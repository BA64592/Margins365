# Cron ops (GA-22 / GA-42)

Daily job endpoint:

`POST https://margins365.com/api/internal/cron`  
Header: `X-Cron-Secret: <CRON_SECRET>`

Runs:
1. Due account deletions (wipe product data, tombstone, SES “data deleted”, close login)
2. Founding “price ends soon” emails (14 days before full price)

## DigitalOcean

1. App env: set `CRON_SECRET` (long random)
2. Add an App Platform **Job** or external cron (e.g. cron-job.org) daily that POSTs with the header

## Manual

```bash
CRON_SECRET=… node scripts/scheduler.mjs
```
