/**
 * Standalone registration-reminder runner — Railway-independent.
 *
 * Does the same job as the API's in-process cron, but runs anywhere Node +
 * DATABASE_URL + RESEND_API_KEY are available (e.g. a GitHub Actions schedule).
 * Nudges workers who registered but never finished: a "finish your registration"
 * email + an in-app notification back to the portal.
 *
 * Guard-rails (identical to the in-app version): only candidates registered
 * >24h ago, not yet submitted, status NEW/SCREENING, capped at 3 reminders each,
 * none within 48h of the last, real email addresses only.
 *
 * Env: DATABASE_URL (required), RESEND_API_KEY (required to email),
 *      MAIL_FROM (optional), CANDIDATE_PORTAL_URL (optional), DRY_RUN=1 (optional).
 *
 * Run locally:  node --env-file=.env scripts/send-reminders.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RESEND_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'Starff <noreply@starff.co.uk>';
const PORTAL = process.env.CANDIDATE_PORTAL_URL || 'https://my.starff.co.uk';
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_REMINDERS = 3;

function emailHtml(firstName) {
  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#0b1f3a">
  <div style="max-width:520px;margin:0 auto;padding:28px 22px">
    <div style="font-weight:800;font-size:22px;color:#f47a20;letter-spacing:.5px">STARFF</div>
    <h1 style="font-size:18px;margin:18px 0 10px">You're nearly there, ${firstName}</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
      Thanks for registering with Starff. A few quick steps — your right to work, documents and
      availability — and we can start matching you to shifts. It only takes a few minutes.
    </p>
    <p style="margin:22px 0">
      <a href="${PORTAL}" style="background:#f47a20;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;display:inline-block">Finish my registration</a>
    </p>
    <p style="font-size:12px;color:#5a6b82;line-height:1.6;margin-top:24px">
      Starff Ltd, 66 Paul Street, London EC2A 4NA. If you've already finished, you can ignore this.
    </p>
  </div></body></html>`;
}

async function sendEmail(to, firstName) {
  if (!RESEND_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to, subject: 'Finish your Starff registration', html: emailHtml(firstName) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text().catch(() => '')}`.trim());
  return true;
}

async function main() {
  const now = new Date();
  const staleAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cooloff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const candidates = await prisma.candidate.findMany({
    where: {
      submittedAt: null,
      archivedAt: null,
      status: { in: ['NEW', 'SCREENING'] },
      createdAt: { lte: staleAfter },
      reminderCount: { lt: MAX_REMINDERS },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: cooloff } }],
    },
    include: { user: { select: { id: true, email: true } } },
    take: 200,
  });

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${candidates.length} candidate(s) eligible for a reminder.`);
  if (!RESEND_KEY && !DRY_RUN) {
    console.log('RESEND_API_KEY not set — cannot email. Exiting without changes.');
    return;
  }

  let sent = 0;
  for (const c of candidates) {
    const email = c.user?.email;
    if (!email || email.endsWith('@candidate.local') || email.endsWith('@placeholder.starff')) continue;
    console.log(`  → ${c.firstName} ${c.lastName} <${email}> (reminder #${(c.reminderCount ?? 0) + 1})`);
    if (DRY_RUN) continue;
    try {
      await sendEmail(email, c.firstName);
      // In-app notification for the candidate's portal bell (best-effort).
      await prisma.notification.create({
        data: {
          userId: c.userId,
          type: 'registration_reminder',
          title: 'Finish your Starff registration',
          body: `Hi ${c.firstName}, you're nearly there — a few quick steps and we can start matching you to shifts.`,
          link: PORTAL,
        },
      }).catch(() => {});
      await prisma.candidate.update({
        where: { id: c.id },
        data: { lastReminderAt: now, reminderCount: (c.reminderCount ?? 0) + 1 },
      });
      sent++;
    } catch (e) {
      console.log(`     ! failed: ${e.message}`);
    }
  }
  console.log(`${DRY_RUN ? '[DRY RUN] would send' : 'Sent'} ${DRY_RUN ? candidates.length : sent} reminder(s).`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
