# K80–K86 + D-1 — Design & Dev implementation notes

**Source:** Updated `Margins365-v20-Changes.pdf` (K59–K86), Akthar iPhone findings 11 Nov 2026  
**Branch:** `cursor/v20-k80-k86-cd8f`

| ID | Status in this change |
|----|------------------------|
| D-1 | Fixed — `formatGbp` keeps pence when not a whole pound |
| K80 | Fixed — Modal/ConfirmDialog viewport fit + internal scroll; consent z below modals + safe-area |
| K81 | Fixed — sticky “14 days free…” banner removed (no-op component) |
| K82 | Fixed — instant scroll-to-top + focus main `h1` on route change |
| K83 | Fixed — feature suggestion stores then SES to `CONTACT_INBOX` with Reply-To |
| K84 | Fixed — contact SES + visitor confirmation **without** message text; honeypot + min fill; session enrichment |
| K85 | Fixed — reset URL from `APP_ORIGIN` only; SES failure still returns neutral message |
| K86 | Ops with Akthar — SES Verified + DKIM + MAIL FROM + production access; not fully automatable in app code |

## K86 checklist (Akthar + DNS)

1. SES eu-north-1: `margins365.com` identity Verified; Easy DKIM Successful; MAIL FROM `mail.margins365.com` Successful  
2. Production access (out of sandbox)  
3. Bounce/complaint handling  
4. Apex SPF `v=spf1 include:amazonses.com ~all`; DMARC `p=none` + rua then quarantine  
5. From `noreply@margins365.com` / name Margins365  
