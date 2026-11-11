# Stripe setup — Margins 365 (v19 tiers)

## Products to create

Four **subscription** products (tax-inclusive GBP). Annual = 10× monthly.

| Plan | Monthly | Annual |
|---|---|---|
| Starter | £39 | £390 |
| Growth | £79 | £790 |
| Pro | £129 | £1,290 |
| Scale | £199 | £1,990 |

Tax code: `txcd_10103001`. No multi-currency fixed amounts yet (OD6).

### Automated (recommended)

```bash
STRIPE_SECRET_KEY=sk_test_…   # or sk_live_…
node scripts/stripe-bootstrap-products.mjs
```

The script is idempotent for matching metadata/`unit_amount` prices. It prints:

```
STRIPE_PRICE_STARTER_MONTH=price_…
STRIPE_PRICE_STARTER_YEAR=price_…
STRIPE_PRICE_GROWTH_MONTH=price_…
STRIPE_PRICE_GROWTH_YEAR=price_…
STRIPE_PRICE_PRO_MONTH=price_…
STRIPE_PRICE_PRO_YEAR=price_…
STRIPE_PRICE_SCALE_MONTH=price_…
STRIPE_PRICE_SCALE_YEAR=price_…
```

Paste those onto DigitalOcean App Platform (RUN_TIME) and redeploy.

### Manual (Dashboard)

1. Products → Add product for each tier name above.  
2. Add two recurring prices per product (monthly + yearly), GBP, **inclusive** tax.  
3. Copy each Price ID into the env keys above.

## Checkout behaviour

- Mode: **subscription**
- 14-day free trial via `subscription_data.trial_period_days`
- Plan + interval chosen in-app are sent as `planId` / `interval`
- Card collected up front; charge on day 15 unless cancelled (K38/K43)

## Env vars (DigitalOcean)

| Key | Scope | Notes |
|---|---|---|
| `VITE_PAYMENTS_MODE` | BUILD_TIME | `stripe` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | BUILD_TIME | `pk_test_…` / `pk_live_…` |
| `STRIPE_SECRET_KEY` | RUN_TIME SECRET | matching mode |
| `STRIPE_PRICE_*_MONTH` / `*_YEAR` | RUN_TIME | eight price IDs |
| `STRIPE_WEBHOOK_SECRET` | RUN_TIME SECRET | `whsec_…` |
| `STRIPE_API_VERSION` | RUN_TIME | `2025-03-31.basil` |
| `STRIPE_TRIAL_DAYS` | RUN_TIME | default `14` |
| `APP_ORIGIN` | RUN_TIME | live public origin |

Legacy `STRIPE_PRICE_FULL` / `STRIPE_PRICE_EARLY_BIRD` (one-time lifetime) are obsolete for new checkouts; keep only if you still honour sold lifetime licences.

## Webhook

Endpoint (live host): `https://<your-domain>/api/webhooks/stripe`  

Minimum events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.trial_will_end` (GA-18 — ~3 days before trial end)
- `invoice.payment_failed` (GA-20)
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`
- `payment_intent.payment_failed`

After creating/updating the endpoint, put the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

## Checklist

See `docs/checklists/stripe-smp.md`.
