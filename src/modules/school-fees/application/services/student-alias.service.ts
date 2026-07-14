import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId } from '@shared/domain/alias/damm.util';
import {
  DEFAULT_TIPS_ACQUIRER_ID5,
  LIPA_NAMBA_BLOCKS,
} from '@shared/domain/alias/alias.constants';
import { AliasRepository } from '@modules/alias/infrastructure/persistence/alias.repository';
import { QrRepository } from '@modules/qr/infrastructure/persistence/qr.repository';

type Tx = Prisma.TransactionClient;

export interface CreateStudentInput {
  admissionNo: string;
  fullName: string;
  guardianPhone?: string;
}

export interface BulkStudentRow extends CreateStudentInput {
  row: number;
}

@Injectable()
export class StudentAliasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: AliasRepository,
    private readonly qr: QrRepository,
  ) {}

  async listStudents(merchantId: string) {
    return this.prisma.student.findMany({
      where: { merchantId, deletedAt: null },
      include: { studentAlias: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStudent(
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

    return this.prisma.$transaction(async (tx) => {
      const student =
        existing ??
        (await tx.student.create({
          data: {
            merchantId,
            admissionNo: input.admissionNo,
            fullName: input.fullName,
            guardianPhone: input.guardianPhone,
          },
        }));

      const alias = await this.issueStudentAlias(tx, merchantId, student.id, actorId);
      return { student, alias };
    });
  }

  async bulkUpload(
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
          where: {
            merchantId,
            admissionNo: row.admissionNo,
            deletedAt: null,
          },
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
              lipaNamba: existing.studentAlias.alias8digit,
            });
          } else {
            results.push({
              row: row.row,
              admissionNo: row.admissionNo,
              status: 'error',
              message: 'Student already active — alias unchanged',
              studentId: existing.id,
              lipaNamba: existing.studentAlias.alias8digit,
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
            lipaNamba: created.alias.alias8digit,
          });
        } else {
          results.push({
            row: row.row,
            admissionNo: row.admissionNo,
            status: 'created',
            studentId: created.id,
            lipaNamba: created.studentAlias?.alias8digit,
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
      data: { isActive: true, updatedAt: new Date() },
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

  private async issueStudentAlias(
    tx: Tx,
    merchantId: string,
    studentId: string,
    actorId?: string,
  ) {
    const schoolSeq = await tx.schoolSequence.findUnique({
      where: { merchantId },
    });
    if (!schoolSeq) {
      throw new BadRequestException(
        'School sequence not assigned — complete school onboarding approval first',
      );
    }

    const updatedSeq = await tx.schoolSequence.update({
      where: { merchantId },
      data: { lastStudentSeq: { increment: 1 } },
    });
    const studentSeq4 = updatedSeq.lastStudentSeq.toString().padStart(4, '0');

    const generated = await this.aliases.generatePublicAlias(
      tx,
      LIPA_NAMBA_BLOCKS.SCHOOL,
    );
    const internalId8digit = buildEightDigitId(
      schoolSeq.schoolSeq3,
      studentSeq4,
    );

    const merchant = await tx.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { profile: true, acquirer: true },
    });

    const qr = await this.qr.createStaticQr({
      merchantId,
      studentId,
      merchantName: merchant.tradingName,
      city: merchant.profile?.city ?? 'Dar es Salaam',
      postalCode: merchant.profile?.postalCode ?? '11000',
      mcc: merchant.mcc,
      publicAlias: generated.alias8digit,
      acquirerId5: merchant.acquirer.tipsAcquirerId5 ?? DEFAULT_TIPS_ACQUIRER_ID5,
      internalRoutingId: internalId8digit,
      createdBy: actorId,
    }, tx);

    return tx.studentAlias.create({
      data: {
        studentId,
        merchantId,
        alias8digit: generated.alias8digit,
        internalId8digit,
        acquirerCode3: generated.acquirerCode3,
        aliasSeq4: generated.aliasSeq4,
        schoolSeq3: schoolSeq.schoolSeq3,
        studentSeq4,
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
