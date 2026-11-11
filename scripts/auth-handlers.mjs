/**
 * Server-side email/password auth + verification (spec A5 / K5).
 * Sessions: httpOnly cookie `marginos_session`.
 */
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { dbConfigured, query } from './db.mjs'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

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
    stripeCustomerId: row.stripe_customer_id || null,
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
  return rows[0] || null
}

function sesMailer() {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-north-1'
  const from = process.env.SES_FROM_ADDRESS || process.env.SES_FROM_EMAIL || ''
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
      Content: {
        Simple: {
          Subject: { Data: 'Verify your Margins 365 email', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: `Verify your Margins 365 email.\n\nOpen this link within 24 hours (any device — your other signed-in devices will update automatically):\n${verifyUrl}\n\nNo code is required. Do not reply to this email.\n`,
              Charset: 'UTF-8',
            },
            Html: {
              Data: `<p>Verify your <strong>Margins 365</strong> email address.</p><p><a href="${verifyUrl}">Confirm email</a></p><p style="color:#555;font-size:14px">Open the link on any device. Your other signed-in sessions update automatically — there is no code to type.</p><p style="color:#555;font-size:14px">${verifyUrl}</p>`,
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
  const base = origin || process.env.APP_ORIGIN || 'https://margins365.com'
  // Hit the API so verify works without SPA JS; cookie is set then redirect to app.
  const verifyUrl = `${base.replace(/\/$/, '')}/api/auth/verify?token=${encodeURIComponent(token)}`
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
    const id = `acct_${crypto.randomBytes(10).toString('hex')}`
    const hash = await bcrypt.hash(password, 12)
    const inserted = await query(
      `INSERT INTO users (id, email, password_hash, email_verified, plan, time_zone, last_sign_in_at)
       VALUES ($1, $2, $3, FALSE, 'free', $4, NOW())
       RETURNING *`,
      [id, email, hash, timeZone],
    )
    user = inserted.rows[0]
  } else {
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

/** K65 — public Help centre Contact us form → info.marginos@gmail.com + visitor copy. */
export async function handleContactForm(req, body) {
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
  if (!name || !email.includes('@') || !message) {
    return { status: 400, body: { ok: false, message: 'Name, email and message are required.' } }
  }
  if (message.length > 4000) {
    return { status: 400, body: { ok: false, message: 'Keep your message under 4,000 characters.' } }
  }
  const inbox = process.env.CONTACT_INBOX || 'info.marginos@gmail.com'
  const subject = `Margins365 contact — ${name}`
  const text = `Name: ${name}\nPhone: ${phone || '—'}\nBusiness: ${businessName || '—'}\nEmail: ${email}\nCountry: ${country || '—'}\n\n${message}\n`
  const html = `<p><strong>Name:</strong> ${name}</p><p><strong>Phone:</strong> ${phone || '—'}</p><p><strong>Business:</strong> ${businessName || '—'}</p><p><strong>Email:</strong> ${email}</p><p><strong>Country:</strong> ${country || '—'}</p><p>${message.replace(/\n/g, '<br/>')}</p>`
  const toInbox = await sendSesSimple(inbox, subject, text, html)
  if (!toInbox.ok) {
    return {
      status: 502,
      body: { ok: false, message: 'Could not send your message. Try again shortly.' },
    }
  }
  await sendSesSimple(
    email,
    'We received your Margins365 message',
    `Thanks ${name}. We have your message to Margins365.\n\nWe read every message but do not promise a reply time. This is not a cancellation route — cancel only in Plan & billing.\n\n— Margins365\n`,
    `<p>Thanks ${name}. We have your message to <strong>Margins365</strong>.</p><p>We read every message but do not promise a reply time. This is not a cancellation route — cancel only in Plan &amp; billing.</p><p>— Margins365</p>`,
  )
  return {
    status: 200,
    body: { ok: true, message: 'Thanks — we have your message. A copy is on its way to your inbox.' },
  }
}

/** Authenticated feature suggestion (max 1000 chars). */
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
  return { status: 200, body: { ok: true, message: 'Thanks — we saved your suggestion for review.' } }
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

async function sendSesSimple(to, subject, text, html) {
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
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' },
          },
        },
      },
    }),
  )
  return { ok: true }
}

async function sendPasswordResetEmail(to, resetUrl) {
  const subject = 'Reset your Margins 365 password'
  const text = `Reset your Margins 365 password.\n\nSet a new password within ${RESET_MINUTES} minutes:\n${resetUrl}\n\nIf you did not ask for this, you can ignore this email.\n`
  const html = `<p>Reset your Margins 365 password.</p><p><a href="${resetUrl}">Set a new password</a></p><p style="color:#555;font-size:14px">This link expires in ${RESET_MINUTES} minutes.</p><p style="color:#555;font-size:14px">${resetUrl}</p><p style="color:#555;font-size:14px">If you did not ask for this, you can ignore this email.</p>`
  return sendSesSimple(to, subject, text, html)
}

async function sendGoogleOnlyResetEmail(to) {
  const subject = 'Your Margins 365 sign-in'
  const text = `You asked about a password for this Margins 365 account. This account uses Google to sign in. Use Continue with Google on the sign-in screen — there is no password to reset. If you didn’t ask for this, you can ignore this email.\n`
  const html = `<p>You asked about a password for this <strong>Margins 365</strong> account.</p><p>This account uses Google to sign in. Use <strong>Continue with Google</strong> on the sign-in screen — there is no password to reset.</p><p style="color:#555;font-size:14px">If you didn’t ask for this, you can ignore this email.</p>`
  return sendSesSimple(to, subject, text, html)
}

async function sendPasswordChangedEmail(to) {
  const subject = 'Your password was changed'
  const text = `Your Margins 365 password was changed.\n\nAll other signed-in sessions were signed out. If you did not make this change, reply to this email or contact support from the privacy policy contact address.\n`
  const html = `<p>Your Margins 365 password was changed.</p><p>All other signed-in sessions were signed out.</p><p style="color:#555;font-size:14px">If you did not make this change, reply to this email or use the privacy policy contact address.</p>`
  return sendSesSimple(to, subject, text, html)
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
  const origin = body.origin || req.headers.origin || process.env.APP_ORIGIN || 'https://margins365.com'
  const resetUrl = `${String(origin).replace(/\/$/, '')}/?reset=${encodeURIComponent(token)}`
  const sent = await sendPasswordResetEmail(user.email, resetUrl)
  if (!sent.ok) {
    return { status: 502, body: { ok: false, message: sent.message || 'Could not send reset email.' } }
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
        const iv = sub.items?.data?.[0]?.price?.recurring?.interval
        if (iv === 'year' || iv === 'month') billingInterval = iv
        if (sub.customer) {
          await query(
            `UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2), updated_at = NOW() WHERE id = $1`,
            [user.id, String(sub.customer)],
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
