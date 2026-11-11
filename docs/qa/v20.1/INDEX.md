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
| K92 | Stripe customer emails as stop-gap | Awaiting answer |
| K93 | Plan-change confirmation email | Awaiting answer |
| K94 | Self-serve “Delete my account now” | Awaiting answer (pack recommends not at launch) |

## GAP P0 — engineering status (code vs live QA)

| GAP | Sev | Code status (as of main) | Notes |
| --- | --- | --- | --- |
| GAP-01 | P0 | **Code fixed (K89)** | Needs Stripe test-mode QA evidence |
| GAP-02 | P0 | **Code fixed** | Server ignores client `trialDays` |
| GAP-03 | P0 | Open | One trial per account/card |
| GAP-04 | P0 | Open | Block duplicate Checkout |
| GAP-05 | P0 | Partial / verify | Founding coupons at Checkout — confirm live Stripe |
| GAP-06 | P0 | Partial / verify | Founding place atomicity under parallel Checkout |
| GAP-07 | P0 | Partial | Webhooks improved for cancel_at_period_end; more events still needed |
| GAP-11 | P0 | Open | Access end date from Stripe |
| GAP-14 | P0 | Open | Refund → access end + deletion schedule |
| GAP-16 | P0 | Open | Legal acceptance records |
| GAP-17 | P0 | **Code fixed (K90)** | Trial-start email — needs E2E proof |
| GAP-18 | P0 | Open | 3-day trial reminder |
| GAP-20 | P0 | Open | Payment-failed emails |
| GAP-21 | P0 | **Code fixed (K89)** | Cancel email — needs E2E proof |
| GAP-22 | P0 | Open | Data-deleted email / job |
| GAP-32 | P0 | **Ops proven (K86)** | SES production + DNS |
| GAP-33 | P0 | Open | Reset links always APP_ORIGIN (verify) |
| GAP-34 | P0 | Open | Fake-success ban across auth |
| GAP-40–44 | P0 | Open | Server product data, limits, wipe, closure, privacy match |

## Exit criteria that still block release (high level)

17. K88–K90 suites + Stripe cancel with no upcoming invoice  
18. Every P0/P1 **GAP** pass  
19. **RG-1–RG-4** + full **E2E** in Stripe test mode (no live trial before this)

## Files

- PDF: `docs/qa/v20.1/Margins365-QA-Prompt-v20.1.pdf`
- Text extract: `docs/qa/v20.1/Margins365-QA-Prompt-v20.1.txt`
