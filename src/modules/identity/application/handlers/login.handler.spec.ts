import { PasswordAlgo, UserStatus } from '@prisma/client';
import { LoginHandler } from './login.handler';
import { LoginCommand } from '../commands/login.command';
import {
  AccountLockedException,
  InvalidCredentialsException,
  PasswordResetRequiredException,
} from '../../domain/exceptions/auth.exceptions';

describe('LoginHandler — Argon2id migration (brief §1)', () => {
  const baseUser = {
    id: 'user-1',
    email: 'a@mms.local',
    status: UserStatus.ACTIVE,
  };

  function buildCred(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      passwordHash: 'stored-hash',
      passwordAlgo: PasswordAlgo.BCRYPT,
      mustResetPassword: false,
      mfaEnabled: false,
      lockoutUntil: null,
      ...overrides,
    };
  }

  function buildHandler(cred: ReturnType<typeof buildCred>) {
    const user = { ...baseUser, authCredential: cred };

    const users = {
      findByEmail: jest.fn().mockResolvedValue(user),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    const credentials = {
      recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
      resetFailedAttempts: jest.fn().mockResolvedValue(undefined),
      migratePasswordHash: jest.fn().mockResolvedValue(undefined),
    };
    const loginAttempts = { record: jest.fn().mockResolvedValue(undefined) };
    const passwordHasher = {
      currentAlgorithm: PasswordAlgo.ARGON2ID,
      verify: jest.fn().mockResolvedValue(true),
      hash: jest.fn().mockResolvedValue('new-argon2id-hash'),
    };
    const tokens = {
      issueTokens: jest.fn().mockResolvedValue({
        accessToken: 'access',
        expiresIn: 900,
        tokenType: 'Bearer',
        refreshToken: 'refresh',
        refreshExpiresAt: new Date('2026-08-23'),
      }),
    };
    const mfa = { verifyCode: jest.fn(), decryptSecret: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(5) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const enrichedAuth = {
      fromDbUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };

    const handler = new LoginHandler(
      users as never,
      credentials as never,
      loginAttempts as never,
      passwordHasher,
      tokens as never,
      mfa as never,
      config as never,
      audit as never,
      enrichedAuth as never,
    );

    return {
      handler,
      users,
      credentials,
      loginAttempts,
      passwordHasher,
      tokens,
      audit,
    };
  }

  const command = new LoginCommand(
    'a@mms.local',
    'correct-password',
    undefined,
    '1.2.3.4',
    'jest',
  );

  it('rehashes a BCRYPT user to Argon2id on successful login and still issues a session', async () => {
    const cred = buildCred({ passwordAlgo: PasswordAlgo.BCRYPT });
    const { handler, credentials, passwordHasher, tokens } = buildHandler(cred);

    const result = await handler.execute(command);

    expect(passwordHasher.verify).toHaveBeenCalledWith(
      'correct-password',
      'stored-hash',
      PasswordAlgo.BCRYPT,
    );
    expect(passwordHasher.hash).toHaveBeenCalledWith('correct-password');
    expect(credentials.migratePasswordHash).toHaveBeenCalledWith(
      'user-1',
      'new-argon2id-hash',
    );
    expect(tokens.issueTokens).toHaveBeenCalled();
    expect(result.accessToken).toBe('access');
  });

  it('verifies an ARGON2ID user directly with no rehash and no extra write', async () => {
    const cred = buildCred({ passwordAlgo: PasswordAlgo.ARGON2ID });
    const { handler, credentials, passwordHasher, tokens } = buildHandler(cred);

    await handler.execute(command);

    expect(passwordHasher.verify).toHaveBeenCalledWith(
      'correct-password',
      'stored-hash',
      PasswordAlgo.ARGON2ID,
    );
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(credentials.migratePasswordHash).not.toHaveBeenCalled();
    expect(tokens.issueTokens).toHaveBeenCalled();
  });

  it('does not rehash a BCRYPT user on a failed login, and leaves passwordAlgo unchanged', async () => {
    const cred = buildCred({ passwordAlgo: PasswordAlgo.BCRYPT });
    const { handler, credentials, passwordHasher } = buildHandler(cred);
    passwordHasher.verify.mockResolvedValue(false);

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(credentials.migratePasswordHash).not.toHaveBeenCalled();
  });

  it('blocks a privileged mustResetPassword account even with correct credentials', async () => {
    const cred = buildCred({
      passwordAlgo: PasswordAlgo.BCRYPT,
      mustResetPassword: true,
    });
    const { handler, credentials, tokens } = buildHandler(cred);

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      PasswordResetRequiredException,
    );

    // No session issued, and no side-channel rehash — the account must go
    // through the explicit reset flow, not slip past via lazy rehash.
    expect(tokens.issueTokens).not.toHaveBeenCalled();
    expect(credentials.migratePasswordHash).not.toHaveBeenCalled();
  });

  it('still enforces account lockout ahead of any password check', async () => {
    const cred = buildCred({ lockoutUntil: new Date(Date.now() + 60_000) });
    const { handler, passwordHasher } = buildHandler(cred);

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      AccountLockedException,
    );
    expect(passwordHasher.verify).not.toHaveBeenCalled();
  });
});
