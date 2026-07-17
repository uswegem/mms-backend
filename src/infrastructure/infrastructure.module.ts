import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './cache/redis.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { QueueModule } from './queue/queue.module';
import { SupabaseModule } from './integrations/supabase/supabase.module';
import { EmailModule } from './email/email.module';
import { JwtAuthGuard } from './auth/rbac/guards/jwt-auth.guard';
import { RolesGuard } from './auth/rbac/guards/roles.guard';
import { PermissionsGuard } from './auth/rbac/guards/permissions.guard';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
    HealthModule,
    RedisModule,
    IdempotencyModule,
    QueueModule.register(),
    SupabaseModule,
    EmailModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class InfrastructureModule {}
