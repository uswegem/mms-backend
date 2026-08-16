import { PasswordAlgo, UserStatus } from '@prisma/client';
import { LoginHandler } from './login.handler';
import { ResetPasswordHandler } from './reset-password.handler';
import { LoginCommand } from '../commands/login.command';
import { ResetPasswordCommand } from '../commands/reset-password.command';
import { PasswordResetRequiredException } from '../../domain/exceptions/auth.exceptions';

/**
 * End-to-end (handler-level, not HTTP) walk through the forced-reset flow:
 * a flagged user is blocked at login -> completes a reset -> the flag and
 * the BCRYPT hash are gone -> a subsequent login succeeds normally.
 *
 * Wires LoginHandler and ResetPasswordHandler against a single shared
 * in-memory record, standing in for the row both handlers act on through
 * their real repositories. This exercises the actual handler logic making
 * the state transition — it's not a full HTTP/DB e2e test, which this repo
 * doesn't yet have scaffolding for.
 */
describe('Forced password reset — end-to-end handler flow (brief §1.3)', () => {
  it('lets a flagged privileged user through only after they reset', async () => {
    const store = {
      id: 'user-1',
      email: 'admin@mms.local',
      status: UserStatus.ACTIVE,
      authCredential: {
        passwordHash: 'old-bcrypt-hash',
        passwordAlgo: PasswordAlgo.BCRYPT,
        mustResetPassword: true,
        mfaEnabled: false,
        lockoutUntil: null as Date | null,
      },
    };

    const users = {
      findByEmail: jest.fn().mockImplementation(() => Promise.resolve(store)),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    const credentials = {
      recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
      resetFailedAttempts: jest.fn().mockResolvedValue(undefined),
      migratePasswordHash: jest.fn().mockResolvedValue(undefined),
      updatePassword: jest
        .fn()
        .mockImplementation((_userId: string, hash: string) => {
          store.authCredential = {
            ...store.authCredential,
            passwordHash: hash,
            passwordAlgo: PasswordAlgo.ARGON2ID,
            mustResetPassword: false,
          };
          return Promise.resolve();
        }),
    };
    const loginAttempts = { record: jest.fn().mockResolvedValue(undefined) };
    const passwordHasher = {
      currentAlgorithm: PasswordAlgo.ARGON2ID,
      // Old password verifies against BCRYPT; new password is whatever hash()
      // returns, verified back against ARGON2ID on the second login.
      verify: jest
        .fn()
        .mockImplementation((plain: string, hash: string) =>
          Promise.resolve(
            plain === 'OldPassword1!'
              ? hash === 'old-bcrypt-hash'
              : hash === 'new-argon2id-hash',
          ),
        ),
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
      hashToken: jest.fn((t: string) => `hashed:${t}`),
    };
    const mfa = { verifyCode: jest.fn(), decryptSecret: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(5) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const enrichedAuth = {
      fromDbUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };

    const loginHandler = new LoginHandler(
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

    // 1. Correct old credentials still don't grant a session.
    await expect(
      loginHandler.execute(
        new LoginCommand(
          'admin@mms.local',
          'OldPassword1!',
          undefined,
          '1.2.3.4',
          'jest',
        ),
      ),
    ).rejects.toBeInstanceOf(PasswordResetRequiredException);

    // 2. Complete the reset (token validity itself is ForgotPasswordHandler's
    // concern, exercised separately — assume a valid token here).
    const passwordResets = {
      findValidByHash: jest
        .fn()
        .mockResolvedValue({ id: 'reset-1', userId: 'user-1' }),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };
    const refreshTokens = {
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };

    const resetHandler = new ResetPasswordHandler(
      passwordResets as never,
      credentials as never,
      refreshTokens as never,
      passwordHasher,
      tokens as never,
      audit as never,
    );

    await resetHandler.execute(
      new ResetPasswordCommand('raw-token', 'NewPassword1!'),
    );

    expect(store.authCredential.mustResetPassword).toBe(false);
    expect(store.authCredential.passwordAlgo).toBe(PasswordAlgo.ARGON2ID);
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');

    // 3. A subsequent login with the new password succeeds normally.
    const result = await loginHandler.execute(
      new LoginCommand(
        'admin@mms.local',
        'NewPassword1!',
        undefined,
        '1.2.3.4',
        'jest',
      ),
    );
    expect(result.accessToken).toBe('access');
    expect(store.authCredential.mustResetPassword).toBe(false);
  });
});
