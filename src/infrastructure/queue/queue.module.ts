import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule, AmqpConnection } from '@golevelup/nestjs-rabbitmq';

@Module({})
export class QueueModule {
  static register(): DynamicModule {
    const enabled = process.env.RABBITMQ_ENABLED !== 'false';

    if (!enabled) {
      return {
        global: true,
        module: QueueModule,
        providers: [
          {
            provide: AmqpConnection,
            useValue: { publish: async () => {} } as unknown as AmqpConnection,
          },
        ],
        exports: [AmqpConnection],
      };
    }

    return {
      global: true,
      module: QueueModule,
      imports: [
        RabbitMQModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            uri: config.get<string>('rabbitmq.url')!,
            exchanges: [{ name: config.get<string>('rabbitmq.exchange')!, type: 'topic' as const }],
            connectionInitOptions: { wait: false },
            enableControllerDiscovery: true,
          }),
        }),
      ],
      exports: [RabbitMQModule],
    };
  }
}
