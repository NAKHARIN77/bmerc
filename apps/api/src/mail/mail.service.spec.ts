import { MailService } from './mail.service.js';

describe('MailService', () => {
  const before = { url: process.env.SMTP_URL, from: process.env.MAIL_FROM };
  afterEach(() => {
    process.env.SMTP_URL = before.url;
    process.env.MAIL_FROM = before.from;
    if (before.url === undefined) delete process.env.SMTP_URL;
    if (before.from === undefined) delete process.env.MAIL_FROM;
  });

  it('builds and hands the message to the SMTP transport when SMTP_URL is set', async () => {
    process.env.SMTP_URL = 'json';
    process.env.MAIL_FROM = 'BMERC <no-reply@bmerc.test>';
    const mail = new MailService();
    expect(await mail.send({ to: 'a@b.test', subject: 'Hi', text: 'Body' })).toBe(true);
    expect(mail.sent).toHaveLength(1);
    expect(mail.configured).toBe(false); // the json test transport does not count as real sending
  });

  it('only logs when no provider is configured', async () => {
    delete process.env.SMTP_URL;
    const mail = new MailService();
    expect(await mail.send({ to: 'a@b.test', subject: 'Hi', text: 'Body' })).toBe(false);
    expect(mail.configured).toBe(false);
    expect(mail.sent[0]).toMatchObject({ to: 'a@b.test' });
  });

  it('reports a failed send and keeps the error for Platform health', async () => {
    process.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:1'; // nothing listens on port 1
    process.env.MAIL_FROM = 'BMERC <no-reply@bmerc.test>';
    const mail = new MailService();
    expect(await mail.send({ to: 'a@b.test', subject: 'Hi', text: 'Body' })).toBe(false);
    expect(mail.lastError).toMatchObject({ to: 'a@b.test' });
    expect(mail.lastError?.message).toBeTruthy();
  });
});
