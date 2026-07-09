import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface WelcomeCredentialsEmail {
  to: string;
  fullName: string;
  temporaryPassword: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('mail.enabled') === true;
  }

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.warn(
        'Mail is disabled (MAIL_ENABLED is not true). Welcome emails will not be sent.',
      );
      return;
    }

    const host = this.config.get<string>('mail.host');
    const user = this.config.get<string>('mail.user');
    const pass = this.config.get<string>('mail.pass');

    if (!host || !user || !pass) {
      this.logger.warn(
        'Mail is enabled but SMTP settings are incomplete. Emails will not be sent.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('mail.port'),
      secure: this.config.get<boolean>('mail.secure'),
      auth: { user, pass },
    });
  }

  async sendWelcomeCredentials(
    params: WelcomeCredentialsEmail,
  ): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    const loginUrl = `${this.config.get<string>('cors.origin')}/login`;
    const from = this.config.get<string>('mail.from')!;

    await this.transporter.sendMail({
      from,
      to: params.to,
      subject: 'Your MMS account has been created',
      text: [
        `Hello ${params.fullName},`,
        '',
        'Your Merchant Management System account has been created.',
        '',
        `Email: ${params.to}`,
        `Temporary password: ${params.temporaryPassword}`,
        '',
        `Sign in at ${loginUrl}`,
        '',
        'Change your password after your first login.',
        '',
        'If you did not expect this email, contact your administrator.',
      ].join('\n'),
      html: `
        <p>Hello ${this.escapeHtml(params.fullName)},</p>
        <p>Your Merchant Management System account has been created.</p>
        <p><strong>Email:</strong> ${this.escapeHtml(params.to)}<br/>
        <strong>Temporary password:</strong> <code>${this.escapeHtml(params.temporaryPassword)}</code></p>
        <p><a href="${this.escapeHtml(loginUrl)}">Sign in to MMS</a></p>
        <p>Change your password after your first login.</p>
        <p style="color:#666;font-size:12px;">If you did not expect this email, contact your administrator.</p>
      `.trim(),
    });

    this.logger.log(`Welcome email sent to ${params.to}`);
    return true;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
