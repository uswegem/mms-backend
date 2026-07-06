import { Injectable } from '@nestjs/common';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';

@Injectable()
export class AuthzAuditService {
  constructor(private readonly audit: AuditLogService) {}

  async recordRoleChange(
    actorId: string,
    action: string,
    roleId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actorId,
      action,
      entityType: 'role',
      entityId: roleId,
      metadata,
    });
  }

  async recordPolicyOverrideChange(
    actorId: string,
    action: string,
    overrideId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actorId,
      action,
      entityType: 'policy_override',
      entityId: overrideId,
      metadata,
    });
  }
}
