# DigitalOcean App Platform deploy (LON1)

## Why the first deploy failed

DigitalOcean ran MarginOS as a **Web Service** with **no start command**.  
Vite produces static files in `dist/` — there is no long-running Node process unless you add one.

Log lines:

- `when there is no default process a command is required`
- readiness probe `dial tcp …:8080: connection refused`

## Current recommended setup — Web Service (SPA + SES API)

Verification email needs a Node runtime for `POST /api/auth/send-verification`.

| Setting | Value |
|---|---|
| Component type | **Web Service** |
| Source | `BA64592/MarginOS` · branch `main` |
| Build command | `npm ci && npm run build` |
| Run command | `npm start` |
| HTTP port | `8080` |

`npm start` runs `scripts/server.mjs`: serves `dist/` (SPA fallback) and the SES verification API.

### Runtime secrets / env

| Key | Notes |
|---|---|
| `AWS_ACCESS_KEY_ID` | SECRET |
| `AWS_SECRET_ACCESS_KEY` | SECRET |
| `AWS_REGION` | `eu-north-1` |
| `AWS_SES_REGION` | `eu-north-1` (alias; either works) |
| `SES_FROM_EMAIL` | `no-reply@margins365.com` |
| `SES_FROM_ADDRESS` | same (code accepts either) |

Redeploy after setting secrets. Check `GET /api/health` → `{ "sesConfigured": true }`.

## Static Site only (no email API)

| Setting | Value |
|---|---|
| Component type | **Static Site** |
| Build command | `npm ci && npm run build` |
| Output directory | `dist` |
| Catch-all / SPA | `index.html` |

Static Site cannot send SES mail; `/api/*` falls through to `index.html`.

## Stripe (K4)

Also served by `scripts/server.mjs`:

- `POST /api/checkout`
- `POST /api/webhooks/stripe`
- Health includes `stripeConfigured`

See `docs/STRIPE-SETUP.md`. `VITE_PAYMENTS_MODE` / `VITE_STRIPE_PUBLISHABLE_KEY` are **build-time** on App Platform.

## Note on Vercel `/api/*`

The `api/` handlers also work on Vercel. On DigitalOcean, the Web Service `scripts/server.mjs` is the supported path.
