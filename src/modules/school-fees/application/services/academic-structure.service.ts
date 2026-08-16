import { Injectable } from '@nestjs/common';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class AcademicStructureService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  private async write(action: string, type: string, entity: { id: string }, actorId?: string) {
    await this.audit.record({ actorId: actorId ?? null, action, entityType: type, entityId: entity.id });
    return entity;
  }

  async createYear(merchantId: string, data: { name: string; startsOn?: Date; endsOn?: Date; isCurrent?: boolean }, actorId?: string) {
    if (data.isCurrent) await this.prisma.academicYear.updateMany({ where: { merchantId }, data: { isCurrent: false } });
    return this.write('ACADEMIC_YEAR_CREATED', 'academic_year', await this.prisma.academicYear.create({ data: { merchantId, ...data } }), actorId);
  }
  async updateYear(merchantId: string, id: string, data: { name?: string; startsOn?: Date; endsOn?: Date; isCurrent?: boolean }, actorId?: string) {
    if (data.isCurrent) await this.prisma.academicYear.updateMany({ where: { merchantId }, data: { isCurrent: false } });
    return this.write('ACADEMIC_YEAR_UPDATED', 'academic_year', await this.prisma.academicYear.update({ where: { id }, data: { ...data, merchantId } }), actorId);
  }
  listYears(merchantId: string) { return this.prisma.academicYear.findMany({ where: { merchantId }, include: { terms: true }, orderBy: { name: 'desc' } }); }

  async createTerm(merchantId: string, data: { academicYearId: string; name: string; sequence?: number; startsOn?: Date; endsOn?: Date }, actorId?: string) {
    return this.write('ACADEMIC_TERM_CREATED', 'academic_term', await this.prisma.academicTerm.create({ data: { merchantId, ...data } }), actorId);
  }
  async updateTerm(merchantId: string, id: string, data: { name?: string; sequence?: number; startsOn?: Date; endsOn?: Date }, actorId?: string) {
    return this.write('ACADEMIC_TERM_UPDATED', 'academic_term', await this.prisma.academicTerm.update({ where: { id }, data: { ...data, merchantId } }), actorId);
  }
  listTerms(merchantId: string, academicYearId?: string) { return this.prisma.academicTerm.findMany({ where: { merchantId, academicYearId }, orderBy: [{ academicYearId: 'desc' }, { sequence: 'asc' }] }); }

  async createClassLevel(merchantId: string, data: { code: string; name: string; sortOrder?: number; isActive?: boolean }, actorId?: string) {
    return this.write('CLASS_LEVEL_CREATED', 'class_level', await this.prisma.classLevel.create({ data: { merchantId, ...data } }), actorId);
  }
  async updateClassLevel(merchantId: string, id: string, data: { code?: string; name?: string; sortOrder?: number; isActive?: boolean }, actorId?: string) {
    return this.write('CLASS_LEVEL_UPDATED', 'class_level', await this.prisma.classLevel.update({ where: { id }, data: { ...data, merchantId } }), actorId);
  }
  listClassLevels(merchantId: string) { return this.prisma.classLevel.findMany({ where: { merchantId }, orderBy: { sortOrder: 'asc' } }); }
}
