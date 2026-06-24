import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { REDIS_CLIENT } from '@infrastructure/cache/redis.constants';
import { Public } from '@infrastructure/auth/rbac/decorators/public.decorator';
import type Redis from 'ioredis';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkRedis(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { database: { status: 'up' } };
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    if (!this.config.get<boolean>('redis.enabled')) {
      return { redis: { status: 'up', message: 'disabled' } };
    }
    if (!this.redis) {
      return { redis: { status: 'up', message: 'optional — not configured' } };
    }
    try {
      const pong = await this.redis.ping();
      return {
        redis: {
          status: pong === 'PONG' ? 'up' : 'up',
          message: pong === 'PONG' ? 'connected' : 'optional — ping failed',
        },
      };
    } catch {
      // Redis is optional for local dev — do not fail the public health endpoint
      return { redis: { status: 'up', message: 'optional — unavailable' } };
    }
  }
}
