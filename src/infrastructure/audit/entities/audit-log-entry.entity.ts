/**
 * Audit log domain record — maps to audit_logs table.
 */
export class AuditLogEntry {
  constructor(
    readonly actorId: string | null,
    readonly action: string,
    readonly entityType: string,
    readonly entityId: string | null,
    readonly metadata: Record<string, unknown> = {},
    readonly ipAddress?: string,
    readonly userAgent?: string,
    readonly correlationId?: string,
  ) {}
}
