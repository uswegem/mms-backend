import { AliasRepository } from './alias.repository';
import {
  ALIAS_BLOCKS,
  MERCHANT_ALIAS_BLOCKS,
  SCHOOL_ALIAS_BLOCKS,
} from '@shared/domain/alias/alias.constants';

function makeClient(queryRawImpl: (...args: unknown[]) => Promise<Array<{ last_seq: number }>>) {
  return { $queryRaw: jest.fn(queryRawImpl) } as any;
}

describe('AliasRepository.allocateAliasSlot', () => {
  it('claims the next slot in the first block when it has room', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient(async () => [{ last_seq: 42 }]);

    const result = await repo.allocateAliasSlot(ALIAS_BLOCKS, client);

    expect(result).toEqual({ block: '780', seq4: '0042' });
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rolls over from block 780 to 781 once 780 is exhausted', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient(async (_strings: unknown, block: string) => {
      if (block === '780') return [];
      if (block === '781') return [{ last_seq: 1 }];
      return [];
    });

    const result = await repo.allocateAliasSlot(ALIAS_BLOCKS, client);

    expect(result).toEqual({ block: '781', seq4: '0001' });
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('throws a provisioning error when every block (780/781/782) is exhausted', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient(async () => []);

    await expect(repo.allocateAliasSlot(ALIAS_BLOCKS, client)).rejects.toThrow(/exhausted/);
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('never allocates block 780 for a merchant — MERCHANT_ALIAS_BLOCKS excludes it entirely', async () => {
    const repo = new AliasRepository({} as any);
    const queriedBlocks: string[] = [];
    const client = makeClient(async (_strings: unknown, block: string) => {
      queriedBlocks.push(block);
      return [{ last_seq: 1 }];
    });

    const result = await repo.allocateAliasSlot(MERCHANT_ALIAS_BLOCKS, client);

    expect(result.block).not.toBe('780');
    expect(queriedBlocks).not.toContain('780');
  });

  it('rolls over from 781 to 782 for merchants, never touching 780', async () => {
    const repo = new AliasRepository({} as any);
    const queriedBlocks: string[] = [];
    const client = makeClient(async (_strings: unknown, block: string) => {
      queriedBlocks.push(block);
      if (block === '781') return [];
      if (block === '782') return [{ last_seq: 5 }];
      return [];
    });

    const result = await repo.allocateAliasSlot(MERCHANT_ALIAS_BLOCKS, client);

    expect(result).toEqual({ block: '782', seq4: '0005' });
    expect(queriedBlocks).toEqual(['781', '782']);
  });

  it('never allocates 781 or 782 for a school/student — SCHOOL_ALIAS_BLOCKS only contains 780', async () => {
    const repo = new AliasRepository({} as any);
    const queriedBlocks: string[] = [];
    const client = makeClient(async (_strings: unknown, block: string) => {
      queriedBlocks.push(block);
      return [{ last_seq: 3 }];
    });

    const result = await repo.allocateAliasSlot(SCHOOL_ALIAS_BLOCKS, client);

    expect(result.block).toBe('780');
    expect(queriedBlocks).toEqual(['780']);
  });

  it('throws a provisioning error scoped to the allowed blocks when the school block is exhausted, without trying merchant blocks', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient(async () => []);

    await expect(repo.allocateAliasSlot(SCHOOL_ALIAS_BLOCKS, client)).rejects.toThrow(/780/);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
