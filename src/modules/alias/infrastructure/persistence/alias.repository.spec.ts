import {
  AliasRepository,
  StudentAliasCapacityExceededException,
} from './alias.repository';
import { LIPA_NAMBA_BLOCKS } from '@shared/domain/alias/alias.constants';

function makeClient(
  overrides: {
    upsert?: jest.Mock;
    findUnique?: jest.Mock;
    queryRaw?: jest.Mock;
  } = {},
) {
  return {
    globalAliasSequence: {
      upsert: overrides.upsert ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
    },
    $queryRaw: overrides.queryRaw ?? jest.fn(),
  } as any;
}

describe('AliasRepository.nextSeq4ForBlock', () => {
  it('atomically increments the per-block sequence and pads to 4 digits', async () => {
    const repo = new AliasRepository({} as any);
    const upsert = jest.fn().mockResolvedValue({ lastSeq: 42 });
    const client = makeClient({ upsert });

    const seq4 = await repo.nextSeq4ForBlock(LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY, client);

    expect(seq4).toBe('0042');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'BLOCK_781' } }),
    );
  });

  it('throws once the block sequence is exhausted', async () => {
    const repo = new AliasRepository({} as any);
    const upsert = jest.fn().mockResolvedValue({ lastSeq: 10000 });
    const client = makeClient({ upsert });

    await expect(
      repo.nextSeq4ForBlock(LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY, client),
    ).rejects.toThrow(/exhausted/);
  });
});

describe('AliasRepository.resolveMerchantBlock', () => {
  it('prefers block 781 when it has room', async () => {
    const repo = new AliasRepository({} as any);
    const findUnique = jest.fn().mockResolvedValue({ lastSeq: 5000 });
    const client = makeClient({ findUnique });

    const block = await repo.resolveMerchantBlock(client);

    expect(block).toBe(LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'BLOCK_781' } });
  });

  it('prefers block 781 when no sequence row exists yet', async () => {
    const repo = new AliasRepository({} as any);
    const findUnique = jest.fn().mockResolvedValue(null);
    const client = makeClient({ findUnique });

    const block = await repo.resolveMerchantBlock(client);

    expect(block).toBe(LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY);
  });

  it('overflows to block 782 once 781 is exhausted', async () => {
    const repo = new AliasRepository({} as any);
    const findUnique = jest.fn().mockResolvedValue({ lastSeq: 9999 });
    const client = makeClient({ findUnique });

    const block = await repo.resolveMerchantBlock(client);

    expect(block).toBe(LIPA_NAMBA_BLOCKS.MERCHANT_SECONDARY);
  });
});

describe('AliasRepository.generatePublicAlias', () => {
  it('defaults to the SCHOOL block (780) when none is passed', async () => {
    const repo = new AliasRepository({} as any);
    const upsert = jest.fn().mockResolvedValue({ lastSeq: 1 });
    const client = makeClient({ upsert });

    const result = await repo.generatePublicAlias(client);

    expect(result.acquirerCode3).toBe(LIPA_NAMBA_BLOCKS.SCHOOL);
    expect(result.alias8digit.startsWith('780')).toBe(true);
    expect(result.alias8digit).toHaveLength(8);
  });

  it('builds an 8-digit alias for an explicit merchant block', async () => {
    const repo = new AliasRepository({} as any);
    const upsert = jest.fn().mockResolvedValue({ lastSeq: 7 });
    const client = makeClient({ upsert });

    const result = await repo.generatePublicAlias(client, LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY);

    expect(result.acquirerCode3).toBe('781');
    expect(result.aliasSeq4).toBe('0007');
    expect(result.alias8digit).toHaveLength(8);
  });
});

describe('AliasRepository.generateStudentAlias', () => {
  it('builds a 10-digit student alias from the flat global sequence', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient({ queryRaw: jest.fn().mockResolvedValue([{ last_seq: 15 }]) });

    const result = await repo.generateStudentAlias(client);

    expect(result.acquirerCode3).toBe('780');
    expect(result.aliasSeq6).toBe('000015');
    expect(result.alias10digit).toHaveLength(10);
  });

  it('throws StudentAliasCapacityExceededException when the cap is reached', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient({ queryRaw: jest.fn().mockResolvedValue([]) });

    await expect(repo.generateStudentAlias(client)).rejects.toThrow(
      StudentAliasCapacityExceededException,
    );
  });
});

describe('AliasRepository.findByAlias', () => {
  it('dispatches an 8-digit alias to MerchantAlias lookup', async () => {
    const merchantAlias = { alias8digit: '78100019' };
    const prisma = {
      merchantAlias: { findUnique: jest.fn().mockResolvedValue(merchantAlias) },
      studentAlias: { findUnique: jest.fn() },
    };
    const repo = new AliasRepository(prisma as any);

    const result = await repo.findByAlias('78100019');

    expect(result).toEqual({ type: 'merchant', record: merchantAlias });
    expect(prisma.studentAlias.findUnique).not.toHaveBeenCalled();
  });

  it('dispatches a 10-digit alias to StudentAlias lookup', async () => {
    const studentAlias = { alias10digit: '7800000015' };
    const prisma = {
      merchantAlias: { findUnique: jest.fn() },
      studentAlias: { findUnique: jest.fn().mockResolvedValue(studentAlias) },
    };
    const repo = new AliasRepository(prisma as any);

    const result = await repo.findByAlias('7800000015');

    expect(result).toEqual({ type: 'student', record: studentAlias });
    expect(prisma.merchantAlias.findUnique).not.toHaveBeenCalled();
  });

  it('returns null for a string that matches neither length', async () => {
    const prisma = {
      merchantAlias: { findUnique: jest.fn() },
      studentAlias: { findUnique: jest.fn() },
    };
    const repo = new AliasRepository(prisma as any);

    const result = await repo.findByAlias('123');

    expect(result).toBeNull();
  });
});
