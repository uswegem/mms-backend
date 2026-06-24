import { Module } from '@nestjs/common';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AliasRepository } from './infrastructure/persistence/alias.repository';
import { MerchantAliasService } from './application/services/merchant-alias.service';
import { AliasController } from './presentation/http/alias.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AliasController],
  providers: [AliasRepository, MerchantAliasService],
  exports: [AliasRepository, MerchantAliasService],
})
export class AliasModule {}
