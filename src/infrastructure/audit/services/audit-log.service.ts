import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuditLogEntry } from '../entities/audit-log-entry.entity';

export interface AuditRecordInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.repository.create(
      new AuditLogEntry(
        input.actorId,
        input.action,
        input.entityType,
        input.entityId,
        input.metadata ?? {},
        input.ipAddress,
        input.userAgent,
        input.correlationId,
      ),
    );
  }
}
