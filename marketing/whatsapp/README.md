# WhatsApp Channel kit

Everything needed to set up and run the Starff WhatsApp Channel. The channel is
a **one-way broadcast to candidates** (temp workers): followers see posts but
can't reply in the channel, and they can't see each other's numbers. Applications
come in through a direct message to the Starff WhatsApp Business number.

> **WhatsApp number:** 07742 545 967 (used in every post and the Canva templates).
>
> **Before going live:** the remaining blockers in `marketing/README.md` apply here
> too — the final sector list and whether "Get Starffed"
> is used. This kit uses the **website's four sectors** (Logistics & Warehousing,
> Events & Entertainment, Construction, Delivery Services) and leaves out the
> "Get Starffed" pun until that's decided. Every `{{PLACEHOLDER}}` must be
> filled before you post.

## 1. Set-up checklist

- [ ] Create the channel from the **Starff WhatsApp Business** account (Updates tab → `+` → New channel), not a personal number
- [ ] Name: **Starff Jobs** (see below)
- [ ] Icon: upload `images/profile-navy.png`
- [ ] Description: paste from section 3
- [ ] Settings → Profile reactions: **on**, set to a limited set (👍 ✅)
- [ ] Post `images/01-welcome.png` with the welcome text, then `02-how-it-works.png`
- [ ] Add the channel link to: starff.co.uk footer, email signatures, flyer QR code, candidate welcome email
- [ ] Apply for the verified badge once Meta Verified is in place (optional)

## 2. Logo / channel icon

| File | Use |
|------|-----|
| `images/profile-navy.png` | **Channel icon (recommended).** 640×640, orange mark on navy, centred for WhatsApp's circle crop |
| `images/profile-white.png` | Alternative if you want it to match a white WhatsApp Business profile photo |

Both use the dot-cluster "S" mark only — the wordmark is unreadable at icon size.

## 3. Channel name and description

**Name:** `Starff Jobs`
(Alternatives: `Starff — Temp Shifts London`, `Starff Shifts`)

**Description** (paste as-is; ~420 characters):

```
Paid temporary shifts across London from Starff — logistics & warehousing, events, construction and delivery.

Every post shows the rate, location, hours and what you need.

To apply: message us on WhatsApp 07742 545 967 with the shift name.
New? Register at starff.co.uk first.

We never charge workers a fee.
Starff Ltd · Temporary staffing · Co. no. 17166246
```

## 4. Post kit

Images live in `images/`. Text templates are below — copy, fill the
placeholders, attach the image. WhatsApp formatting: `*bold*`, `_italic_`.

### Compliance — fixed in every shift post (do not remove)

- The word **temporary**
- **Rate**, **location**, and **what the role requires**
- **Starff Ltd** and how to contact us
- Never name a client without their written OK — use the area and type of site ("a warehouse in Park Royal")
- Never charge a work-seeker a fee
- Rate must be at or above the National Living Wage

### A. Welcome / pinned post — `01-welcome.png`

```
👋 Welcome to *Starff Jobs*

We post paid *temporary* shifts across London here first — warehouse, events, construction and delivery.

Every shift shows:
💷 Rate per hour
📍 Location
🕐 Date and hours
✅ What you need to bring

*How to apply:* message us on WhatsApp 07742 545 967 with the shift name.
*New to Starff?* Register at starff.co.uk — it takes 5 minutes.

Turn on notifications 🔔 so you don't miss shifts.

_Starff Ltd. We never charge workers a fee._
```

### B. How it works — `02-how-it-works.png`

```
*New to Starff? Three steps.*

1️⃣ Register at starff.co.uk
2️⃣ Upload your right-to-work ID (passport, share code or BRP)
3️⃣ We message you when a shift matches your skills and area

Already registered? Just reply to the shift on WhatsApp 07742 545 967.

_Starff Ltd · temporary staffing · we never charge workers a fee._
```

### C. Shift alert — `03-shift-alert-EXAMPLE.png` (the one you'll post most)

**Easiest: use the Canva template** — *Starff WhatsApp — Post templates*
(https://canva.link/t5vda4rav71f6iq). Page 1 shift alert (C), page 2 urgent
(F), page 3 weekly roundup (D), page 4 shift filled (E). Duplicate the page, type over the
details, Share → Download → PNG. Swap or delete the warehouse illustration for
non-warehouse roles.

(Developer alternative: edit the `03-…` entry in `src/posts.json`, run
`node render.mjs 03` from `src/`.)

```
🟠 *TEMPORARY SHIFT — {{ROLE}}*

📍 {{AREA}} ({{POSTCODE DISTRICT}})
📅 {{DAY DATE}}
🕐 {{START}} – {{END}}
💷 *£{{RATE}}/hr*
👥 {{N}} workers needed

*You'll need:* {{REQUIREMENTS — e.g. safety boots, hi-vis, CSCS card}}

To apply, message *{{ROLE}} {{DATE}}* to 07742 545 967.
First come, first served — admin confirms every booking.

_Starff Ltd · we never charge workers a fee._
```

### D. Weekly roundup — `04-weekly-roundup-EXAMPLE.png` (Monday mornings)

```
📋 *Shifts this week*

• *{{ROLE}}* — {{AREA}}, {{DAYS}} — £{{RATE}}/hr
• *{{ROLE}}* — {{AREA}}, {{DAYS}} — £{{RATE}}/hr
• *{{ROLE}}* — {{AREA}}, {{DAYS}} — £{{RATE}}/hr
• *{{ROLE}}* — {{AREA}}, {{DAYS}} — £{{RATE}}/hr

All *temporary*. Message 07742 545 967 with the role and day to apply.

_Starff Ltd · we never charge workers a fee._
```

### E. Shift filled (keeps trust high — post within the hour)

```
✅ *FILLED* — {{ROLE}}, {{AREA}}, {{DATE}}

Thanks to everyone who applied. More shifts coming — keep notifications on 🔔
```

### F. Urgent / same-day

```
🚨 *URGENT — TODAY* 🚨
*{{ROLE}}* · {{AREA}}
🕐 Start {{TIME}} · 💷 £{{RATE}}/hr · *temporary*
Need: {{REQUIREMENTS}}

Message *URGENT* to 07742 545 967 now.
_Starff Ltd · we never charge workers a fee._
```

### G. Employer post (occasional — share with business contacts) — `05-employers.png`

```
*Short staffed? We'll fill the shift.*

Starff supplies vetted *temporary* workers for logistics, events, construction and delivery across London.

Tell us the shift — we'll do the rest.
📞 07742 545 967 · starff.co.uk
```

## 5. Posting rhythm

| When | Post |
|------|------|
| Monday 8am | Weekly roundup (D) |
| As shifts come in | Shift alert (C), one per shift |
| Within the hour of filling | Filled (E) |
| Same-day gaps | Urgent (F) — max one a day, or people mute the channel |
| Every 2–3 weeks | Re-post How it works (B) for new followers |

Keep it to **1–4 posts a day**. More than that and followers mute.

## 6. Re-making the images

```bash
cd marketing/whatsapp/src
node render.mjs          # all images → ../images/
node render.mjs 03       # just the shift alert
```

`posts.json` holds the words; `card.html` holds the layout (brand colours from
`packages/ui/tokens.ts`). Uses the Chromium that Playwright already has. The
`-EXAMPLE` images carry made-up shifts — re-render before posting.
