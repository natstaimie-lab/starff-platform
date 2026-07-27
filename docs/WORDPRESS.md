# WordPress integration

The live site (`starff.co.uk`) is **not rebuilt**. It stays the marketing site.
We only connect its forms to the platform so submissions land in the database.

## ✅ Installed (dormant until activated)

A hook is installed on the live site at
`wp-content/novamira-sandbox/starff-webhook.php`. On every Contact Form 7
submission it maps the fields and POSTs an Enquiry to `<API>/api/v1/enquiries`
with the `X-Webhook-Secret` header. It is **non-blocking** (never slows or breaks
the form) and **dormant** until you set the target URL — so the live site is
currently unaffected.

- Secret is set (WP option `starff_webhook_secret`, matches the API's `.env`).
- Target URL (WP option `starff_webhook_url`) is **empty** → nothing is sent yet.

### To activate (once the API is publicly reachable)

The live site can't reach `localhost`, so first the API must be online — either
**deployed** or exposed via a temporary tunnel (e.g. `cloudflared tunnel --url
http://localhost:3001`). Then set the URL option to that public API base:

```php
update_option('starff_webhook_url', 'https://your-api-host');   // no trailing /api
```

(Ask Claude to run this via the Novamira MCP, or set it in wp-admin.) After that,
submitting any of the three live forms creates an Enquiry visible in the admin
dashboard → **Enquiries**, where staff can **Convert** it to a Candidate/Client.

## Current state (from the existing build)

Three Contact Form 7 forms are live and currently **email-only**:

- **Starff Contact** (#2882) — Contact us
- **Starff Post a Job** (#2883) — For Employers
- **Starff Register** (#2884) — For Candidates (has file uploads: RTW + certs)

## The connection

1. Add a webhook to each CF7 form (via a plugin like *CF7 to Webhook*, or the
   Novamira MCP) that POSTs the submission to:
   ```
   POST https://<api-host>/api/v1/enquiries
   Header: X-Webhook-Secret: <WORDPRESS_WEBHOOK_SECRET>
   ```
2. The API validates the secret, stores an **Enquiry** row (type = CONTACT /
   POST_A_JOB / CANDIDATE_REGISTER), and (optionally) still sends the email.
3. Enquiries show up in the **Admin dashboard**, where staff convert them into real
   Candidate or Client records.

## Later (optional)

- Add "Candidate Login" / "Client Login" buttons on the site linking to the portals.
- Move file uploads from CF7 email attachments to the portal's secure Supabase Storage
  (the proper home for RTW/DBS documents).

## Test checklist

- [ ] Submit the live "Register" form → an Enquiry row appears via the API.
- [ ] A request with a wrong/missing `X-Webhook-Secret` is rejected (401).
- [ ] Existing email notifications still arrive (nothing on the site breaks).
