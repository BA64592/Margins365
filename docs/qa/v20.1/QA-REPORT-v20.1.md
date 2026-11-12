# Margins365 — QA Report v20.1 (production crawl + GAP smoke)

**QA run:** Thursday, 12 November 2026, ~00:45–01:00 Europe/London  
**Build under test:** https://margins365.com · GitHub `main` `a596b2e` (then hotfix for invite/path + GA-55 pricing copy)  
**Prompt:** `Margins365-QA-Prompt-v20.1` (640 cases)  
**Method:** Production read-only crawl + unauthenticated API contract checks + UI screenshots. **No Stripe Test staging** was available in this session, so money/deletion/E2E suites are **Blocked** per prompt §4–5 (never use live cards / real customer data).

## Verdict

| Gate | Result |
| --- | --- |
| Production public surface (routes, sitemap, headers, GA-59 pages) | **Pass with 2 defects** (invite token HTTP 404; pricing “14 days free” copy) — fixes shipping with this report |
| P0/P1 GAP full matrix + E2E-01–23 | **Blocked** — needs staging + Stripe **Test** + test clocks + SES test inboxes |
| Release (exit criteria 17–19 / RG-1–RG-4) | **Not ready** until staging E2E Pass |

## Evidence

| Artifact | Path |
| --- | --- |
| HTTP smoke JSON | `docs/qa/v20.1/evidence/prod-smoke.json` |
| Screenshots | `docs/qa/v20.1/evidence/{pricing,sign-in,reset-password,welcome,invite,help}.png` |

## Pass (production-allowed)

| ID / check | Result | Evidence |
| --- | --- | --- |
| Core pages `/` `/pricing` `/sample-shop` `/help` legal/* | Pass (200) | prod-smoke.json |
| GA-59 `/sign-in` `/reset-password` `/welcome` `/invite` | Pass (200 + auth modal) | screenshots |
| GA-60 Phase 2 calculators/landings out of sitemap | Pass | sitemap.xml crawl |
| GA-60 Phase 2 `noindex` | Pass | prod-smoke NOINDEX_* |
| Billing APIs reject signed-out cancel/portal/change-plan | Pass (401 Sign in first) | prod-smoke.json |
| Security headers present (CSP / XFO / XCTO) | Pass | prod-smoke SEC_HEADERS |
| GAP-01/21 prior live cancel (Growth) | Pass (owner live check 12 Nov) | Stripe `sub_1UabFD…` cancel_at_period_end after createPreview fix |
| GAP-01/21 **stop test** (Akthar) | **Pass** (12 Nov 2026 Europe/London) | Owner: ran 14-day trial → cancelled subscription → worked. Stripe still shows `cancel_at_period_end=true`, `cancel_at` Wed 25 Nov 2026 13:07 UTC, plan growth |
| GAP-32 / K86 SES | Pass (prior ops) | `docs/qa/v20/evidence/k86-ses/` |

## Fail (this run)

| ID | Sev | Finding | Status |
| --- | --- | --- | --- |
| GAP-59 | P1 | `GET /invite/:token` returned **HTTP 404** (SPA meta treated path as unknown). `/invite` alone was 200. | **Fixed in hotfix** — `seo-meta` treats `/invite/*` as known |
| GAP-55 / K81 | P1/P2 | Pricing still used “14 days free…” hero/card copy; SEO noscript h1 matched. Approved cancel line missing on pricing cards. | **Fixed in hotfix** — “14-day free trial” + “Cancel before your trial ends…” |

## Blocked (need staging — not run)

All suites that require Stripe Test, test clocks, SES receipt proof, or signed-in account matrix, including:

- GAP-02–07, 11, 14, 16–24 (money/webhooks/emails with Dashboard + inbox proof)
- GAP-08–10, 12–13, 40–53 (change plan, portal config, shops/seats/limits wipe)
- CAN / CHK / EML / DEL / LIM / SEAT / SHOP / BILL
- **E2E-01–E2E-23** (mandatory release gate)
- MOB / RESP device matrix beyond desktop screenshots

**Blocker reason:** No staging URL + Stripe test-mode keys + test inboxes handed to QA in this environment. Prompt forbids live-card billing tests.

## Owner / Akthar still required

1. Provide **staging** (or written go-ahead for limited Live CHK) with Stripe **Test**, test clocks, cron trigger, SES test inboxes.  
2. Turn on Stripe **Customer Portal** (cancel off) so GAP-10 can Pass.  
3. Confirm Live founding coupons.  
4. Company / ICO legal details when ready.

## Next QA session (when staging exists)

1. Seed §5.1 account matrix (all four tiers × trial/paid/cancel/past_due).  
2. Run GAP-01–66 with Stripe Dashboard + SES header proof.  
3. Run E2E-01–23; mark INDEX rows **Fixed** only with evidence.  
4. Mobile re-test GA-64 after billing modals.

## Owner live stop-test (billing cancel)

**Akthar, 12 Nov 2026 Europe/London:** “I have run the stop test 14 day trial, cancelled the subscription, it worked.”

Stripe check (same window): `sub_1UabFD0LXvIDuHeuhZeRxFsX` · status `trialing` · `cancel_at_period_end=true` · plan `growth` · cancels Wed 25 Nov 2026 13:07 UTC (Europe/London same as GMT in November).

Marks **GAP-01 / GAP-21** as **Fixed (owner live)** for the Growth trial cancel path. Remaining tiers + full CAN/E2E still need staging Test mode.

## Sign-off

| Role | Status |
| --- | --- |
| QA (this crawl) | Production smoke **complete**; full v20.1 **not** signed off |
| GAP-01 / GAP-21 cancel | **Pass** — owner live stop-test |
| Release | **Blocked** on staging E2E + owner portal/coupons/legal |
