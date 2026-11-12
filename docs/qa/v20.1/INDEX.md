# QA Prompt v20.1 — index

**Source:** `Margins365-QA-Prompt-v20.1.pdf` (11 Nov 2026, 20:55 Europe/London)  
**Cases:** 640 (includes MOB/K87/K88–K90 + **66 GAP** + **23 E2E**)  
**Companions:** Spec/Changes/SEO under `docs/v20.1/`  
**Launch readiness PDF:** owner checklist (11 Nov 2026) — Dev status below.

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
| K92 | Stripe customer emails as stop-gap | **Yes — Live only** (saved 11 Nov 2026). **Test mode not mirrored**. See `docs/v20.1/K92-STRIPE-CUSTOMER-EMAILS.md`. |
| K93 | Plan-change confirmation email | **Yes** — SES after Stripe confirms. Built, awaiting QA. |
| K94 | Self-serve “Delete my account now” | **Not at launch** — privacy contact + admin |

## Launch readiness (Dev code vs QA Fixed)

Per the Launch Readiness PDF: a gap is **Fixed** only after QA evidence. Until then: **Built, awaiting QA**.

### P0 money / security / data / emails

| GAP | Sev | Code status | Notes |
| --- | --- | --- | --- |
| GAP-01 / K89 | P0 | **Built, awaiting QA** | Live cancel + Keep my plan proven on Growth trial (12 Nov). Full CAN/E2E suite still open. |
| GAP-02 | P0 | **Built, awaiting QA** | Server owns 14-day trial |
| GAP-03 | P0 | **Built, awaiting QA** | One trial / account |
| GAP-04 | P0 | **Built, awaiting QA** | No second live subscription |
| GAP-05 | P0 | **Built, awaiting QA** | Founding coupons; Checkout **fails** (no silent full-price) if coupon missing |
| GAP-06 | P0 | **Built, awaiting QA** | Atomic founding reserve under 100 |
| GAP-07 | P0 | **Built, awaiting QA** | Webhooks incl. `invoice.paid`, trial_will_end, payment_failed, refund/dispute |
| GAP-11 | P0 | **Built, awaiting QA** | Access end from Stripe `cancel_at` |
| GAP-14 | P0 | **Built, awaiting QA** | Refund/dispute → wipe schedule |
| GAP-16 | P0 | **Built, awaiting QA** | Legal acceptance recorded |
| GAP-17 / K90 | P0 | **Built, awaiting QA** | Trial-start SES + on-screen confirm |
| GAP-18 | P0 | **Built, awaiting QA** | 3-day trial reminder via `trial_will_end` |
| GAP-20 | P0 | **Built, awaiting QA** | Payment failed SES |
| GAP-21 / K89 | P0 | **Built, awaiting QA** | Cancel SES |
| GAP-22 | P0 | **Built, awaiting QA** | Founding ends-soon via cron |
| GAP-23 | P0 | **Built, awaiting QA** | 80% order-limit SES (once / period) |
| GAP-24 | P0 | **Built, awaiting QA** | Data deleted email on wipe |
| GAP-32 | P0 | **Ops proven (K86)** | SES production + DNS |
| GAP-33 | P0 | **Built, awaiting QA** | Reset links from `APP_ORIGIN` → `/reset-password?token=` |
| GAP-34 | P0 | **Built, awaiting QA** | No demo auth fallback |
| GAP-40–44 | P0 | **Built, awaiting QA** | Server shop workspaces, limits, wipe, closure |

### P1 features

| GAP | Sev | Code status | Notes |
| --- | --- | --- | --- |
| GAP-08 / K93 | P1 | **Built, awaiting QA** | Change plan + SES |
| GAP-09 | P1 | **Built, awaiting QA** | Interval change at renewal |
| GAP-10 | P1 | **Built, awaiting QA** | `/api/billing/portal` + Plan & billing **Invoices & card** (needs Stripe portal on) |
| GAP-55 | P1 | **Built, awaiting QA** | Day-14 wording removed |
| GAP-57 | P1 | **Built, awaiting QA** | Trial confirm after Stripe |
| GAP-59 | P1 | **Built, awaiting QA** | `/sign-in`, `/reset-password`, `/welcome`, `/invite/:token` |
| GAP-60 | P1 | **Built, awaiting QA** | Calculators/landings held: removed from sitemap + `noindex` |
| GAP-26 | P1 | **Built, awaiting QA** | Seat invite SES with `/invite/:token` |
| GAP-49 / 50 / 52 / 53 | P1 | **Partial** | Shops/team APIs exist; full switcher + member billing gate still thin |
| GAP-25 / 27 | P1 | **Partial / open** | Member fan-out on cancel / remove-member email |
| GAP-12 / 13 | P1 | **Partial** | Licence sync exists; daily Stripe reconcile job not full |
| GAP-45–48 | P1 | **Partial** | Cancel reason stored; full multi-shop export + privacy admin tool open (K94 admin) |
| GAP-64 / K82 | P1 | **Built, awaiting QA** | Modal scroll-lock + top-of-page nav |

## Ops for Akthar (still required for release)

1. Stripe Customer Portal **on** (card + invoices; cancellation **off**).
2. Confirm founding coupons exist in **Live** (`m365_founding_50_6mo` / `m365_founding_25_annual` or env overrides).
3. Statement descriptor Margins365; Terms/Privacy URLs on Stripe Checkout.
4. DO Postgres backups retention ≤ 7 days.
5. Company details + ICO number for legal pages (withheld — supply when ready).
6. Hand QA: staging or Live + Stripe **Test** + test inboxes + full 640-case pass.

## Exit criteria that still block release

17–19: QA evidence for every P0/P1 GAP + E2E + RG-1–RG-4.  
**Dev perspective:** core P0 money/security/data/email paths are built; remaining open rows are mostly QA Fixed + owner tasks + thinner P1s (member seats, reconcile, privacy admin).

## Latest QA run (12 Nov 2026 Europe/London)

- Report: `docs/qa/v20.1/QA-REPORT-v20.1.md`
- Defects: `docs/qa/v20.1/DEFECT-LOG-v20.1.md`
- Evidence: `docs/qa/v20.1/evidence/`
- **Production smoke:** Pass (2 defects fixed in hotfix). **Full 640 / E2E:** Blocked — needs staging + Stripe Test.

## Files

- PDF: `docs/qa/v20.1/Margins365-QA-Prompt-v20.1.pdf`
- Text extract: `docs/qa/v20.1/Margins365-QA-Prompt-v20.1.txt`
