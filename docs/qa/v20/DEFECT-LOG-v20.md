# Margins365 defect log — QA Prompt v20 (11 Nov 2026, Europe/London)

Environment for all: **Production** https://margins365.com · DO ACTIVE after main `207716a` · Desktop Chrome unless noted.

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
