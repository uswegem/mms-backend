import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
    // Drives PasswordMigrationBackstopJob (identity module) — no BullMQ in
    // this codebase, and a single daily sweep doesn't need one.
    ScheduleModule.forRoot(),
    InfrastructureModule,
    ModulesModule,
  ],
})
export class AppModule {}
