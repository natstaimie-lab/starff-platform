# AI salesperson: reading employer replies (CRM Phase 4c)

When an employer replies to a Starff sales email, the reply goes to two places:
your normal inbox (as now) **and** a Resend receiving address. Resend tells the
API, which:

1. Stores the reply once (safe if Resend retries).
2. Matches it to a lead by the sender's email address.
3. **Unsubscribe check first.** Words like "unsubscribe", "remove me" or "stop
   emailing" mark every lead with that address **Do not email**: nothing more
   is drafted or sent to them. This works even if the AI is off.
4. Logs the reply on the lead's timeline ("from them").
5. The AI reads it, tags it (interested, question, not now, said no, wrong
   person), suggests a stage change and drafts an answer. These appear in
   **AI approvals**. Nothing is sent and no stage moves until you press a button.
6. Out-of-office replies are logged and ignored. Replies from an address no
   lead has are listed under **Replies to check**.

Staff can also switch **Do not email** on or off from the lead page.

## One-time setup

1. **Database first.** From the repo root: `npm run db:push`. It adds two
   columns to Lead, some columns to AiDraft and a new InboundEmail table.
   Nothing is removed. Do this **before** the code goes live: the new code
   reads these columns.
2. **Receiving address in Resend.** Resend → Emails → Receiving. Either use the
   free `<anything>@<your-id>.resend.app` address, or set up a subdomain such
   as `replies.starff.co.uk` (add the MX record Resend shows at your DNS
   provider). **Don't** point the MX of `starff.co.uk` itself at Resend: that
   would move your normal mailbox.
3. **Webhook in Resend.** Resend → Webhooks → Add: URL
   `https://starff-platform-production.up.railway.app/api/v1/inbound/resend`,
   event `email.received`. Copy its signing secret.
4. **Railway variables** (API service):
   - `LEAD_INBOUND_ADDRESS` = the receiving address from step 2
   - `RESEND_INBOUND_WEBHOOK_SECRET` = the signing secret from step 3

   Until both are set, everything else keeps working; replies just aren't read.

## Testing

- Unit: `node --test apps/api/test/inbound.test.ts`
- End to end (needs the same `RESEND_INBOUND_WEBHOOK_SECRET` in `.env` and on
  the API you test): `E2E_ONLY="crm ai" npm run test:e2e`
