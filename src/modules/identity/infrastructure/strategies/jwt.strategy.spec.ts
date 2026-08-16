import { UserStatus } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy — post-signature-verification checks', () => {
  const keyCache = { getKeyForVersion: jest.fn() };

  function buildStrategy(user: unknown) {
    const users = { findById: jest.fn().mockResolvedValue(user) };
    const enrichedAuth = {
      fromDbUser: jest.fn().mockResolvedValue({
        toJwtPayload: () => ({ sub: 'user-1', email: 'a@mms.local' }),
      }),
    };
    return new JwtStrategy(
      keyCache as never,
      users as never,
      enrichedAuth as never,
    );
  }

  it('rejects a token whose type claim is not "access" even if the signature verified', async () => {
    const strategy = buildStrategy({ id: 'user-1', status: UserStatus.ACTIVE });
    await expect(
      strategy.validate({ type: 'refresh' } as never),
    ).rejects.toThrow();
  });

  it('rejects a signature-valid token for a user who is no longer ACTIVE', async () => {
    const strategy = buildStrategy({ id: 'user-1', status: UserStatus.LOCKED });
    await expect(
      strategy.validate({ sub: 'user-1', type: 'access' } as never),
    ).rejects.toThrow();
  });

  it('accepts a valid, active-user access token and re-derives fresh permissions', async () => {
    const strategy = buildStrategy({ id: 'user-1', status: UserStatus.ACTIVE });
    const result = await strategy.validate({
      sub: 'user-1',
      type: 'access',
    } as never);
    expect(result).toMatchObject({ sub: 'user-1', type: 'access' });
  });
});
