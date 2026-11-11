# Margins365 QA Report v20 — Production pass (partial)

**Environment:** Production https://margins365.com  
**Build / deploy:** DigitalOcean Lon app, ACTIVE deployment after `main` `207716a`  
**When:** Wednesday, 11 November 2026, ~15:34–15:55 Europe/London  
**Prompt:** `docs/qa/v20/Margins365-QA-Prompt-v20.pdf`  
**Method:** Read-only production crawl (`scripts/qa-v20-prod-crawl.mjs`) + desktop Chrome browser evidence. No Stripe test cards, no staging accounts, no destructive tests.

## Verdict

**Release not signed off.** Exit criteria §8 are **not met**. Public / SEO / consent / legal / Phase-2 URL smoke largely **Pass**. Billing, auth, shops/seats server SoT, emails, isolation, deletion, and device matrix are **Blocked** pending staging §5 accounts and Stripe test clocks.

Open **P1:** DEF-SEC-001 (security headers). Additional **P1/P2** domain/canonical issues logged below.

## Known gaps G1–G13 (re-test first)

| Gap | Result | Evidence |
|-----|--------|----------|
| G1 Routing / robots / 404 | **Pass** | Distinct titles; `/robots.txt` + `/sitemap.xml` 200; unknown path **HTTP 404** |
| G2 Scroll-to-top | **Pass** | Browser: mid-Pricing → Home lands at top |
| G3 Shops / seats screens | **Blocked** | Needs Scale/Pro staging accounts; client UI exists at `/app/shops`, `/app/team` but server SoT unproven |
| G4 Footer links | **Pass** | Browser: Terms / Privacy / Refunds / DPA / Cookies / Help are links |
| G5 Footer copyright / old sentence gone | **Pass** | Browser: `© 2026 Margins365. All rights reserved.`; no £39 footer sentence |
| G6 Brand space | **Pass** | Titles/meta use Margins365 one word |
| G7 Server product SoT | **Blocked / Fail risk** | `/api/health`, `/api/founding` live; shops/seats still client-local until server endpoints |
| G8 Cancel → Stripe | **Blocked** | Needs signed-in staging + Stripe test |
| G9 Webhook free plan | **Blocked** | Needs Stripe cancel + DB |
| G10 Security headers | **Fail** | Only `X-Content-Type-Options: nosniff` on HTML; no HSTS/CSP/XFO/Referrer-Policy from origin |
| G11 Founding fields | **Pass (API)** | `/api/founding` → 100 places; Pricing UI shows founding line |
| G12 Cookie notice | **Pass** | `/legal/cookies` v20.1 live + consent banner |
| G13 Search-ready basics | **Pass (partial)** | Per-route title/desc/canonical/OG; robots; sitemap; 404. CWV / Search Console / JSON-LD still open |

## Suite status (this pass)

| Suite | Status | Notes |
|-------|--------|-------|
| PUB | Partial Pass | Public routes + browser link/H1/nav checks |
| FTR | Pass | Copyright + links (browser) |
| BR | Partial Pass | Public HTML brand audit clean; emails/Stripe descriptor not checked |
| NAV | Partial Pass | Routes/refresh titles/404/scroll; intuitiveness study not run |
| AUTH | Blocked | No §5.1 staging accounts |
| CHK | Blocked | Stripe test mode + clocks required |
| OFF | Partial Pass | Counter API + Pricing UI; coupon reservation E2E Blocked |
| TRL / LIM / IMP / CALC / CR | Blocked | Need accounts + fixtures |
| SHOP / SEAT | Blocked | Need Scale/Pro + server SoT proof |
| PROF / ONB / BILL / CAN / DEL | Blocked | Need accounts |
| HELP | Partial Pass | Page + form fields visible; submit/SES/abuse limits not run |
| LEG | Partial Pass | Five legal pages + Cookie v20.1; PDF download present; content audit vs product incomplete |
| EML | Blocked | SES headers / SPF-DKIM-DMARC |
| DOM | Fail / Partial | `marginos.online` → 301 OK; **www.marginos.online TLS handshake fails**; www.margins365.com serves 200 (no apex 301) |
| RESP / XB / A11Y / PERF | Blocked / Not run | Device matrix + Lighthouse not in this pass |
| SEC | Fail (headers) / Blocked (isolation) | DEF-SEC-001 |
| PRIV | Partial | Cookie notice + consent; export/deletion Blocked |
| SEO | Partial Pass | SEO-01 style crawl basics Pass; SEO-30–32 / CWV / SC open |
| PCALC | Partial Pass | URLs live; one calculator exercised; full PCALC parity suite not run |
| CONS / ANL | Pass (smoke) | Reject works; Accept/Plausible network not fully HAR-proven |
| ERR | Partial | 404 UI Pass |
| REG | Not run systematically | |

## Defects raised

See `docs/qa/v20/DEFECT-LOG-v20.md`.

## Evidence index

- Crawl JSON: `docs/qa/v20/evidence/prod-crawl.json`
- Screenshots: `/opt/cursor/artifacts/qa-v20/` (home H1, footer/consent, pricing founding, terms, Etsy calc, 404)
- Crawl script: `scripts/qa-v20-prod-crawl.mjs`

## What QA still needs from Akthar / staging

1. Staging URL with Stripe **test** mode, SES test inboxes, Google test OAuth, separate DB  
2. §5.1 account matrix (all tiers × states) + Scale shops + two isolation accounts  
3. Stripe test clocks + admin/DB read for founding counter, usage, deletion tombstones  
4. Written go-ahead only for live CHK-40–42  
5. Confirm founding Stripe coupons exist (`m365_founding_50_6mo` / `m365_founding_25_annual` or env overrides)  
6. Fix or accept DEF-SEC-001 / www.marginos.online TLS / www→apex canonical policy  
