import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendSmsOptions {
  to: string;   // E.164 format: 255XXXXXXXXX
  message: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly senderId: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<boolean>('sms.enabled') === true;
    this.apiKey = config.get<string>('sms.beem.apiKey') ?? '';
    this.secretKey = config.get<string>('sms.beem.secretKey') ?? '';
    this.senderId = config.get<string>('sms.beem.senderId') ?? 'LipaNamba';
  }

  isEnabled(): boolean {
    return this.enabled && Boolean(this.apiKey) && Boolean(this.secretKey);
  }

  async sendSms(opts: SendSmsOptions): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.warn(`SMS disabled — would have sent to ${opts.to}`);
      return false;
    }

    const credentials = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');

    const body = {
      source_addr: this.senderId,
      schedule_time: '',
      encoding: '0',
      message: opts.message,
      recipients: [{ recipient_id: 1, dest_addr: opts.to }],
    };

    const res = await fetch('https://apisms.beem.africa/v1/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Beem SMS failed ${res.status}: ${text}`);
      return false;
    }

    this.logger.log(`SMS sent to ${opts.to}`);
    return true;
  }
}
