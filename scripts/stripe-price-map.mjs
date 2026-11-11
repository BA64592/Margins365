/**
 * Resolve Stripe Price IDs for Margins365 subscription tiers.
 * Shared by DigitalOcean runtime checkout.
 */

const PLAN_IDS = new Set(['starter', 'growth', 'pro', 'scale'])
const INTERVALS = new Set(['month', 'year'])

/**
 * @param {string} planId
 * @param {string} interval  'month' | 'year'
 * @returns {string|null}
 */
export function priceIdForPlan(planId, interval) {
  const plan = String(planId || '').toLowerCase()
  const iv = String(interval || 'month').toLowerCase() === 'year' ? 'year' : 'month'
  if (!PLAN_IDS.has(plan)) return null

  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${iv === 'year' ? 'YEAR' : 'MONTH'}`
  const fromTier = process.env[key]
  if (fromTier) return fromTier

  // Legacy lifetime one-shot prices (pre-v18) — last-resort fallback for Pro monthly only
  if (plan === 'pro' && iv === 'month') {
    return process.env.STRIPE_PRICE_FULL || process.env.STRIPE_PRICE_EARLY_BIRD || null
  }
  return null
}

export function stripeTierConfigured() {
  for (const plan of PLAN_IDS) {
    for (const iv of ['MONTH', 'YEAR']) {
      if (!process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${iv}`]) return false
    }
  }
  return true
}

export function normalizePlanId(planId) {
  const p = String(planId || '').toLowerCase()
  return PLAN_IDS.has(p) ? p : null
}

export function normalizeInterval(interval) {
  const iv = String(interval || 'month').toLowerCase()
  return INTERVALS.has(iv) ? iv : 'month'
}
