/**
 * Payment provider layer — v18 Stripe subscriptions + trial (Managed Payments).
 */
import { isLiveStripeEnabled } from '../demoFlags'
import { formatMoney } from '../format'
import { FOUNDING_CAP, PLANS, TRIAL_DAYS, type BillingInterval, type PlanId } from '../plans'
import type { HomeCurrency } from '../types'

/** SMP tax-covered countries (abbreviated launch list). */
export const ALLOWED_BUYER_COUNTRIES = new Set([
  'GB', 'US', 'CA', 'AU', 'IE', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'SE', 'DK', 'FI', 'PL', 'NZ', 'CH', 'NO',
])

/** @deprecated v17 */
export const EARLY_BIRD_CAP = 0
export const PRO_PRICE_GBP = PLANS.pro.monthlyGbp
export const EARLY_BIRD_PRICE_GBP = PLANS.growth.foundingMonthlyGbp
export const FIXED_PRICES = {
  full: { GBP: PLANS.pro.monthlyGbp, USD: PLANS.pro.monthlyGbp, EUR: PLANS.pro.monthlyGbp, CAD: PLANS.pro.monthlyGbp, AUD: PLANS.pro.monthlyGbp },
  earlyBird: { GBP: PLANS.growth.foundingMonthlyGbp, USD: PLANS.growth.foundingMonthlyGbp, EUR: PLANS.growth.foundingMonthlyGbp, CAD: PLANS.growth.foundingMonthlyGbp, AUD: PLANS.growth.foundingMonthlyGbp },
} as const

export type LicenceState =
  | 'active'
  | 'trialing'
  | 'removed_full_refund'
  | 'removed_lost_dispute'
  | 'refunded_duplicate'
  | 'none'

export interface LicenceRecord {
  id: string
  accountId: string
  provider: 'mock' | 'stripe_smp'
  planId: PlanId
  interval: BillingInterval
  pricePaid: number
  currency: HomeCurrency
  founding: boolean
  amountRefunded: number
  disputeState: 'none' | 'open' | 'lost' | 'won' | 'prevented' | 'warning_closed'
  state: LicenceState
  trialEndsAt: string | null
  createdAt: string
  /** @deprecated v17 */
  earlyBird?: boolean
}

export interface CheckoutResult {
  ok: boolean
  message: string
  licence?: LicenceRecord
  foundingSold?: number
  earlyBirdSold?: number
  checkoutUrl?: string
}

/** K72 — normal or founding price (annual founding = 25% off year 1). */
export function priceForPlan(planId: PlanId, interval: BillingInterval, founding = false) {
  const def = PLANS[planId]
  if (interval === 'year') {
    if (!founding) return def.annualGbp
    return Math.round(def.annualGbp * 0.75 * 100) / 100
  }
  return founding ? def.foundingMonthlyGbp : def.monthlyGbp
}

/** @deprecated */
export function priceFor(currency: HomeCurrency, _earlyBird: boolean) {
  return FIXED_PRICES.full[currency]
}

export type CheckoutArgs = {
  accountId: string
  email: string
  emailVerified: boolean
  billingCountry: string
  currency: HomeCurrency
  planId: PlanId
  interval: BillingInterval
  alreadySubscribed: boolean
  paymentPending: boolean
  foundingSold: number
  trialUsed: boolean
  /** @deprecated */
  alreadyPro?: boolean
  earlyBirdSold?: number
}

function validateCheckoutGates(args: CheckoutArgs): CheckoutResult | null {
  if (!args.emailVerified) {
    return { ok: false, message: 'Verify your email before checkout.' }
  }
  if (!ALLOWED_BUYER_COUNTRIES.has(args.billingCountry.toUpperCase())) {
    return { ok: false, message: "This product isn't available in your country yet." }
  }
  if (args.alreadySubscribed || args.alreadyPro) {
    return { ok: false, message: 'You already have an active plan' }
  }
  if (args.paymentPending) {
    return { ok: false, message: 'Your payment is processing' }
  }
  if (args.trialUsed) {
    return { ok: false, message: 'This account has already used its free trial.' }
  }
  return null
}

export function mockStartCheckout(args: CheckoutArgs): CheckoutResult {
  const gate = validateCheckoutGates(args)
  if (gate) return gate
  const founding = foundingPlacesLeft(args.foundingSold) > 0
  const amount = priceForPlan(args.planId, args.interval, founding)
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const licence: LicenceRecord = {
    id: `lic_${Date.now()}`,
    accountId: args.accountId,
    provider: 'mock',
    planId: args.planId,
    interval: args.interval,
    pricePaid: amount,
    currency: 'GBP',
    founding,
    amountRefunded: 0,
    disputeState: 'none',
    state: 'trialing',
    trialEndsAt,
    createdAt: new Date().toISOString(),
  }
  return {
    ok: true,
    message: `${PLANS[args.planId].name} trial started — ${TRIAL_DAYS} days free, then ${formatMoney(amount, 'GBP', true)}${args.interval === 'year' ? '/year' : '/month'}${founding ? ' (founding)' : ''}.`,
    licence,
    foundingSold: founding ? args.foundingSold + 1 : args.foundingSold,
  }
}

export async function stripeStartCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
  const gate = validateCheckoutGates(args)
  if (gate) return gate
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: args.accountId,
        email: args.email,
        currency: 'GBP',
        billingCountry: args.billingCountry,
        planId: args.planId,
        interval: args.interval,
        founding: foundingPlacesLeft(args.foundingSold) > 0,
        trialDays: TRIAL_DAYS,
        acceptLegal: true,
        successUrl: `${window.location.origin}/?checkout=success`,
        cancelUrl: `${window.location.origin}/?checkout=cancel`,
      }),
    })
    const data = (await res.json()) as { ok?: boolean; message?: string; url?: string }
    if (!res.ok || !data.ok || !data.url) {
      return {
        ok: false,
        message: data.message || 'Stripe Checkout is not available. Complete live keys and prices.',
      }
    }
    return {
      ok: true,
      message: 'Redirecting to Stripe Checkout…',
      checkoutUrl: data.url,
    }
  } catch {
    return {
      ok: false,
      message: 'Could not reach Stripe checkout API.',
    }
  }
}

export async function startCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
  if (isLiveStripeEnabled()) return stripeStartCheckout(args)
  return mockStartCheckout(args)
}

export function earlyBirdPlacesLeft(_sold: number) {
  return Math.max(0, FOUNDING_CAP - _sold)
}

export function foundingPlacesLeft(sold: number) {
  return Math.max(0, FOUNDING_CAP - sold)
}
