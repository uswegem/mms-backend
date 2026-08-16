import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeeStructureStatus, Prisma } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { money } from '../../domain/fee-money.util';

type ItemInput = { code: string; name: string; amount: string; isMandatory?: boolean; dueDate?: Date; sortOrder?: number };

@Injectable()
export class FeeStructureService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async createDraft(merchantId: string, input: { academicYearId: string; academicTermId: string; classLevelId: string; name: string; items: ItemInput[] }, actorId?: string) {
    const { academicYearId, academicTermId, classLevelId, name, items } = input;
    const version = await this.nextVersion(merchantId, { academicYearId, academicTermId, classLevelId });
    const structure = await this.prisma.feeStructure.create({
      data: {
        merchantId,
        academicYearId,
        academicTermId,
        classLevelId,
        name,
        version,
        createdBy: actorId,
        items: { create: items.map((item) => ({ ...item, amount: money(item.amount) })) },
      },
      include: { items: true },
    });
    await this.record('FEE_STRUCTURE_CREATED', structure.id, actorId);
    return structure;
  }

  async updateDraft(merchantId: string, id: string, input: { name?: string; items: ItemInput[] }, actorId?: string) {
    const structure = await this.draft(merchantId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.feeStructureItem.deleteMany({ where: { feeStructureId: id } });
      return tx.feeStructure.update({
        where: { id }, data: { name: input.name ?? structure.name, items: { create: input.items.map((item) => ({ ...item, amount: money(item.amount) })) } }, include: { items: true },
      });
    });
    await this.record('FEE_STRUCTURE_UPDATED', id, actorId);
    return updated;
  }

  async publish(merchantId: string, id: string, actorId?: string) {
    await this.draft(merchantId, id);
    const published = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.feeStructure.findUniqueOrThrow({ where: { id } });
      await tx.feeStructure.updateMany({ where: { merchantId, academicYearId: candidate.academicYearId, academicTermId: candidate.academicTermId, classLevelId: candidate.classLevelId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
      return tx.feeStructure.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() }, include: { items: true } });
    });
    await this.record('FEE_STRUCTURE_PUBLISHED', id, actorId);
    return published;
  }

  async archive(merchantId: string, id: string, actorId?: string) {
    await this.getOwned(merchantId, id);
    const result = await this.prisma.feeStructure.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await this.record('FEE_STRUCTURE_ARCHIVED', id, actorId);
    return result;
  }

  async deleteDraft(merchantId: string, id: string) {
    await this.draft(merchantId, id);
    if (await this.prisma.feeInvoice.count({ where: { feeStructureId: id } })) throw new BadRequestException('Cannot delete a fee structure with invoices');
    return this.prisma.feeStructure.delete({ where: { id } });
  }

  async amendPublished(merchantId: string, id: string, actorId?: string) {
    const source = await this.getOwned(merchantId, id);
    if (source.status !== 'PUBLISHED') throw new BadRequestException('Only published structures may be amended');
    const items = await this.prisma.feeStructureItem.findMany({ where: { feeStructureId: id } });
    return this.createDraft(merchantId, { academicYearId: source.academicYearId, academicTermId: source.academicTermId, classLevelId: source.classLevelId, name: source.name, items: items.map((x) => ({ code: x.code, name: x.name, amount: x.amount.toString(), isMandatory: x.isMandatory, dueDate: x.dueDate ?? undefined, sortOrder: x.sortOrder })) }, actorId);
  }

  list(merchantId: string) { return this.prisma.feeStructure.findMany({ where: { merchantId }, include: { items: true, academicYear: true, academicTerm: true, classLevel: true }, orderBy: { createdAt: 'desc' } }); }
  async get(merchantId: string, id: string) { return this.prisma.feeStructure.findFirstOrThrow({ where: { id, merchantId }, include: { items: true, academicYear: true, academicTerm: true, classLevel: true } }); }

  private async nextVersion(
    merchantId: string,
    input: Pick<Prisma.FeeStructureUncheckedCreateInput, 'academicYearId' | 'academicTermId' | 'classLevelId'>,
  ) {
    const previous = await this.prisma.feeStructure.aggregate({
      where: {
        merchantId,
        academicYearId: input.academicYearId,
        academicTermId: input.academicTermId,
        classLevelId: input.classLevelId,
      },
      _max: { version: true },
    });
    return (previous._max.version ?? 0) + 1;
  }
  private async getOwned(merchantId: string, id: string) { const value = await this.prisma.feeStructure.findFirst({ where: { id, merchantId } }); if (!value) throw new NotFoundException('Fee structure not found'); return value; }
  private async draft(merchantId: string, id: string) { const value = await this.getOwned(merchantId, id); if (value.status !== FeeStructureStatus.DRAFT) throw new BadRequestException('Fee structure is not a draft'); return value; }
  private record(action: string, id: string, actorId?: string) { return this.audit.record({ actorId: actorId ?? null, action, entityType: 'fee_structure', entityId: id }); }
}
