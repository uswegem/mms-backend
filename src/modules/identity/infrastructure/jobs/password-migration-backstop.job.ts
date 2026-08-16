import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '@infrastructure/email/email.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { UserRepository, NotifiableUser } from '../persistence/user.repository';
import { AuthCredentialRepository } from '../persistence/auth-credential.repository';

const MS_PER_DAY = 86_400_000;

/**
 * 90-day backstop for the Argon2id migration (brief §1.4). Closes the gap a
 * pure lazy-rehash approach leaves open — a dormant account could otherwise
 * sit on BCRYPT indefinitely, since rehashing only happens on login.
 *
 * The clock is global (one ARGON2_MIGRATION_START_DATE for every account,
 * not per-account creation date), so this job's two phases fire for
 * everyone still on BCRYPT on the same two calendar days: a warning a few
 * days out, then the forced-reset flag once the deadline passes. No BullMQ
 * in this codebase (RabbitMQ fills that role instead) — @nestjs/schedule's
 * cron is the right-sized tool for a single daily sweep like this.
 */
@Injectable()
export class PasswordMigrationBackstopJob {
  private readonly logger = new Logger(PasswordMigrationBackstopJob.name);

  constructor(
    private readonly users: UserRepository,
    private readonly credentials: AuthCredentialRepository,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const startDate = new Date(
      this.config.get<string>('auth.argon2MigrationStartDate')!,
    );
    const backstopDays =
      this.config.get<number>('auth.argon2BackstopDays') ?? 90;
    const warningDays =
      this.config.get<number>('auth.argon2BackstopWarningDays') ?? 7;
    const daysElapsed = (Date.now() - startDate.getTime()) / MS_PER_DAY;

    if (daysElapsed >= backstopDays) {
      await this.flagOverdueAccounts();
    } else if (daysElapsed >= backstopDays - warningDays) {
      await this.warnApproachingAccounts();
    }
  }

  private async flagOverdueAccounts(): Promise<void> {
    const overdue = await this.users.findBcryptUsersNotFlagged();
    for (const user of overdue) {
      await this.credentials.setMustResetPassword(user.id, true);
      await this.sendNotice(user, {
        subject: 'Action required: reset your MMS password',
        body:
          `Hello ${user.fullName},\n\n` +
          'Your MMS account password has not been upgraded to our current ' +
          'security standard. You now need to set a new password before ' +
          'you can sign in again.\n\n' +
          'Use "Forgot password" on the login page to set a new one.',
      });
      await this.audit.record({
        actorId: null,
        action: 'AUTH_PASSWORD_RESET_BACKSTOP_FLAGGED',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email },
      });
    }
    if (overdue.length > 0) {
      this.logger.warn(
        `Argon2id 90-day backstop: flagged ${overdue.length} account(s) for forced reset.`,
      );
    }
  }

  private async warnApproachingAccounts(): Promise<void> {
    const approaching = await this.users.findBcryptUsersNotWarned();
    for (const user of approaching) {
      await this.credentials.markResetWarningSent(user.id);
      await this.sendNotice(user, {
        subject: 'Upcoming: your MMS password will need to be reset',
        body:
          `Hello ${user.fullName},\n\n` +
          'In a few days, MMS will require you to set a new password as ' +
          "part of a security upgrade. You don't need to do anything yet " +
          '— you can reset it any time before then using "Forgot password" ' +
          'on the login page to avoid being interrupted later.',
      });
    }
    if (approaching.length > 0) {
      this.logger.log(
        `Argon2id 90-day backstop: sent warning to ${approaching.length} account(s).`,
      );
    }
  }

  private async sendNotice(
    user: NotifiableUser,
    { subject, body }: { subject: string; body: string },
  ): Promise<void> {
    if (!this.email.isEnabled()) return;
    await this.email.sendEmail({
      to: user.email,
      subject,
      text: body,
    });
  }
}
