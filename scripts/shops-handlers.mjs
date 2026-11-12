/**
 * K68 / DEF-SHOP-001 — shops + seat invites (server source of truth).
 * GA-26 — seat invitation email with /invite/:token link.
 */
import crypto from 'node:crypto'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { userFromRequest } from './auth-handlers.mjs'
import { dbConfigured, query } from './db.mjs'
import { SUPPORT_INBOX, sesFromAddress } from './support-inbox.mjs'

const PLAN_SHOPS = { starter: 1, growth: 1, pro: 1, scale: 3, legacy: 1 }
const PLAN_SEATS = { starter: 1, growth: 1, pro: 2, scale: 5, legacy: 2 }
const PAID = new Set(['trialing', 'active', 'legacy', 'canceled_access'])
const APP_ORIGIN = (
  process.env.APP_ORIGIN ||
  process.env.VITE_PRODUCT_DOMAIN ||
  'https://margins365.com'
).replace(/\/$/, '')
const ORIGIN_URL = APP_ORIGIN.startsWith('http') ? APP_ORIGIN : `https://${APP_ORIGIN}`
const CONTACT_INBOX = SUPPORT_INBOX

async function sendInviteMail(to, subject, text, html) {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-north-1'
  const from = sesFromAddress()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!from || !accessKeyId || !secretAccessKey) return { ok: false, message: 'SES not configured' }
  const client = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [CONTACT_INBOX],
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

export async function ensureShopsSchema() {
  if (!dbConfigured()) return false
  await query(`
    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS shops_user_id_idx ON shops(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS shops_user_name_uidx
      ON shops (user_id, lower(name));

    CREATE TABLE IF NOT EXISTS seat_invites (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS seat_invites_owner_idx ON seat_invites(owner_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS seat_invites_owner_email_pending_uidx
      ON seat_invites (owner_user_id, lower(email))
      WHERE status = 'pending';
  `)
  return true
}

function planKey(user) {
  const p = String(user.plan || 'free').toLowerCase()
  if (p === 'legacy') return 'legacy'
  if (p === 'starter' || p === 'growth' || p === 'pro' || p === 'scale') return p
  return 'starter'
}

function maxShops(user) {
  return PLAN_SHOPS[planKey(user)] || 1
}

function maxSeats(user) {
  return PLAN_SEATS[planKey(user)] || 1
}

function hasPaidAccess(user) {
  const state = String(user.licence_state || 'none')
  if (PAID.has(state)) return true
  // Some rows still use plan alone while trialing
  const p = String(user.plan || '')
  return p === 'starter' || p === 'growth' || p === 'pro' || p === 'scale' || p === 'legacy'
}

async function ensureDefaultShop(userId) {
  const { rows } = await query(`SELECT id, name FROM shops WHERE user_id = $1 ORDER BY created_at ASC`, [
    userId,
  ])
  if (rows.length) return rows
  const id = `shop_${crypto.randomBytes(4).toString('hex')}`
  await query(`INSERT INTO shops (id, user_id, name) VALUES ($1, $2, $3)`, [id, userId, 'Main shop'])
  const again = await query(`SELECT id, name FROM shops WHERE user_id = $1 ORDER BY created_at ASC`, [
    userId,
  ])
  return again.rows
}

export async function handleListShops(req) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  await ensureShopsSchema()
  const shops = await ensureDefaultShop(user.id)
  return {
    status: 200,
    body: {
      ok: true,
      shops: shops.map((s) => ({ id: s.id, name: s.name })),
      maxShops: maxShops(user),
      plan: planKey(user),
    },
  }
}

export async function handleCreateShop(req, body) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  if (!hasPaidAccess(user)) {
    return { status: 403, body: { ok: false, message: 'Start a plan to manage shops.' } }
  }
  await ensureShopsSchema()
  const shops = await ensureDefaultShop(user.id)
  const limit = maxShops(user)
  if (planKey(user) !== 'scale') {
    return { status: 403, body: { ok: false, message: 'Add up to 3 shops on Scale (£199/mo).' } }
  }
  if (shops.length >= limit) {
    return { status: 403, body: { ok: false, message: `Scale includes up to ${limit} shops.` } }
  }
  const name = String(body.name || '').trim()
  if (!name || name.length > 60) {
    return { status: 400, body: { ok: false, message: 'Shop name must be 1–60 characters.' } }
  }
  const id = `shop_${crypto.randomBytes(4).toString('hex')}`
  try {
    await query(`INSERT INTO shops (id, user_id, name) VALUES ($1, $2, $3)`, [id, user.id, name])
  } catch (err) {
    if (String(err?.message || '').includes('shops_user_name_uidx')) {
      return { status: 409, body: { ok: false, message: 'That shop name is already used.' } }
    }
    throw err
  }
  return handleListShops(req)
}

export async function handleRenameShop(req, shopId, body) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  await ensureShopsSchema()
  const name = String(body.name || '').trim()
  if (!name || name.length > 60) {
    return { status: 400, body: { ok: false, message: 'Shop name must be 1–60 characters.' } }
  }
  try {
    const { rowCount } = await query(
      `UPDATE shops SET name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [name, shopId, user.id],
    )
    if (!rowCount) return { status: 404, body: { ok: false, message: 'Shop not found' } }
  } catch (err) {
    if (String(err?.message || '').includes('shops_user_name_uidx')) {
      return { status: 409, body: { ok: false, message: 'That shop name is already used.' } }
    }
    throw err
  }
  return handleListShops(req)
}

export async function handleDeleteShop(req, shopId) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  await ensureShopsSchema()
  const shops = await ensureDefaultShop(user.id)
  if (shops.length <= 1) {
    return {
      status: 400,
      body: { ok: false, message: 'The last shop cannot be removed — use Start Fresh to empty it.' },
    }
  }
  const { rowCount } = await query(`DELETE FROM shops WHERE id = $1 AND user_id = $2`, [
    shopId,
    user.id,
  ])
  if (!rowCount) return { status: 404, body: { ok: false, message: 'Shop not found' } }
  return handleListShops(req)
}

export async function handleListTeam(req) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  await ensureShopsSchema()
  // Expire old invites
  await query(
    `UPDATE seat_invites SET status = 'expired'
     WHERE owner_user_id = $1 AND status = 'pending' AND expires_at < NOW()`,
    [user.id],
  )
  const { rows } = await query(
    `SELECT id, email, status, created_at, expires_at
     FROM seat_invites
     WHERE owner_user_id = $1 AND status = 'pending'
     ORDER BY created_at ASC`,
    [user.id],
  )
  const seats = maxSeats(user)
  const pending = rows.map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    expiresAt: r.expires_at,
  }))
  return {
    status: 200,
    body: {
      ok: true,
      owner: {
        email: user.email,
        businessName: user.business_name || null,
        fullName: user.full_name || null,
        role: 'owner',
      },
      invites: pending,
      seatsUsed: 1 + pending.length,
      seatsMax: seats,
      plan: planKey(user),
    },
  }
}

export async function handleCreateInvite(req, body) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  const pk = planKey(user)
  if (pk !== 'pro' && pk !== 'scale') {
    return { status: 403, body: { ok: false, message: 'Team seats are on Pro (2) and Scale (5).' } }
  }
  await ensureShopsSchema()
  const email = String(body.email || '').trim().toLowerCase()
  if (!email.includes('@') || email.length > 254) {
    return { status: 400, body: { ok: false, message: 'Enter a valid email.' } }
  }
  if (email === String(user.email || '').toLowerCase()) {
    return { status: 400, body: { ok: false, message: 'That person is already on the team.' } }
  }
  const current = await handleListTeam(req)
  if (current.body.seatsUsed >= current.body.seatsMax) {
    return {
      status: 403,
      body: { ok: false, message: `This plan includes ${current.body.seatsMax} seats.` },
    }
  }
  if (current.body.invites.some((i) => i.email === email)) {
    return { status: 409, body: { ok: false, message: 'That person is already invited.' } }
  }
  const id = `inv_${crypto.randomBytes(6).toString('hex')}`
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  try {
    await query(
      `INSERT INTO seat_invites (id, owner_user_id, email, status, expires_at)
       VALUES ($1, $2, $3, 'pending', $4)`,
      [id, user.id, email, expires.toISOString()],
    )
  } catch (err) {
    if (String(err?.message || '').includes('seat_invites_owner_email_pending_uidx')) {
      return { status: 409, body: { ok: false, message: 'That person is already invited.' } }
    }
    throw err
  }
  // GA-26 — SES invite with /invite/:token (route is live; accept completes membership in a later seat pass)
  const inviteUrl = `${ORIGIN_URL}/invite/${encodeURIComponent(id)}`
  const ownerName = user.full_name || user.business_name || user.email || 'A Margins365 account owner'
  try {
    await sendInviteMail(
      email,
      `${ownerName} invited you to Margins365`,
      `${ownerName} invited you to join their Margins365 team.\n\nOpen this link to continue:\n${inviteUrl}\n\nThis invite expires in 7 days.\n\n— Margins365\n`,
      `<p><strong>${ownerName}</strong> invited you to join their Margins365 team.</p><p><a href="${inviteUrl}">Accept invite</a></p><p>This invite expires in 7 days.</p><p>— Margins365</p>`,
    )
  } catch (err) {
    console.error('[seat-invite] SES failed', err)
  }
  return handleListTeam(req)
}

export async function handleRevokeInvite(req, inviteId) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  await ensureShopsSchema()
  await query(
    `UPDATE seat_invites SET status = 'revoked', revoked_at = NOW()
     WHERE id = $1 AND owner_user_id = $2 AND status = 'pending'`,
    [inviteId, user.id],
  )
  return handleListTeam(req)
}
