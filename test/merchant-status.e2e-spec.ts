import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';

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

  it('suspends and reactivates active merchant', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/suspend`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    const reactivated = await request(app.getHttpServer())
      .post(`/api/v1/merchants/${merchantId}/status/reactivate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(reactivated.body.status).toBe('ACTIVE');
  });
});
