import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Outgoing email. No provider is wired yet (design doc section 9: pick one at deploy time),
 * so messages are written to the log. Tests read `sent`.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  readonly sent: MailMessage[] = [];

  async send(msg: MailMessage) {
    this.sent.push(msg);
    if (this.sent.length > 100) this.sent.shift();
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(`No mail provider configured; email to ${msg.to} ("${msg.subject}") was not delivered`);
      return;
    }
    if (!process.env.VITEST) this.logger.log(`To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
  }
}

/** Link into the web app, e.g. webLink('/accept-invite', token). */
export function webLink(path: string, token: string) {
  const base = (process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}
