import { Module } from '@nestjs/common';
import { EmailModule } from '@infrastructure/email/email.module';
import { SmsModule } from '@infrastructure/sms/sms.module';
import { QrPosterModule } from '@shared/qr-poster/qr-poster.module';
import { SendQrEmailHandler } from './application/handlers/send-qr-email.handler';
import { SendQrSmsHandler } from './application/handlers/send-qr-sms.handler';

/** Bounded context: Notifications — email + SMS delivery for student QR posters */
@Module({
  imports: [EmailModule, SmsModule, QrPosterModule],
  providers: [SendQrEmailHandler, SendQrSmsHandler],
})
export class NotificationsModule {}
