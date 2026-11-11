# v20.1 — K88 / K89 / K90 / K92 / K93

**Pack:** Changes/Spec/SEO/Dev Answers v20.1 (11 Nov 2026).  
**K91–K94:** decided — see `DECISIONS-K91-K94.md`.

## Decisions (Akthar)

| ID | Decision |
| --- | --- |
| K91 | **No pause** on live trials. Prioritise GA-01 cancel → Stripe. |
| K92 | **Yes** — Stripe customer emails stop-gap (ops). See `K92-STRIPE-CUSTOMER-EMAILS.md`. |
| K93 | **Yes** — SES plan-change confirmation. See `K93-PLAN-CHANGE.md`. |
| K94 | **Not at launch** — early delete via privacy + admin. |

## Shipped (label: Built, awaiting QA until evidence)

### K88 — Contact reply wording
- Help form intro, success line, pop-up body, and visitor SES confirmation use:  
  “Thank you for contacting us, we aim to respond within 24 hours.”
- Visitor confirmation does **not** include their message text.

### K89 — Real Stripe cancel
- `POST /api/billing/cancel` — Stripe `cancel_at_period_end` + SES + confirmation pop-up.
- `POST /api/billing/resubscribe` — clears scheduled cancel before access ends.

### K90 — Trial-start email + pop-up
- SES once per subscription after Stripe `trialing`; Checkout polls `GET /api/billing/trial-status`.

### K92 — Stripe customer emails (ops only)
- **Live enabled** (11 Nov 2026): receipts, unpaid-invoice reminders, 7-day trial-ending, renewals, card-fail emails. See `K92-STRIPE-CUSTOMER-EMAILS.md`.
- **Test mode not mirrored** — QA: do not expect Stripe customer emails in Test for K92.
- Does **not** replace GA-18 (our 3-day reminder).

### K93 / GA-08 — Change plan
- `POST /api/billing/change-plan` + UpgradeModal “Change plan” path.
- Upgrade / trial: immediate. Paid downgrade & interval: subscription schedule at renewal.
- SES includes old/new plan, effective date, price in pence, proration, order limit.

### GA-55 — Trial cancel wording
- Replaced “Cancel before day 14 and pay nothing” with  
  “Cancel before your trial ends (date shown at Checkout and in Plan & billing)”.

## Ops still needed
- Stripe Dashboard: webhooks + **K92** customer emails.
- QA evidence for GA-01/02/17/21/28/29/32 (and K93) before marking **Fixed**.
- Remaining P0/P1 gap-audit items.
