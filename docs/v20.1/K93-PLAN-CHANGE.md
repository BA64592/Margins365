# K93 / GA-08 — Plan change + confirmation email

**Approved:** Akthar, 11 Nov 2026.

## Behaviour

| Case | Timing | Stripe | Email |
| --- | --- | --- | --- |
| Trial → any plan/interval | Immediate | Item price swap, `proration_behavior: none`, trial end unchanged | SES after Stripe OK |
| Paid upgrade (higher tier, same interval) | Immediate | Swap + `create_prorations` | SES with proration pence |
| Paid downgrade or interval change | At renewal | Subscription schedule phase 2 | SES with scheduled effective date |

## API

`POST /api/billing/change-plan` (session cookie)

```json
{ "planId": "growth", "interval": "month" }
```

Response includes old/new plan, effective date, `newPricePence`, proration, order limit, reference. UI: Plan & billing → **Change plan**.

## Ops

- Requires `STRIPE_PRICE_*_{MONTH,YEAR}` for all four tiers.
- Status until QA evidence: **Built, awaiting QA** (not Fixed).
