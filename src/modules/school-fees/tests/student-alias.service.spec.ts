import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { IdempotencyService } from '@infrastructure/idempotency/idempotency.service';
import {
  StudentAliasService,
  PARENTAL_CONSENT_STATEMENT,
} from '../application/services/student-alias.service';

const GUARDIAN_PHONE = '255700000001';

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
}

function buildTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    student: {
      create: jest.fn((args: any) =>
        Promise.resolve({
          id: 'student-1',
          merchantId: 'merchant-1',
          ...args.data,
        }),
      ),
    },
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'merchant-1',
        tradingName: 'MAPAMBANO SECONDARY',
        mcc: '8211',
        profile: { city: 'DAR ES SALAAM', postalCode: '11000' },
        acquirer: { tipsAcquirerId5: '01044', tipsParticipantCode: '044' },
      }),
    },
    studentAlias: {
      create: jest.fn((args: any) =>
        Promise.resolve({ id: 'alias-1', ...args.data }),
      ),
    },
    ...overrides,
  };
}

describe('StudentAliasService', () => {
  function buildService(
    txOverrides: Partial<Record<string, unknown>> = {},
    redis: unknown = null,
    prismaOverrides: Partial<Record<string, unknown>> = {},
  ) {
    const tx = buildTx(txOverrides);
    const prisma = {
      merchant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isSchool: true, status: 'ACTIVE' }),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: any) =>
          Promise.resolve({
            id: 'student-1',
            merchantId: 'merchant-1',
            ...args.data,
          }),
        ),
        update: jest.fn((args: any) =>
          Promise.resolve({ id: 'student-1', ...args.data }),
        ),
      },
      studentRosterUpload: {
        create: jest.fn().mockResolvedValue({ id: 'upload-1' }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      ...prismaOverrides,
    };
    const aliases = {
      generateStudentAlias: jest.fn().mockResolvedValue({
        alias10digit: '7800000015',
        acquirerCode3: '780',
        aliasSeq6: '000001',
      }),
    };
    const qr = {
      createStaticQr: jest.fn().mockResolvedValue({ id: 'qr-1' }),
    };
    const qrValidators = {
      resolveAcquirerId5: jest.fn().mockReturnValue('01044'),
      ensureTipsRegistration: jest
        .fn()
        .mockResolvedValue({ merchantId15: '044000000000001' }),
    };
    const amqp = { publish: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(undefined) };

    const service = new StudentAliasService(
      prisma as never,
      aliases as never,
      qr as never,
      qrValidators as never,
      new IdempotencyService(redis as never),
      amqp as never,
      config as never,
    );

    return { service, prisma, tx, aliases, qr, qrValidators };
  }

  function p2002(message: string) {
    return new Prisma.PrismaClientKnownRequestError(message, {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
  }

  describe('10-digit alias generation', () => {
    it('calls generateStudentAlias and stores alias10digit on the created alias row', async () => {
      const { service, aliases, tx } = buildService();

      const result = await service.createStudent('merchant-1', {
        admissionNo: 'ADM-001',
        fullName: 'A B',
        guardianPhone: GUARDIAN_PHONE,
      });

      expect(aliases.generateStudentAlias).toHaveBeenCalledTimes(1);
      expect(tx.studentAlias.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alias10digit: '7800000015',
            aliasSeq6: '000001',
          }),
        }),
      );
      expect((result as any).alias.alias10digit).toBe('7800000015');
    });

    it('does not pass internalRoutingId to createStaticQr (tag 62/05 dropped)', async () => {
      const { service, qr } = buildService();

      await service.createStudent('merchant-1', {
        admissionNo: 'ADM-001',
        fullName: 'A B',
        guardianPhone: GUARDIAN_PHONE,
      });

      expect(qr.createStaticQr).toHaveBeenCalledWith(
        expect.not.objectContaining({ internalRoutingId: expect.anything() }),
        expect.anything(),
      );
    });
  });

  describe('race condition: concurrent duplicate admission number', () => {
    it('translates a unique-constraint violation on student.create into the same friendly error a sequential duplicate gets', async () => {
      const { service, tx } = buildService({
        student: {
          create: jest
            .fn()
            .mockRejectedValue(p2002('Unique constraint failed')),
        },
      });

      await expect(
        service.createStudent('merchant-1', {
          admissionNo: 'ADM-001',
          fullName: 'A B',
          guardianPhone: GUARDIAN_PHONE,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createStudent('merchant-1', {
          admissionNo: 'ADM-001',
          fullName: 'A B',
          guardianPhone: GUARDIAN_PHONE,
        }),
      ).rejects.toThrow('already enrolled');
      expect(tx.student.create).toHaveBeenCalled();
    });

    it('does not swallow unrelated errors from student.create', async () => {
      const { service } = buildService({
        student: {
          create: jest.fn().mockRejectedValue(new Error('connection reset')),
        },
      });

      await expect(
        service.createStudent('merchant-1', {
          admissionNo: 'ADM-001',
          fullName: 'A B',
          guardianPhone: GUARDIAN_PHONE,
        }),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('Idempotency-Key de-duplication', () => {
    it('replays the cached result for a retried createStudent request with the same key, without enrolling twice', async () => {
      const redis = createMockRedis();
      const { service, prisma } = buildService({}, redis);

      const first = await service.createStudent('merchant-1', {
        admissionNo: 'ADM-001',
        fullName: 'A B',
        guardianPhone: GUARDIAN_PHONE,
        idempotencyKey: 'stu-key-1',
      });
      const second = await service.createStudent('merchant-1', {
        admissionNo: 'ADM-001',
        fullName: 'A B',
        guardianPhone: GUARDIAN_PHONE,
        idempotencyKey: 'stu-key-1',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('rejects a concurrent createStudent request sharing the same key while the first is still in flight', async () => {
      const redis = createMockRedis();
      redis.store.set(
        'idem:student:create:merchant-1:concurrent-1',
        '__PROCESSING__',
      );
      const { service } = buildService({}, redis);

      await expect(
        service.createStudent('merchant-1', {
          admissionNo: 'ADM-002',
          fullName: 'C D',
          guardianPhone: GUARDIAN_PHONE,
          idempotencyKey: 'concurrent-1',
        }),
      ).rejects.toThrow('already being processed');
    });

    it('replays the cached result for a retried bulkUpload request with the same key', async () => {
      const redis = createMockRedis();
      const { service, prisma } = buildService({}, redis);
      const rows = [
        {
          row: 1,
          admissionNo: 'ADM-010',
          fullName: 'E F',
          guardianPhone: GUARDIAN_PHONE,
        },
      ];

      const first = await service.bulkUpload(
        'merchant-1',
        rows,
        'user-1',
        'bulk-key-1',
      );
      const second = await service.bulkUpload(
        'merchant-1',
        rows,
        'user-1',
        'bulk-key-1',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('does not de-duplicate when no Idempotency-Key is supplied', async () => {
      const redis = createMockRedis();
      const { service, prisma } = buildService({}, redis);

      await service.createStudent('merchant-1', {
        admissionNo: 'ADM-001',
        fullName: 'A B',
        guardianPhone: GUARDIAN_PHONE,
      });
      await service.createStudent('merchant-1', {
        admissionNo: 'ADM-002',
        fullName: 'A B',
        guardianPhone: GUARDIAN_PHONE,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('confirmBulkImport — parental/guardian consent attestation (brief §4.3.2)', () => {
    const rows = [
      {
        row: 1,
        admissionNo: 'ADM-020',
        fullName: 'G H',
        guardianPhone: GUARDIAN_PHONE,
      },
    ];

    it('rejects the whole batch when parentalConsentAttested is false, before touching any student row', async () => {
      const { service, prisma, tx } = buildService();

      await expect(
        service.confirmBulkImport('merchant-1', rows, 'user-1', false),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.studentRosterUpload.create).not.toHaveBeenCalled();
      expect(tx.student.create).not.toHaveBeenCalled();
    });

    it('persists the attestation record — who, when, and the exact statement text — before creating any student', async () => {
      const { service, prisma } = buildService();

      await service.confirmBulkImport('merchant-1', rows, 'user-1', true);

      expect(prisma.studentRosterUpload.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          merchantId: 'merchant-1',
          rowCount: 1,
          parentalConsentAttested: true,
          consentStatementText: PARENTAL_CONSENT_STATEMENT,
          attestedBy: 'user-1',
          attestedAt: expect.any(Date),
        }),
      });
    });

    it('proceeds to create students once attested', async () => {
      const { service, prisma } = buildService();

      const result = await service.confirmBulkImport(
        'merchant-1',
        rows,
        'user-1',
        true,
      );

      expect(prisma.student.create).toHaveBeenCalled();
      expect(result.total).toBe(1);
    });
  });
});
