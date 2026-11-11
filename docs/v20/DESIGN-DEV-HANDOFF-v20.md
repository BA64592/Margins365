# Margins365 v20 — Design & Development handoff

**Status:** Approved pack ingested 11 November 2026 (Europe/London).  
**Sources:** `docs/v20/Margins365-v20-Changes.pdf`, `Margins365-Spec-v20.pdf`, `Margins365-SEO-v20.pdf`, five legal PDFs.  
**Text extracts:** matching `*.txt` in this folder. **Legal HTML source:** `src/content/legal/*`. **Public PDFs:** `/legal-pdfs/*`.

Developers build K59–K75, K78, K79 on staging. QA uses the QA Prompt v20 (not in this pack). K76–K77 are Phase 2 after the core QA pass. Prices, order limits and formulas 12.0–12.3 do not change.

## Decision index

| ID | Decision |
| --- | --- |
| K59 | Brand **Margins365** (one word) everywhere customer-facing |
| K60 | Header: Home / Sample shop / Pricing; Sample report → Sample shop |
| K61 | Start here: Sample shop and Compare plans swapped |
| K62 | Every navigation opens at the top |
| K63 | Real URL routes; refresh / deep links / back-forward |
| K64 | Footer copyright; Help + Legal columns; remove old £39 sentence |
| K65 | `/help` FAQ + Contact us form (SES) |
| K66 | Sample shop CTAs + shop icon → `/app/sample` |
| K67 | Signed-in header: business-name menu, no trial CTA |
| K68 | Shops 1/1/1/3 · seats 1/1/2/5 · invites (server SoT) |
| K69 | Trial = chosen tier (ends K52 reverse trial / Keep Pro) |
| K70 | Info profile (phone optional; richer fields) |
| K71 | Optional cancel reason |
| K72 | Founding: 50% off 6 months, first 100 paying |
| K73 | margins365.com only; strip marginos.online |
| K74 | Publish five legal pages + PDFs |
| K75 | SEO: prerender, metadata, robots, sitemap, redirects, CWV |
| K76 | Phase 2 — free public calculators |
| K77 | Phase 2 — keyword landings + help articles |
| K78 | Home H1: “Know your true profit and where it leaks” |
| K79 | Consent banner + Plausible; Cookie/Privacy/DPA v20.1 |

## Build order (from change pack)

1. K73 + K59 · 2. K63 + K62 · 3. Server shop store + K68 · 4. K70 + K67 · 5. K69 + K72 · 6. K71 · 7. K60/K61/K66 · 8. K64/K65 · 9. K74 · 10. K75 + K78 · 11. K79 · Phase 2: K76 then K77.

## Shipped in first implementation PR (this branch)

- Docs ingested under `docs/v20/` + public legal PDFs  
- K59 brand default Margins365  
- K63 client routes + K62 scroll-top + `/sample-report` → `/sample-shop`  
- K60/K61/K66 Sample shop rename + Start here order + icon CTA  
- K64 footer copyright + Help/Legal links (legal open in new tab)  
- K65 Help centre page + `/api/contact`  
- K74 legal pages at `/legal/*` with Download PDF  
- K69 trial = chosen tier (removed Keep Pro UI / reverse-trial copy)  
- K78 Home H1  
- K75 basics: `robots.txt`, `sitemap.xml`, `lang=en-GB`, Home title/meta/OG stubs  

## Still open (next PRs)

- Full prerender / SSR for public HTML (SEO A1)  
- Server real 404 / redirects / HSTS / asset caching  
- K67 account menu + Control room IA  
- K68 shops/seats/invites + server product data (F1)  
- K70 Info fields · K71 cancel reason · K72 founding coupons  
- K73 SES/SPF/DKIM/DMARC + Stripe descriptor + strip remaining marginos.online strings  
- K79 consent banner + Plausible  
- Phase 2 K76/K77  

## Hand to QA when

All K59–K75, K78, K79 acceptance lists pass on staging; Stripe test + SES from margins365.com; then run QA Prompt v20. Nothing to Marketing until QA passes.
