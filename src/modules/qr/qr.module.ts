import { Module } from '@nestjs/common';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AliasModule } from '@modules/alias/alias.module';
import { QrRepository } from './infrastructure/persistence/qr.repository';
import { QrController } from './presentation/http/qr.controller';

@Module({
  imports: [DatabaseModule, AuthModule, AliasModule],
  controllers: [QrController],
  providers: [QrRepository],
  exports: [QrRepository],
})
export class QrModule {}
