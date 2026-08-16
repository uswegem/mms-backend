import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/redis.constants';

/**
 * Global rate limiting (brief §5 — "rate limiting on auth endpoints
 * specifically, tighter than general API limits, to blunt
 * credential-stuffing/brute-force").
 *
 * Storage is Redis-backed when Redis is enabled/reachable, so limits hold
 * across horizontally scaled instances. Falls back to @nestjs/throttler's
 * built-in in-memory storage (single-instance only) when Redis is disabled —
 * REDIS_CLIENT resolves to null in that case (see cache/redis.module.ts).
 */
@Module({
  imports: [
    NestThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, redis: Redis | null) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('throttle.ttlMs') ?? 60_000,
            limit: config.get<number>('throttle.defaultLimit') ?? 120,
          },
        ],
        storage: redis ? new ThrottlerStorageRedisService(redis) : undefined,
      }),
    }),
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerConfigModule {}
