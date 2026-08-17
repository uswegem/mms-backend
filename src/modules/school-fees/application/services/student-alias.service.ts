import { BadRequestException, Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { IdempotencyService } from '@infrastructure/idempotency/idempotency.service';
import {
  AliasRepository,
  StudentAliasCapacityExceededException,
} from '@modules/alias/infrastructure/persistence/alias.repository';
import { QrRepository } from '@modules/qr/infrastructure/persistence/qr.repository';
import { QrValidators } from '@modules/qr/validators/qr.validators';
import {
  QUEUE_ROUTING,
  type StudentAliasGeneratePayload,
} from '@infrastructure/queue/queue.constants';
import type { CsvImportRow } from './bulk-student-upload.service';

type Tx = Prisma.TransactionClient;

export interface CreateStudentInput {
  admissionNo: string;
  fullName: string;
  /// Mandatory (brief §4.3.4) — see Student.guardianPhone in schema.prisma.
  guardianPhone: string;
  parentEmail?: string;
  idempotencyKey?: string;
}

export interface BulkStudentRow extends CreateStudentInput {
  row: number;
}

export interface BatchConfirmResult {
  batchId: string;
  total: number;
  queued: number;
  skipped: number;
}

/**
 * Canonical current wording (brief §4.3.2) — owned server-side and stamped
 * onto StudentRosterUpload.consentStatementText at commit time, rather than
 * trusting client-supplied text, so a batch's record always reflects what
 * was actually shown to the uploader when they attested, even if this
 * wording changes later. Legal sufficiency of this exact text is still
 * pending LFB Compliance/Legal sign-off — see the brief's open questions.
 */
export const PARENTAL_CONSENT_STATEMENT =
  'The school confirms parental/guardian consent, or an equivalent lawful basis under the ' +
  'Personal Data Protection Act 2022, has been obtained for the students in this roster.';

@Injectable()
export class StudentAliasService {
  private readonly exchange: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: AliasRepository,
    private readonly qr: QrRepository,
    private readonly qrValidators: QrValidators,
    private readonly idempotency: IdempotencyService,
    private readonly amqp: AmqpConnection,
    private readonly config: ConfigService,
  ) {
    this.exchange = config.get<string>('rabbitmq.exchange') ?? 'mms.events';
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async listStudents(merchantId: string) {
    return this.prisma.student.findMany({
      where: { merchantId, deletedAt: null },
      include: { studentAlias: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Single enrol (synchronous: student + alias in one transaction) ────────

  async createStudent(
    merchantId: string,
    input: CreateStudentInput,
    actorId?: string,
  ) {
    return this.idempotency.withKey(
      `student:create:${merchantId}`,
      input.idempotencyKey,
      () => this.doCreateStudent(merchantId, input, actorId),
    );
  }

  private async doCreateStudent(
    merchantId: string,
    input: CreateStudentInput,
    actorId?: string,
  ) {
    await this.assertSchoolMerchant(merchantId);

    const existing = await this.prisma.student.findFirst({
      where: { merchantId, admissionNo: input.admissionNo, deletedAt: null },
      include: { studentAlias: true },
    });

    if (existing?.studentAlias) {
      if (!existing.studentAlias.isActive) {
        return this.reactivateStudent(existing.id, actorId);
      }
      throw new BadRequestException(
        `Student with admission ${input.admissionNo} already enrolled`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const student =
          existing ??
          (await tx.student.create({
            data: {
              merchantId,
              admissionNo: input.admissionNo,
              fullName: input.fullName,
              guardianPhone: input.guardianPhone,
              parentEmail: input.parentEmail,
            },
          }));

        const alias = await this.issueStudentAlias(
          tx,
          merchantId,
          student.id,
          actorId,
        );
        return { student, alias };
      });
    } catch (err) {
      if (err instanceof StudentAliasCapacityExceededException) throw err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Student with admission ${input.admissionNo} already enrolled`,
        );
      }
      throw err;
    }
  }

  // ── Async bulk confirm: creates Student records, queues alias generation ──

  async confirmBulkImport(
    merchantId: string,
    rows: CsvImportRow[],
    actorId: string,
    parentalConsentAttested: boolean,
  ): Promise<BatchConfirmResult> {
    if (!parentalConsentAttested) {
      throw new BadRequestException(
        'This roster cannot be committed without confirming the parental/guardian consent attestation.',
      );
    }

    await this.assertSchoolMerchant(merchantId);

    const batchId = crypto.randomUUID();
    let queued = 0;
    let skipped = 0;

    // Persisted before any student row is touched — the attestation covers
    // the whole batch, and its own record (who/when/exact wording shown)
    // must exist even if every row in the batch later fails for some other
    // reason.
    await this.prisma.studentRosterUpload.create({
      data: {
        merchantId,
        batchId,
        rowCount: rows.length,
        parentalConsentAttested: true,
        consentStatementText: PARENTAL_CONSENT_STATEMENT,
        attestedBy: actorId,
        attestedAt: new Date(),
      },
    });

    const rabbitmqEnabled =
      this.config.get<boolean>('rabbitmq.enabled') === true;

    for (const row of rows) {
      try {
        const existing = await this.prisma.student.findFirst({
          where: { merchantId, admissionNo: row.admissionNo, deletedAt: null },
          include: { studentAlias: true },
        });

        if (existing?.studentAlias?.isActive) {
          skipped++;
          continue;
        }

        // Create or update student record (no alias yet)
        let studentId: string;
        if (existing) {
          // Reactivate on next alias issue
          await this.prisma.student.update({
            where: { id: existing.id },
            data: {
              fullName: row.fullName,
              guardianPhone: row.guardianPhone ?? existing.guardianPhone,
              parentEmail: row.parentEmail ?? existing.parentEmail,
              isActive: true,
              status: 'ACTIVE',
            },
          });
          studentId = existing.id;
        } else {
          const student = await this.prisma.student.create({
            data: {
              merchantId,
              admissionNo: row.admissionNo,
              fullName: row.fullName,
              guardianPhone: row.guardianPhone,
              parentEmail: row.parentEmail,
            },
          });
          studentId = student.id;
        }

        // Publish alias-generation task to RabbitMQ
        const payload: StudentAliasGeneratePayload = {
          studentId,
          merchantId,
          actorId,
          batchId,
          row: row.row,
        };

        if (rabbitmqEnabled) {
          await this.amqp.publish(
            this.exchange,
            QUEUE_ROUTING.STUDENT_ALIAS_GENERATE,
            payload,
          );
        } else {
          // Fallback: synchronous for dev environments without RabbitMQ
          await this.prisma.$transaction(async (tx) =>
            this.issueStudentAlias(tx, merchantId, studentId, actorId),
          );
        }

        queued++;
      } catch {
        skipped++;
      }
    }

    return { batchId, total: rows.length, queued, skipped };
  }

  // ── Issue alias (called by consumer or direct enrol) ─────────────────────

  async issueStudentAliasById(
    studentId: string,
    merchantId: string,
    actorId?: string,
  ) {
    return this.prisma.$transaction(async (tx) =>
      this.issueStudentAlias(tx, merchantId, studentId, actorId),
    );
  }

  // ── Send QR to parent (queues email + SMS notifications) ─────────────────

  async sendQrToParent(
    studentId: string,
    channels: ('email' | 'sms')[],
  ): Promise<{ emailQueued: boolean; smsQueued: boolean }> {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        studentAlias: {
          include: { qrCode: { include: { payloadVersions: true } } },
        },
        merchant: true,
      },
    });

    if (!student.studentAlias) {
      throw new BadRequestException('Student has no active Lipa Namba alias');
    }

    const tlvPayload =
      student.studentAlias.qrCode?.payloadVersions[0]?.tlvPayload;
    const rabbitmqEnabled =
      this.config.get<boolean>('rabbitmq.enabled') === true;

    let emailQueued = false;
    let smsQueued = false;

    if (channels.includes('email') && student.parentEmail && tlvPayload) {
      const emailPayload = {
        studentId,
        parentEmail: student.parentEmail,
        fullName: student.fullName,
        alias10digit: student.studentAlias.alias10digit,
        schoolName: student.merchant.tradingName,
        tlvPayload,
      };
      if (rabbitmqEnabled) {
        await this.amqp.publish(
          this.exchange,
          QUEUE_ROUTING.NOTIFICATION_QR_EMAIL,
          emailPayload,
        );
      }
      emailQueued = true;
    }

    if (channels.includes('sms') && student.guardianPhone) {
      const smsPayload = {
        guardianPhone: student.guardianPhone,
        fullName: student.fullName,
        alias10digit: student.studentAlias.alias10digit,
        schoolName: student.merchant.tradingName,
      };
      if (rabbitmqEnabled) {
        await this.amqp.publish(
          this.exchange,
          QUEUE_ROUTING.NOTIFICATION_QR_SMS,
          smsPayload,
        );
      }
      smsQueued = true;
    }

    return { emailQueued, smsQueued };
  }

  // ── Fetch student with full alias + QR data (for PDF endpoint) ───────────

  async getStudentWithQr(studentId: string) {
    return this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        studentAlias: {
          include: { qrCode: { include: { payloadVersions: true } } },
        },
        merchant: true,
      },
    });
  }

  // ── Legacy synchronous bulk (kept for backward compat) ────────────────────

  async bulkUpload(
    merchantId: string,
    rows: BulkStudentRow[],
    actorId?: string,
    idempotencyKey?: string,
  ) {
    return this.idempotency.withKey(
      `student:bulk:${merchantId}`,
      idempotencyKey,
      () => this.doBulkUpload(merchantId, rows, actorId),
    );
  }

  private async doBulkUpload(
    merchantId: string,
    rows: BulkStudentRow[],
    actorId?: string,
  ) {
    await this.assertSchoolMerchant(merchantId);
    const results: Array<{
      row: number;
      admissionNo: string;
      status: 'created' | 'reactivated' | 'error';
      message?: string;
      studentId?: string;
      lipaNamba?: string;
    }> = [];

    for (const row of rows) {
      try {
        const existing = await this.prisma.student.findFirst({
          where: { merchantId, admissionNo: row.admissionNo, deletedAt: null },
          include: { studentAlias: true },
        });

        if (existing?.studentAlias) {
          if (!existing.studentAlias.isActive) {
            await this.reactivateStudent(existing.id, actorId);
            results.push({
              row: row.row,
              admissionNo: row.admissionNo,
              status: 'reactivated',
              studentId: existing.id,
              lipaNamba: existing.studentAlias.alias10digit,
            });
          } else {
            results.push({
              row: row.row,
              admissionNo: row.admissionNo,
              status: 'error',
              message: 'Student already active — alias unchanged',
              studentId: existing.id,
              lipaNamba: existing.studentAlias.alias10digit,
            });
          }
          continue;
        }

        const created = await this.createStudent(merchantId, row, actorId);
        if ('alias' in created) {
          results.push({
            row: row.row,
            admissionNo: row.admissionNo,
            status: 'created',
            studentId: created.student.id,
            lipaNamba: created.alias.alias10digit,
          });
        } else {
          results.push({
            row: row.row,
            admissionNo: row.admissionNo,
            status: 'created',
            studentId: (created as { id: string }).id,
            lipaNamba: (created as { studentAlias?: { alias10digit?: string } })
              .studentAlias?.alias10digit,
          });
        }
      } catch (err) {
        results.push({
          row: row.row,
          admissionNo: row.admissionNo,
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      total: rows.length,
      created: results.filter((r) => r.status === 'created').length,
      reactivated: results.filter((r) => r.status === 'reactivated').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async reactivateStudent(studentId: string, actorId?: string) {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { studentAlias: true },
    });
    if (!student.studentAlias) {
      throw new BadRequestException('Student has no alias to reactivate');
    }

    await this.prisma.student.update({
      where: { id: studentId },
      data: { isActive: true, status: 'ACTIVE', updatedAt: new Date() },
    });
    await this.prisma.studentAlias.update({
      where: { studentId },
      data: { isActive: true, tipsRegistered: false },
    });

    return this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { studentAlias: true },
    });
  }

  async issueStudentAlias(
    tx: Tx,
    merchantId: string,
    studentId: string,
    actorId?: string,
  ) {
    const { alias10digit, acquirerCode3, aliasSeq6 } =
      await this.aliases.generateStudentAlias(tx);

    const merchant = await tx.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { profile: true, acquirer: true },
    });

    if (!merchant.profile?.city?.trim()) {
      throw new BadRequestException(
        'Merchant profile city is required before TANQR issuance',
      );
    }
    if (!merchant.profile?.postalCode) {
      throw new BadRequestException(
        'Merchant profile postal code is required before TANQR issuance',
      );
    }

    const acquirerId5 = this.qrValidators.resolveAcquirerId5({
      acquirerTipsAcquirerId5: merchant.acquirer.tipsAcquirerId5,
    });
    const tipsParticipantCode =
      merchant.acquirer.tipsParticipantCode ?? acquirerId5.slice(-3);
    const { merchantId15 } = await this.qrValidators.ensureTipsRegistration(
      merchantId,
      acquirerId5,
      tipsParticipantCode,
      tx,
    );

    const qr = await this.qr.createStaticQr(
      {
        merchantId,
        studentId,
        merchantName: merchant.tradingName,
        city: merchant.profile.city,
        postalCode: merchant.profile.postalCode,
        mcc: merchant.mcc,
        merchantId15,
        storeLabel: alias10digit,
        acquirerId5,
        createdBy: actorId,
      },
      tx,
    );

    return tx.studentAlias.create({
      data: {
        studentId,
        merchantId,
        alias10digit,
        acquirerCode3,
        aliasSeq6,
        qrCodeId: qr.id,
      },
    });
  }

  private async assertSchoolMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant?.isSchool) {
      throw new BadRequestException('Merchant is not a school');
    }
    if (merchant.status !== 'ACTIVE') {
      throw new BadRequestException('School merchant must be ACTIVE');
    }
  }
}
