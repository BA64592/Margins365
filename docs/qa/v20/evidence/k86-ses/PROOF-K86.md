# K86 SES proof — Akthar screenshots (11 Nov 2026, ~20:37 Europe/London)

Source: AWS Console eu-north-1 (Hold My Coffee / Akthar Uddin) + GoDaddy DNS for margins365.com.  
Files: this folder + `/opt/cursor/artifacts/k86-ses-proof/`.

## Console (eu-north-1)

| Check | Status |
| --- | --- |
| Identity `margins365.com` (domain) | **Verified** |
| Identity `info.marginos@gmail.com` (email) | **Verified** |
| Easy DKIM | **Successful** (RSA 2048; signatures Enabled) |
| Custom MAIL FROM `Mail.margins365.com` | **Successful** |
| DMARC (SES guidance) | `v=DMARC1; p=none;` |

## Live DNS (checked after screenshots)

| Record | Result |
| --- | --- |
| 3× DKIM CNAMEs → `*.dkim.amazonses.com` | Pass |
| MX `mail.margins365.com` → `10 feedback-smtp.eu-north-1.amazonses.com` | Pass |
| TXT `mail.margins365.com` SPF `include:amazonses.com` | Pass |
| TXT `_dmarc.margins365.com` | Pass (`p=none`) |
| Apex TXT SPF on `margins365.com` | **Missing** |
| SES production access (out of sandbox) | **Not shown** in these screenshots |
| Inbox header proofs (Gmail / Outlook / iCloud) | **Not attached** |

## Verdict

Identity + DKIM + MAIL FROM are proven. ES / EML exit criteria still need: apex SPF on `@`, production-access screenshot, and at least one external delivery header pass per provider.
