import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@infrastructure/cache/redis.constants';

const PROCESSING_MARKER = '__PROCESSING__';
const DEFAULT_LOCK_TTL_SECONDS = 30;
const DEFAULT_RESULT_TTL_SECONDS = 24 * 60 * 60;

/**
 * De-duplicates a mutating request keyed by a client-supplied idempotency
 * key (e.g. an Idempotency-Key header) — a flaky-connection client timeout
 * + retry must not re-run the underlying operation. Backed by Redis (via
 * the globally-provided REDIS_CLIENT, already used by RbacService for
 * permission caching); best-effort and a safe no-op when Redis is
 * unavailable, since this is a safety net, not a hard dependency the
 * caller requires to function.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  /**
   * Runs `fn` at most once per (scope, key). A concurrent call sharing an
   * in-flight key throws ConflictException rather than racing into a
   * duplicate; a sequential retry after completion replays the cached
   * result verbatim. On failure the lock is released so a genuine retry
   * isn't permanently blocked.
   */
  async withKey<T>(
    scope: string,
    key: string | undefined,
    fn: () => Promise<T>,
    options: { lockTtlSeconds?: number; resultTtlSeconds?: number } = {},
  ): Promise<T> {
    if (!key || !this.redis) {
      return fn();
    }

    const lockTtl = options.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;
    const resultTtl = options.resultTtlSeconds ?? DEFAULT_RESULT_TTL_SECONDS;
    const cacheKey = `idem:${scope}:${key}`;

    const claimed = await this.redis.set(cacheKey, PROCESSING_MARKER, 'EX', lockTtl, 'NX');
    if (claimed !== 'OK') {
      const existing = await this.redis.get(cacheKey);
      if (existing && existing !== PROCESSING_MARKER) {
        return JSON.parse(existing) as T;
      }
      throw new ConflictException(
        'A request with this Idempotency-Key is already being processed',
      );
    }

    try {
      const result = await fn();
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', resultTtl);
      return result;
    } catch (err) {
      await this.redis.del(cacheKey);
      throw err;
    }
  }
}
