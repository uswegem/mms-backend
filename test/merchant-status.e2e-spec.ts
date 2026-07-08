import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
import { PasswordHasherPort } from '../src/modules/identity/application/ports/password-hasher.port';

jest.setTimeout(120_000);

describe('Merchant Status Lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let merchantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@mms.local', password: 'Admin@12345678' })
      .expect(200);

    accessToken = loginRes.body.accessToken;

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        legalName: 'Status Test Merchant',
        tradingName: 'Status Shop',
        mcc: '5814',
        city: 'Dar es Salaam',
        postalCode: '11000',
      })
      .expect(201);

    merchantId = createRes.body.id;
    expect(createRes.body.status).toBe('DRAFT');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns allowed actions for draft merchant', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/merchants/${merchantId}/status/allowed-actions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.currentStatus).toBe('DRAFT');
    expect(res.body.allowedActions).toContain('SUBMIT_FOR_REVIEW');
  });

  it('submits merchant for review', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/submit-review`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(res.body.status).toBe('PENDING_REVIEW');
  });

  it('blocks profile edit while pending review', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tradingName: 'Changed Name' })
      .expect(422);
  });

  it('moves to pending approval', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/pending-approval`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(res.body.status).toBe('PENDING_APPROVAL');
  });

  it('blocks maker from checker-approving own merchant', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Should fail maker-checker' })
      .expect(422);
  });

  it('checker approves to active when maker differs', async () => {
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { createdBy: '00000000-0000-0000-0000-000000000099' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'Approved in e2e test' })
      .expect(201);

    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.onboardedAt).toBeTruthy();
  });

  it('records status history', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/merchants/${merchantId}/status/history`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body[0].toStatus).toBe('ACTIVE');
  });

  it('requests a suspend via maker-checker instead of changing status directly', async () => {
    const requested = await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/request`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ action: 'SUSPEND', reason: 'e2e test suspend request' })
      .expect(201);

    expect(requested.body.status).toBe('ACTIVE');
    expect(requested.body.pendingStatusAction).toBe('SUSPEND');

    const tasksRes = await request(app.getHttpServer())
      .get('/api/v1/approvals/tasks?status=PENDING')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const task = tasksRes.body.data.find(
      (t: { entityType: string; entityId: string }) =>
        t.entityType === 'MERCHANT_STATUS_CHANGE' && t.entityId === merchantId,
    );
    expect(task).toBeDefined();

    // Self-approval must be blocked (maker === checker).
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/tasks/${task.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(422);

    // A genuinely different user (checker) is required to approve.
    const checkerEmail = `checker-${Date.now()}@mms.local`;
    const rolesRes = await request(app.getHttpServer())
      .get('/api/v1/authz/roles')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const bankAdminRoleId = rolesRes.body.find(
      (r: { code: string }) => r.code === 'BANK_ADMIN',
    ).id;

    const createUserRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: checkerEmail, fullName: 'E2E Checker', roleIds: [bankAdminRoleId] })
      .expect(201);
    const checkerUserId: string = createUserRes.body.user.id;

    // The API only returns the auto-generated temp password when
    // NODE_ENV === 'development' (not in the e2e test environment), so set a
    // known password hash directly for the purposes of this test.
    const hasher = app.get(PasswordHasherPort);
    const checkerPassword = 'E2eChecker@12345';
    await prisma.authCredential.update({
      where: { userId: checkerUserId },
      data: { passwordHash: await hasher.hash(checkerPassword) },
    });

    const checkerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: checkerEmail, password: checkerPassword })
      .expect(200);
    const checkerToken = checkerLoginRes.body.accessToken;

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/approvals/tasks/${task.id}/approve`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({})
      .expect(201);
    expect(approved.body.status).toBe('APPROVED');

    const merchantRes = await request(app.getHttpServer())
      .get(`/api/v1/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(merchantRes.body.status).toBe('SUSPENDED');
    expect(merchantRes.body.pendingStatusAction).toBeNull();
  });

  it('the old direct status-change routes no longer exist', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/suspend`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/suspend`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
