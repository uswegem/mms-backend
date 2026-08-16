import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { BulkStudentUploadService } from './bulk-student-upload.service';
import { StudentAliasService } from './student-alias.service';

@Injectable()
export class StudentRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: StudentAliasService,
    private readonly bulk: BulkStudentUploadService,
  ) {}

  async updateStudent(merchantId: string, studentId: string, input: {
    fullName?: string; guardianName?: string; guardianPhone?: string; status?: StudentStatus;
  }) {
    await this.mustStudent(merchantId, studentId);
    return this.prisma.student.update({
      where: { id: studentId },
      data: { ...input, isActive: input.status ? input.status === 'ACTIVE' : undefined },
    });
  }

  async enrollStudent(merchantId: string, studentId: string, academicYearId: string, classLevelId: string) {
    await this.mustStudent(merchantId, studentId);
    const [year, level] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: academicYearId, merchantId } }),
      this.prisma.classLevel.findFirst({ where: { id: classLevelId, merchantId, isActive: true } }),
    ]);
    if (!year || !level) throw new BadRequestException('Academic year or active class level not found');
    await this.prisma.studentEnrollment.updateMany({
      where: { studentId, isCurrent: true }, data: { isCurrent: false, leftAt: new Date() },
    });
    return this.prisma.studentEnrollment.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId } },
      create: { merchantId, studentId, academicYearId, classLevelId, isCurrent: true },
      update: { classLevelId, isCurrent: true, leftAt: null },
    });
  }

  promoteStudent(merchantId: string, studentId: string, academicYearId: string, classLevelId: string) {
    return this.enrollStudent(merchantId, studentId, academicYearId, classLevelId);
  }

  async getStudent(merchantId: string, studentId: string) {
    await this.mustStudent(merchantId, studentId);
    return this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { studentAlias: true, enrollments: { include: { academicYear: true, classLevel: true } } },
    });
  }

  list(merchantId: string, filters: { status?: StudentStatus; classLevelId?: string; academicYearId?: string; search?: string } = {}) {
    return this.prisma.student.findMany({
      where: {
        merchantId, deletedAt: null, status: filters.status,
        ...(filters.search ? { OR: [{ fullName: { contains: filters.search, mode: 'insensitive' } }, { admissionNo: { contains: filters.search, mode: 'insensitive' } }] } : {}),
        ...(filters.classLevelId || filters.academicYearId ? { enrollments: { some: { isCurrent: true, classLevelId: filters.classLevelId, academicYearId: filters.academicYearId } } } : {}),
      },
      include: { studentAlias: true, enrollments: { where: { isCurrent: true }, include: { classLevel: true, academicYear: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  async bulkImportWithErrors(merchantId: string, file?: { buffer: Buffer }, csvText?: string, actorId?: string) {
    const rows = await this.bulk.parseInput(file, csvText);
    const result = await this.aliases.bulkUpload(merchantId, rows, actorId);
    const errorCsv = ['row,admission_no,error', ...result.results.filter((r) => r.status === 'error')
      .map((r) => `${r.row},"${r.admissionNo.replace(/"/g, '""')}","${(r.message ?? '').replace(/"/g, '""')}"`)].join('\n');
    return { ...result, errorCsv };
  }

  private async mustStudent(merchantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, merchantId, deletedAt: null } });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }
}
