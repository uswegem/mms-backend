import { Prisma } from '@prisma/client';
import { MerchantAliasService } from './merchant-alias.service';
import { LIPA_NAMBA_BLOCKS } from '@shared/domain/alias/alias.constants';

function makeAliasRepo(block: '780' | '781' | '782') {
  let seq = 1;
  return {
    findMerchantAlias: jest.fn().mockResolvedValue(null),
    resolveMerchantBlock: jest.fn().mockResolvedValue(block),
    generatePublicAlias: jest.fn().mockImplementation(() => {
      const aliasSeq4 = seq.toString().padStart(4, '0');
      seq += 1;
      return Promise.resolve({
        alias8digit: `${block}${aliasSeq4}C`,
        acquirerCode3: block,
        aliasSeq4,
        checksum1: 'C',
      });
    }),
  };
}

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '0.0.0',
    meta: { target: ['alias_8digit'] },
  });
}

function makePrisma(
  isSchool: boolean,
  opts: { create?: jest.Mock; schoolSequence?: any } = {},
) {
  const tx = {
    schoolSequence: opts.schoolSequence ?? {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockResolvedValue({ merchantId: 'merchant-1', schoolSeq3: '001' }),
    },
  };
  return {
    merchant: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'm1', acquirerId: 'a1', isSchool }),
    },
    merchantAlias: {
      create:
        opts.create ??
        jest.fn((args: any) => Promise.resolve({ id: 'alias1', ...args.data })),
    },
    $transaction: jest.fn((cb: (tx: any) => unknown) => cb(tx)),
    __tx: tx,
  };
}

describe('MerchantAliasService.issueMerchantAlias block scoping', () => {
  it('resolves a merchant block (781/782) for a non-school merchant and marks isSchool false', async () => {
    const aliases = makeAliasRepo('781');
    const prisma = makePrisma(false);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueMerchantAlias('merchant-1');

    expect(aliases.resolveMerchantBlock).toHaveBeenCalledWith();
    expect(aliases.generatePublicAlias).toHaveBeenCalledWith(undefined, '781');
    expect(prisma.merchantAlias.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isSchool: false }),
      }),
    );
    expect(result.alias.acquirerCode3).toBe('781');
    expect(result.schoolSeq).toBeNull();
  });

  it('always uses LIPA_NAMBA_BLOCKS.SCHOOL (780) for a school merchant, without calling resolveMerchantBlock, and marks isSchool true', async () => {
    const aliases = makeAliasRepo('780');
    const prisma = makePrisma(true);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueMerchantAlias('merchant-1');

    expect(aliases.resolveMerchantBlock).not.toHaveBeenCalled();
    expect(aliases.generatePublicAlias).toHaveBeenCalledWith(
      undefined,
      LIPA_NAMBA_BLOCKS.SCHOOL,
    );
    expect(prisma.merchantAlias.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isSchool: true }),
      }),
    );
    expect(result.alias.acquirerCode3).toBe('780');
    expect(result.schoolSeq).toEqual({
      merchantId: 'merchant-1',
      schoolSeq3: '001',
    });
  });

  it('issueSchoolMerchantAlias (deprecated) delegates to issueMerchantAlias', async () => {
    const aliases = makeAliasRepo('780');
    const prisma = makePrisma(true);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueSchoolMerchantAlias('merchant-1');

    expect(result.alias.acquirerCode3).toBe('780');
  });
});

describe('MerchantAliasService.issueMerchantAlias collision self-healing', () => {
  // Regression coverage for the ONB-2026-000016 incident: a stale/desynced
  // sequence counter made every retry regenerate the exact same colliding
  // alias forever, because the counter bump and the insert used to share one
  // transaction and rolled back together on failure.
  it('retries with a freshly generated alias when the insert hits a unique-constraint collision, and does not re-derive the same alias twice', async () => {
    const aliases = makeAliasRepo('780');
    const create = jest
      .fn()
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'alias1', ...args.data }),
      );
    const prisma = makePrisma(true, { create });
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueMerchantAlias('merchant-1');

    expect(aliases.generatePublicAlias).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledTimes(3);
    const generatedAliases = create.mock.calls.map(
      (call) => call[0].data.alias8digit,
    );
    expect(new Set(generatedAliases).size).toBe(3); // each attempt used a distinct alias
    expect(result.alias.alias8digit).toBe(generatedAliases[2]);
  });

  it('gives up and rethrows after exhausting all attempts on persistent collisions', async () => {
    const aliases = makeAliasRepo('780');
    const create = jest.fn().mockRejectedValue(uniqueConstraintError());
    const prisma = makePrisma(true, { create });
    const service = new MerchantAliasService(prisma as any, aliases as any);

    await expect(service.issueMerchantAlias('merchant-1')).rejects.toThrow(
      'Unique constraint failed',
    );
    expect(create).toHaveBeenCalledTimes(5); // MAX_ALIAS_ISSUE_ATTEMPTS
  });

  it('does not retry and rethrows immediately on a non-collision error', async () => {
    const aliases = makeAliasRepo('780');
    const create = jest.fn().mockRejectedValue(new Error('connection reset'));
    const prisma = makePrisma(true, { create });
    const service = new MerchantAliasService(prisma as any, aliases as any);

    await expect(service.issueMerchantAlias('merchant-1')).rejects.toThrow(
      'connection reset',
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
