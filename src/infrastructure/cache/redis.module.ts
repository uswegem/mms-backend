import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis | null => {
        if (!config.get<boolean>('redis.enabled')) return null;
        const url = config.get<string>('redis.url');
        if (!url) return null;
        return new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
