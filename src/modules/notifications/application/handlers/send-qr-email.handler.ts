import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { QUEUE_NAMES, QUEUE_ROUTING, type NotifyQrEmailPayload } from '@infrastructure/queue/queue.constants';
import { EmailService } from '@infrastructure/email/email.service';
import { PosterRenderer } from '@shared/qr-poster/poster.renderer';
import { formatLipaNamba } from '@shared/qr-poster/format-lipa-namba';

@Injectable()
export class SendQrEmailHandler {
  private readonly logger = new Logger(SendQrEmailHandler.name);

  constructor(
    private readonly email: EmailService,
    private readonly poster: PosterRenderer,
  ) {}

  @RabbitSubscribe({
    exchange: '',
    routingKey: QUEUE_ROUTING.NOTIFICATION_QR_EMAIL,
    queue: QUEUE_NAMES.NOTIFICATION_QR_EMAIL,
    queueOptions: { durable: true },
    errorHandler: (channel, msg) => channel.nack(msg, false, false),
  })
  async handle(payload: NotifyQrEmailPayload): Promise<void> {
    const { parentEmail, fullName, alias10digit, schoolName, tlvPayload } = payload;
    this.logger.log(`Sending QR email to ${parentEmail} for ${fullName}`);

    const pdfBuffer = await this.poster.renderPdf({
      name: fullName,
      alias: alias10digit,
      tlvPayload,
      schoolName,
      isActive: true,
    });

    const formatted = formatLipaNamba(alias10digit);
    await this.email.sendEmail({
      to: parentEmail,
      subject: `Lipa Namba yako ya ${schoolName} — ${formatted}`,
      text: [
        `Habari ${fullName},`,
        '',
        `Mtoto wako amesajiliwa kwenye mfumo wa malipo wa ${schoolName}.`,
        '',
        `Lipa Namba: ${formatted}`,
        '',
        'Tumia nambari hii kulipa ada kutoka benki au mtandao wowote wa simu.',
        'QR poster imeambatishwa kwenye barua pepe hii kwa urahisi wa kulipa.',
        '',
        `Asante,`,
        schoolName,
      ].join('\n'),
      html: `
        <p>Habari <strong>${fullName}</strong>,</p>
        <p>Mtoto wako amesajiliwa kwenye mfumo wa malipo wa <strong>${schoolName}</strong>.</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:4px;color:#1a1a1a">${formatted}</p>
        <p>Tumia nambari hii kulipa ada kutoka benki au mtandao wowote wa simu.</p>
        <p>QR poster imeambatishwa kwenye barua pepe hii.</p>
        <p style="color:#888;font-size:12px;">— ${schoolName}</p>
      `.trim(),
      attachments: [
        {
          filename: `LipaNamba_${fullName.replace(/\s+/g, '_')}_${alias10digit}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    this.logger.log(`QR email sent to ${parentEmail}`);
  }
}
