# Margins365 defect log — QA Prompt v20 (11 Nov 2026, Europe/London)

Environment for all: **Production** https://margins365.com · DO ACTIVE after main `207716a` · Desktop Chrome unless noted.

## Status update (Design & Dev fix pass — 11 Nov 2026 Europe/London)

| ID | Status |
|----|--------|
| DEF-SEC-001 | **Fixed** in `cursor/qa-v20-fixes-cd8f` — security headers on HTML/JSON/static/redirects |
| DEF-SEO-001 | **Fixed** — `www.margins365.com` → apex 301 |
| DEF-DOM-001 | **Mitigated** — app redirect + `www.marginos.online` on DO app spec; DNS/cert may still be EXTERNAL-CONFIG |
| DEF-SHOP-001 | **Fixed foundation** — `/api/shops` + `/api/team` Postgres SoT; invite email send still EML |

See `DESIGN-DEV-RESPONSE-v20.md`.

---

### DEF-SEC-001
**Title:** HTML responses missing full security header set  
**Priority:** P1  
**Test case:** G10 / SEC-20–SEC-24  
**Spec:** QA Prompt G10; SEC suite  
**Device / browser:** Crawl client (HTTP)  
**URL:** https://margins365.com/  
**Steps:**  
1. `curl -sSI https://margins365.com/`  
**Expected:** HSTS, CSP, X-Frame-Options, X-Content-Type-Options (nosniff), Referrer-Policy on HTML.  
**Actual:** Only `x-content-type-options: nosniff`. No `strict-transport-security`, `content-security-policy`, `x-frame-options`, or `referrer-policy` from origin (Cloudflare present but does not add these on the observed response).  
**Evidence:** `docs/qa/v20/evidence/prod-crawl.json` → `routes["/"].securityHeaders`  
**Frequency:** Always  
**Impact:** Security posture; clickjacking / MIME / referrer / HSTS gaps  
**Tags:** KNOWN-GAP G10

---

### DEF-DOM-001
**Title:** www.marginos.online TLS handshake failure (legacy host)  
**Priority:** P1  
**Test case:** DOM / SEO redirects  
**Spec:** V21, K73, SEO host redirects  
**URL:** https://www.marginos.online/  
**Steps:**  
1. HTTPS GET to www.marginos.online  
**Expected:** Valid TLS and 301/308 to https://margins365.com/…  
**Actual:** `ssl/tls alert handshake failure` (no usable redirect). Apex `marginos.online` correctly 301s to margins365.com.  
**Evidence:** prod-crawl `redirects["www.marginos.online"]`  
**Frequency:** Always  
**Impact:** Old www bookmarks/emails break without redirect  
**Tags:** EXTERNAL-CONFIG | V21

---

### DEF-SEO-001
**Title:** www.margins365.com serves 200 instead of 301 to apex canonical  
**Priority:** P2  
**Test case:** SEO host / canonical  
**Spec:** V23 / SEO “one canonical host with 301 redirects”  
**URL:** https://www.margins365.com/pricing  
**Steps:**  
1. Request www host  
**Expected:** 301 to `https://margins365.com/…`  
**Actual:** HTTP 200 with same page content; canonical meta still points at apex (good) but host dual-serves.  
**Evidence:** prod-crawl `redirects["www.margins365.com"]`; `curl -sSI`  
**Frequency:** Always  
**Impact:** Duplicate-host SEO risk  
**Tags:** SEO

---

### DEF-SHOP-001 (provisional)
**Title:** Shops / seats not proven as server source of truth  
**Priority:** P1 (blocks SHOP/SEAT/SEC isolation exit criteria)  
**Test case:** G7, SHOP-*, SEAT-*, SEC-01–04  
**Spec:** V15, V16, 23.2–23.3  
**Expected:** Server is SoT for shops, seats, invites, order usage.  
**Actual:** Production exposes client routes `/app/shops` and `/app/team` (UI present in build) but no proven authenticated shop/seat APIs in this pass; prior known gap G7 still applies until staging proves persistence across devices.  
**Evidence:** QA report G7; blocked suites  
**Frequency:** N/A (Blocked proof)  
**Impact:** Multi-device / isolation / Scale shops cannot be release-signed  
**Tags:** KNOWN-GAP G7 | Blocked pending staging

---

## Closed / Pass observations (not defects)

- G1 routing + real 404 closed vs prior empty-shell audit.  
- Brand one-word on public titles.  
- Cookie notice v20.1 + consent banner.  
- Founding counter API + Pricing “100 places left”.  
- Legal five docs readable signed-out with version/date + PDF.  
- Home H1 exact string (browser).  
- `marginos.online` → `https://margins365.com/…` 301.  
- `/sample-report` → `/sample-shop` 301.  

---

## Retest pass — K80–K86 prompt (11 Nov 2026 evening Europe/London)

| ID | Status |
|----|--------|
| DEF-MOB-001 | **Fixed & verified on prod** (`7243dd7`, DO ACTIVE) — body/`html` scroll lock + iOS `position:fixed` pin while Modal/ConfirmDialog open |
| DEF-BN-001 | **Fixed & verified on prod** — removed unused `TRIAL_BANNER_LINE` from client bundle |
| DEF-EML-K86 | **Open / ops** — apex SPF empty; DMARC `p=none`; SES production access proof not attached |

### DEF-MOB-001
**Title:** Plans modal does not lock background scroll at ~390px  
**Priority:** P0  
**Test case:** MOB-01 / MOB-07  
**Actual:** Wheel/touch scrolled the page behind the open UpgradeModal.  
**Fix:** `useBodyScrollLock` in `src/components/ui.tsx`.

### DEF-BN-001
**Title:** Exact sticky banner copy still in JS via unused constant  
**Priority:** P1  
**Test case:** MOB-12 / BN-1  
**Actual:** `TRIAL_BANNER_LINE` remained in `plans.ts` and the production bundle.  
**Fix:** Removed; `TRIAL_BANNER_REMOVED` marker only. Allowed non-banner "Cancel before day 14" trial lines remain (spec B.19.2).

### DEF-EML-K86
**Title:** K86 SES / DNS proof incomplete on apex  
**Priority:** P1 (ops)  
**Test case:** EML-22–25 / exit criterion 8 & 16  
**Actual:** No SPF TXT on `margins365.com`; DMARC is `p=none` only; MAIL FROM subdomain present.  


---

## K86 SES proof update — 11 Nov 2026 evening Europe/London

Akthar supplied AWS + GoDaddy screenshots (archived under `docs/qa/v20/evidence/k86-ses/`).

| Item | Status |
|------|--------|
| Domain identity Verified (eu-north-1) | Proven |
| Easy DKIM Successful | Proven (live DNS matches) |
| MAIL FROM `mail.margins365.com` Successful | Proven (live DNS matches) |
| DMARC `p=none` | Present (monitoring only) |
| Apex SPF on `margins365.com` | **Still open** — add TXT `@` `v=spf1 include:amazonses.com ~all` (or include existing senders) |
| SES production access | **Still open** — console screenshot not in pack |
| External header proofs | **Still open** |

DEF-EML-K86 remains **partially open** until apex SPF + production access + header proofs.
