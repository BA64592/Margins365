/**
 * v18 public pricing + checkout copy (GBP approved; OD6 non-GBP undecided).
 */
import { PRODUCT_NAME } from './brand'
import {
  FOUNDING_CAP,
  PLANS,
  PLAN_ORDER,
  TRIAL_DAYS,
  formatGbp,
  planPriceLabel,
  type BillingInterval,
  type PlanId,
} from './plans'

export {
  FOUNDING_CAP,
  PLANS,
  PLAN_ORDER,
  TRIAL_DAYS,
  formatGbp,
  planPriceLabel,
}

/** @deprecated v17 early-bird — kept so old imports compile during migration. */
export const EARLY_BIRD_CAP = 0
export const FIXED_PRICES = {
  full: { GBP: 129, USD: 129, EUR: 129, CAD: 129, AUD: 129 },
  earlyBird: { GBP: 129, USD: 129, EUR: 129, CAD: 129, AUD: 129 },
} as const

export function earlyBirdPlacesLeft(_sold = 0) {
  return 0
}

export function formatEarlyBirdPrice() {
  return formatGbp(PLANS.growth.foundingMonthlyGbp)
}

export function formatFullProPrice() {
  return formatGbp(PLANS.pro.monthlyGbp)
}

export function earlyBirdPrice() {
  return PLANS.growth.foundingMonthlyGbp
}

export function fullProPrice() {
  return PLANS.pro.monthlyGbp
}

export function positioningLine() {
  return `Find where your margin leaks and what each leak costs you. Plans from ${formatGbp(PLANS.starter.monthlyGbp)} a month, including VAT. Cancel any time.`
}

export function trialPaywallCopy(plan: PlanId = 'growth', interval: BillingInterval = 'month') {
  const def = PLANS[plan]
  const price = interval === 'year' ? def.annualGbp : def.monthlyGbp
  return `Try ${def.name} free for ${TRIAL_DAYS} days. Cancel before your trial ends (date shown at Checkout and in Plan & billing) and pay nothing. Then ${formatGbp(price)}${interval === 'year' ? ' / year' : ' / month'} including VAT unless you cancel in Plan & billing.`
}

export function planShortCta(plan: PlanId = 'growth') {
  const def = PLANS[plan]
  return def.mostPopular
    ? `${def.name} · ${formatGbp(def.monthlyGbp)}/mo`
    : `Plans from ${formatGbp(PLANS.starter.monthlyGbp)}`
}

export function heroCta() {
  return `Start ${TRIAL_DAYS}-day free trial`
}

export function upgradeModalHeadline() {
  return `${PRODUCT_NAME} plans — ${TRIAL_DAYS} days free on every tier. Cancel before your trial ends (date shown at Checkout and in Plan & billing) and pay nothing.`
}

/** @deprecated v17 names — map to growth trial CTA. */
export function proUnlockPaywallCopy() {
  return trialPaywallCopy('growth', 'month')
}

export function proShortCta() {
  return planShortCta('growth')
}

export function proHeroCta() {
  return heroCta()
}

export function proModalHeadline() {
  return upgradeModalHeadline()
}

export function proCheckoutButtonLabel() {
  return `Start ${TRIAL_DAYS}-day free trial`
}
