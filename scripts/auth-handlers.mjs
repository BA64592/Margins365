/**
 * Server-side email/password auth + verification (spec A5 / K5).
 * Sessions: httpOnly cookie `marginos_session`.
 */
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { dbConfigured, query } from './db.mjs'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { SUPPORT_INBOX, sesFromAddress } from './support-inbox.mjs'

const SESSION_DAYS = 30
const VERIFY_HOURS = 24
/** K57 / Q34 defaults */
const RESET_MINUTES = Number(process.env.PASSWORD_RESET_MINUTES || 60)
const RESET_PER_EMAIL = Number(process.env.PASSWORD_RESET_PER_EMAIL || 3)
const RESET_PER_IP = Number(process.env.PASSWORD_RESET_PER_IP || 10)
const RESET_WINDOW_MS = 60 * 60 * 1000
const MIN_PASSWORD = 15
const COOKIE = 'marginos_session'
const GENERIC_RESET_MSG = "If an account exists, we've sent a reset link."

const loginHits = new Map()

function rateLimit(key, limit, windowMs) {
  const now = Date.now()
  const row = loginHits.get(key) || { n: 0, start: now }
  if (now - row.start > windowMs) {
    row.n = 0
    row.start = now
  }
  row.n += 1
  loginHits.set(key, row)
  return row.n <= limit
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`
}

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    out[k] = decodeURIComponent(v)
  }
  return out
}

function sessionCookie(sessionId, maxAgeSec) {
  // App Platform terminates TLS; always Secure in hosted envs unless explicitly disabled.
  const secure =
    process.env.FORCE_SECURE_COOKIES !== '0' &&
    (process.env.NODE_ENV === 'production' ||
      process.env.FORCE_SECURE_COOKIES === '1' ||
      Boolean(process.env.DATABASE_URL))
  const parts = [
    `${COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

function parseEnabledPlatforms(raw) {
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return null
    return parsed.filter((p) => ['shopify', 'amazon', 'etsy'].includes(p))
  } catch {
    return null
  }
}

export function publicUser(row) {
  const plan = String(row.plan || 'free').toLowerCase()
  const licenceState = String(row.licence_state || 'none').toLowerCase()
  const interval = String(row.billing_interval || '').toLowerCase()
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    plan: ['starter', 'growth', 'pro', 'scale', 'free'].includes(plan) ? plan : 'free',
    licenceState,
    billingInterval: interval === 'year' || interval === 'month' ? interval : null,
    trialEndsAt: row.trial_ends_at?.toISOString?.() || row.trial_ends_at || null,
    cancelAt: row.cancel_at?.toISOString?.() || row.cancel_at || null,
    cancelReference: row.cancel_reference || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    accountClosedAt: row.account_closed_at?.toISOString?.() || row.account_closed_at || null,
    deletionDueAt: row.deletion_due_at?.toISOString?.() || row.deletion_due_at || null,
    stripeCustomerId: row.stripe_customer_id || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    timeZone: row.time_zone || 'Europe/London',
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    lastSignInAt: row.last_sign_in_at?.toISOString?.() || row.last_sign_in_at,
    authProvider: row.auth_provider === 'google' ? 'google' : 'email',
    fullName: row.full_name || null,
    businessName: row.business_name || null,
    phone: row.phone || null,
    enabledPlatforms: parseEnabledPlatforms(row.enabled_platforms),
  }
}

async function createSession(userId) {
  const id = newId('sess')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await query(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`, [
    id,
    userId,
    expires.toISOString(),
  ])
  return { id, expires }
}

export async function userFromRequest(req) {
  if (!dbConfigured()) return null
  const cookies = parseCookies(req.headers.cookie)
  const sid = cookies[COOKIE]
  if (!sid) return null
  const { rows } = await query(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sid],
  )
  const user = rows[0] || null
  // GA-44 — closed accounts cannot use the API; kill leftover sessions
  if (user?.account_closed_at || String(user?.licence_state || '') === 'ended') {
    await query(`DELETE FROM sessions WHERE id = $1`, [sid])
    return null
  }
  return user
}

function sesMailer() {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-north-1'
  const from = sesFromAddress()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || ''
  if (!from || !accessKeyId || !secretAccessKey) return { error: 'SES is not configured' }
  return { region, from, accessKeyId, secretAccessKey }
}

async function sendVerifyEmail(to, verifyUrl) {
  const cfg = sesMailer()
  if (cfg.error) return { ok: false, message: cfg.error }
  const client = new SESv2Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: cfg.from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [SUPPORT_INBOX],
      Content: {
        Simple: {
          Subject: { Data: 'Verify your Margins365 email', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: `Verify your Margins365 email.\n\nOpen this link within 24 hours (any device — your other signed-in devices will update automatically):\n${verifyUrl}\n\nNo code is required. Do not reply to this email.\n`,
              Charset: 'UTF-8',
            },
            Html: {
              Data: `<p>Verify your <strong>Margins365</strong> email address.</p><p><a href="${verifyUrl}">Confirm email</a></p><p style="color:#555;font-size:14px">Open the link on any device. Your other signed-in sessions update automatically — there is no code to type.</p><p style="color:#555;font-size:14px">${verifyUrl}</p>`,
              Charset: 'UTF-8',
            },
          },
        },
      },
    }),
  )
  return { ok: true }
}

async function mintVerification(userId, origin) {
  const token = `ver_${crypto.randomBytes(16).toString('hex')}`
  const expires = new Date(Date.now() + VERIFY_HOURS * 60 * 60 * 1000)
  await query(
    `INSERT INTO verification_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expires.toISOString()],
  )
  // GA-33 / K85 — every email link from fixed APP_ORIGIN only (ignore browser origin)
  void origin
  const base = process.env.APP_ORIGIN || 'https://margins365.com'
  // Hit the API so verify works without SPA JS; cookie is set then redirect to app.
  const verifyUrl = `${String(base).replace(/\/$/, '')}/api/auth/verify?token=${encodeURIComponent(token)}`
  return { token, verifyUrl }
}

/** Google Identity Services — server verifies access token via Google userinfo. */
export async function handleGoogleContinue(body, req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const accessToken = String(body.accessToken || '').trim()
  const timeZone = String(body.timeZone || 'Europe/London')
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'
  if (!rateLimit(`auth:${ip}`, 30, 15 * 60 * 1000)) {
    return { status: 429, body: { ok: false, message: 'Too many attempts. Try again later.' } }
  }
  if (!accessToken) {
    return { status: 400, body: { ok: false, message: 'Google sign-in token missing.' } }
  }

  let profile
  try {
    const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!gRes.ok) {
      return { status: 401, body: { ok: false, message: 'Google sign-in could not be verified.' } }
    }
    profile = await gRes.json()
  } catch {
    return { status: 502, body: { ok: false, message: 'Could not reach Google to verify sign-in.' } }
  }

  const sub = String(profile.sub || '').trim()
  const email = String(profile.email || '')
    .trim()
    .toLowerCase()
  const emailVerified =
    profile.email_verified === true || profile.email_verified === 'true'
  const displayName = String(profile.name || '').trim() || null
  if (!sub || !email || !email.includes('@')) {
    return { status: 400, body: { ok: false, message: 'Google did not return a usable email.' } }
  }
  // Spec Part 3 — reject unverified Google accounts (no provisional session)
  if (!emailVerified) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'unverified_google_account',
        message: 'Your Google account email is not verified. Use a verified Google account or continue with email.',
      },
    }
  }

  const bySub = await query(`SELECT * FROM users WHERE google_sub = $1`, [sub])
  let user = bySub.rows[0]
  if (!user) {
    const byEmail = await query(`SELECT * FROM users WHERE email = $1`, [email])
    const existing = byEmail.rows[0]
    if (existing) {
      const provider = String(existing.auth_provider || 'email')
      if (provider === 'email' && existing.password_hash) {
        return {
          status: 409,
          body: {
            ok: false,
            message:
              'This email already has a password account. Sign in with email, or reset your password.',
          },
        }
      }
      await query(
        `UPDATE users SET
           google_sub = $2,
           auth_provider = 'google',
           email_verified = CASE WHEN $3 THEN TRUE ELSE email_verified END,
           full_name = COALESCE(full_name, $4),
           last_sign_in_at = NOW(),
           time_zone = COALESCE($5, time_zone),
           updated_at = NOW()
         WHERE id = $1`,
        [existing.id, sub, emailVerified, displayName, timeZone],
      )
      const refreshed = await query(`SELECT * FROM users WHERE id = $1`, [existing.id])
      user = refreshed.rows[0]
    } else {
      const id = `acct_${crypto.randomBytes(10).toString('hex')}`
      // Unusable password hash — Google accounts cannot sign in with a password.
      const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
      const inserted = await query(
        `INSERT INTO users (
           id, email, password_hash, email_verified, plan, time_zone,
           last_sign_in_at, auth_provider, google_sub, full_name
         ) VALUES ($1, $2, $3, $4, 'free', $5, NOW(), 'google', $6, $7)
         RETURNING *`,
        [id, email, hash, emailVerified, timeZone, sub, displayName],
      )
      user = inserted.rows[0]
    }
  } else {
    await query(
      `UPDATE users SET
         last_sign_in_at = NOW(),
         time_zone = COALESCE($2, time_zone),
         email_verified = CASE WHEN $3 THEN TRUE ELSE email_verified END,
         full_name = COALESCE(full_name, $4),
         updated_at = NOW()
       WHERE id = $1`,
      [user.id, timeZone, emailVerified, displayName],
    )
    const refreshed = await query(`SELECT * FROM users WHERE id = $1`, [user.id])
    user = refreshed.rows[0]
  }

  const session = await createSession(user.id)
  return {
    status: 200,
    headers: { 'Set-Cookie': sessionCookie(session.id, SESSION_DAYS * 24 * 60 * 60) },
    body: {
      ok: true,
      user: publicUser(user),
      message: user.email_verified
        ? 'Signed in with Google.'
        : 'Signed in with Google. Verify your email before upload.',
    },
  }
}

const LEGAL_TERMS_VERSION = process.env.LEGAL_TERMS_VERSION || 'v20'
const LEGAL_REFUNDS_VERSION = process.env.LEGAL_REFUNDS_VERSION || 'v20'

export async function recordLegalAcceptance(userId, source, ip) {
  if (!dbConfigured() || !userId) return
  const docs = [
    ['terms', LEGAL_TERMS_VERSION],
    ['refunds', LEGAL_REFUNDS_VERSION],
  ]
  for (const [document, version] of docs) {
    await query(
      `INSERT INTO legal_acceptances (id, user_id, document, version, ip, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `leg_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        document,
        version,
        ip || null,
        source || 'signup',
      ],
    )
  }
}

export async function handleAuthContinue(body, req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const email = String(body.email || '')
    .trim()
    .toLowerCase()
  const password = String(body.password || '')
  const timeZone = String(body.timeZone || 'Europe/London')
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'
  if (!rateLimit(`auth:${ip}`, 30, 15 * 60 * 1000)) {
    return { status: 429, body: { ok: false, message: 'Too many attempts. Try again later.' } }
  }
  if (!email || !email.includes('@') || password.length < MIN_PASSWORD) {
    return {
      status: 400,
      body: {
        ok: false,
        message: `Valid email and password (${MIN_PASSWORD}+ characters) required.`,
      },
    }
  }

  const existing = await query(`SELECT * FROM users WHERE email = $1`, [email])
  let user = existing.rows[0]
  if (!user) {
    // GA-16 — record Terms + Refunds acceptance at account create
    if (!body.acceptLegal) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'legal_required',
          message: 'Accept the Terms and Refunds policy to create an account.',
        },
      }
    }
    const id = `acct_${crypto.randomBytes(10).toString('hex')}`
    const hash = await bcrypt.hash(password, 12)
    const inserted = await query(
      `INSERT INTO users (id, email, password_hash, email_verified, plan, time_zone, last_sign_in_at)
       VALUES ($1, $2, $3, FALSE, 'free', $4, NOW())
       RETURNING *`,
      [id, email, hash, timeZone],
    )
    user = inserted.rows[0]
    await recordLegalAcceptance(user.id, 'signup', ip)
  } else {
    if (user.account_closed_at || String(user.licence_state || '') === 'ended') {
      return {
        status: 403,
        body: {
          ok: false,
          code: 'account_closed',
          message:
            'This account is closed. Create a new empty account with the same email is not possible — use a new email, or contact support from Help.',
        },
      }
    }
    if (String(user.auth_provider || 'email') === 'google') {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'google_only',
          message:
            'This account uses Google Sign-In. Please use Continue with Google above.',
        },
      }
    }
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return { status: 401, body: { ok: false, message: 'Email or password is incorrect.' } }
    }
    await query(`UPDATE users SET last_sign_in_at = NOW(), time_zone = COALESCE($2, time_zone), updated_at = NOW() WHERE id = $1`, [
      user.id,
      timeZone,
    ])
    const refreshed = await query(`SELECT * FROM users WHERE id = $1`, [user.id])
    user = refreshed.rows[0]
  }

  const session = await createSession(user.id)
  const headers = { 'Set-Cookie': sessionCookie(session.id, SESSION_DAYS * 24 * 60 * 60) }

  let verifyQueued = false
  if (!user.email_verified) {
    const origin = body.origin || req.headers.origin || 'https://margins365.com'
    if (rateLimit(`verify:${user.id}`, 5, 60 * 60 * 1000)) {
      const { verifyUrl } = await mintVerification(user.id, origin)
      const sent = await sendVerifyEmail(user.email, verifyUrl)
      verifyQueued = sent.ok
    }
  }

  return {
    status: 200,
    headers,
    body: {
      ok: true,
      user: publicUser(user),
      message: user.email_verified
        ? 'Signed in.'
        : verifyQueued
          ? 'Signed in. Check your email for a verification link (24h).'
          : 'Signed in. Verify your email before upload or checkout.',
    },
  }
}

export async function handleAuthMe(req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Not signed in.' } }
  return { status: 200, body: { ok: true, user: publicUser(user) } }
}

/** Update mandatory profile + platform picks (K58 UX / plan slots). */
export async function handleUpdateProfile(req, body) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }

  const fullName = String(body.fullName || '').trim()
  const businessName = String(body.businessName || '').trim()
  const phone = String(body.phone || '').trim()
  if (!fullName || !businessName || !phone) {
    return {
      status: 400,
      body: { ok: false, message: 'Name, business name and phone number are required.' },
    }
  }
  if (phone.replace(/\D/g, '').length < 7) {
    return { status: 400, body: { ok: false, message: 'Enter a valid phone number.' } }
  }

  let enabledPlatforms = null
  if (body.enabledPlatforms != null) {
    const allowed = new Set(['shopify', 'amazon', 'etsy'])
    const list = Array.isArray(body.enabledPlatforms)
      ? body.enabledPlatforms.map(String).filter((p) => allowed.has(p))
      : []
    const max = Math.max(1, Math.min(3, Number(body.maxPlatforms) || 3))
    if (list.length < 1) {
      return {
        status: 400,
        body: { ok: false, message: 'Choose at least one platform for your plan.' },
      }
    }
    if (list.length > max) {
      return {
        status: 400,
        body: {
          ok: false,
          message: `Your plan allows ${max} of 3 platforms. Remove one before saving.`,
        },
      }
    }
    enabledPlatforms = list
  }

  await query(
    `UPDATE users SET
       full_name = $2,
       business_name = $3,
       phone = $4,
       enabled_platforms = COALESCE($5, enabled_platforms),
       updated_at = NOW()
     WHERE id = $1`,
    [
      user.id,
      fullName,
      businessName,
      phone,
      enabledPlatforms ? JSON.stringify(enabledPlatforms) : null,
    ],
  )
  const refreshed = await query(`SELECT * FROM users WHERE id = $1`, [user.id])
  return {
    status: 200,
    body: { ok: true, message: 'Profile saved.', user: publicUser(refreshed.rows[0]) },
  }
}

export async function handleAuthLogout() {
  return {
    status: 200,
    headers: { 'Set-Cookie': clearSessionCookie() },
    body: { ok: true },
  }
}

export async function handleAuthLogoutDestroy(req) {
  if (dbConfigured()) {
    const cookies = parseCookies(req.headers.cookie)
    const sid = cookies[COOKIE]
    if (sid) await query(`DELETE FROM sessions WHERE id = $1`, [sid])
  }
  return handleAuthLogout()
}

/** Sign out of all devices — delete every session for the signed-in user. */
export async function handleAuthLogoutAll(req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  await query(`DELETE FROM sessions WHERE user_id = $1`, [user.id])
  return {
    status: 200,
    headers: { 'Set-Cookie': clearSessionCookie() },
    body: { ok: true, message: 'Signed out of all devices.' },
  }
}

/** K65 / K84 — Help centre Contact us → CONTACT_INBOX + visitor confirmation (no message text). */
export async function handleContactForm(req, body) {
  // Honeypot — bots fill this; humans leave it empty
  if (String(body?.companyWebsite || body?.website || '').trim()) {
    return {
      status: 200,
      body: { ok: true, message: 'Thank you for contacting us, we aim to respond within 24 hours.' },
    }
  }
  const filledAt = Number(body?.filledAt || 0)
  if (filledAt && Date.now() - filledAt < 2500) {
    return { status: 429, body: { ok: false, message: 'Please wait a moment and try again.' } }
  }
  const name = String(body?.name || '').trim()
  const phone = String(body?.phone || '').trim()
  const businessName = String(body?.businessName || '').trim()
  const email = String(body?.email || '')
    .trim()
    .toLowerCase()
  const country = String(body?.country || '').trim().toUpperCase()
  const message = String(body?.message || '').trim()
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'
  if (!rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000)) {
    return { status: 429, body: { ok: false, message: 'Please wait before sending another message.' } }
  }
  if (!rateLimit(`contact-email:${email || ip}`, 3, 60 * 60 * 1000)) {
    return { status: 429, body: { ok: false, message: 'Please wait before sending another message.' } }
  }
  if (!name || !email.includes('@') || !country || !message) {
    return {
      status: 400,
      body: { ok: false, message: 'Name, email, country and message are required.' },
    }
  }
  if (message.length < 10 || message.length > 5000) {
    return { status: 400, body: { ok: false, message: 'Message must be 10–5,000 characters.' } }
  }
  const sessionUser = dbConfigured() ? await userFromRequest(req) : null
  const inbox = SUPPORT_INBOX
  const subject = `Margins365 contact: ${name} — ${businessName || '—'}`
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
  const sessionBits = sessionUser
    ? `\nSigned-in account: ${sessionUser.email}\nAccount business: ${sessionUser.business_name || '—'}\nPlan: ${sessionUser.plan || '—'} (${sessionUser.licence_state || '—'})\nAccount ID: ${sessionUser.id}\nForm email differs from account: ${email !== String(sessionUser.email || '').toLowerCase() ? 'yes' : 'no'}\n`
    : '\nSigned-out visitor\n'
  const text = `Name: ${name}\nPhone: ${phone || '—'}\nBusiness: ${businessName || '—'}\nEmail: ${email}\nCountry: ${country}\nWhen (Europe/London): ${when}${sessionBits}\n${message}\n`
  const html = `<p><strong>Name:</strong> ${name}</p><p><strong>Phone:</strong> ${phone || '—'}</p><p><strong>Business:</strong> ${businessName || '—'}</p><p><strong>Email:</strong> ${email}</p><p><strong>Country:</strong> ${country}</p><p><strong>When:</strong> ${when}</p><pre style="white-space:pre-wrap;font-family:inherit">${sessionBits.trim()}</pre><p>${message.replace(/\n/g, '<br/>')}</p>`
  const toInbox = await sendSesSimple(inbox, subject, text, html, email)
  if (!toInbox.ok) {
    return {
      status: 502,
      body: { ok: false, message: 'Could not send your message. Try again shortly.' },
    }
  }
  const mentionsCancel = /cancel/i.test(message)
  const confirmExtra = mentionsCancel
    ? '\n\nTo cancel, the account owner uses Plan & billing.'
    : ''
  // K84 — visitor confirmation WITHOUT message text; K88 — 24-hour aim wording
  const k88Line = `Hi ${name}, Thank you for contacting us, we aim to respond within 24 hours. You sent your message from the Margins365 Help centre on ${when}.`
  await sendSesSimple(
    email,
    "We've received your message — Margins365",
    `${k88Line}${confirmExtra}\n\n— Margins365\n`,
    `<p>Hi ${name}, Thank you for contacting us, we aim to respond within 24 hours. You sent your message from the Margins365 Help centre on ${when}.</p>${mentionsCancel ? '<p>To cancel, the account owner uses Plan &amp; billing.</p>' : ''}<p>— Margins365</p>`,
    SUPPORT_INBOX,
  )
  return {
    status: 200,
    body: {
      ok: true,
      message: 'Thank you for contacting us, we aim to respond within 24 hours.',
    },
  }
}

/** K83 — authenticated feature suggestion: store + email CONTACT_INBOX. */
export async function handleFeatureSuggestion(req, body) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  const text = String(body?.text || '').trim()
  if (!text) return { status: 400, body: { ok: false, message: 'Write a short note.' } }
  if (text.length > 1000) {
    return { status: 400, body: { ok: false, message: 'Keep suggestions to 1,000 characters.' } }
  }
  if (!rateLimit(`suggest:${user.id}`, 5, 60 * 60 * 1000)) {
    return { status: 429, body: { ok: false, message: 'Please wait before sending another suggestion.' } }
  }
  if (!rateLimit(`suggest-day:${user.id}`, 20, 24 * 60 * 60 * 1000)) {
    return { status: 429, body: { ok: false, message: 'Daily suggestion limit reached.' } }
  }
  await query(
    `INSERT INTO feature_suggestions (id, user_id, plan_id, email, request_text)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      newId('sug'),
      user.id,
      String(user.plan || 'free'),
      user.email,
      text.slice(0, 1000),
    ],
  )
  const inbox = SUPPORT_INBOX
  const biz = user.business_name || '—'
  const plan = user.plan || '—'
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
  const subject = `Margins365 feature suggestion: ${biz} (${plan})`
  const notifyText = `Suggestion:\n${text}\n\nName: ${user.full_name || '—'}\nEmail: ${user.email}\nBusiness: ${biz}\nPlan: ${plan} (${user.licence_state || '—'})\nRole: owner\nAccount ID: ${user.id}\nWhen (Europe/London): ${when}\nScreen: ${String(body?.screen || 'Plan & billing')}\n`
  const notifyHtml = `<p><strong>Suggestion</strong></p><p>${text.replace(/\n/g, '<br/>')}</p><p>Name: ${user.full_name || '—'}<br/>Email: ${user.email}<br/>Business: ${biz}<br/>Plan: ${plan} (${user.licence_state || '—'})<br/>Account ID: ${user.id}<br/>When: ${when}</p>`
  const sent = await sendSesSimple(inbox, subject, notifyText, notifyHtml, user.email)
  if (!sent.ok) {
    console.error('[feature-suggestion] SES failed after store', sent.message)
  }
  return {
    status: 200,
    body: {
      ok: true,
      message: 'Thanks, your suggestion has been sent to the Margins365 team.',
    },
  }
}

export async function handleSendVerification(req, body) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  if (user.email_verified) {
    return { status: 200, body: { ok: true, message: 'Email already verified.' } }
  }
  if (!rateLimit(`verify:${user.id}`, 5, 60 * 60 * 1000)) {
    return { status: 429, body: { ok: false, message: 'Too many verification emails. Try later.' } }
  }
  const origin = body?.origin || req.headers.origin || 'https://margins365.com'
  const { verifyUrl } = await mintVerification(user.id, origin)
  const sent = await sendVerifyEmail(user.email, verifyUrl)
  if (!sent.ok) return { status: 502, body: { ok: false, message: sent.message } }
  return { status: 200, body: { ok: true, message: 'Verification email sent (24h single-use link).' } }
}

export async function handleVerifyToken(token) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const t = String(token || '')
  if (!t) return { status: 400, body: { ok: false, message: 'Token required.' } }
  const { rows } = await query(
    `SELECT * FROM verification_tokens WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [t],
  )
  const row = rows[0]
  if (!row) {
    return { status: 400, body: { ok: false, message: 'Verification link is invalid or expired.' } }
  }
  await query(`UPDATE verification_tokens SET used_at = NOW() WHERE token = $1`, [t])
  await query(
    `UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`,
    [row.user_id],
  )
  const userRes = await query(`SELECT * FROM users WHERE id = $1`, [row.user_id])
  // Sign this browser in so profile completion works on the device that opened the email
  // (iPad still updates via /api/auth/me poll on the original session).
  const session = await createSession(row.user_id)
  return {
    status: 200,
    headers: { 'Set-Cookie': sessionCookie(session.id, SESSION_DAYS * 24 * 60 * 60) },
    body: { ok: true, message: 'Email verified.', user: publicUser(userRes.rows[0]) },
  }
}

async function sendSesSimple(to, subject, text, html, replyTo) {
  const cfg = sesMailer()
  if (cfg.error) return { ok: false, message: cfg.error }
  const client = new SESv2Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
  /** @type {Record<string, unknown>} */
  const input = {
    FromEmailAddress: cfg.from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    },
  }
  if (replyTo) input.ReplyToAddresses = [String(replyTo)]
  await client.send(new SendEmailCommand(input))
  return { ok: true }
}

async function sendPasswordResetEmail(to, resetUrl) {
  const subject = 'Reset your Margins365 password'
  const text = `Reset your Margins365 password.\n\nSet a new password within ${RESET_MINUTES} minutes:\n${resetUrl}\n\nIf you did not ask for this, you can ignore this email.\n`
  const html = `<p>Reset your Margins365 password.</p><p><a href="${resetUrl}">Set a new password</a></p><p style="color:#555;font-size:14px">This link expires in ${RESET_MINUTES} minutes.</p><p style="color:#555;font-size:14px">${resetUrl}</p><p style="color:#555;font-size:14px">If you did not ask for this, you can ignore this email.</p>`
  return sendSesSimple(to, subject, text, html, SUPPORT_INBOX)
}

async function sendGoogleOnlyResetEmail(to) {
  const subject = 'Your Margins365 sign-in'
  const text = `You asked about a password for this Margins365 account. This account uses Google to sign in. Use Continue with Google on the sign-in screen — there is no password to reset. If you didn’t ask for this, you can ignore this email.\n`
  const html = `<p>You asked about a password for this <strong>Margins365</strong> account.</p><p>This account uses Google to sign in. Use <strong>Continue with Google</strong> on the sign-in screen — there is no password to reset.</p><p style="color:#555;font-size:14px">If you didn’t ask for this, you can ignore this email.</p>`
  return sendSesSimple(to, subject, text, html, SUPPORT_INBOX)
}

async function sendPasswordChangedEmail(to) {
  const subject = 'Your password was changed'
  const text = `Your Margins365 password was changed.\n\nAll other signed-in sessions were signed out. If you did not make this change, reply to this email or contact support from the privacy policy contact address.\n`
  const html = `<p>Your Margins365 password was changed.</p><p>All other signed-in sessions were signed out.</p><p style="color:#555;font-size:14px">If you did not make this change, reply to this email or use the privacy policy contact address.</p>`
  return sendSesSimple(to, subject, text, html, SUPPORT_INBOX)
}

/** K57 — request password reset (no account enumeration). */
export async function handleRequestPasswordReset(body, req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const email = String(body.email || '')
    .trim()
    .toLowerCase()
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'
  if (!rateLimit(`reset-ip:${ip}`, RESET_PER_IP, RESET_WINDOW_MS)) {
    return { status: 429, body: { ok: false, message: 'Please wait before requesting another link' } }
  }
  // Always the same message when input looks valid
  if (!email || !email.includes('@')) {
    return { status: 400, body: { ok: false, message: 'Enter a valid email address.' } }
  }
  if (!rateLimit(`reset-email:${email}`, RESET_PER_EMAIL, RESET_WINDOW_MS)) {
    // Still no enumeration — same success copy
    return { status: 200, body: { ok: true, message: GENERIC_RESET_MSG } }
  }

  const existing = await query(`SELECT * FROM users WHERE email = $1`, [email])
  const user = existing.rows[0]
  if (!user) {
    return { status: 200, body: { ok: true, message: GENERIC_RESET_MSG } }
  }

  const provider = String(user.auth_provider || 'email')
  if (provider === 'google') {
    await sendGoogleOnlyResetEmail(user.email)
    return { status: 200, body: { ok: true, message: GENERIC_RESET_MSG } }
  }

  // Invalidate older unused reset links for this user
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.id],
  )
  const token = `rst_${crypto.randomBytes(16).toString('hex')}`
  const expires = new Date(Date.now() + RESET_MINUTES * 60 * 1000)
  await query(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, user.id, expires.toISOString()],
  )
  // K85 — reset link built only from fixed APP_ORIGIN, never from browser-supplied origin
  const base = String(process.env.APP_ORIGIN || 'https://margins365.com').replace(/\/$/, '')
  // GA-59 — canonical reset path (legacy ?reset= on / still accepted by the SPA)
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`
  const sent = await sendPasswordResetEmail(user.email, resetUrl)
  if (!sent.ok) {
    console.error('[password-reset] SES failed; token kept for retry', sent.message, user.id)
    // Still neutral — do not reveal SES failure or account existence
  }
  return { status: 200, body: { ok: true, message: GENERIC_RESET_MSG } }
}

/** K57 — consume reset token and set new password; wipe other sessions. */
export async function handleResetPassword(body) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const token = String(body.token || '')
  const newPassword = String(body.password || body.newPassword || '')
  if (!token) {
    return {
      status: 400,
      body: { ok: false, message: 'This reset link is invalid or expired.', canResend: true },
    }
  }
  if (newPassword.length < MIN_PASSWORD) {
    return {
      status: 400,
      body: {
        ok: false,
        message: `Password must be at least ${MIN_PASSWORD} characters.`,
      },
    }
  }
  const { rows } = await query(
    `SELECT * FROM password_reset_tokens
     WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [token],
  )
  const row = rows[0]
  if (!row) {
    return {
      status: 400,
      body: {
        ok: false,
        message: 'This reset link is invalid or expired.',
        canResend: true,
      },
    }
  }
  const hash = await bcrypt.hash(newPassword, 12)
  await query(
    `UPDATE users SET password_hash = $2, auth_provider = 'email', updated_at = NOW() WHERE id = $1`,
    [row.user_id, hash],
  )
  await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1`, [token])
  // Invalidate every other unused reset token for this user
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
    [row.user_id],
  )
  // Sign out all sessions
  await query(`DELETE FROM sessions WHERE user_id = $1`, [row.user_id])
  const userRes = await query(`SELECT * FROM users WHERE id = $1`, [row.user_id])
  const user = userRes.rows[0]
  if (user?.email) {
    await sendPasswordChangedEmail(user.email)
  }
  return {
    status: 200,
    headers: { 'Set-Cookie': clearSessionCookie() },
    body: {
      ok: true,
      message: 'Password updated. Sign in with your new password. Other sessions were signed out.',
    },
  }
}

export async function setUserPlan(userId, plan, licenceState = 'active', billingInterval = null) {
  if (!dbConfigured() || !userId) return
  const iv =
    billingInterval === 'year' || billingInterval === 'month' ? billingInterval : null
  if (iv) {
    await query(
      `UPDATE users SET plan = $2, licence_state = $3, billing_interval = $4, updated_at = NOW() WHERE id = $1`,
      [userId, plan, licenceState, iv],
    )
  } else {
    await query(
      `UPDATE users SET plan = $2, licence_state = $3, updated_at = NOW() WHERE id = $1`,
      [userId, plan, licenceState],
    )
  }
}

export async function setUserPlanByEmail(email, plan, licenceState = 'active', billingInterval = null) {
  if (!dbConfigured() || !email) return
  const iv =
    billingInterval === 'year' || billingInterval === 'month' ? billingInterval : null
  if (iv) {
    await query(
      `UPDATE users SET plan = $2, licence_state = $3, billing_interval = $4, updated_at = NOW() WHERE email = $1`,
      [email.trim().toLowerCase(), plan, licenceState, iv],
    )
  } else {
    await query(
      `UPDATE users SET plan = $2, licence_state = $3, updated_at = NOW() WHERE email = $1`,
      [email.trim().toLowerCase(), plan, licenceState],
    )
  }
}

function normalizeTierPlan(planId) {
  const p = String(planId || '').toLowerCase()
  return ['starter', 'growth', 'pro', 'scale'].includes(p) ? p : null
}

function licenceStateFromSubscriptionStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'trialing') return 'trialing'
  if (s === 'active') return 'active'
  if (s === 'past_due') return 'past_due'
  if (s === 'canceled' || s === 'unpaid' || s === 'incomplete_expired') return 'canceled'
  return null
}

/**
 * Reconcile subscription tier from Stripe Checkout / Subscriptions.
 * Never force plan=pro — apply metadata plan + real Stripe status (F1).
 */
export async function handleSyncLicence(req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Auth database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return { status: 503, body: { ok: false, message: 'Stripe is not configured.' } }
  }
  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secret, {
    apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil',
  })
  const email = user.email.toLowerCase()
  const sessions = await stripe.checkout.sessions.list({ limit: 40, status: 'complete' })
  const matches = sessions.data.filter((s) => {
    const e = (s.customer_details?.email || s.customer_email || '').toLowerCase()
    const ref =
      s.client_reference_id ||
      s.metadata?.margins365_account_id ||
      s.metadata?.marginos_account_id ||
      ''
    return e === email || ref === user.id
  })

  // Prefer subscription checkouts (v18+ tiers) over legacy one-time payments
  const subHit =
    matches.find((s) => s.mode === 'subscription' && s.subscription) ||
    matches.find((s) => s.mode === 'subscription') ||
    null
  const oneTimeHit = matches.find((s) => s.mode === 'payment') || null

  if (subHit) {
    let planId =
      normalizeTierPlan(subHit.metadata?.margins365_plan || subHit.metadata?.marginos_plan) ||
      normalizeTierPlan(user.plan) ||
      'pro'
    let licenceState =
      subHit.payment_status === 'paid' ? 'active' : 'trialing'
    let billingInterval =
      String(subHit.metadata?.margins365_interval || subHit.metadata?.marginos_interval || '')
        .toLowerCase() === 'year'
        ? 'year'
        : 'month'

    if (subHit.subscription) {
      try {
        const subId =
          typeof subHit.subscription === 'string'
            ? subHit.subscription
            : subHit.subscription.id
        const sub = await stripe.subscriptions.retrieve(subId)
        planId =
          normalizeTierPlan(sub.metadata?.margins365_plan || sub.metadata?.marginos_plan) ||
          planId
        const mapped = licenceStateFromSubscriptionStatus(sub.status)
        if (mapped) licenceState = mapped
        // K89 — scheduled cancel still has access
        if (sub.cancel_at_period_end && (sub.status === 'trialing' || sub.status === 'active')) {
          licenceState = 'canceled_access'
        }
        const iv = sub.items?.data?.[0]?.price?.recurring?.interval
        if (iv === 'year' || iv === 'month') billingInterval = iv
        if (sub.customer) {
          await query(
            `UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2),
               stripe_subscription_id = COALESCE(stripe_subscription_id, $3),
               cancel_at_period_end = $4,
               cancel_at = $5,
               trial_ends_at = COALESCE($6::timestamptz, trial_ends_at),
               updated_at = NOW() WHERE id = $1`,
            [
              user.id,
              String(sub.customer),
              sub.id,
              Boolean(sub.cancel_at_period_end),
              sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
              sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            ],
          )
        }
      } catch {
        // Keep session-derived plan/state if subscription retrieve fails
      }
    }

    await query(
      `UPDATE users SET
         plan = $2,
         licence_state = $3,
         billing_interval = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [user.id, planId, licenceState, billingInterval],
    )
    const refreshed = await query(`SELECT * FROM users WHERE id = $1`, [user.id])
    return {
      status: 200,
      body: {
        ok: true,
        user: publicUser(refreshed.rows[0]),
        message: `Licence synced (${planId} / ${licenceState}).`,
      },
    }
  }

  if (oneTimeHit) {
    // Pre-v18 lifetime Pro purchase
    await query(
      `UPDATE users SET plan = 'pro', licence_state = 'legacy', updated_at = NOW() WHERE id = $1`,
      [user.id],
    )
    const refreshed = await query(`SELECT * FROM users WHERE id = $1`, [user.id])
    return {
      status: 200,
      body: {
        ok: true,
        user: publicUser(refreshed.rows[0]),
        message: 'Legacy lifetime Pro licence restored.',
      },
    }
  }

  // No Stripe hit — if DB already has a tier, return it unchanged (do not invent Pro)
  const refreshed = await query(`SELECT * FROM users WHERE id = $1`, [user.id])
  return {
    status: 200,
    body: {
      ok: true,
      user: publicUser(refreshed.rows[0]),
      message: 'No completed Checkout found.',
    },
  }
}

export { COOKIE, sessionCookie }
