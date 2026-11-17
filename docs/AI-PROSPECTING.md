# AI prospecting via Apollo (CRM Phase 4d)

Every Monday at 07:00 (London) the API asks Apollo for **London companies that
advertised warehouse jobs in the last 30 days**, finds each one's **Operations /
Site / Warehouse manager**, and puts them on **Admin → Suggested leads**.
Nothing becomes a lead and nobody is emailed until you press **Accept**.

- **Accept** → a NEW lead (source AI, sector Warehouse & Logistics), due today,
  so it shows in *Follow-ups today* and the 07:30 AI salesperson drafts a first
  email into *AI approvals* for you to check.
- **Reject** → kept, so that company is never suggested again.
- Companies already in Leads or Clients (same website domain or company name)
  are skipped.

## Credits

| Apollo call | Cost |
|---|---|
| Company search (25 companies a page, up to `APOLLO_MAX_PAGES`, default 4) | 1 credit a page |
| People search (find the manager) | free |
| People match (their name + work email), once per suggestion | about 1 credit |

So a full week is roughly **cap + 4 credits** (about 24 with the default cap of
20). No phone numbers are requested (those cost 8 credits each).

## Setup (Railway → API service → Variables)

| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | from Apollo → Settings → Integrations → API |
| `APOLLO_WEEKLY_CAP` | optional, default `20` |
| `APOLLO_PROSPECTING` | optional: `off` stops the Monday run (the button still works) |

The database needs `npm run db:push` once (additive: adds the `SuggestedLead`
table only) before the new API is deployed.
