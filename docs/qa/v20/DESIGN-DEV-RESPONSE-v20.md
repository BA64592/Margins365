# Design & Development response to QA Prompt v20 outcomes

**Date:** 11 November 2026 (Europe/London)  
**Branch:** `cursor/qa-v20-fixes-cd8f`  
**Against:** `docs/qa/v20/QA-REPORT-v20.md` + `DEFECT-LOG-v20.md`

## Review summary

QA’s production read-only pass correctly closed the old empty-shell gaps (G1, G6, G12, G13 basics) and correctly failed/blocked release on security headers, host canonicalisation, and server SoT for shops/seats. This change set fixes the actionable P1/P2 items in code and App Spec.

| Defect | Priority | Action |
|--------|----------|--------|
| DEF-SEC-001 | P1 | **Fixed** — `scripts/security-headers.mjs` applied to HTML, JSON, static assets and redirects (HSTS, CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy) |
| DEF-SEO-001 | P2 | **Fixed** — `www.margins365.com` (and legacy hosts) 301/308 to apex `margins365.com` |
| DEF-DOM-001 | P1 | **Mitigated in app + DO spec** — redirect logic already covers `www.marginos.online`; added domain to `.do/app.yaml` so App Platform can issue TLS. Still needs DNS CNAME/A pointing at the app (EXTERNAL-CONFIG if DNS missing) |
| DEF-SHOP-001 | P1 | **Fixed foundation** — Postgres `shops` + `seat_invites` tables; `/api/shops` and `/api/team` APIs; Shops/Team UI uses server SoT (invite email send still follows EML suite) |

## Still Blocked (needs staging / ops — not code-only)

- AUTH / CHK / CAN / DEL / EML full suites (Stripe test clocks, SES inboxes, §5.1 accounts)
- Invite email delivery + accept-invite deep link (EML)
- RESP / A11Y / PERF matrices
- Search Console / Bing / CWV (SEO-30–32)
- Live CHK-40–42 (Akthar go-ahead only)

## Re-test after deploy

1. `curl -sSI https://margins365.com/` → expect HSTS, CSP, X-Frame-Options, Referrer-Policy, nosniff  
2. `curl -sSI https://www.margins365.com/pricing` → expect **301** Location apex  
3. `curl -sSI https://www.marginos.online/pricing` → expect TLS OK + 301 (after DNS/cert)  
4. Signed-in staging: `/api/shops` create/rename/delete persists across browsers; `/api/team/invites` persists  
