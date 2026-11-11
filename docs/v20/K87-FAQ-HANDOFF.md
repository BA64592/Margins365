# K87 — Hard limits & billing FAQ (single source)

**Approved:** Changes pack K59–K87 (11 Nov 2026).

## Source of truth
- `src/content/hard-limits-faq.json` — 15 entries + Help groups + Help-only sign-in answers
- `src/content/hard-limits-faq.ts` / `.mjs` — typed / Node accessors + FAQPage JSON-LD helper

## Surfaces
- Pricing: all 15 in 3.2 order; Help centre link; state-aware CTAs; “Open Sample Shop” icon (no “View sample report”)
- Help: same 15 under five group headings; Sign-in and account (2); Contact us `#contact`
- Server HTML for `/pricing` and `/help`: noscript FAQ copy + `FAQPage` JSON-LD

## Acceptance map
FQ-1…FQ-6 covered in code; K86 SES proof remains ops.
