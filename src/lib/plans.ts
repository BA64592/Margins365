/**
 * v18.1 subscription tiers (K41–K52, FINAL 6 Nov 2026).
 * Non-GBP fixed amounts undecided (OD6) — GBP checkout only by default.
 */
import { formatMoney } from './format'
import type { Platform } from './types'

/** Paid subscription tiers (no permanent Free plan). */
export type PlanId = 'starter' | 'growth' | 'pro' | 'scale'

/**
 * Access state on the account.
 * - none: signed out / no trial / no sub — sample shop only
 * - trial | active: selected PlanId applies (trial features use trialEntitlement — K52)
 * - legacy: pre-v18 lifetime Pro licence → Pro-level features
 * - canceled_access: still within disclosed access window before wipe (K39/K51)
 */
export type AccessKind = 'none' | 'trial' | 'active' | 'legacy' | 'canceled_access'

export type BillingInterval = 'month' | 'year'

export type PlanFeature =
  | 'diagnosis'
  | 'overheads'
  | 'perChannelRoas'
  | 'ownFx'
  | 'fullTax'
  | 'simpleUkTax'
  | 'scenarios'
  | 'pdf'
  | 'multiPlatform'
  | 'tiktokBeta'

export interface PlanDefinition {
  id: PlanId
  name: string
  mostPopular?: boolean
  monthlyGbp: number
  annualGbp: number
  /** K72 — founding monthly GBP (50% off for first 6 months). */
  foundingMonthlyGbp: number
  orderLimit: number
  shops: number
  maxPlatforms: number
  historyMonths: number | null
  seats: number
  uploadsTelemetryDefault: number | null
  savedDatasetsTelemetryDefault: number | null
}

/** K72 — founding offer: 50% off first 6 monthly payments for first 100 paying accounts. */
export const FOUNDING_CAP = 100
export const FOUNDING_MONTHS = 6
/** Annual founding = 25% off first year (half price for 6 of 12 months). */
export const FOUNDING_ANNUAL_DISCOUNT = 0.25
export const TRIAL_DAYS = 14
/** @deprecated — monthly founding is 6 invoices; annual uses 25% off year 1. */
export const FOUNDING_MONTHLY_ONLY = false
/** Recommended trial reminder lead days (configurable). */
export const TRIAL_REMINDER_DAYS = 3

/** K43 — exact sticky banner string (approved word-for-word). */
/** Removed by K81 — do not reintroduce a sticky trial banner string. */
export const TRIAL_BANNER_REMOVED = true as const

/** K46 — single primary CTA label everywhere. */
export const PRIMARY_TRIAL_CTA = 'Start 14-day free trial'

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyGbp: 39,
    annualGbp: 390,
    foundingMonthlyGbp: 19.5,
    orderLimit: 500,
    shops: 1,
    maxPlatforms: 1,
    historyMonths: 3,
    seats: 1,
    uploadsTelemetryDefault: 10,
    savedDatasetsTelemetryDefault: 3,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyGbp: 79,
    annualGbp: 790,
    foundingMonthlyGbp: 39.5,
    orderLimit: 2000,
    shops: 1,
    // K53 — usable slots exclude TikTok until S47 (Q32: 1/2/3 of 3).
    maxPlatforms: 2,
    historyMonths: 12,
    seats: 1,
    uploadsTelemetryDefault: 30,
    savedDatasetsTelemetryDefault: null,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    mostPopular: true, // K54 — Most Popular moved from Growth to Pro
    monthlyGbp: 129,
    annualGbp: 1290,
    foundingMonthlyGbp: 64.5,
    orderLimit: 5000,
    shops: 1,
    maxPlatforms: 3,
    historyMonths: 24,
    seats: 2,
    uploadsTelemetryDefault: null,
    savedDatasetsTelemetryDefault: null,
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    monthlyGbp: 199,
    annualGbp: 1990,
    foundingMonthlyGbp: 99.5,
    orderLimit: 15000,
    shops: 3,
    maxPlatforms: 3,
    historyMonths: null,
    seats: 5,
    uploadsTelemetryDefault: null,
    savedDatasetsTelemetryDefault: null,
  },
}

export const PLAN_ORDER: PlanId[] = ['starter', 'growth', 'pro', 'scale']

const TIER_FEATURES: Record<PlanId, Set<PlanFeature>> = {
  starter: new Set(['diagnosis', 'simpleUkTax', 'tiktokBeta']),
  growth: new Set([
    'diagnosis',
    'overheads',
    'perChannelRoas',
    'ownFx',
    'fullTax',
    'scenarios',
    'pdf',
    'multiPlatform',
    'tiktokBeta',
  ]),
  pro: new Set([
    'diagnosis',
    'overheads',
    'perChannelRoas',
    'ownFx',
    'fullTax',
    'scenarios',
    'pdf',
    'multiPlatform',
    'tiktokBeta',
  ]),
  scale: new Set([
    'diagnosis',
    'overheads',
    'perChannelRoas',
    'ownFx',
    'fullTax',
    'scenarios',
    'pdf',
    'multiPlatform',
    'tiktokBeta',
  ]),
}

/** Effective tier for feature checks (legacy lifetime → Pro). */
export function effectivePlanId(plan: PlanId | 'none' | 'legacy' | null | undefined): PlanId | null {
  if (!plan || plan === 'none') return null
  if (plan === 'legacy') return 'pro'
  return plan
}

/**
 * K69 — trial gives the chosen tier (replaces K52 reverse trial).
 * Starter trial → Starter, Growth → Growth, Pro → Pro, Scale → Scale.
 */
export function trialEntitlementFor(chosen: PlanId): PlanId {
  return chosen
}

/** Plan used for entitlements while access is trial (K69). */
export function entitlementPlanId(
  access: AccessKind,
  chosen: PlanId | 'none' | 'legacy' | null | undefined,
  trialEntitlement?: PlanId | null,
): PlanId | null {
  const chosenId = effectivePlanId(chosen)
  if (access === 'trial') {
    if (trialEntitlement) return trialEntitlement
    if (chosenId) return trialEntitlementFor(chosenId)
    return chosenId
  }
  return chosenId
}

export function hasPaidAccess(access: AccessKind): boolean {
  return access === 'trial' || access === 'active' || access === 'legacy' || access === 'canceled_access'
}

/** Server licence_state → local Plan + AccessKind (Slice A / F2–F4). */
export function localStateFromLicence(input: {
  plan?: string | null
  licenceState?: string | null
  billingInterval?: string | null
}): {
  plan: PlanId | 'none' | 'legacy'
  access: AccessKind
  trialEntitlement: PlanId | null
  billingInterval: BillingInterval | null
} {
  const licence = String(input.licenceState || 'none').toLowerCase()
  const rawPlan = String(input.plan || 'free').toLowerCase()
  const ivRaw = String(input.billingInterval || '').toLowerCase()
  const billingInterval: BillingInterval | null =
    ivRaw === 'year' || ivRaw === 'month' ? ivRaw : null

  if (licence === 'legacy') {
    return { plan: 'legacy', access: 'legacy', trialEntitlement: null, billingInterval }
  }

  const chosen =
    rawPlan === 'starter' || rawPlan === 'growth' || rawPlan === 'pro' || rawPlan === 'scale'
      ? (rawPlan as PlanId)
      : null

  if (!chosen) {
    return { plan: 'none', access: 'none', trialEntitlement: null, billingInterval }
  }

  if (licence === 'trialing') {
    return {
      plan: chosen,
      access: 'trial',
      trialEntitlement: trialEntitlementFor(chosen),
      billingInterval,
    }
  }

  if (licence === 'active' || licence === 'past_due') {
    return { plan: chosen, access: 'active', trialEntitlement: null, billingInterval }
  }

  if (licence === 'canceled_access') {
    return { plan: chosen, access: 'canceled_access', trialEntitlement: null, billingInterval }
  }

  // GA-14 / GA-44 — refund, dispute, ended: no access; keep never inventing a free plan
  if (
    licence === 'removed_full_refund' ||
    licence === 'removed_lost_dispute' ||
    licence === 'ended' ||
    licence === 'canceled'
  ) {
    return { plan: 'none', access: 'none', trialEntitlement: null, billingInterval }
  }

  // none / unknown with a plan still in DB but no paid access
  return { plan: 'none', access: 'none', trialEntitlement: null, billingInterval }
}

export function hasFeature(
  plan: PlanId | 'none' | 'legacy' | null | undefined,
  feature: PlanFeature,
): boolean {
  const id = effectivePlanId(plan)
  if (!id) return false
  return TIER_FEATURES[id].has(feature)
}

export function orderLimitFor(plan: PlanId | 'none' | 'legacy' | null | undefined): number | null {
  const id = effectivePlanId(plan)
  if (!id) return null
  return PLANS[id].orderLimit
}

export function maxPlatformsFor(plan: PlanId | 'none' | 'legacy' | null | undefined): number {
  const id = effectivePlanId(plan)
  if (!id) return 0
  return PLANS[id].maxPlatforms
}

/**
 * Platform picker slots for Account / uploads.
 * Free accounts (no plan yet) get Starter’s 1-of-3 until they start a trial or subscribe.
 */
export function platformSlotLimitFor(plan: PlanId | 'none' | 'legacy' | null | undefined): number {
  const n = maxPlatformsFor(plan)
  return n > 0 ? n : PLANS.starter.maxPlatforms
}

export function scenarioSaveLimit(plan: PlanId | 'none' | 'legacy' | null | undefined): number | null {
  const id = effectivePlanId(plan)
  if (!id) return 0
  if (id === 'starter') return 0
  if (id === 'growth') return 2
  return null // unlimited
}

/** D-1 / K72 — show pence when the amount is not a whole pound (never round £19.50 → £20). */
export function formatGbp(amount: number) {
  const whole = Math.abs(amount - Math.round(amount)) < 1e-9
  return formatMoney(amount, 'GBP', whole)
}

export function foundingAnnualGbp(plan: PlanId): number {
  return Math.round(PLANS[plan].annualGbp * (1 - FOUNDING_ANNUAL_DISCOUNT) * 100) / 100
}

export function planPriceLabel(plan: PlanId, interval: BillingInterval, founding = false) {
  const def = PLANS[plan]
  if (interval === 'year') return formatGbp(founding ? foundingAnnualGbp(plan) : def.annualGbp)
  return formatGbp(founding ? def.foundingMonthlyGbp : def.monthlyGbp)
}

/** Display line while founding places remain (K72). */
export function foundingOfferLine(placesLeft: number): string | null {
  if (placesLeft <= 0) return null
  return `Founding offer: 50% off your first 6 months — for the first ${FOUNDING_CAP} paying customers. ${placesLeft} places left.`
}

export function trialCheckoutSummary(plan: PlanId, interval: BillingInterval, _founding = false) {
  const def = PLANS[plan]
  const price = interval === 'year' ? def.annualGbp : def.monthlyGbp
  const entitlement = trialEntitlementFor(plan)
  return {
    trialDays: TRIAL_DAYS,
    postTrialPrice: formatGbp(price),
    interval,
    planName: def.name,
    entitlementName: PLANS[entitlement].name,
    // K69 — trial matches chosen plan (no reverse trial)
    reverseTrial: false,
  }
}

/** Charge date hint for checkout / pricing cards (account TZ ≈ local). */
export function trialChargeDateLabel(from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + TRIAL_DAYS)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Usable upload platforms today (K53 — TikTok not a slot until S47). */
export const LAUNCH_PLATFORMS: Platform[] = ['shopify', 'amazon', 'etsy']

/** K53 public line until the TikTok XLSX reader ships. */
export const TIKTOK_COMING_SOON = 'TikTok Shop UK (Beta): Excel import coming soon'

/** K54 — homepage differentiation line (word for word). */
/** K56 — until S47 (TikTok reader) passes; then swap to “…Tik-Tok).” */
export const MULTI_PLATFORM_LINE =
  'Built for single or multi-platform sellers (Shopify, Amazon, Etsy, TikTok coming soon).'

export function nextPlanAfter(plan: PlanId): PlanId | null {
  const i = PLAN_ORDER.indexOf(plan)
  if (i < 0 || i >= PLAN_ORDER.length - 1) return null
  return PLAN_ORDER[i + 1]
}

/** K47 — shop / seat explanations (tap-friendly). */
export const SHOP_HELP =
  'A shop is one online store connected to this account. If you sell from two Shopify stores, that is two shops. Starter, Growth and Pro include 1 shop. Scale includes up to 3.'
export const SEAT_HELP =
  'A seat is a person who can sign in to this account. The owner always uses one seat. Extra seats are for people such as a bookkeeper or business partner. Starter and Growth include 1 seat (the owner). Pro includes 2. Scale includes 5.'
