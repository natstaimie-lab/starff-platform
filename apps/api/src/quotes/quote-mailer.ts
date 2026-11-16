import { Injectable, Logger, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';

const EMAIL_LOGO_URL = 'https://admin.starff.co.uk/logos/starff-email-white.png';

/** Escape text typed by staff before it goes into the email HTML. */
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface QuoteEmail {
  to: string[];
  cc?: string[];
  /** Staff member sending it — gets a copy and receives the client's reply. */
  senderEmail?: string | null;
  senderName?: string | null;
  subject: string;
  /** Plain text typed by staff; blank lines become paragraphs. */
  message: string;
  pdf: Buffer;
  filename: string;
}

/**
 * Sends a quote through Resend with the PDF attached. Unlike notification
 * emails this one is the point of the action, so failures are thrown back to
 * the admin instead of being swallowed.
 *
 * From: QUOTES_FROM (default "Starff <hello@starff.co.uk>"). The starff.co.uk
 * domain must be verified in Resend for this address to send.
 */
@Injectable()
export class QuoteMailer {
  private readonly logger = new Logger('QuoteMailer');

  get from(): string {
    return process.env.QUOTES_FROM || 'Starff <hello@starff.co.uk>';
  }

  /** Replies go to the staff member if they have a Starff address, else the shared inbox. */
  replyTo(senderEmail?: string | null): string {
    if (senderEmail && /@starff\.co\.uk$/i.test(senderEmail)) return senderEmail;
    return process.env.MAIL_REPLY_TO || 'hello@starff.co.uk';
  }

  render(message: string, senderName?: string | null): string {
    const paras = message.trim().split(/\n\s*\n/).map((p) =>
      `<p style="color:#0B1F3A;margin:0 0 14px">${esc(p.trim()).replace(/\n/g, '<br />')}</p>`).join('');
    const sign = senderName ? `${esc(senderName)}<br />Starff` : 'The Starff team';
    return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;background:#F5F7FA">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F5F7FA" style="background:#F5F7FA"><tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border:1px solid #E3E8F0;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B1F3A;line-height:1.6;font-size:15px">
          <tr><td bgcolor="#F47A20" style="background:#F47A20;padding:18px 28px"><img src="${EMAIL_LOGO_URL}" width="124" height="44" alt="STARFF" style="display:block;border:0;color:#FFFFFF;font-size:22px;font-weight:700" /></td></tr>
          <tr><td style="padding:28px">
            ${paras}
            <p style="color:#0B1F3A;margin:18px 0 0">Kind regards,<br />${sign}</p>
          </td></tr>
          <tr><td style="padding:0 28px 24px">
            <hr style="border:none;border-top:1px solid #E3E8F0;margin:0 0 16px" />
            <p style="font-size:12px;color:#7B8AA0;margin:0">Your quote is attached as a PDF. Starff Ltd · temporary recruitment · starff.co.uk · company no. 17166246</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
  }

  async send(e: QuoteEmail): Promise<{ id?: string }> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new ServiceUnavailableException('Email is not set up yet (RESEND_API_KEY is missing on the API server).');
    const bcc = e.senderEmail && !e.to.concat(e.cc ?? []).some((a) => a.toLowerCase() === e.senderEmail!.toLowerCase())
      ? [e.senderEmail] : undefined;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: e.to,
        cc: e.cc?.length ? e.cc : undefined,
        bcc,
        reply_to: this.replyTo(e.senderEmail),
        subject: e.subject,
        html: this.render(e.message, e.senderName),
        text: `${e.message.trim()}\n\nKind regards,\n${e.senderName ? `${e.senderName}\nStarff` : 'The Starff team'}\n\n(Your quote is attached as a PDF.)`,
        attachments: [{ filename: e.filename, content: e.pdf.toString('base64') }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Resend ${res.status}: ${detail}`);
      throw new BadGatewayException(`The email service refused the message (${res.status}). ${detail}`.trim());
    }
    return res.json().catch(() => ({}));
  }
}
