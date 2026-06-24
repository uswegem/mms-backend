import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('rabbitmq.url')!,
        exchanges: config.get<boolean>('rabbitmq.enabled')
          ? [{ name: config.get<string>('rabbitmq.exchange')!, type: 'topic' as const }]
          : [],
        connectionInitOptions: { wait: false },
        enableControllerDiscovery: false,
      }),
    }),
  ],
})
export class QueueModule {}
