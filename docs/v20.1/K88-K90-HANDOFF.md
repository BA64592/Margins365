# v20.1 — K88 / K89 / K90 implementation

**Pack:** Changes/Spec/SEO v20.1 (11 Nov 2026, 20:55 Europe/London).  
**K91–K94:** proposed only — **not implemented** (await Akthar).

## Shipped

### K88 — Contact reply wording
- Help form intro, success line, pop-up body, and visitor SES confirmation use:  
  “Thank you for contacting us, we aim to respond within 24 hours.”
- Removed “can’t / don’t promise a reply time” from the contact flow (Suggest a feature keeps its own line).

### K89 — Real Stripe cancel
- `POST /api/billing/cancel` — owner session → Stripe `cancel_at_period_end: true` + idempotency key → re-read subscription → upcoming-invoice check (trials) → store `canceled_access` + reference → SES email → confirmation pop-up.
- Failure never flips local cancel state; shows Try again pop-up.
- `POST /api/billing/resubscribe` — clears `cancel_at_period_end` before access ends.
- Plan & billing shows Cancelled status + Keep my plan.
- Webhook sync maps `cancel_at_period_end` → `licence_state = canceled_access`.

### K90 — Trial-start email + pop-up
- SES trial-start email once per subscription after Stripe shows `trialing` (Checkout completed / subscription created|updated).
- Checkout `?checkout=success` polls `GET /api/billing/trial-status` up to 30s; pop-up only after server confirm (or “still confirming” waiting copy).

## Ops still needed
- Stripe Dashboard: ensure webhooks include `customer.subscription.created` / `updated` / `deleted` and `checkout.session.completed`.
- Decide **K91–K94** (pause live trials, Stripe customer emails stop-gap, plan-change email, early delete).
- Remaining gap-audit P0s beyond K88–K90 (shops data SoT, upload limits, etc.).
