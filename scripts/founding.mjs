/**
 * K72 — founding offer: 50% off first 6 monthly invoices (or 25% first annual year)
 * for the first 100 paying accounts. Server is source of truth for the counter.
 */
import { dbConfigured, query } from './db.mjs'

export const FOUNDING_CAP = 100

/** Coupon IDs — create in Stripe Dashboard / bootstrap; override via env. */
export function foundingCouponId(interval) {
  if (interval === 'year') {
    return process.env.STRIPE_COUPON_FOUNDING_ANNUAL || 'm365_founding_25_annual'
  }
  return process.env.STRIPE_COUPON_FOUNDING_MONTHLY || 'm365_founding_50_6mo'
}

export async function ensureFoundingSchema() {
  if (!dbConfigured()) return false
  await query(`
    CREATE TABLE IF NOT EXISTS founding_places (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('reserved', 'confirmed', 'released')),
      reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      plan_id TEXT,
      interval TEXT
    );
    CREATE INDEX IF NOT EXISTS founding_places_status_idx ON founding_places(status);
  `)
  return true
}

/** Reserved + confirmed count (never exceeds FOUNDING_CAP). */
export async function foundingUsedCount() {
  if (!dbConfigured()) {
    return Number(process.env.FOUNDING_SOLD_FALLBACK || 0)
  }
  await ensureFoundingSchema()
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM founding_places WHERE status IN ('reserved', 'confirmed')`,
  )
  return Number(rows[0]?.n || 0)
}

export async function foundingPlacesLeft() {
  return Math.max(0, FOUNDING_CAP - (await foundingUsedCount()))
}

export async function getFoundingStatus() {
  const used = await foundingUsedCount()
  const left = Math.max(0, FOUNDING_CAP - used)
  return {
    ok: true,
    cap: FOUNDING_CAP,
    used,
    sold: used,
    placesLeft: left,
    eligible: left > 0,
  }
}

/**
 * Reserve one place for an account at Checkout start.
 * Returns { ok, reserved, placesLeft, reason? }.
 */
export async function reserveFoundingPlace(userId, planId, interval) {
  if (!userId) return { ok: false, reserved: false, placesLeft: await foundingPlacesLeft(), reason: 'no_user' }
  if (!dbConfigured()) {
    // Soft-fail open: apply coupon when env says offer is live and under cap
    const left = await foundingPlacesLeft()
    return { ok: true, reserved: left > 0, placesLeft: left, ephemeral: true }
  }
  await ensureFoundingSchema()

  const existing = await query(`SELECT status FROM founding_places WHERE user_id = $1`, [userId])
  if (existing.rows[0]) {
    const st = existing.rows[0].status
    if (st === 'reserved' || st === 'confirmed') {
      return { ok: true, reserved: true, placesLeft: await foundingPlacesLeft(), already: true }
    }
    // released — may re-reserve only if places remain (product: "a later account does not get it again")
    return {
      ok: true,
      reserved: false,
      placesLeft: await foundingPlacesLeft(),
      reason: 'already_used',
    }
  }

  // GA-06 — single-statement reserve under cap (avoids parallel 101st)
  try {
    const { rows } = await query(
      `INSERT INTO founding_places (user_id, status, plan_id, interval)
       SELECT $1, 'reserved', $2, $3
       WHERE (
         SELECT COUNT(*)::int FROM founding_places WHERE status IN ('reserved', 'confirmed')
       ) < $4
       AND NOT EXISTS (SELECT 1 FROM founding_places WHERE user_id = $1)
       RETURNING user_id`,
      [userId, planId || null, interval || null, FOUNDING_CAP],
    )
    if (rows[0]) {
      return { ok: true, reserved: true, placesLeft: await foundingPlacesLeft() }
    }
    const again = await query(`SELECT status FROM founding_places WHERE user_id = $1`, [userId])
    if (again.rows[0] && (again.rows[0].status === 'reserved' || again.rows[0].status === 'confirmed')) {
      return { ok: true, reserved: true, placesLeft: await foundingPlacesLeft(), already: true }
    }
    return { ok: true, reserved: false, placesLeft: await foundingPlacesLeft(), reason: 'sold_out' }
  } catch (err) {
    const again = await query(`SELECT status FROM founding_places WHERE user_id = $1`, [userId])
    if (again.rows[0] && (again.rows[0].status === 'reserved' || again.rows[0].status === 'confirmed')) {
      return { ok: true, reserved: true, placesLeft: await foundingPlacesLeft(), already: true }
    }
    return {
      ok: false,
      reserved: false,
      placesLeft: await foundingPlacesLeft(),
      reason: err instanceof Error ? err.message : 'reserve_failed',
    }
  }
}

export async function confirmFoundingPlace(userId) {
  if (!userId || !dbConfigured()) return
  await ensureFoundingSchema()
  await query(
    `UPDATE founding_places
     SET status = 'confirmed', confirmed_at = NOW()
     WHERE user_id = $1 AND status = 'reserved'`,
    [userId],
  )
}

export async function releaseFoundingPlace(userId) {
  if (!userId || !dbConfigured()) return
  await ensureFoundingSchema()
  await query(
    `UPDATE founding_places
     SET status = 'released', released_at = NOW()
     WHERE user_id = $1 AND status IN ('reserved', 'confirmed')`,
    [userId],
  )
}
