import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Onboarding workflow (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let applicationId: string;
  let makerUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@mms.local', password: 'Admin@12345678' })
      .expect(201);

    accessToken = loginRes.body.accessToken;
    makerUserId = loginRes.body.user?.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates sole proprietor onboarding application', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        legalEntityType: 'SOLE_PROPRIETOR',
        legalName: 'Test Sole Trader',
        tradingName: 'Test Shop',
        mcc: '5814',
        city: 'Dar es Salaam',
        postalCode: '11000',
      })
      .expect(201);

    expect(res.body.applicationNo).toMatch(/^ONB-/);
    expect(res.body.status).toBe('DRAFT');
    applicationId = res.body.id;
  });

  it('assigns settlement account and uploads KYC document', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/onboarding/applications/${applicationId}/settlement-account`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountNumber: '0123456789012',
        accountName: 'Test Sole Trader',
        bankCode: 'CRDB',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/onboarding/applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        docType: 'KYC_ID',
        fileName: 'national-id.pdf',
        s3Bucket: 'mms-dev',
        s3Key: `test/${applicationId}/id.pdf`,
        mimeType: 'application/pdf',
        fileSize: 1024,
      })
      .expect(201);
  });

  it('submits application for approval', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/onboarding/applications/${applicationId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(res.body.status).toBe('SUBMITTED');
  });

  it('maker approves and creates checker task', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/onboarding/applications/${applicationId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(res.body.status).toBe('UNDER_REVIEW');

    const tasks = await request(app.getHttpServer())
      .get('/api/v1/approvals/tasks?status=PENDING')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const task = tasks.body.data.find(
      (t: { entityId: string }) => t.entityId === applicationId,
    );
    expect(task).toBeDefined();
    expect(task.makerId).toBeDefined();
    expect(makerUserId).toBeDefined();
  });

  it('lists onboarding applications', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('returns onboarding timeline', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/onboarding/applications/${applicationId}/timeline`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.events.length).toBeGreaterThan(0);
  });
});
