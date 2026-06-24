import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import configuration from '@infrastructure/config/configuration';
import { envValidationSchema } from '@infrastructure/config/env.validation';
import { InfrastructureModule } from '@infrastructure/infrastructure.module';
import { ModulesModule } from '@modules/modules.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),
    CqrsModule.forRoot(),
    InfrastructureModule,
    ModulesModule,
  ],
})
export class AppModule {}
