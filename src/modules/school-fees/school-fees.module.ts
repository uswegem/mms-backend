import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { MerchantOnboardingModule } from '@modules/merchant-onboarding/merchant-onboarding.module';
import { AliasModule } from '@modules/alias/alias.module';
import { QrModule } from '@modules/qr/qr.module';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { SCHOOL_ONBOARDING_COMPLETION_PORT } from '@modules/maker-checker/application/ports/school-onboarding-completion.port';
import { SchoolsController } from './presentation/http/schools.controller';
import { StudentsController } from './presentation/http/students.controller';
import { SchoolsRepository } from './infrastructure/persistence/schools.repository';
import { StudentAliasService } from './application/services/student-alias.service';
import { BulkStudentUploadService } from './application/services/bulk-student-upload.service';
import { SchoolIssuanceService } from './application/services/school-issuance.service';

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    MerchantOnboardingModule,
    AliasModule,
    QrModule,
    forwardRef(() => MakerCheckerModule),
  ],
  controllers: [SchoolsController, StudentsController],
  providers: [
    SchoolsRepository,
    StudentAliasService,
    BulkStudentUploadService,
    SchoolIssuanceService,
    {
      provide: SCHOOL_ONBOARDING_COMPLETION_PORT,
      useExisting: SchoolIssuanceService,
    },
  ],
  exports: [
    SchoolsRepository,
    StudentAliasService,
    SchoolIssuanceService,
    SCHOOL_ONBOARDING_COMPLETION_PORT,
  ],
})
export class SchoolFeesModule {}
