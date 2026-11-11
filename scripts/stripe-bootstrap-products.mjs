/**
 * Create Margins365 subscription products + tax-inclusive GBP prices (v19 / K42).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_... node scripts/stripe-bootstrap-products.mjs
 *
 * Creates four products (Starter / Growth / Pro / Scale), each with monthly + annual
 * recurring prices. Annual = 10× monthly (pay 10, get 12). GBP only (OD6).
 *
 * Prints env keys to set on DigitalOcean (and locally).
 */
import Stripe from 'stripe'

const secret = process.env.STRIPE_SECRET_KEY
if (!secret) {
  console.error('Set STRIPE_SECRET_KEY')
  process.exit(1)
}

const stripe = new Stripe(secret, {
  apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil',
})

/** Amounts in pence, tax-inclusive. */
const TIERS = [
  {
    id: 'starter',
    name: 'Margins365 Starter',
    description: 'Starter plan — 500 orders/month, 1 platform, 3-month history.',
    monthlyGbp: 3900,
    annualGbp: 39000,
  },
  {
    id: 'growth',
    name: 'Margins365 Growth',
    description: 'Growth plan — 2,000 orders/month, up to 2 platforms, 12-month history.',
    monthlyGbp: 7900,
    annualGbp: 79000,
  },
  {
    id: 'pro',
    name: 'Margins365 Pro',
    description: 'Pro plan — 5,000 orders/month, all platforms, 24-month history, 2 seats.',
    monthlyGbp: 12900,
    annualGbp: 129000,
  },
  {
    id: 'scale',
    name: 'Margins365 Scale',
    description: 'Scale plan — 15,000 orders/month, 3 shops, 5 seats, full history.',
    monthlyGbp: 19900,
    annualGbp: 199000,
  },
]

const out = {
  mode: secret.startsWith('sk_live') ? 'live' : 'test',
  products: {},
  env: {},
}

for (const tier of TIERS) {
  // Reuse product if one with this metadata already exists
  const listedProducts = await stripe.products.list({ active: true, limit: 100 })
  let product = listedProducts.data.find(
    (p) => p.metadata?.margins365_plan === tier.id || p.metadata?.marginos_plan === tier.id,
  )
  if (!product) {
    product = await stripe.products.create({
      name: tier.name,
      description: tier.description,
      tax_code: 'txcd_10103001',
      metadata: {
        margins365_plan: tier.id,
        marginos_plan: tier.id, // legacy key for older handlers
      },
    })
  }

  async function ensurePrice(interval, unitAmount, nickname) {
    const listed = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
    const hit = listed.data.find(
      (p) =>
        p.currency === 'gbp' &&
        p.recurring?.interval === interval &&
        p.unit_amount === unitAmount &&
        p.tax_behavior === 'inclusive',
    )
    if (hit) return hit
    return stripe.prices.create({
      product: product.id,
      currency: 'gbp',
      unit_amount: unitAmount,
      tax_behavior: 'inclusive',
      recurring: { interval },
      nickname,
      metadata: {
        margins365_plan: tier.id,
        margins365_interval: interval === 'month' ? 'month' : 'year',
        marginos_plan: tier.id,
      },
    })
  }

  const monthly = await ensurePrice(
    'month',
    tier.monthlyGbp,
    `${tier.name} — monthly`,
  )
  const annual = await ensurePrice('year', tier.annualGbp, `${tier.name} — annual`)

  const monthKey = `STRIPE_PRICE_${tier.id.toUpperCase()}_MONTH`
  const yearKey = `STRIPE_PRICE_${tier.id.toUpperCase()}_YEAR`
  out.products[tier.id] = {
    productId: product.id,
    [monthKey]: monthly.id,
    [yearKey]: annual.id,
  }
  out.env[monthKey] = monthly.id
  out.env[yearKey] = annual.id
}

console.log(JSON.stringify(out, null, 2))
console.log('\n# DigitalOcean / .env — paste these RUN_TIME values:')
for (const [k, v] of Object.entries(out.env)) {
  console.log(`${k}=${v}`)
}
