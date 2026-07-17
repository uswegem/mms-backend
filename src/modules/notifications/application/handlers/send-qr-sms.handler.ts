import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { QUEUE_NAMES, QUEUE_ROUTING, type NotifyQrSmsPayload } from '@infrastructure/queue/queue.constants';
import { SmsService } from '@infrastructure/sms/sms.service';
import { formatLipaNamba } from '@shared/qr-poster/format-lipa-namba';

@Injectable()
export class SendQrSmsHandler {
  private readonly logger = new Logger(SendQrSmsHandler.name);

  constructor(private readonly sms: SmsService) {}

  @RabbitSubscribe({
    exchange: '',
    routingKey: QUEUE_ROUTING.NOTIFICATION_QR_SMS,
    queue: QUEUE_NAMES.NOTIFICATION_QR_SMS,
    queueOptions: { durable: true },
    errorHandler: (channel, msg) => channel.nack(msg, false, false),
  })
  async handle(payload: NotifyQrSmsPayload): Promise<void> {
    const { guardianPhone, fullName, alias10digit, schoolName } = payload;
    this.logger.log(`Sending QR SMS to ${guardianPhone} for ${fullName}`);

    const formatted = formatLipaNamba(alias10digit);
    const message =
      `${schoolName}: Lipa Namba ya ${fullName} ni ${formatted}. ` +
      `Lipa ada kutoka benki au mtandao wowote wa simu.`;

    await this.sms.sendSms({ to: guardianPhone, message });
    this.logger.log(`QR SMS sent to ${guardianPhone}`);
  }
}
