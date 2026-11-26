import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Outgoing email (invites, password reset).
 * - SMTP_URL set: sent over SMTP, so any provider works (Resend, SendGrid, Amazon SES, Postmark, Gmail),
 *   e.g. smtps://USER:PASSWORD@smtp.resend.com:465. MAIL_FROM is the sender, e.g. "BMERC <no-reply@bmerc.app>".
 * - Not set: development writes the message to the log; production logs a warning that nothing was sent.
 * Tests read `sent`. SMTP_URL=json builds the message without sending it (used by the unit test).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  readonly sent: MailMessage[] = [];
  /** The most recent delivery failure, shown on Platform health so a broken sender is noticed. */
  lastError: { at: string; to: string; message: string } | null = null;
  private transport: Transporter | null | undefined;

  /** True when real sending is configured (shown on Platform health). */
  get configured() {
    return !!process.env.SMTP_URL && process.env.SMTP_URL !== 'json';
  }

  private transporter() {
    if (this.transport !== undefined) return this.transport;
    const url = process.env.SMTP_URL;
    this.transport = !url ? null : url === 'json' ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport(url);
    return this.transport;
  }

  async send(msg: MailMessage) {
    this.sent.push(msg);
    if (this.sent.length > 100) this.sent.shift();
    const t = this.transporter();
    if (t) {
      const from = process.env.MAIL_FROM ?? 'BMERC <no-reply@localhost>';
      try {
        await t.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text });
      } catch (e) {
        // The invite or reset is already saved; the person can ask for it again. Do not fail the request.
        this.logger.error(`Email to ${msg.to} ("${msg.subject}") failed: ${(e as Error).message}`);
        this.lastError = { at: new Date().toISOString(), to: msg.to, message: (e as Error).message };
        return false;
      }
      this.lastError = null;
      return true;
    }
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(`No mail provider configured (SMTP_URL); email to ${msg.to} ("${msg.subject}") was not delivered`);
      return false;
    }
    if (!process.env.VITEST) this.logger.log(`To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
    return false;
  }
}

/** Link into the web app, e.g. webLink('/accept-invite', token). */
export function webLink(path: string, token: string) {
  const base = (process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}
