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
