import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './cache/redis.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { QueueModule } from './queue/queue.module';
import { SupabaseModule } from './integrations/supabase/supabase.module';
import { EmailModule } from './email/email.module';
import { ThrottlerConfigModule } from './throttler/throttler.module';
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
    ThrottlerConfigModule,
  ],
  providers: [
    // ThrottlerGuard runs first so rate limits apply even to @Public()
    // routes (login, password reset) before auth/permission checks execute.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class InfrastructureModule {}
