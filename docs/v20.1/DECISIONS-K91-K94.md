# Decisions K91–K94 (Akthar, 11 Nov 2026)

Source: `Margins365-v20.1-Dev-Answers.pdf`.

| ID | Question | Decision |
| --- | --- | --- |
| **K91** | Pause live sign-ups / real trials until all P0s fixed? | **No pause.** Live trials stay open. Prioritise GA-01 (cancel through Stripe). Until cancel works, check cancellations by hand in Stripe Dashboard. |
| **K92** | Turn on Stripe’s own customer emails as a stop-gap? | **Yes — Live only** (saved 11 Nov 2026). Receipts, failed-payment reminders, 7-day trial-ending, renewals. **Test mode not configured** (Akthar). Stripe trial-ending is **7 days** before, not 3 — **GA-18** still required. |
| **K93** | Send confirmation email when someone changes plan? | **Yes.** SES after Stripe confirms. Include old plan, new plan, effective date, new price in pence incl. VAT, proration, and new order limit. |
| **K94** | Self-serve “Delete my account now” at launch? | **Not at launch.** Cancel already wipes at access end. Early deletion via privacy contact + admin tool (GDPR one-month). |

## Policy notes from the same answers

- GA-01, GA-02, GA-17, GA-21, GA-28, GA-29, GA-32 are **“Built, awaiting QA”** until Stripe test-mode + email + second-device evidence exists — not “Fixed”.
- GA-55: replace every “Cancel before day 14 and pay nothing” with “Cancel before your trial ends (date shown at Checkout and in Plan & billing)”.
- Release only when no P0/P1 open; P0s first, then P1s, then mobile re-test (GA-64).
