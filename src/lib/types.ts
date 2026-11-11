import type { AccessKind, BillingInterval, PlanId } from './plans'

/** @deprecated Prefer PlanId + AccessKind (v18). Kept for migration of persisted free/pro. */
export type LegacyPlan = 'free' | 'pro'
/** Active subscription tier, none, or legacy lifetime. */
export type Plan = PlanId | 'none' | 'legacy'
export type { AccessKind, BillingInterval, PlanId }
export type HomeCurrency = 'GBP' | 'EUR' | 'USD' | 'CAD' | 'AUD'
export type Platform = 'shopify' | 'amazon' | 'etsy' | 'tiktok' | 'manual'
export type Confidence = 'High' | 'Medium' | 'Low'
export type ScoreBand = 'Strong' | 'Needs attention' | 'At risk'
export type ProductVerdict = 'Losing money' | 'Thin' | 'Healthy' | 'No revenue'
export type LeakId =
  | 'unprofitable_ads'
  | 'high_returns'
  | 'loss_making_product'
  | 'shipping_subsidy'
  | 'fee_drag'
  | 'thin_pricing'

export interface AuthUser {
  id: string
  email: string
  emailVerified: boolean
  authProvider: 'email' | 'google'
  googleEmailVerified?: boolean
  /** Legal / display name — mandatory once signed in. */
  fullName?: string | null
  /** Trading / business name — mandatory once signed in. */
  businessName?: string | null
  /** Contact phone — mandatory once signed in. */
  phone?: string | null
  /**
   * Platforms this account may upload (Shopify / Amazon / Etsy).
   * Length capped by plan maxPlatforms (1 / 2 / 3 of 3). Customer picks which.
   */
  enabledPlatforms?: Platform[] | null
  createdAt: string
  lastSignInAt: string
  timeZone: string
  timeZoneChangedAt: string | null
}

export function isProfileComplete(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  // K70 — phone optional; name + business + verified email + platforms required
  return Boolean(
    user.fullName?.trim() &&
      user.businessName?.trim() &&
      user.emailVerified &&
      user.enabledPlatforms &&
      user.enabledPlatforms.length > 0,
  )
}

export interface TaxSettings {
  pricesIncludeTax: boolean
  businessCountry: string
  vatGstRegistered: boolean
  vatGstFrom: string | null
  euOss: boolean
  euIoss: boolean
  ukFlatRate: boolean
  ukFlatRatePct: number
  usSelfCollectStates: string[]
}

export interface ProductCostRow {
  sku: string
  name: string
  unitCost: number
  packagingCost: number
  /** Per-SKU average shipping cost per unit (when no per-order shipping). */
  shippingCostPerUnit: number
  /** Per returned unit average return shipping / restocking. */
  returnCostPerReturnedUnit: number
  digital: boolean
  /** Built-in demo row — removable without touching the user’s own data (v16.3). */
  isSample?: boolean
}

export interface AdSpendEntry {
  id: string
  channel: string
  amount: number
  startDate: string
  endDate: string
  attributedRevenue?: number
  /** Built-in demo ad row (v16.3). */
  isSample?: boolean
}

export interface OrderLine {
  id: string
  orderId: string
  linePosition: number
  platform: Platform
  sku: string
  name: string
  quantity: number
  unitPrice: number
  /** Product revenue before order-level discounts (qty × unit price − line discounts). */
  lineValue: number
  orderDate: string
  postingDate: string
  currency: HomeCurrency | string
  country: string
  region: string | null
  requiresShipping: boolean
  isFba: boolean
  taxAmount: number
  marketplaceCollectedTax: boolean
  /** Allocated / line amounts in home currency after conversion. */
  shippingCharged: number
  shippingCost: number
  discount: number
  refundAmount: number
  returnExtraCost: number
  referralFee: number
  paymentFee: number
  listingFee: number
  fulfilmentFee: number
  conversionFee: number
  feesActual: {
    referral: boolean
    payment: boolean
    listing: boolean
  }
  shippingChargedAllocated: boolean
  shippingCostAllocated: boolean
  refundAllocated: boolean
  refundUnitsEstimated: boolean
  /** Built-in demo order line — removable without touching the user’s own data (v16.3). */
  isSample?: boolean
}

export interface StorePeriod {
  start: string
  end: string
  days: number
}

export interface ProductResult {
  sku: string
  name: string
  platforms: Platform[]
  unitsSold: number
  revenue: number
  productPackagingCost: number
  shippingCost: number
  shippingCharged: number
  netShippingCost: number
  fees: number
  returnCost: number
  adSpendShare: number
  contributionMargin: number
  contributionMarginPct: number
  netProfit: number
  netMarginPct: number
  verdict: ProductVerdict
  unitReturnRate: number
  ordersCount: number
  returnCostRate: number
  refundUnitsEstimated: boolean
  costMissing: boolean
  targetPrice: number | null
  targetPriceNote: string
  maths: Record<string, string>
}

export interface HealthPartResult {
  key: 'netMargin' | 'adEfficiency' | 'returns' | 'productMix' | 'fees' | 'shipping'
  label: string
  weight: number
  score: number | null
  dropped: boolean
  dropReason?: string
  detail: string
}

export interface HealthResult {
  score: number | null
  band: ScoreBand | null
  confidence: Confidence
  confidenceReasons: string[]
  parts: HealthPartResult[]
  maths: string[]
}

export interface Leak {
  id: string
  leakType: LeakId
  title: string
  description: string
  monthlyImpact: number
  recommendation: string
  productSku?: string
  productName?: string
  estimated?: boolean
  maths: string[]
}

export interface StoreTotals {
  revenue: number
  productPackagingCost: number
  shippingCost: number
  shippingCharged: number
  netShippingCost: number
  shippingEligibleRevenue: number
  fees: number
  returnCost: number
  adSpend: number
  conversionFees: number
  overheads: number
  contributionMargin: number
  contributionMarginPct: number
  trueProfit: number
  netMarginPct: number
  blendedRoas: number | null
  breakEvenRoas: number | null | 'not reachable'
  breakEvenAcos: number | null
  orderCount: number
  period: StorePeriod
}

export interface AnalysisResult {
  totals: StoreTotals
  products: ProductResult[]
  health: HealthResult
  leaks: Leak[]
  headlineAction: string
  warnings: string[]
  shortPeriod: boolean
}

export interface ScenarioAdjustments {
  pricePct: number
  productCostPct: number
  adSpendPct: number
  returnRatePct: number
  shippingChargePct: number
  discountPct: number
}

export interface Scenario {
  id: string
  name: string
  adjustments: ScenarioAdjustments
}

export interface SavedDataset {
  id: string
  name: string
  start: string
  end: string
  platforms: Platform[]
  createdAt: string
}

export interface UploadDayState {
  dateKey: string
  used: number
}

/** Free 24-hour retention clock per successful upload (v16.4 F1). Sample data has none. */
export type FreeUploadKind = 'orders' | 'template' | 'manual'

export interface FreeRetentionClock {
  id: string
  kind: FreeUploadKind
  startedAt: string
  expiresAt: string
  /** Set while a delayed payment is pending (K11). */
  pausedAt: string | null
  remainingMsWhenPaused: number | null
}

/** Snapshot of Pro shop kept after refund/chargeback — export only until Pro returns (K8). */
export interface KeptProData {
  costs: ProductCostRow[]
  ads: AdSpendEntry[]
  lines: OrderLine[]
  savedDatasets: SavedDataset[]
  scenarios: Scenario[]
  monthlyOverheads: number
  keptAt: string
}

export interface AppPersistedState {
  version: 6
  plan: Plan
  access: AccessKind
  billingInterval: BillingInterval | null
  trialEndsAt: string | null
  accessEndsAt: string | null
  /** K52 — Pro or Scale while access is trial; day 15 still charges `plan`. */
  trialEntitlement?: PlanId | null
  foundingEligible: boolean
  foundingSold: number
  /** Force light UI (v18 — dark mode retired). */
  theme: 'light'
  currency: HomeCurrency
  user: AuthUser | null
  tax: TaxSettings
  targetMarginPct: number
  monthlyOverheads: number
  conversionFeePct: number
  userFxRates: Record<string, number>
  costs: ProductCostRow[]
  ads: AdSpendEntry[]
  lines: OrderLine[]
  scenarios: Scenario[]
  savedDatasets: SavedDataset[]
  /** Unique-order usage for the current billing month (v18 §12.4). */
  usageMonthKey: string
  usageUniqueOrderIds: string[]
  /** @deprecated v17 daily upload counter — retained for migration only. */
  uploadDay?: UploadDayState
  /** @deprecated v17 early-bird counter. */
  earlyBirdSold?: number
  licenceActive: boolean
  digitalListingSkus: string[]
  /** True when any built-in sample rows are still loaded (v16.3). */
  usingSampleData?: boolean
  /** @deprecated v17 Free 24h clocks — retired by K39. */
  freeClocks?: FreeRetentionClock[]
  freeDataDeletedNotice?: string | null
  keptProData?: KeptProData | null
  paymentPending?: boolean
  trialUsed?: boolean
}

/** Privacy-safe audit event for Clear sample data / Start fresh (v16.3 E7). */
export interface DataActionEvent {
  id: string
  /** sample data cleared | sample data cleared (automatic) | start fresh | account deleted */
  eventType:
    | 'sample data cleared'
    | 'sample data cleared (automatic)'
    | 'start fresh'
    | 'account deleted'
  at: string
  accountId: string | null
  plan: Plan
  deleted: {
    orderLines: number
    costRows: number
    adRows: number
    savedDatasets: number
    scenarios: number
    overheadsCleared: boolean
  }
}
