# Defect log — QA Prompt v20.1

**Opened:** 12 November 2026, Europe/London  
**Build:** production `a596b2e` (+ hotfix branch)

| ID | Sev | Suite | Summary | Status |
| --- | --- | --- | --- | --- |
| DEF-QA-201-001 | P1 | GAP-59 | `/invite/:token` returned HTTP 404 (seo-meta unknown path) | **Fixed** (hotfix) |
| DEF-QA-201-002 | P1 | GAP-55 | Pricing “14 days free” copy; missing approved cancel-before-trial-ends line on cards | **Fixed** (hotfix) |

## Open / blocked (environment)

| ID | Sev | Summary | Status |
| --- | --- | --- | --- |
| DEF-QA-201-ENV | P0 | No staging + Stripe Test + test clocks + SES inboxes for E2E/GAP money suites | **Blocked** — owner setup |
| DEF-QA-201-003 | P0 | Live Stripe has **0 founding coupons** (`m365_founding_*` 404) — GAP-05 / E2E-05 | **Open** |
| DEF-QA-201-004 | P1 | Live Stripe Customer Portal **configurations = 0** — GAP-10 / E2E-10 (app button present; owner reviewed Dashboard) | **Open** |
| DEF-QA-201-005 | P0 | Webhook missing `invoice.paid` + `invoice.payment_action_required` — GAP-07 | **Open** |
