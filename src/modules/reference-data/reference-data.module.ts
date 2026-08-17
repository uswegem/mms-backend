import { Module } from '@nestjs/common';
import { ReferenceDataController } from './presentation/http/reference-data.controller';
import { ReferenceDataService } from './application/services/reference-data.service';

@Module({
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService],
  exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
