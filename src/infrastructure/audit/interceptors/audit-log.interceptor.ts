import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../services/audit-log.service';
import type { Request } from 'express';

/**
 * Global audit interceptor — capture mutating HTTP calls when implemented.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly auditService: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.get<boolean>('audit.enabled')) {
      return next.handle();
    }
    return next.handle().pipe(
      tap(() => {
        const httpContext = context.switchToHttp();
        const req = httpContext.getRequest<Request>();

        // Only audit mutating requests (enterprise grade: avoid noise for reads)
        const method = req.method?.toUpperCase();
        if (!method || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          return;
        }

        const correlationId =
          (req.headers['x-correlation-id'] as string | undefined) ?? undefined;

        // False positive: Express.User is an empty interface by default in
        // this codebase (no global augmentation adds `sub`), so this
        // assertion is load-bearing — removing it is a real TS2339 build
        // error, not a no-op. (Confirmed by reproducing the break.)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const actorId = (req.user as { sub?: string } | undefined)?.sub ?? null;

        // Best-effort: route.path might not exist during all execution
        // types. req.route is loosely typed by @types/express; .path is a
        // real, safe runtime property on it.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const action = `${method} ${req.route?.path ?? req.path}`;

        // Best-effort by design: a failed audit write must never fail the
        // HTTP response it's describing. But it must not vanish silently
        // either — an unlogged catch here would mean the one place this
        // generic HTTP-level record was attempted leaves no trace at all
        // that it was ever lost. Logging keeps the failure observable
        // without touching the response.
        void this.auditService
          .record({
            actorId,
            action,
            entityType: 'http',
            entityId: null,
            correlationId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: {
              path: req.originalUrl,
            },
          })
          .catch((err) =>
            this.logger.error(
              `Audit write failed for ${action} (correlationId=${correlationId ?? 'none'}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }),
    );
  }
}
