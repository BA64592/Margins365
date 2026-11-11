# QA retest — K80–K86 / D-1 (prompt v20 updated 11 Nov 2026)

**Prompt:** `docs/qa/v20/Margins365-QA-Prompt-v20.pdf` (upload hash `1f8d91be…`, 520 cases; +35 for K80–K86 and D-1).  
**Production at start of pass:** commit `3fa8c83` (ACTIVE).  
**Follow-up fix this pass:** body scroll lock for Modal/ConfirmDialog (MOB-01/MOB-07) + remove `TRIAL_BANNER_LINE` from client bundle (MOB-12 text search).

## Automated / crawl (apex)

| Check | Result |
| --- | --- |
| Security headers (HSTS, CSP, XFO, nosniff, RP) | Pass |
| `/api/founding` → eligible, placesLeft 100 | Pass |
| Bundle founding amounts `19.5` / `39.5` / `64.5` / `99.5` | Pass |
| `formatMoney` min/maxFractionDigits whole-aware (D-1) | Pass |
| Exact sticky banner copy in shell HTML | Pass (absent) |
| Exact sticky banner copy in JS after this fix | Pass (removed constant) |
| SPF on apex TXT | Fail / open — no SPF on `margins365.com` apex (K86) |
| DMARC | Partial — `v=DMARC1; p=none;` only |
| Custom MAIL FROM `mail.margins365.com` | Pass (MX + SPF include amazonses) |

## Browser smoke (Chrome; ~390 width for MOB)

| ID | Result | Notes |
| --- | --- | --- |
| MOB-12 / K81 | Pass | Sticky banner gone; header is top chrome |
| MOB-13 / BN-3 | Pass | Trial terms remain on Pricing cards + plans modal |
| OFF / D-1 | Pass | £19.50 / £39.50 / £64.50 / £99.50 shown under founding |
| MOB-01 | Fail → fixed | Background scrolled behind modal; body scroll lock added |
| MOB-06 | N/A | Cookie consent already stored in session |
| K82 / NAV | Pass | Instant jump to top on Pricing nav |
| HELP form present (K84 UI) | Pass | Not submitted (no live SES proof this pass) |
| AUTH-21–25 / EML / real iPhone | Blocked | Needs device lab + operator SES proof (K86) |

## Exit criterion 16 (K80–K86)

Not fully met until: (1) MOB retest on real iPhone Safari (bar shown/hidden), Android, iPad; (2) K86 SES production-access / DKIM / SPF apex proof attached by Akthar; (3) MOB-01 re-verified after this deploy.

## Defects opened this pass

| ID | Sev | Status | Summary |
| --- | --- | --- | --- |
| DEF-MOB-001 | P0 | Fixed (pending deploy) | Modal open: page behind scrolled (MOB-01/07) |
| DEF-BN-001 | P1 | Fixed (pending deploy) | Banner copy still present in JS as `TRIAL_BANNER_LINE` (text-search fail for MOB-12) |
| DEF-EML-K86 | P1 | Open / ops | Apex SPF empty; DMARC `p=none`; SES production access not proven in this pass |
