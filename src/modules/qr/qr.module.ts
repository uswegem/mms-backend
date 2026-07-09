import { Module } from '@nestjs/common';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AliasModule } from '@modules/alias/alias.module';
import { MerchantsModule } from '@modules/merchants/merchants.module';
import { QrRendererService } from './application/services/qr-renderer.service';
import { QrStorageService } from './application/services/qr-storage.service';
import { QrAnnex2DisplayService } from './application/services/qr-annex2-display.service';
import { QrPayloadValidatorService } from './application/services/qr-payload-validator.service';
import { QrService } from './application/services/qr.service';
import { QrRepository } from './infrastructure/persistence/qr.repository';
import { MerchantQrController } from './presentation/http/merchant-qr.controller';
import { QrController } from './presentation/http/qr.controller';
import { QrValidators } from './validators/qr.validators';

@Module({
  imports: [DatabaseModule, AuthModule, AuditModule, AliasModule, MerchantsModule],
  controllers: [QrController, MerchantQrController],
  providers: [
    QrRepository,
    QrService,
    QrRendererService,
    QrStorageService,
    QrAnnex2DisplayService,
    QrPayloadValidatorService,
    QrValidators,
  ],
  exports: [QrRepository, QrService],
})
export class QrModule {}
