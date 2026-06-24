import {
  CallHandler,
  ExecutionContext,
  Injectable,
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

        const actorId =
          (req.user as { sub?: string } | undefined)?.sub ?? null;

        // Best-effort: route.path might not exist during all execution types.
        const action = `${method} ${req.route?.path ?? req.path}`;

        void this.auditService.record({
          actorId,
          action,
          entityType: 'http',
          entityId: null,
          correlationId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          metadata: {
            path: req.originalUrl,
          },
        }).catch(() => undefined);
      }),
    );
  }
}
