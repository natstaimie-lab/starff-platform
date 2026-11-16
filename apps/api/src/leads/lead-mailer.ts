import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { esc } from '../quotes/quote-mailer';

const EMAIL_LOGO_URL = 'https://admin.starff.co.uk/logos/starff-email-white.png';
const LANDLINE = '020 3576 0494';

/** The opt-out line every sales email carries (PECR: B2B email must offer one). */
export const OPT_OUT_LINE = "If you'd rather not hear from us, just reply \"unsubscribe\" and we won't email you again.";

export interface LeadEmail {
  to: string;
  subject: string;
  /** Plain text; blank lines become paragraphs. No sign-off: the template adds it. */
  message: string;
  senderEmail?: string | null;
  senderName?: string | null;
}

/**
 * Sends a one-to-one sales email to a lead through Resend. Like quotes, the
 * email IS the action, so failures are thrown back to the admin.
 */
@Injectable()
export class LeadMailer {
  private readonly logger = new Logger('LeadMailer');

  get from(): string {
    return process.env.QUOTES_FROM || 'Starff <hello@starff.co.uk>';
  }

  replyTo(senderEmail?: string | null): string {
    if (senderEmail && /@starff\.co\.uk$/i.test(senderEmail)) return senderEmail;
    return process.env.MAIL_REPLY_TO || 'hello@starff.co.uk';
  }

  private sign(senderName?: string | null) {
    return senderName ? `${senderName}\nStarff` : 'The Starff team';
  }

  render(message: string, senderName?: string | null): string {
    const paras = message.trim().split(/\n\s*\n/).map((p) =>
      `<p style="color:#0B1F3A;margin:0 0 14px">${esc(p.trim()).replace(/\n/g, '<br />')}</p>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;background:#F5F7FA">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F5F7FA" style="background:#F5F7FA"><tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border:1px solid #E3E8F0;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B1F3A;line-height:1.6;font-size:15px">
          <tr><td bgcolor="#F47A20" style="background:#F47A20;padding:18px 28px"><img src="${EMAIL_LOGO_URL}" width="124" height="44" alt="STARFF" style="display:block;border:0;color:#FFFFFF;font-size:22px;font-weight:700" /></td></tr>
          <tr><td style="padding:28px">
            ${paras}
            <p style="color:#0B1F3A;margin:18px 0 0">Kind regards,<br />${esc(this.sign(senderName)).replace(/\n/g, '<br />')}<br /><a href="tel:+442035760494" style="color:#0B1F3A">${LANDLINE}</a></p>
          </td></tr>
          <tr><td style="padding:0 28px 24px">
            <hr style="border:none;border-top:1px solid #E3E8F0;margin:0 0 16px" />
            <p style="font-size:12px;color:#7B8AA0;margin:0">Starff Ltd · temporary recruitment · starff.co.uk · company no. 17166246<br />${esc(OPT_OUT_LINE)}</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
  }

  async send(e: LeadEmail): Promise<{ id?: string }> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new ServiceUnavailableException('Email is not set up yet (RESEND_API_KEY is missing on the API server).');
    const bcc = e.senderEmail && e.senderEmail.toLowerCase() !== e.to.toLowerCase() ? [e.senderEmail] : undefined;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [e.to],
        bcc,
        reply_to: this.replyTo(e.senderEmail),
        subject: e.subject,
        html: this.render(e.message, e.senderName),
        text: `${e.message.trim()}\n\nKind regards,\n${this.sign(e.senderName)}\n${LANDLINE}\n\n${OPT_OUT_LINE}`,
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
