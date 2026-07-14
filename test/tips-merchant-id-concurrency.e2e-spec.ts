import { PrismaClient } from '@prisma/client';
import { TipsMerchantIdRepository } from '../src/modules/qr/domain/tips-merchant-id.repository';

jest.setTimeout(30_000);

/**
 * allocateMerchantId15 compiles (via Prisma's upsert-with-increment) into a
 * single native `INSERT ... ON CONFLICT (id) DO UPDATE SET last_seq =
 * last_seq + 1 RETURNING ...`, which Postgres serializes atomically on the
 * row's unique index — not an application-level read-then-write. This test
 * fires real concurrent allocations at the real DB to prove that empirically.
 *
 * Note: this exercises the actual singleton 'GLOBAL' sequence row and resets
 * it afterward — don't run this against an environment with real allocated
 * Merchant IDs you care about preserving.
 */
describe('TipsMerchantIdRepository concurrency (e2e)', () => {
  const prisma = new PrismaClient();
  const repo = new TipsMerchantIdRepository(prisma as any);

  beforeAll(async () => {
    await prisma.tipsMerchantIdSequence.deleteMany({ where: { id: 'GLOBAL' } });
  });

  afterAll(async () => {
    await prisma.tipsMerchantIdSequence.deleteMany({ where: { id: 'GLOBAL' } });
    await prisma.$disconnect();
  });

  it('never hands out the same Merchant ID twice under N concurrent allocations', async () => {
    const N = 100;

    const results = await Promise.all(
      Array.from({ length: N }, () => repo.allocateMerchantId15('001')),
    );

    expect(results).toHaveLength(N);
    expect(new Set(results).size).toBe(N);

    for (const id of results) {
      expect(id).toHaveLength(15);
      expect(id.startsWith('001')).toBe(true);
    }

    const sequences = results
      .map((id) => parseInt(id.slice(3), 10))
      .sort((a, b) => a - b);
    const min = sequences[0];
    const max = sequences[sequences.length - 1];

    expect(max - min + 1).toBe(N);
    expect(new Set(sequences).size).toBe(N);
  });
});
