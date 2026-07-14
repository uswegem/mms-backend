import { PrismaClient } from '@prisma/client';

jest.setTimeout(30_000);

/**
 * Verifies the Postgres CHECK constraints added in
 * Database/migrations/006_alias_block_entity_guard.sql actually reject
 * mismatched alias block / entity-type combinations, independent of any
 * application-level bug. Every assertion runs inside a transaction that is
 * deliberately rolled back, so no test data survives the run.
 */
describe('Alias block/entity-type DB guard (e2e)', () => {
  const prisma = new PrismaClient();
  let merchantId: string;

  beforeAll(async () => {
    const merchant = await prisma.merchant.findFirst();
    if (!merchant) {
      throw new Error('Seed at least one merchant before running this test');
    }
    merchantId = merchant.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function expectConstraintViolation(
    constraintName: string,
    run: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<unknown>,
  ) {
    await expect(
      prisma.$transaction(async (tx) => {
        await run(tx);
      }),
    ).rejects.toThrow(new RegExp(constraintName));
  }

  it('rejects a 780 alias for a merchant that is not a school', async () => {
    await expectConstraintViolation('merchant_aliases_block_matches_entity_type', (tx) =>
      tx.merchantAlias.create({
        data: {
          merchantId,
          alias8digit: '78099101',
          acquirerCode3: '780',
          merchantCode4: '9101',
          checksum1: '1',
          isSchool: false,
        },
      }),
    );
  });

  it('rejects a 781/782 alias for a merchant flagged as a school', async () => {
    await expectConstraintViolation('merchant_aliases_block_matches_entity_type', (tx) =>
      tx.merchantAlias.create({
        data: {
          merchantId,
          alias8digit: '78199102',
          acquirerCode3: '781',
          merchantCode4: '9102',
          checksum1: '2',
          isSchool: true,
        },
      }),
    );
  });

  it('never lets 781/782 leak into a student alias — only block 780 is valid', async () => {
    await expectConstraintViolation('student_aliases_block_is_school_block', async (tx) => {
      const student = await tx.student.create({
        data: {
          merchantId,
          admissionNo: `GUARD-TEST-${Date.now()}`,
          fullName: 'Alias Guard Test Student',
        },
      });
      await tx.studentAlias.create({
        data: {
          studentId: student.id,
          merchantId,
          alias8digit: '78199103',
          internalId8digit: '00100001',
          acquirerCode3: '781',
          aliasSeq4: '9103',
          schoolSeq3: '001',
          studentSeq4: '0001',
        },
      });
    });
  });

  it('accepts a correctly-scoped merchant alias (781/782, non-school)', async () => {
    await prisma.$transaction(async (tx) => {
      const alias = await tx.merchantAlias.create({
        data: {
          merchantId,
          alias8digit: '78199201',
          acquirerCode3: '781',
          merchantCode4: '9201',
          checksum1: '1',
          isSchool: false,
        },
      });
      expect(alias.acquirerCode3).toBe('781');
      throw new Error('__ROLLBACK_TEST_FIXTURE__');
    }).catch((e) => {
      if (e.message !== '__ROLLBACK_TEST_FIXTURE__') throw e;
    });
  });

  it('accepts a correctly-scoped student alias (block 780)', async () => {
    await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          merchantId,
          admissionNo: `GUARD-TEST-OK-${Date.now()}`,
          fullName: 'Alias Guard Test Student OK',
        },
      });
      const alias = await tx.studentAlias.create({
        data: {
          studentId: student.id,
          merchantId,
          alias8digit: '78099202',
          internalId8digit: '00100002',
          acquirerCode3: '780',
          aliasSeq4: '9202',
          schoolSeq3: '001',
          studentSeq4: '0002',
        },
      });
      expect(alias.acquirerCode3).toBe('780');
      throw new Error('__ROLLBACK_TEST_FIXTURE__');
    }).catch((e) => {
      if (e.message !== '__ROLLBACK_TEST_FIXTURE__') throw e;
    });
  });
});
