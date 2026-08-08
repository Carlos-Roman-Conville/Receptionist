import nodemailer from 'nodemailer';
import type { ClientConfig } from '@receptionist/config';
import { loadAsyncEnv } from './env.js';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  from?: string;
}

export interface SendEmailResult {
  sent: boolean;
  skippedReason?: string;
  messageId?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const env = loadAsyncEnv();
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return { sent: false, skippedReason: 'smtp_not_configured' };
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  const info = await transporter.sendMail({
    from: input.from ?? env.smtpUser,
    to: Array.isArray(input.to) ? input.to.join(', ') : input.to,
    subject: input.subject,
    text: input.text,
  });

  return { sent: true, messageId: info.messageId };
}

export function defaultEmailFrom(config: ClientConfig): string {
  const identity = config.businessDetails.identity as Record<string, unknown>;
  const email = String(identity?.public_email ?? '');
  const env = loadAsyncEnv();
  return email || env.smtpUser || env.defaultNotifyEmail;
}
