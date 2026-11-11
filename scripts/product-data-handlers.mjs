/**
 * GA-40 / GA-41 — server product data SoT + hard monthly order limits.
 */
import { userFromRequest } from './auth-handlers.mjs'
import { dbConfigured, query } from './db.mjs'
import { ensureShopsSchema } from './shops-handlers.mjs'

const ORDER_LIMITS = { starter: 500, growth: 2000, pro: 5000, scale: 15000, legacy: 5000 }
const CLOSED = new Set(['ended', 'removed_full_refund', 'removed_lost_dispute'])

export async function ensureProductDataSchema() {
  if (!dbConfigured()) return false
  await ensureShopsSchema()
  await query(`
    CREATE TABLE IF NOT EXISTS shop_workspaces (
      shop_id TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      costs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      ads_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      scenarios_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      saved_datasets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS shop_workspaces_user_id_idx ON shop_workspaces(user_id);

    CREATE TABLE IF NOT EXISTS account_order_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, period_key)
    );
  `)
  return true
}

function periodKeyNow(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function orderLimitFor(user) {
  const p = String(user.plan || 'starter').toLowerCase()
  return ORDER_LIMITS[p] || 500
}

function uniqueIdsFromLines(lines) {
  const set = new Set()
  for (const l of lines || []) {
    if (l?.isSample) continue
    if (l?.orderId) set.add(String(l.orderId))
  }
  return set
}

async function assertNotClosed(user) {
  const state = String(user.licence_state || '')
  if (user.account_closed_at || CLOSED.has(state)) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'account_closed',
        message: 'This account is closed. Create a new empty account to start again.',
      },
    }
  }
  return null
}

export async function handleGetWorkspace(req, shopId) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  const closed = await assertNotClosed(user)
  if (closed) return closed
  await ensureProductDataSchema()
  const shop = await query(`SELECT id FROM shops WHERE id = $1 AND user_id = $2`, [shopId, user.id])
  if (!shop.rows[0]) return { status: 404, body: { ok: false, message: 'Shop not found' } }
  const { rows } = await query(`SELECT * FROM shop_workspaces WHERE shop_id = $1`, [shopId])
  const period = periodKeyNow()
  const usage = await query(
    `SELECT order_ids FROM account_order_usage WHERE user_id = $1 AND period_key = $2`,
    [user.id, period],
  )
  const orderIds = usage.rows[0]?.order_ids || []
  const limit = orderLimitFor(user)
  if (!rows[0]) {
    return {
      status: 200,
      body: {
        ok: true,
        empty: true,
        shopId,
        periodKey: period,
        orderLimit: limit,
        usageUniqueOrderIds: Array.isArray(orderIds) ? orderIds : [],
        usageUniqueOrderCount: Array.isArray(orderIds) ? orderIds.length : 0,
        lines: [],
        costs: [],
        ads: [],
        scenarios: [],
        savedDatasets: [],
        updatedAt: null,
      },
    }
  }
  const row = rows[0]
  return {
    status: 200,
    body: {
      ok: true,
      empty: false,
      shopId,
      periodKey: period,
      orderLimit: limit,
      usageUniqueOrderIds: Array.isArray(orderIds) ? orderIds : [],
      usageUniqueOrderCount: Array.isArray(orderIds) ? orderIds.length : 0,
      lines: row.lines_json || [],
      costs: row.costs_json || [],
      ads: row.ads_json || [],
      scenarios: row.scenarios_json || [],
      savedDatasets: row.saved_datasets_json || [],
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at || null,
    },
  }
}

/**
 * PUT /api/shops/:id/workspace — authoritative save; enforces order limits.
 * Body: { lines, costs, ads, scenarios, savedDatasets, incomingOrderIds? }
 */
export async function handlePutWorkspace(req, shopId, body) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  const closed = await assertNotClosed(user)
  if (closed) return closed
  await ensureProductDataSchema()
  const shop = await query(`SELECT id FROM shops WHERE id = $1 AND user_id = $2`, [shopId, user.id])
  if (!shop.rows[0]) return { status: 404, body: { ok: false, message: 'Shop not found' } }

  const lines = Array.isArray(body?.lines) ? body.lines : []
  const costs = Array.isArray(body?.costs) ? body.costs : []
  const ads = Array.isArray(body?.ads) ? body.ads : []
  const scenarios = Array.isArray(body?.scenarios) ? body.scenarios : []
  const savedDatasets = Array.isArray(body?.savedDatasets) ? body.savedDatasets : []
  const period = String(body?.periodKey || periodKeyNow()).slice(0, 7)
  const limit = orderLimitFor(user)

  // GA-41 — server unique-order count for the billing period
  const incomingIds = uniqueIdsFromLines(lines)
  const extra = Array.isArray(body?.incomingOrderIds)
    ? body.incomingOrderIds.map(String)
    : []
  for (const id of extra) incomingIds.add(id)

  const usageRow = await query(
    `SELECT order_ids FROM account_order_usage WHERE user_id = $1 AND period_key = $2`,
    [user.id, period],
  )
  const existing = new Set(
    Array.isArray(usageRow.rows[0]?.order_ids) ? usageRow.rows[0].order_ids.map(String) : [],
  )
  // Merged set = existing ∪ ids present in this save (import grows the set; shrinks allowed when clearing data)
  const merged = new Set([...existing])
  // If client sends full usageUniqueOrderIds, prefer that as the period set (must not exceed limit)
  if (Array.isArray(body?.usageUniqueOrderIds)) {
    merged.clear()
    for (const id of body.usageUniqueOrderIds) merged.add(String(id))
  } else {
    for (const id of incomingIds) merged.add(id)
  }

  if (merged.size > limit) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'order_limit',
        message: `This import would take you over your ${limit.toLocaleString('en-GB')} unique orders / month limit.`,
        orderLimit: limit,
        projected: merged.size,
        used: existing.size,
      },
    }
  }

  await query(
    `INSERT INTO shop_workspaces (shop_id, user_id, lines_json, costs_json, ads_json, scenarios_json, saved_datasets_json, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
     ON CONFLICT (shop_id) DO UPDATE SET
       lines_json = EXCLUDED.lines_json,
       costs_json = EXCLUDED.costs_json,
       ads_json = EXCLUDED.ads_json,
       scenarios_json = EXCLUDED.scenarios_json,
       saved_datasets_json = EXCLUDED.saved_datasets_json,
       updated_at = NOW(),
       user_id = EXCLUDED.user_id`,
    [
      shopId,
      user.id,
      JSON.stringify(lines),
      JSON.stringify(costs),
      JSON.stringify(ads),
      JSON.stringify(scenarios),
      JSON.stringify(savedDatasets),
    ],
  )
  await query(
    `INSERT INTO account_order_usage (user_id, period_key, order_ids, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, period_key) DO UPDATE SET
       order_ids = EXCLUDED.order_ids,
       updated_at = NOW()`,
    [user.id, period, JSON.stringify([...merged])],
  )

  return {
    status: 200,
    body: {
      ok: true,
      shopId,
      periodKey: period,
      orderLimit: limit,
      usageUniqueOrderCount: merged.size,
      usageUniqueOrderIds: [...merged],
      updatedAt: new Date().toISOString(),
    },
  }
}

/** GET /api/account/usage — period usage for UI */
export async function handleGetOrderUsage(req) {
  if (!dbConfigured()) return { status: 503, body: { ok: false, message: 'Database not configured' } }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in required' } }
  await ensureProductDataSchema()
  const period = periodKeyNow()
  const limit = orderLimitFor(user)
  const { rows } = await query(
    `SELECT order_ids FROM account_order_usage WHERE user_id = $1 AND period_key = $2`,
    [user.id, period],
  )
  const ids = Array.isArray(rows[0]?.order_ids) ? rows[0].order_ids : []
  return {
    status: 200,
    body: {
      ok: true,
      periodKey: period,
      orderLimit: limit,
      usageUniqueOrderIds: ids,
      usageUniqueOrderCount: ids.length,
    },
  }
}
