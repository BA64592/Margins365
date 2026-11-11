/**
 * DigitalOcean App Platform runtime:
 * static SPA + auth + SES + Stripe checkout/webhook.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  handleAuthContinue,
  handleAuthLogoutAll,
  handleAuthLogoutDestroy,
  handleAuthMe,
  handleContactForm,
  handleFeatureSuggestion,
  handleGoogleContinue,
  handleRequestPasswordReset,
  handleResetPassword,
  handleSendVerification,
  handleSyncLicence,
  handleUpdateProfile,
  handleVerifyToken,
} from './auth-handlers.mjs'
import { dbConfigured, migrate } from './db.mjs'
import { ensureFoundingSchema, getFoundingStatus } from './founding.mjs'
import { injectHtmlMeta, normalizeSeoPath } from './seo-meta.mjs'
import {
  createCheckoutSession,
  handleStripeWebhook,
  stripeConfigured,
} from './stripe-handlers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT || 8080)

/** Canonical public origin (K58 cutover). */
const CANONICAL_ORIGIN = String(
  process.env.APP_ORIGIN || 'https://margins365.com',
).replace(/\/$/, '')

/** Legacy hosts that permanently redirect to the canonical domain. */
const LEGACY_HOSTS = new Set(
  String(process.env.LEGACY_REDIRECT_HOSTS || 'marginos.online,www.marginos.online')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
)

function requestHost(req) {
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  return raw.split(',')[0].trim().split(':')[0].toLowerCase()
}

/** 301/308 legacy domain → margins365.com (preserve path + query). */
function redirectLegacyHost(req, res) {
  const host = requestHost(req)
  if (!LEGACY_HOSTS.has(host)) return false
  const target = `${CANONICAL_ORIGIN}${req.url || '/'}`
  const code = req.method === 'GET' || req.method === 'HEAD' ? 301 : 308
  res.writeHead(code, {
    Location: target,
    'Cache-Control': 'public, max-age=86400',
  })
  res.end()
  return true
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

function readBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function json(res, status, body, headers = {}) {
  const out = { 'Content-Type': 'application/json', ...headers }
  res.writeHead(status, out)
  res.end(JSON.stringify(body))
}

function safeJoin(base, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0])
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const full = path.join(base, cleaned)
  if (!full.startsWith(base)) return null
  return full
}

function sendIndexHtml(res, reqPath, statusOverride) {
  const index = path.join(dist, 'index.html')
  if (!fs.existsSync(index)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const raw = fs.readFileSync(index, 'utf8')
  const { html, status } = injectHtmlMeta(raw, reqPath)
  const code = statusOverride ?? status
  res.writeHead(code, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(html)
}

async function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/' : req.url.split('?')[0]
  const seoPath = normalizeSeoPath(urlPath)

  // Asset / file request (has extension other than trailing SPA paths)
  const looksLikeFile = /\.[a-zA-Z0-9]{1,8}$/.test(seoPath)
  if (looksLikeFile) {
    let filePath = safeJoin(dist, seoPath)
    if (!filePath) {
      res.writeHead(400)
      res.end('Bad request')
      return
    }
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      const ext = path.extname(filePath).toLowerCase()
      const immutable = ext === '.js' || ext === '.css' || ext === '.woff2' || ext === '.woff'
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      })
      fs.createReadStream(filePath).pipe(res)
      return
    }
    res.writeHead(404)
    res.end('Not found')
    return
  }

  // SPA routes — inject per-path meta; unknown paths get HTTP 404 (K75)
  sendIndexHtml(res, seoPath)
}

async function parseJson(req) {
  const raw = (await readBodyBuffer(req)).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}

const server = http.createServer(async (req, res) => {
  try {
    if (redirectLegacyHost(req, res)) return

    const url = req.url?.split('?')[0] || '/'
    const qs = new URL(req.url || '/', 'http://localhost').searchParams

    if (req.method === 'POST' && url === '/api/auth/continue') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleAuthContinue(body, req)
      json(res, result.status, result.body, result.headers || {})
      return
    }

    if (req.method === 'POST' && url === '/api/auth/google') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleGoogleContinue(body, req)
      json(res, result.status, result.body, result.headers || {})
      return
    }

    if (req.method === 'GET' && url === '/api/auth/me') {
      const result = await handleAuthMe(req)
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'POST' && url === '/api/auth/profile') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleUpdateProfile(req, body)
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'POST' && url === '/api/auth/logout') {
      const result = await handleAuthLogoutDestroy(req)
      json(res, result.status, result.body, result.headers || {})
      return
    }

    if (req.method === 'POST' && url === '/api/auth/logout-all') {
      const result = await handleAuthLogoutAll(req)
      json(res, result.status, result.body, result.headers || {})
      return
    }

    if (req.method === 'POST' && url === '/api/contact') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleContactForm(req, body)
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'POST' && url === '/api/feature-suggestions') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleFeatureSuggestion(req, body)
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'POST' && url === '/api/auth/sync-licence') {
      const result = await handleSyncLicence(req)
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'POST' && url === '/api/auth/send-verification') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        body = {}
      }
      // Prefer authenticated session path; fall back to legacy body for old clients
      const result = await handleSendVerification(req, body)
      if (result.status !== 401 || !body.email || !body.verifyUrl) {
        json(res, result.status, result.body)
        return
      }
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'POST' && url === '/api/auth/verify') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleVerifyToken(body.token)
      json(res, result.status, result.body, result.headers || {})
      return
    }

    if (req.method === 'GET' && url === '/api/auth/verify') {
      const result = await handleVerifyToken(qs.get('token'))
      if (result.status === 200) {
        const headers = {
          Location: '/?verified=1',
          ...(result.headers || {}),
        }
        res.writeHead(302, headers)
        res.end()
        return
      }
      json(res, result.status, result.body, result.headers || {})
      return
    }

    if (req.method === 'POST' && url === '/api/auth/request-password-reset') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleRequestPasswordReset(body, req)
      json(res, result.status, result.body)
      return
    }

    // Primary reset + Part 7 QA-A alias
    if (
      req.method === 'POST' &&
      (url === '/api/auth/reset-password' || url === '/api/v1/auth/reset')
    ) {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await handleResetPassword(body)
      json(res, result.status, result.body, result.headers || {})
      return
    }

    if (req.method === 'POST' && url === '/api/checkout') {
      let body = {}
      try {
        body = await parseJson(req)
      } catch {
        json(res, 400, { ok: false, message: 'Invalid JSON' })
        return
      }
      const result = await createCheckoutSession(body, req)
      json(res, result.status, result.body)
      return
    }

    // Primary Stripe webhook + Part 5 alias (same handler; no Dashboard change required)
    if (
      req.method === 'POST' &&
      (url === '/api/webhooks/stripe' || url === '/api/v1/billing/webhook')
    ) {
      const rawBuf = await readBodyBuffer(req)
      const sig = req.headers['stripe-signature']
      const result = await handleStripeWebhook(rawBuf, Array.isArray(sig) ? sig[0] : sig)
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'GET' && url === '/api/health') {
      json(res, 200, {
        ok: true,
        dbConfigured: dbConfigured(),
        stripeConfigured: stripeConfigured(),
        sesConfigured: Boolean(
          (process.env.SES_FROM_ADDRESS || process.env.SES_FROM_EMAIL) &&
            process.env.AWS_ACCESS_KEY_ID &&
            process.env.AWS_SECRET_ACCESS_KEY,
        ),
        region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-north-1',
      })
      return
    }

    // K72 — public founding counter (server source of truth)
    if (req.method === 'GET' && url === '/api/founding') {
      const status = await getFoundingStatus()
      json(res, 200, status)
      return
    }

    // Legacy sample-report → sample-shop (K60 / K75)
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      (url === '/sample-report' || url === '/sample-report/')
    ) {
      res.writeHead(301, {
        Location: '/sample-shop',
        'Cache-Control': 'public, max-age=86400',
      })
      res.end()
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res)
      return
    }

    res.writeHead(405)
    res.end()
  } catch (err) {
    console.error(err)
    json(res, 500, { ok: false, message: 'Internal error' })
  }
})

migrate()
  .then(async (ok) => {
    if (ok) {
      console.info('[margins365] database migrated')
      try {
        await ensureFoundingSchema()
      } catch (e) {
        console.warn('[margins365] founding schema', e)
      }
    } else console.warn('[margins365] DATABASE_URL missing — auth API disabled')
    server.listen(port, '0.0.0.0', () => {
      console.info(`[margins365] listening on 0.0.0.0:${port}`)
    })
  })
  .catch((err) => {
    console.error('[margins365] migrate failed', err)
    server.listen(port, '0.0.0.0', () => {
      console.info(`[margins365] listening on 0.0.0.0:${port} (auth migrate failed)`)
    })
  })
