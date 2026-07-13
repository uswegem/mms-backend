import { AliasRepository } from './alias.repository';

function makeClient(queryRawImpl: (...args: unknown[]) => Promise<Array<{ last_seq: number }>>) {
  return { $queryRaw: jest.fn(queryRawImpl) } as any;
}

describe('AliasRepository.allocateAliasSlot', () => {
  it('claims the next slot in the first block when it has room', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient(async () => [{ last_seq: 42 }]);

    const result = await repo.allocateAliasSlot(client);

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

    const result = await repo.allocateAliasSlot(client);

    expect(result).toEqual({ block: '781', seq4: '0001' });
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('throws a provisioning error when every block (780/781/782) is exhausted', async () => {
    const repo = new AliasRepository({} as any);
    const client = makeClient(async () => []);

    await expect(repo.allocateAliasSlot(client)).rejects.toThrow(/exhausted/);
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
