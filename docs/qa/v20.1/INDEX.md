# QA Prompt v20.1 — index

**Source:** `Margins365-QA-Prompt-v20.1.pdf` (11 Nov 2026, 20:55 Europe/London)  
**Cases:** 640 (includes MOB/K87/K88–K90 + **66 GAP** + **23 E2E**)  
**Companions:** Spec/Changes/SEO under `docs/v20.1/`

## What’s new vs v20

| Addition | Purpose |
| --- | --- |
| Suite **GAP** (GAP-01–GAP-66) | One test per gap in Changes v20.1; RG-2 method |
| Suite **E2E** (E2E-01–E2E-23) | Mandatory Stripe test-mode + SES + 2-device matrix (RG-4) |
| Exit criteria **17–19** | K88–K90; all P0/P1 GAP; RG-1–RG-4 |
| Release gate **RG-1–RG-4** | Fake-success ban; server-backed actions; storage allowlist; E2E |

## Decision log (Akthar)

| ID | Decision | Status |
| --- | --- | --- |
| K91 | Pause live sign-ups / live-mode trials | **Rejected** — do not pause |
| K92 | Stripe customer emails as stop-gap | **Yes — Live only** (saved 11 Nov 2026). **Test mode not mirrored** — do not expect Stripe receipt / fail / trial-ending / renewal mails in Test. See `docs/v20.1/K92-STRIPE-CUSTOMER-EMAILS.md`. |
| K93 | Plan-change confirmation email | **Yes** — SES after Stripe confirms (`POST /api/billing/change-plan`). Built, awaiting QA. |
| K94 | Self-serve “Delete my account now” | **Not at launch** — privacy contact + admin |

**QA note (K92):** Stripe’s own customer emails are Live-only by Akthar. E2E in Stripe **Test** still covers app SES (cancel, trial-start, plan-change) and Stripe Dashboard behaviour; skip asserting Stripe Dashboard “Customer emails” delivery in Test.

## GAP P0 — engineering status (code vs live QA)

| GAP | Sev | Code status | Notes |
| --- | --- | --- | --- |
| GAP-01 | P0 | **Built, awaiting QA (K89)** | Stripe cancel + email |
| GAP-02 | P0 | **Built, awaiting QA** | Server ignores client `trialDays` |
| GAP-03 | P0 | **Built, awaiting QA** | Server refuses second trial (`trial_consumed`) |
| GAP-04 | P0 | **Built, awaiting QA** | Server refuses Checkout if live sub |
| GAP-05 | P0 | Partial / verify | Founding coupons at Checkout — confirm live Stripe |
| GAP-06 | P0 | **Built, awaiting QA** | Atomic founding reserve under cap |
| GAP-07 | P0 | Partial | More webhook events; add `trial_will_end` + `invoice.payment_failed` in Dashboard |
| GAP-11 | P0 | **Built, awaiting QA** | `cancelAt` from Stripe → client `accessEndsAt` |
| GAP-14 | P0 | Open | Refund → access end + deletion schedule |
| GAP-16 | P0 | **Built, awaiting QA** | Terms+Refunds acceptance at signup & Checkout |
| GAP-17 | P0 | **Built, awaiting QA (K90)** | Trial-start email |
| GAP-18 | P0 | **Built, awaiting QA** | `trial_will_end` → SES 3-day reminder |
| GAP-20 | P0 | **Built, awaiting QA** | `invoice.payment_failed` → SES (+ final failure) |
| GAP-21 | P0 | **Built, awaiting QA (K89)** | Cancel email |
| GAP-22 | P0 | Open | Founding price-ends-soon email / job |
| GAP-32 | P0 | **Ops proven (K86)** | SES production + DNS |
| GAP-33 | P0 | **Built, awaiting QA** | All auth email links from `APP_ORIGIN` only |
| GAP-34 | P0 | **Built, awaiting QA** | No demo auth fallback on server failure |
| GAP-40–44 | P0 | Open | Server product data, limits, wipe, closure, privacy match |

## Ops for Akthar (webhooks)

Add to Stripe webhook endpoint if missing: `customer.subscription.trial_will_end`, `invoice.payment_failed` (see `docs/STRIPE-SETUP.md`).

## Exit criteria that still block release (high level)

17. K88–K90 suites + Stripe cancel with no upcoming invoice  
18. Every P0/P1 **GAP** pass  
19. **RG-1–RG-4** + full **E2E** in Stripe test mode (no live trial before this)

## Files

- PDF: `docs/qa/v20.1/Margins365-QA-Prompt-v20.1.pdf`
- Text extract: `docs/qa/v20.1/Margins365-QA-Prompt-v20.1.txt`
