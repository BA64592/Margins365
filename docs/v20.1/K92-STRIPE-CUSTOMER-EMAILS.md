# K92 — Stripe customer emails (ops)

**Approved:** Akthar, 11 Nov 2026. Stop-gap until SES emails for receipts / failed payment / trial ending are built.

## Status (Akthar, 11 Nov 2026 evening Europe/London)

**Live mode: done.** Akthar enabled and saved the Stripe customer / subscription emails on **Live** only.

**Test mode: not configured.** Do **not** expect Stripe’s own receipt / failed-payment / trial-ending / renewal mails in Stripe Test. QA should treat those as **Live-only** for K92. Product SES emails (cancel, trial-start, plan-change) still apply in whatever environment the app + SES are pointed at.

## What was turned on (Live)

Under Stripe **Settings → Billing → Subscriptions and emails** (and related invoice customer emails):

- Successful payments / finalised invoices (receipts)
- Reminders if a recurring invoice hasn’t been paid (e.g. when due; optional second at 7 days after)
- Reminder email **7 days before a trial ends**
- Emails about upcoming renewals
- Emails when card payments fail
- (Optional) expiring cards

Also: do **not** use “Pause all payment collection” (K91 = no pause). Cancel stays in Plan & billing, not Customer Portal.

## Still required in product (not replaced by Stripe)

| Gap | Email |
| --- | --- |
| GA-18 | Our **3-day** trial reminder (SES) — Stripe only does 7-day |
| GA-20 | Payment-failed handling beyond Stripe’s mail (state + SES as specified) |
| K89 / K90 | Cancel + trial-start (already SES in app) |
| K93 | Plan-change confirmation (SES) |

## Dev note

Customer-email toggles are account settings in Stripe — not App Platform env vars. No code deploy required for K92 itself.
