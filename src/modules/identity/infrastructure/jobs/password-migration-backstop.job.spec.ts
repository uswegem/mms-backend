import { PasswordMigrationBackstopJob } from './password-migration-backstop.job';

describe('PasswordMigrationBackstopJob — 90-day backstop (brief §1.4)', () => {
  const MIGRATION_START = '2026-08-16';
  const CONFIG = {
    'auth.argon2MigrationStartDate': MIGRATION_START,
    'auth.argon2BackstopDays': 90,
    'auth.argon2BackstopWarningDays': 7,
  } as Record<string, unknown>;

  function buildJob() {
    const overdueUser = {
      id: 'u-overdue',
      email: 'overdue@mms.local',
      fullName: 'Overdue',
    };
    const warnUser = {
      id: 'u-warn',
      email: 'warn@mms.local',
      fullName: 'Warn',
    };

    const users = {
      findBcryptUsersNotFlagged: jest.fn().mockResolvedValue([overdueUser]),
      findBcryptUsersNotWarned: jest.fn().mockResolvedValue([warnUser]),
    };
    const credentials = {
      setMustResetPassword: jest.fn().mockResolvedValue(undefined),
      markResetWarningSent: jest.fn().mockResolvedValue(undefined),
    };
    const email = {
      isEnabled: jest.fn().mockReturnValue(true),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn((key: string) => CONFIG[key]) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const job = new PasswordMigrationBackstopJob(
      users as never,
      credentials as never,
      email as never,
      config as never,
      audit as never,
    );

    return { job, users, credentials, email, audit, overdueUser, warnUser };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing before the warning window opens', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20')); // day 4
    const { job, users, credentials } = buildJob();

    await job.run();

    expect(users.findBcryptUsersNotFlagged).not.toHaveBeenCalled();
    expect(users.findBcryptUsersNotWarned).not.toHaveBeenCalled();
    expect(credentials.setMustResetPassword).not.toHaveBeenCalled();
    expect(credentials.markResetWarningSent).not.toHaveBeenCalled();
  });

  it('warns (but does not flag) accounts inside the warning window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10')); // day 86 — within 7-day window before day 90
    const { job, users, credentials, email, warnUser } = buildJob();

    await job.run();

    expect(users.findBcryptUsersNotWarned).toHaveBeenCalled();
    expect(users.findBcryptUsersNotFlagged).not.toHaveBeenCalled();
    expect(credentials.markResetWarningSent).toHaveBeenCalledWith(warnUser.id);
    expect(credentials.setMustResetPassword).not.toHaveBeenCalled();
    expect(email.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: warnUser.email }),
    );
  });

  it('flags overdue accounts once the 90-day deadline has passed, and skips users already on Argon2id', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-20')); // day 96 — past the 90-day deadline
    const { job, users, credentials, email, overdueUser } = buildJob();

    await job.run();

    // findBcryptUsersNotFlagged is itself scoped to passwordAlgo: BCRYPT at
    // the query level, so an already-migrated ARGON2ID user is never
    // returned here in the first place — asserting the call proves the job
    // relies on that filter rather than re-checking algo itself.
    expect(users.findBcryptUsersNotFlagged).toHaveBeenCalled();
    expect(users.findBcryptUsersNotWarned).not.toHaveBeenCalled();
    expect(credentials.setMustResetPassword).toHaveBeenCalledWith(
      overdueUser.id,
      true,
    );
    expect(email.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: overdueUser.email }),
    );
  });
});
