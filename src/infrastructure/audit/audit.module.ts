import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogService } from './services/audit-log.service';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';

@Module({
  providers: [
    AuditLogService,
    AuditLogRepository,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
  exports: [AuditLogService, AuditLogRepository],
})
export class AuditModule {}
