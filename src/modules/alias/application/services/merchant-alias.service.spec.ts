import { MerchantAliasService } from './merchant-alias.service';
import { LIPA_NAMBA_BLOCKS } from '@shared/domain/alias/alias.constants';

function makeAliasRepo(block: '780' | '781' | '782') {
  return {
    findMerchantAlias: jest.fn().mockResolvedValue(null),
    resolveMerchantBlock: jest.fn().mockResolvedValue(block),
    generatePublicAlias: jest.fn().mockResolvedValue({
      alias8digit: `${block}00001C`,
      acquirerCode3: block,
      aliasSeq4: '0001',
      checksum1: 'C',
    }),
  };
}

function makePrisma(tx: any, isSchool: boolean) {
  return {
    merchant: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'm1', acquirerId: 'a1', isSchool }),
    },
    schoolSequence: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((cb: (tx: any) => unknown) => cb(tx)),
  };
}

describe('MerchantAliasService.issueMerchantAlias block scoping', () => {
  it('resolves a merchant block (781/782) for a non-school merchant and marks isSchool false', async () => {
    const aliases = makeAliasRepo('781');
    const tx = {
      merchantAlias: {
        create: jest.fn((args: any) => Promise.resolve({ id: 'alias1', ...args.data })),
      },
    };
    const prisma = makePrisma(tx, false);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueMerchantAlias('merchant-1');

    expect(aliases.resolveMerchantBlock).toHaveBeenCalledWith(tx);
    expect(aliases.generatePublicAlias).toHaveBeenCalledWith(tx, '781');
    expect(tx.merchantAlias.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isSchool: false }) }),
    );
    expect(result.alias.acquirerCode3).toBe('781');
    expect(result.schoolSeq).toBeNull();
  });

  it('always uses LIPA_NAMBA_BLOCKS.SCHOOL (780) for a school merchant, without calling resolveMerchantBlock, and marks isSchool true', async () => {
    const aliases = makeAliasRepo('780');
    const tx = {
      merchantAlias: {
        create: jest.fn((args: any) => Promise.resolve({ id: 'alias1', ...args.data })),
      },
      schoolSequence: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ merchantId: 'merchant-1', schoolSeq3: '001' }),
      },
    };
    const prisma = makePrisma(tx, true);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueMerchantAlias('merchant-1');

    expect(aliases.resolveMerchantBlock).not.toHaveBeenCalled();
    expect(aliases.generatePublicAlias).toHaveBeenCalledWith(tx, LIPA_NAMBA_BLOCKS.SCHOOL);
    expect(tx.merchantAlias.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isSchool: true }) }),
    );
    expect(result.alias.acquirerCode3).toBe('780');
    expect(result.schoolSeq).toEqual({ merchantId: 'merchant-1', schoolSeq3: '001' });
  });

  it('issueSchoolMerchantAlias (deprecated) delegates to issueMerchantAlias', async () => {
    const aliases = makeAliasRepo('780');
    const tx = {
      merchantAlias: {
        create: jest.fn((args: any) => Promise.resolve({ id: 'alias1', ...args.data })),
      },
      schoolSequence: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ merchantId: 'merchant-1', schoolSeq3: '001' }),
      },
    };
    const prisma = makePrisma(tx, true);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueSchoolMerchantAlias('merchant-1');

    expect(result.alias.acquirerCode3).toBe('780');
  });
});
