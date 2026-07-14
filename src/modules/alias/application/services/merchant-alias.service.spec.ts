import { MerchantAliasService } from './merchant-alias.service';
import {
  MERCHANT_ALIAS_BLOCKS,
  SCHOOL_ALIAS_BLOCKS,
} from '@shared/domain/alias/alias.constants';

function makeAliasRepo(block: '780' | '781') {
  return {
    findMerchantAlias: jest.fn().mockResolvedValue(null),
    generatePublicAlias: jest.fn().mockResolvedValue({
      alias8digit: `${block}00001C`,
      acquirerCode3: block,
      aliasSeq4: '0001',
      checksum1: 'C',
    }),
  };
}

function makePrisma(tx: any) {
  return {
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'm1', acquirerId: 'a1' }) },
    schoolSequence: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((cb: (tx: any) => unknown) => cb(tx)),
  };
}

describe('MerchantAliasService block scoping', () => {
  it('issueMerchantAlias only ever requests MERCHANT_ALIAS_BLOCKS (781/782) and marks isSchool false', async () => {
    const aliases = makeAliasRepo('781');
    const tx = {
      merchantAlias: {
        create: jest.fn((args: any) => Promise.resolve({ id: 'alias1', ...args.data })),
      },
    };
    const prisma = makePrisma(tx);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueMerchantAlias('merchant-1');

    expect(aliases.generatePublicAlias).toHaveBeenCalledWith(MERCHANT_ALIAS_BLOCKS, tx);
    expect(tx.merchantAlias.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isSchool: false }) }),
    );
    expect(result.alias.acquirerCode3).toBe('781');
  });

  it('issueSchoolAlias only ever requests SCHOOL_ALIAS_BLOCKS (780) and marks isSchool true', async () => {
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
    const prisma = makePrisma(tx);
    const service = new MerchantAliasService(prisma as any, aliases as any);

    const result = await service.issueSchoolAlias('merchant-1');

    expect(aliases.generatePublicAlias).toHaveBeenCalledWith(SCHOOL_ALIAS_BLOCKS, tx);
    expect(tx.merchantAlias.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isSchool: true }) }),
    );
    expect(result.alias.acquirerCode3).toBe('780');
  });
});
