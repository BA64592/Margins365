import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  analyzeStore,
  applyScenarioToLines,
  buildSampleDataset,
} from '../lib/calc/analyze'
import { importPlatformFiles, type PlatformImportInput } from '../lib/csv/importPlatform'
import { compareFees } from '../lib/fees/presets'
import { createId } from '../lib/format'
import { roundMoney } from '../lib/money'
import { marginosAuthProvider, type AuthSession } from '../lib/auth/provider'
import {
  EARLY_BIRD_CAP,
  foundingPlacesLeft,
  startCheckout,
} from '../lib/payments/provider'
import { logDataAction } from '../lib/auditLog'
import { en } from '../i18n/en'
import { inactivityWarningDays, isInactive24Months } from '../lib/inactivity'
import {
  applyPaymentFailure,
  earliestClock,
  isExpired,
  pauseClocks,
  resumeOrCancelClocks,
} from '../lib/retention'
import { buildDemoStore, type DemoStoreId } from '../lib/demo/stores'
import { clearAllState, loadState, saveState } from '../lib/storage'
import { evaluateOrderImport, uniqueOrderIds } from '../lib/orders/uniqueOrders'
import {
  normalizePathname,
  pageDescription,
  pageTitle,
  pathToRoute,
  routeToPath,
  type AppRoute,
} from '../lib/routes'

export type { AppRoute }
import {
  LAUNCH_PLATFORMS,
  PLANS,
  TRIAL_DAYS,
  entitlementPlanId,
  formatGbp,
  hasFeature,
  hasPaidAccess,
  platformSlotLimitFor,
  localStateFromLicence,
  nextPlanAfter,
  orderLimitFor,
  scenarioSaveLimit,
  trialEntitlementFor,
  type AccessKind,
  type BillingInterval,
  type PlanFeature,
  type PlanId,
} from '../lib/plans'
import {
  isProfileComplete,
  type AdSpendEntry,
  type AnalysisResult,
  type AppPersistedState,
  type AuthUser,
  type FreeRetentionClock,
  type HomeCurrency,
  type KeptProData,
  type OrderLine,
  type Plan,
  type Platform,
  type ProductCostRow,
  type SavedDataset,
  type Scenario,
  type ScenarioAdjustments,
  type TaxSettings,
} from '../lib/types'

function authUserFromSession(session: AuthSession, fallback?: AuthUser | null): AuthUser {
  const tzGuess =
    fallback?.timeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'Europe/London'
  return {
    id: session.accountId,
    email: session.email || fallback?.email || '',
    emailVerified: session.emailVerified,
    authProvider: session.provider === 'google' ? 'google' : 'email',
    fullName: session.fullName ?? fallback?.fullName ?? null,
    businessName: session.businessName ?? fallback?.businessName ?? null,
    phone: session.phone ?? fallback?.phone ?? null,
    enabledPlatforms: (session.enabledPlatforms as Platform[] | null | undefined) ??
      fallback?.enabledPlatforms ??
      null,
    createdAt: fallback?.createdAt || new Date().toISOString(),
    lastSignInAt: new Date().toISOString(),
    timeZone: tzGuess,
    timeZoneChangedAt: fallback?.timeZoneChangedAt ?? null,
    googleEmailVerified: fallback?.googleEmailVerified,
  }
}

function normalizePlan(raw: Plan | 'free' | undefined | null): Plan {
  if (!raw || raw === 'free') return 'none'
  return raw
}

const SAMPLE_CLEARED_NOTE = 'Sample data has been removed now that your own data is in.'

const defaultTax: TaxSettings = {
  pricesIncludeTax: true,
  businessCountry: 'GB',
  vatGstRegistered: false,
  vatGstFrom: null,
  euOss: false,
  euIoss: false,
  ukFlatRate: false,
  ukFlatRatePct: 0,
  usSelfCollectStates: [],
}

function emptyAdj(): ScenarioAdjustments {
  return {
    pricePct: 0,
    productCostPct: 0,
    adSpendPct: 0,
    returnRatePct: 0,
    shippingChargePct: 0,
    discountPct: 0,
  }
}

function defaultScenarios(): Scenario[] {
  return [
    { id: createId('scn'), name: 'Current', adjustments: emptyAdj() },
    {
      id: createId('scn'),
      name: 'Lower ads / fewer returns',
      adjustments: { ...emptyAdj(), adSpendPct: -20, returnRatePct: -30 },
    },
  ]
}

function countSample(lines: OrderLine[], costs: ProductCostRow[], ads: AdSpendEntry[]) {
  return {
    orderLines: lines.filter((l) => l.isSample).length,
    costRows: costs.filter((c) => c.isSample).length,
    adRows: ads.filter((a) => a.isSample).length,
  }
}

function todayKey(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

interface AppContextValue {
  plan: Plan
  access: AccessKind
  billingInterval: BillingInterval | null
  trialEndsAt: string | null
  accessEndsAt: string | null
  /** K52 reverse-trial entitlement (Pro or Scale) while access === trial. */
  trialEntitlement: PlanId | null
  foundingSold: number
  foundingLeft: number
  foundingEligible: boolean
  trialUsed: boolean
  /** Effective plan for features/limits during trial (K52). */
  entitlementPlan: PlanId | null
  keepPro: () => { ok: boolean; message: string }
  /** Easy Cancel — schedule end-of-period account close + data wipe (no charge after cancel). */
  cancelAccess: () => { ok: boolean; message: string }
  /** K89 — apply server-confirmed cancel (never invent cancel locally). */
  applyServerCancel: (input: {
    accessEndsAt: string | null
    reference?: string | null
    stripeLine?: string | null
  }) => void
  /** K90 — trial-start confirmation after Checkout. */
  trialConfirm: {
    open: boolean
    title: string
    body: string
    waiting: boolean
  } | null
  dismissTrialConfirm: () => void
  theme: 'light'
  currency: HomeCurrency
  user: AuthUser | null
  tax: TaxSettings
  targetMarginPct: number
  monthlyOverheads: number
  costs: ProductCostRow[]
  ads: AdSpendEntry[]
  lines: OrderLine[]
  scenarios: Scenario[]
  savedDatasets: SavedDataset[]
  uploadDay: { dateKey: string; used: number }
  uploadsLeft: number
  /** @deprecated v17 — stub mapped to foundingSold. */
  earlyBirdSold: number
  /** @deprecated v17 — stub mapped to foundingLeft. */
  earlyBirdLeft: number
  usageUniqueOrderIds: string[]
  usageUniqueOrderCount: number
  orderLimit: number | null
  route: AppRoute
  setRoute: (r: AppRoute) => void
  hasFeature: (feature: PlanFeature) => boolean
  result: AnalysisResult
  scenarioResults: { scenario: Scenario; result: AnalysisResult }[]
  upgradeOpen: boolean
  authOpen: boolean
  selectedSku: string | null
  feesComparable: boolean
  warnings: string[]
  usingSampleData: boolean
  /** True when the shop has no own (non-sample) order lines. */
  isEmptyShop: boolean
  /** One-shot notice after automatic sample clear (v16.3 E9). */
  sampleClearedNotice: string | null
  dismissSampleClearedNotice: () => void
  /** @deprecated v17 Free 24h clocks — retired by K39. */
  freeClocks: FreeRetentionClock[]
  /** Earliest Free clock still running, if any. */
  earliestFreeClock: FreeRetentionClock | null
  freeDataDeletedNotice: string | null
  dismissFreeDataDeletedNotice: () => void
  keptProData: KeptProData | null
  paymentPending: boolean
  setPaymentPending: (v: boolean) => void
  setUpgradeOpen: (v: boolean) => void
  setAuthOpen: (v: boolean) => void
  setSelectedSku: (sku: string | null) => void
  toggleTheme: () => void
  setCurrency: (c: HomeCurrency) => void
  setTax: (patch: Partial<TaxSettings>) => void
  setTargetMarginPct: (n: number) => void
  setMonthlyOverheads: (n: number) => void
  signInEmail: (
    email: string,
    password: string,
    options?: { acceptLegal?: boolean },
  ) => Promise<{ ok: boolean; message: string; code?: string }>
  signInGoogle: (claims: {
    sub: string
    email: string
    email_verified: boolean
  }) => Promise<{ ok: boolean; message: string; code?: string }>
  verifyEmail: () => void
  requestVerificationEmail: () => Promise<{ ok: boolean; message: string; debugToken?: string }>
  applyVerifyToken: (token: string) => Promise<{ ok: boolean; message: string }>
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; message: string }>
  resetPassword: (token: string, newPassword: string) => Promise<{ ok: boolean; message: string }>
  /** Refresh session from server (verification / profile sync across devices). */
  refreshSession: () => Promise<AuthUser | null>
  updateProfile: (patch: {
    fullName: string
    businessName: string
    phone: string
    enabledPlatforms?: Platform[]
  }) => Promise<{ ok: boolean; message: string }>
  /** Plan slot cap for usable platforms (1 / 2 / 3 of 3). */
  platformSlotLimit: number
  /** K57 — pending password-reset token from ?reset= deep link */
  passwordResetToken: string | null
  clearPasswordResetToken: () => void
  signOut: () => void
  loadSample: () => void
  /** Marketing soft-launch demo shops (synthetic only). */
  loadDemoStore: (id: DemoStoreId) => void
  /** Remove sample rows only — never uses a Free upload (v16.3 E2). */
  clearSampleData: () => void
  /** Delete all shop data; keep account, subscription and settings (v16.3 E3). */
  startFresh: () => void
  recordSuccessfulUpload: () => boolean
  replaceOrders: (lines: OrderLine[]) => void
  importPlatformOrders: (
    input: PlatformImportInput,
  ) => { ok: boolean; message: string }
  /** Apply Margins365 cost/ads template; returns Free deletion note when applicable (v16.4 F2). */
  replaceTemplate: (
    costs: ProductCostRow[],
    ads?: AdSpendEntry[],
  ) => { deletionNote: string | null }
  feeMathsNotes: string[]
  updateCost: (sku: string, patch: Partial<ProductCostRow>) => void
  setAdTotalManual: (amount: number) => void
  unlockProDemo: (
    billingCountry: string,
    planId?: PlanId,
    interval?: BillingInterval,
  ) => Promise<{ ok: boolean; message: string }>
  /** Demo: delayed payment failed — delete past-due Free data (v16.4 F8.14 / K11). */
  failDelayedPayment: () => { ok: boolean; message: string }
  /** Demo harness: end subscription access (plan/access → none). */
  switchToFree: () => void
  /** §10.2.8 — delete account and all local shop data. */
  deleteAccount: (confirmEmail: string) => { ok: boolean; message: string }
  inactivityNotice: string | null
  dismissInactivityNotice: () => void
  createScenario: () => void
  updateScenario: (id: string, patch: Partial<Scenario>) => void
  removeScenario: (id: string) => void
  saveDataset: (name: string) => void
  exportDataCsv: () => string
  /** Active Control Room platform filter (null/empty = all platforms). Recalculates KPIs (BUG-020). */
  platformFilter: Set<Platform> | null
  setPlatformFilter: (next: Set<Platform> | null) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const saved = loadState()
  const sample = buildSampleDataset(saved?.currency ?? 'GBP')

  const initialPlan = normalizePlan(saved?.plan as Plan | 'free' | undefined)
  const initialAccess: AccessKind =
    saved?.access ??
    (initialPlan === 'legacy' ? 'legacy' : initialPlan === 'none' ? 'none' : 'active')

  const [plan, setPlan] = useState<Plan>(initialPlan)
  const [access, setAccess] = useState<AccessKind>(initialAccess)
  const [billingInterval, setBillingInterval] = useState<BillingInterval | null>(
    saved?.billingInterval ?? null,
  )
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(saved?.trialEndsAt ?? null)
  const [trialEntitlement, setTrialEntitlement] = useState<PlanId | null>(
    saved?.trialEntitlement ?? null,
  )
  const [accessEndsAt, setAccessEndsAt] = useState<string | null>(saved?.accessEndsAt ?? null)
  const [foundingSold, setFoundingSold] = useState(saved?.foundingSold ?? saved?.earlyBirdSold ?? 0)
  const [foundingEligible, setFoundingEligible] = useState(saved?.foundingEligible ?? true)
  const [trialUsed, setTrialUsed] = useState(saved?.trialUsed ?? false)
  const [theme] = useState<'light'>('light')
  const [currency, setCurrency] = useState<HomeCurrency>(saved?.currency ?? 'GBP')
  const [user, setUser] = useState<AuthUser | null>(saved?.user ?? null)
  const [tax, setTaxState] = useState<TaxSettings>(saved?.tax ?? defaultTax)
  const [targetMarginPct, setTargetMarginPct] = useState(saved?.targetMarginPct ?? 10)
  const [monthlyOverheads, setMonthlyOverheads] = useState(saved?.monthlyOverheads ?? 0)
  // Older saves may lack isSample; if flagged as sample data, mark every row (v16.3 E1).
  const legacySample = saved?.usingSampleData === true || saved == null
  const markSampleCosts = (rows: ProductCostRow[]) =>
    legacySample ? rows.map((c) => ({ ...c, isSample: c.isSample ?? true })) : rows
  const markSampleLines = (rows: OrderLine[]) =>
    legacySample ? rows.map((l) => ({ ...l, isSample: l.isSample ?? true })) : rows
  const initialCosts = markSampleCosts(saved?.costs ?? sample.costs.map((c) => ({ ...c, isSample: true })))
  const initialLines = markSampleLines(saved?.lines ?? sample.lines.map((l) => ({ ...l, isSample: true })))
  const initialAds: AdSpendEntry[] = saved?.ads
    ? legacySample
      ? saved.ads.map((a) => ({ ...a, isSample: a.isSample ?? true }))
      : saved.ads
    : [
        {
          id: createId('ad'),
          channel: 'Blended',
          amount: sample.adSpend,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          isSample: true,
        },
      ]
  const [costs, setCosts] = useState<ProductCostRow[]>(initialCosts)
  const [ads, setAds] = useState<AdSpendEntry[]>(initialAds)
  const [lines, setLines] = useState<OrderLine[]>(initialLines)
  const [scenarios, setScenarios] = useState<Scenario[]>(saved?.scenarios ?? defaultScenarios())
  const [savedDatasets, setSavedDatasets] = useState<SavedDataset[]>(saved?.savedDatasets ?? [])
  const [uploadDay, setUploadDay] = useState(
    saved?.uploadDay ?? { dateKey: todayKey(saved?.user?.timeZone ?? 'Europe/London'), used: 0 },
  )
  const [usageMonthKey, setUsageMonthKey] = useState(saved?.usageMonthKey ?? '')
  const [usageUniqueOrderIds, setUsageUniqueOrderIds] = useState<string[]>(
    saved?.usageUniqueOrderIds ?? [],
  )
  const [route, setRouteState] = useState<AppRoute>(() =>
    typeof window !== 'undefined' ? pathToRoute(window.location.pathname) : 'home',
  )

  const setRoute = (next: AppRoute) => {
    setRouteState(next)
    if (typeof window === 'undefined') return
    const path = routeToPath(next)
    const current = normalizePathname(window.location.pathname)
    if (current !== path) {
      window.history.pushState({ route: next }, '', path)
    }
    // K82 — open every new page at the top instantly (no smooth scroll); hold after paint
    const jumpTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
    jumpTop()
    requestAnimationFrame(() => {
      jumpTop()
      const h1 = document.querySelector('main h1, h1')
      if (h1 instanceof HTMLElement) {
        try {
          h1.setAttribute('tabindex', '-1')
          h1.focus({ preventScroll: true })
        } catch {
          /* ignore */
        }
      }
    })
    document.title = pageTitle(next)
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', pageDescription(next))
  }

  // K63 — sync URL on load / back-forward; redirect /sample-report
  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncFromLocation = (scrollTop: boolean) => {
      const raw = window.location.pathname
      const normalized = normalizePathname(raw)
      if (raw.replace(/\/+$/, '') === '/sample-report' || (raw.endsWith('/') && raw !== '/')) {
        window.history.replaceState({}, '', normalized)
      }
      const next = pathToRoute(window.location.pathname)
      setRouteState(next)
      document.title = pageTitle(next)
      const meta = document.querySelector('meta[name="description"]')
      if (meta) meta.setAttribute('content', pageDescription(next))
      if (scrollTop) window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    syncFromLocation(true)
    const onPop = () => syncFromLocation(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [sampleClearedNotice, setSampleClearedNotice] = useState<string | null>(null)
  const [freeClocks, setFreeClocks] = useState<FreeRetentionClock[]>(
    hasPaidAccess(initialAccess) ? [] : (saved?.freeClocks ?? []),
  )
  const [freeDataDeletedNotice, setFreeDataDeletedNotice] = useState<string | null>(
    saved?.freeDataDeletedNotice ?? null,
  )
  const [keptProData, setKeptProData] = useState<KeptProData | null>(saved?.keptProData ?? null)
  const [paymentPending, setPaymentPending] = useState(saved?.paymentPending ?? false)
  const [inactivityNotice, setInactivityNotice] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [trialConfirm, setTrialConfirm] = useState<{
    open: boolean
    title: string
    body: string
    waiting: boolean
  } | null>(null)
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null)
  const [selectedSku, setSelectedSku] = useState<string | null>(
    (saved?.costs ?? sample.costs)[0]?.sku ?? null,
  )
  const [platformFilter, setPlatformFilter] = useState<Set<Platform> | null>(null)

  const usingSampleData =
    lines.some((l) => l.isSample) || costs.some((c) => c.isSample) || ads.some((a) => a.isSample)
  /** Empty starting state: no order lines (after Clear sample / Start fresh). */
  const isEmptyShop = lines.length === 0
  const earliestFreeClock =
    access === 'none' && !usingSampleData ? earliestClock(freeClocks, nowTick) : null

  const tz = user?.timeZone ?? 'Europe/London'
  const dayKey = todayKey(tz)
  const currentMonthKey = dayKey.slice(0, 7)
  useEffect(() => {
    if (uploadDay.dateKey !== dayKey) setUploadDay({ dateKey: dayKey, used: 0 })
  }, [dayKey, uploadDay.dateKey])

  useEffect(() => {
    if (usageMonthKey !== currentMonthKey) {
      setUsageMonthKey(currentMonthKey)
      setUsageUniqueOrderIds([])
    }
  }, [currentMonthKey, usageMonthKey])

  // Subscribed → unlimited uploads; no plan → 0 real uploads (sample load still OK).
  const uploadsLeft = hasPaidAccess(access) ? 999 : 0
  const foundingLeft = foundingPlacesLeft(foundingSold)
  const entitlementPlan = entitlementPlanId(access, plan, trialEntitlement)
  const orderLimit = orderLimitFor(entitlementPlan ?? plan)

  // K72 — sync founding counter from server (source of truth)
  useEffect(() => {
    let cancelled = false
    void fetch('/api/founding')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { sold?: number; used?: number; placesLeft?: number; eligible?: boolean } | null) => {
        if (cancelled || !data) return
        const sold = Number(data.sold ?? data.used ?? 0)
        if (Number.isFinite(sold)) setFoundingSold(sold)
        if (typeof data.eligible === 'boolean') setFoundingEligible(data.eligible)
        else if (typeof data.placesLeft === 'number') setFoundingEligible(data.placesLeft > 0)
      })
      .catch(() => {
        /* keep local fallback */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (hasPaidAccess(access)) return
    setFreeClocks((prev) => {
      if (paymentPending) return pauseClocks(prev)
      return resumeOrCancelClocks(prev, { cancel: false })
    })
  }, [paymentPending, access])

  useEffect(() => {
    if (hasPaidAccess(access) || !freeClocks.length) return
    const expired = freeClocks.filter((c) => isExpired(c, nowTick))
    if (!expired.length) return
    const expiredKinds = new Set(expired.map((c) => c.kind))
    if (expiredKinds.has('orders')) {
      setLines((prev) => prev.filter((l) => l.isSample))
    }
    if (expiredKinds.has('template') || expiredKinds.has('manual')) {
      setCosts((prev) => prev.filter((c) => c.isSample))
      setAds((prev) => prev.filter((a) => a.isSample))
    }
    setFreeClocks((prev) => prev.filter((c) => !isExpired(c, nowTick)))
    setSelectedSku(null)
    setFreeDataDeletedNotice(
      'Your data was deleted after 24 hours. Upload again, or start a trial to keep your data.',
    )
  }, [nowTick, access, freeClocks])

  // K8 / F9 — 24-month inactivity deletes uploaded order data (and kept ex-Pro orders)
  useEffect(() => {
    if (!user) return
    const anchor = user.lastSignInAt
    if (isInactive24Months(anchor, nowTick)) {
      setLines((prev) => prev.filter((l) => l.isSample))
      setKeptProData((prev) =>
        prev
          ? {
              ...prev,
              lines: [],
              costs: prev.costs,
              ads: [],
              savedDatasets: [],
              scenarios: [],
            }
          : prev,
      )
      setFreeClocks([])
      setInactivityNotice(
        'Order data was deleted after 24 months of inactivity. Your account and settings remain.',
      )
      return
    }
    const warn = inactivityWarningDays(anchor, nowTick)
    if (warn) {
      setInactivityNotice(
        `Your uploaded order data will be deleted in about ${warn} days under the 24-month inactivity rule. Sign in again or export your data.`,
      )
    }
  }, [user, nowTick])

  /** Apply server plan + licence_state to local entitlement state (never invent legacy from plan=pro). */
  const applyServerLicence = (session: AuthSession) => {
    const next = localStateFromLicence({
      plan: session.plan,
      licenceState: session.licenceState,
      billingInterval: session.billingInterval,
    })
    setPlan(next.plan)
    setAccess(next.access)
    setTrialEntitlement(next.trialEntitlement)
    if (next.billingInterval) setBillingInterval(next.billingInterval)
    if (session.trialEndsAt) setTrialEndsAt(session.trialEndsAt)
    // GA-11 — access end comes from Stripe cancel_at, never a browser estimate
    if (session.cancelAt) setAccessEndsAt(session.cancelAt)
    else if (next.access !== 'canceled_access') setAccessEndsAt(null)
    if (next.access === 'trial' || next.access === 'active' || next.access === 'legacy') {
      setTrialUsed(true)
      setFreeClocks([])
    }
    if (next.access === 'canceled_access' || session.licenceState === 'trialing') {
      setTrialUsed(true)
    }
  }

  // Restore server session (verified email + licence) across devices / sign-ins
  useEffect(() => {
    void marginosAuthProvider.fetchSession().then(async (session) => {
      if (!session) return
      let current = session
      // Always reconcile with Stripe when possible — sync no longer forces Pro
      const sync = await marginosAuthProvider.syncLicence()
      if (sync.ok && sync.session) current = sync.session
      setUser((prev) => authUserFromSession(current, prev))
      applyServerLicence(current)
      // Keep account dialog open until email verified + profile complete
      if (!current.emailVerified || !isProfileComplete(authUserFromSession(current))) {
        setAuthOpen(true)
      }
    })
  }, [])

  // Email verification + password reset + Stripe return deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resetToken = params.get('reset')
    if (resetToken) {
      setPasswordResetToken(resetToken)
      setAuthOpen(true)
      params.delete('reset')
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', next)
    }
    const token = params.get('verify')
    if (token) {
      void marginosAuthProvider.verifyEmail(token).then((res) => {
        if (res.ok) {
          if (res.session) {
            setUser((prev) =>
              authUserFromSession({ ...res.session!, emailVerified: true }, prev),
            )
            applyServerLicence({ ...res.session, emailVerified: true })
          } else {
            setUser((u) => (u ? { ...u, emailVerified: true } : u))
          }
          setAuthOpen(true)
        }
        params.delete('verify')
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
        window.history.replaceState({}, '', next)
      })
    }
    if (params.get('verified') === '1') {
      void marginosAuthProvider.fetchSession().then((session) => {
        if (!session) return
        setUser((prev) => authUserFromSession(session, prev))
        applyServerLicence(session)
        setAuthOpen(true)
      })
      params.delete('verified')
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', next)
    }
    if (params.get('checkout') === 'success') {
      // Do not grant trial from the query string alone (BUG-023). Wait for session/licence sync.
      setPaymentPending(false)
      setFreeClocks([])
      setTrialConfirm({
        open: true,
        waiting: true,
        title: 'Confirming your trial',
        body: "We're still confirming your trial with our payment provider. No charge has been taken. We'll email you as soon as it's confirmed.",
      })
      void (async () => {
        let session = await marginosAuthProvider.fetchSession()
        const sync = await marginosAuthProvider.syncLicence()
        if (sync.ok && sync.session) session = sync.session
        if (session) {
          setUser((prev) => authUserFromSession(session!, prev))
          applyServerLicence(session)
          setTrialUsed(true)
        }
        // K90 — poll until server confirms trialing (webhook), max ~30s
        const started = Date.now()
        while (Date.now() - started < 30000) {
          try {
            const res = await fetch('/api/billing/trial-status', { credentials: 'include' })
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean
              confirmed?: boolean
              waiting?: boolean
              title?: string
              body?: string
            }
            if (res.ok && data.confirmed) {
              setTrialConfirm({
                open: true,
                waiting: false,
                title: data.title || 'Your 14-day free trial has started',
                body: data.body || 'Your trial is confirmed. We’ve emailed a confirmation.',
              })
              const again = await marginosAuthProvider.fetchSession()
              if (again) {
                setUser((prev) => authUserFromSession(again, prev))
                applyServerLicence(again)
              }
              return
            }
          } catch {
            /* retry */
          }
          await new Promise((r) => setTimeout(r, 2000))
        }
        setTrialConfirm({
          open: true,
          waiting: true,
          title: 'Confirming your trial',
          body: "We're still confirming your trial with our payment provider. No charge has been taken. We'll email you as soon as it's confirmed.",
        })
      })()
      params.delete('checkout')
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', next)
    }
  }, [])

  useEffect(() => {
    const state: AppPersistedState = {
      version: 6,
      plan,
      access,
      billingInterval,
      trialEndsAt,
      accessEndsAt,
      trialEntitlement,
      foundingEligible,
      foundingSold,
      theme: 'light',
      currency,
      user,
      tax,
      targetMarginPct,
      monthlyOverheads,
      conversionFeePct: 0,
      userFxRates: {},
      costs,
      ads,
      lines,
      scenarios,
      savedDatasets,
      usageMonthKey,
      usageUniqueOrderIds,
      uploadDay,
      earlyBirdSold: foundingSold,
      licenceActive: hasPaidAccess(access),
      digitalListingSkus: costs.filter((c) => c.digital).map((c) => c.sku),
      usingSampleData,
      freeClocks: hasPaidAccess(access) ? [] : freeClocks,
      freeDataDeletedNotice,
      keptProData,
      paymentPending,
      trialUsed,
    }
    saveState(state)
  }, [
    plan,
    access,
    billingInterval,
    trialEndsAt,
    accessEndsAt,
    trialEntitlement,
    foundingEligible,
    foundingSold,
    currency,
    user,
    tax,
    targetMarginPct,
    monthlyOverheads,
    costs,
    ads,
    lines,
    scenarios,
    savedDatasets,
    usageMonthKey,
    usageUniqueOrderIds,
    uploadDay,
    usingSampleData,
    freeClocks,
    freeDataDeletedNotice,
    keptProData,
    paymentPending,
    trialUsed,
  ])

  const analysisPlan = entitlementPlan ?? plan
  const analysisLines = useMemo(() => {
    if (!platformFilter || platformFilter.size === 0) return lines
    return lines.filter((l) => platformFilter.has(l.platform))
  }, [lines, platformFilter])

  const adSpendTotal = useMemo(() => {
    // When a platform filter is active, only count ads that match that channel loosely;
    // otherwise use all ads (BUG-020 honesty — prefer under-count vs wrong full-shop ROAS).
    if (!platformFilter || platformFilter.size === 0) {
      return ads.reduce((s, a) => s + a.amount, 0)
    }
    const platforms = [...platformFilter]
    return ads.reduce((s, a) => {
      const ch = (a.channel || '').toLowerCase()
      const matches = platforms.some((p) => {
        if (p === 'amazon') return ch.includes('amazon')
        if (p === 'shopify') return ch.includes('meta') || ch.includes('google') || ch.includes('shopify')
        if (p === 'etsy') return ch.includes('etsy')
        return false
      })
      // Blended / unmatched ads: prorate by filtered revenue share later via analyze; include full for now only if single-platform shop
      if (!matches && (ch.includes('blend') || !ch)) {
        return s + a.amount
      }
      return matches ? s + a.amount : s
    }, 0)
  }, [ads, platformFilter])

  const feeCmp = useMemo(() => compareFees(analysisLines, currency), [analysisLines, currency])
  const periodDays = useMemo(() => {
    if (!analysisLines.length) return 30
    const dates = analysisLines.map((l) => l.postingDate || l.orderDate).sort()
    const a = new Date(dates[0] + 'T00:00:00Z').getTime()
    const b = new Date(dates[dates.length - 1] + 'T00:00:00Z').getTime()
    return Math.max(1, Math.round((b - a) / 86400000) + 1)
  }, [analysisLines])
  const overheadsForPeriod = (monthlyOverheads * periodDays) / 30
  const conversionFeesTotal = useMemo(
    () => roundMoney(analysisLines.reduce((s, l) => s + (l.conversionFee || 0), 0)),
    [analysisLines],
  )

  const result = useMemo(() => {
    // Full diagnosis for every tier + sample (v18 — no sanitizeResultForFree).
    // Gates use entitlementPlan so reverse-trial Pro features compute correctly (BUG-012).
    return analyzeStore({
      lines: analysisLines,
      costs,
      adSpendTotal,
      overheadsForPeriod: hasFeature(analysisPlan, 'overheads') ? overheadsForPeriod : 0,
      conversionFees: conversionFeesTotal,
      currency,
      targetMarginPct,
      feesComparable: feeCmp.comparable,
      feesExcessPp: feeCmp.excessPp,
      pricesIncludeTax: tax.pricesIncludeTax,
    })
  }, [
    analysisLines,
    costs,
    adSpendTotal,
    overheadsForPeriod,
    conversionFeesTotal,
    currency,
    targetMarginPct,
    feeCmp,
    analysisPlan,
    tax.pricesIncludeTax,
  ])

  const scenarioResults = useMemo(() => {
    if (!hasFeature(analysisPlan, 'scenarios')) return []
    return scenarios.map((scenario) => {
      const applied = applyScenarioToLines(analysisLines, costs, adSpendTotal, scenario.adjustments)
      return {
        scenario,
        result: analyzeStore({
          lines: applied.lines,
          costs: applied.costs,
          adSpendTotal: applied.adSpend,
          overheadsForPeriod: hasFeature(analysisPlan, 'overheads') ? overheadsForPeriod : 0,
          conversionFees: conversionFeesTotal,
          currency,
          targetMarginPct,
          feesComparable: feeCmp.comparable,
          feesExcessPp: feeCmp.excessPp,
          pricesIncludeTax: tax.pricesIncludeTax,
        }),
      }
    })
  }, [
    analysisPlan,
    scenarios,
    analysisLines,
    costs,
    adSpendTotal,
    overheadsForPeriod,
    conversionFeesTotal,
    currency,
    targetMarginPct,
    feeCmp,
    tax.pricesIncludeTax,
  ])

  const value: AppContextValue = {
    plan,
    access,
    billingInterval,
    trialEndsAt,
    accessEndsAt,
    trialEntitlement,
    foundingSold,
    foundingLeft,
    foundingEligible,
    trialUsed,
    entitlementPlan,
    theme,
    currency,
    user,
    tax,
    targetMarginPct,
    monthlyOverheads,
    costs,
    ads,
    lines,
    scenarios,
    savedDatasets,
    uploadDay,
    uploadsLeft,
    earlyBirdSold: foundingSold,
    earlyBirdLeft: foundingLeft,
    usageUniqueOrderIds,
    usageUniqueOrderCount: usageUniqueOrderIds.length,
    orderLimit,
    route,
    setRoute,
    hasFeature: (feature) => hasFeature(entitlementPlan ?? plan, feature),
    keepPro: () => {
      if (access !== 'trial') {
        return { ok: false, message: 'Keep Pro is only available during a trial.' }
      }
      if (plan === 'pro' || plan === 'scale') {
        return { ok: false, message: 'You are already on Pro or Scale.' }
      }
      setPlan('pro')
      setTrialEntitlement('pro')
      const annual = billingInterval === 'year'
      const price = annual
        ? `${formatGbp(PLANS.pro.annualGbp)} a year`
        : `${formatGbp(PLANS.pro.monthlyGbp)}/mo`
      return {
        ok: true,
        message: `You’re on your Pro free trial until ${
          trialEndsAt
            ? new Date(trialEndsAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : 'the trial end date'
        }. Day 15 charges ${price} unless you cancel.`,
      }
    },
    cancelAccess: () => {
      // K89 — browser must not invent cancel; use /api/billing/cancel via Plan & billing UI.
      return {
        ok: false,
        message: 'Cancel from Plan & billing so Stripe can confirm it.',
      }
    },
    applyServerCancel: (input) => {
      setAccess('canceled_access')
      if (input.accessEndsAt) setAccessEndsAt(input.accessEndsAt)
      setTrialEntitlement(null)
    },
    trialConfirm,
    dismissTrialConfirm: () => setTrialConfirm(null),
    result,
    scenarioResults,
    upgradeOpen,
    authOpen,
    selectedSku,
    feesComparable: feeCmp.comparable,
    feeMathsNotes: feeCmp.mathsNotes,
    warnings: result.warnings,
    usingSampleData,
    isEmptyShop,
    sampleClearedNotice,
    dismissSampleClearedNotice: () => setSampleClearedNotice(null),
    freeClocks,
    earliestFreeClock,
    freeDataDeletedNotice,
    dismissFreeDataDeletedNotice: () => setFreeDataDeletedNotice(null),
    inactivityNotice,
    dismissInactivityNotice: () => setInactivityNotice(null),
    keptProData,
    paymentPending,
    setPaymentPending,
    setUpgradeOpen,
    setAuthOpen,
    setSelectedSku,
    toggleTheme: () => {
      document.documentElement.classList.remove('dark')
    },
    setCurrency,
    setTax: (patch) => setTaxState((t) => ({ ...t, ...patch })),
    setTargetMarginPct,
    setMonthlyOverheads,
    signInEmail: async (email, password, options) => {
      const res = await marginosAuthProvider.signInEmail(email, password, options)
      if (!res.ok || !res.session) {
        return {
          ok: false,
          message: res.message || 'Sign-in failed.',
          code: res.code,
        }
      }
      let session = res.session
      const sync = await marginosAuthProvider.syncLicence()
      if (sync.ok && sync.session) session = sync.session
      const nextUser = authUserFromSession(session)
      setUser(nextUser)
      applyServerLicence(session)
      // Stay open until verified + profile complete (do not dismiss on create/sign-in)
      if (isProfileComplete(nextUser)) setAuthOpen(false)
      else setAuthOpen(true)
      return {
        ok: true,
        message: nextUser.emailVerified
          ? res.message || 'Signed in.'
          : 'Account ready. Check your email and tap Confirm email — this window stays open until you are verified.',
      }
    },
    signInGoogle: async (claims) => {
      const res = await marginosAuthProvider.signInGoogle(claims)
      if (!res.ok || !res.session) {
        return {
          ok: false,
          message: res.message || 'Google sign-in failed.',
          code: res.code,
        }
      }
      let session = {
        ...res.session,
        emailVerified: res.session.emailVerified || claims.email_verified === true,
      }
      const sync = await marginosAuthProvider.syncLicence()
      if (sync.ok && sync.session) {
        session = {
          ...sync.session,
          emailVerified: sync.session.emailVerified || session.emailVerified,
        }
      }
      const nextUser = authUserFromSession(session)
      nextUser.googleEmailVerified = claims.email_verified
      setUser(nextUser)
      applyServerLicence(session)
      if (isProfileComplete(nextUser)) setAuthOpen(false)
      else setAuthOpen(true)
      return {
        ok: true,
        message: isProfileComplete(nextUser)
          ? res.message || 'Signed in with Google.'
          : 'Signed in with Google. Finish your profile to continue.',
      }
    },
    verifyEmail: () => {
      if (!user) return
      void marginosAuthProvider.requestEmailVerification(user.id, user.email).then((res) => {
        if (res.debugToken) {
          void marginosAuthProvider.verifyEmail(res.debugToken).then((v) => {
            if (v.ok) setUser((u) => (u ? { ...u, emailVerified: true } : u))
          })
          return
        }
        // Strict / SES path: wait for ?verify= link
      })
    },
    requestVerificationEmail: async () => {
      if (!user) return { ok: false, message: 'Sign in first.' }
      return marginosAuthProvider.requestEmailVerification(user.id, user.email)
    },
    applyVerifyToken: async (token) => {
      const res = await marginosAuthProvider.verifyEmail(token)
      if (res.ok) {
        setUser((u) => {
          const base = u
            ? { ...u, emailVerified: true }
            : res.session
              ? {
                  id: res.session.accountId,
                  email: res.session.email,
                  emailVerified: true,
                  authProvider: 'email' as const,
                  createdAt: new Date().toISOString(),
                  lastSignInAt: new Date().toISOString(),
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
                  timeZoneChangedAt: null,
                }
              : null
          return base
        })
        if (res.session) applyServerLicence(res.session)
      }
      return res
    },
    requestPasswordReset: (email) => marginosAuthProvider.requestPasswordReset(email),
    resetPassword: async (token, newPassword) => {
      const res = await marginosAuthProvider.resetPassword(token, newPassword)
      if (res.ok) {
        // K57 — successful reset signs out other sessions; clear local session too
        void marginosAuthProvider.signOut()
        setUser(null)
        setPasswordResetToken(null)
      }
      return res
    },
    refreshSession: async () => {
      const session = await marginosAuthProvider.fetchSession()
      if (!session) return null
      const next = authUserFromSession(session)
      setUser((prev) => authUserFromSession(session, prev))
      return next
    },
    updateProfile: async (patch) => {
      const max = platformSlotLimitFor(entitlementPlan ?? plan)
      const res = await marginosAuthProvider.updateProfile({
        fullName: patch.fullName,
        businessName: patch.businessName,
        phone: patch.phone,
        enabledPlatforms: patch.enabledPlatforms,
        maxPlatforms: max,
      })
      if (!res.ok) return { ok: false, message: res.message }
      if (res.session) {
        setUser((prev) => authUserFromSession(res.session!, prev))
      } else {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                fullName: patch.fullName.trim(),
                businessName: patch.businessName.trim(),
                phone: patch.phone.trim(),
                enabledPlatforms: patch.enabledPlatforms ?? prev.enabledPlatforms ?? null,
              }
            : prev,
        )
      }
      return { ok: true, message: res.message || 'Profile saved.' }
    },
    platformSlotLimit: platformSlotLimitFor(entitlementPlan ?? plan),
    passwordResetToken,
    clearPasswordResetToken: () => setPasswordResetToken(null),
    signOut: () => {
      void marginosAuthProvider.signOut()
      // Clear in-memory shop so Account B cannot see Account A data (BUG-022/024).
      setUser(null)
      setPlan('none')
      setAccess('none')
      setBillingInterval(null)
      setTrialEndsAt(null)
      setTrialEntitlement(null)
      setAccessEndsAt(null)
      setTrialUsed(false)
      setLines([])
      setCosts([])
      setAds([])
      setScenarios(defaultScenarios())
      setSavedDatasets([])
      setUsageUniqueOrderIds([])
      setKeptProData(null)
      setPaymentPending(false)
      setSelectedSku(null)
      setPlatformFilter(null)
      setMonthlyOverheads(0)
      setSampleClearedNotice(null)
      setRoute('home')
    },
    loadSample: () => {
      // Loading sample is not an upload (v16.3 E1). Only when the shop is empty / sample-only.
      const hasOwn =
        lines.some((l) => !l.isSample) ||
        costs.some((c) => !c.isSample) ||
        ads.some((a) => !a.isSample)
      if (hasOwn) return
      const s = buildSampleDataset(currency)
      setLines(s.lines)
      setCosts(s.costs)
      setAds([
        {
          id: createId('ad'),
          channel: 'Blended',
          amount: s.adSpend,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          isSample: true,
        },
      ])
      setSelectedSku(s.costs[0]?.sku ?? null)
      setSampleClearedNotice(null)
    },
    loadDemoStore: (id) => {
      const hasOwn =
        lines.some((l) => !l.isSample) ||
        costs.some((c) => !c.isSample) ||
        ads.some((a) => !a.isSample)
      if (hasOwn) return
      const s = buildDemoStore(id, currency)
      setLines(s.lines)
      setCosts(s.costs)
      setAds(s.ads)
      setSelectedSku(s.costs[0]?.sku ?? null)
      setSampleClearedNotice(null)
    },
    clearSampleData: () => {
      const counts = countSample(lines, costs, ads)
      if (counts.orderLines + counts.costRows + counts.adRows === 0) return
      const nextLines = lines.filter((l) => !l.isSample)
      const nextCosts = costs.filter((c) => !c.isSample)
      const nextAds = ads.filter((a) => !a.isSample)
      setLines(nextLines)
      setCosts(nextCosts)
      setAds(nextAds)
      setSelectedSku(nextCosts[0]?.sku ?? nextLines[0]?.sku ?? null)
      setSampleClearedNotice(null)
      logDataAction({
        eventType: 'sample data cleared',
        at: new Date().toISOString(),
        accountId: user?.id ?? null,
        plan,
        deleted: {
          orderLines: counts.orderLines,
          costRows: counts.costRows,
          adRows: counts.adRows,
          savedDatasets: 0,
          scenarios: 0,
          overheadsCleared: false,
        },
      })
    },
    startFresh: () => {
      const sampleCounts = countSample(lines, costs, ads)
      const ownLines = lines.filter((l) => !l.isSample).length
      const ownCosts = costs.filter((c) => !c.isSample).length
      const ownAds = ads.filter((a) => !a.isSample).length
      const datasetsN = savedDatasets.length
      const scenariosN = scenarios.length
      setLines([])
      setCosts([])
      setAds([])
      setMonthlyOverheads(0)
      setScenarios([])
      setSavedDatasets([])
      setSelectedSku(null)
      setSampleClearedNotice(null)
      setFreeClocks([])
      setFreeDataDeletedNotice(null)
      setKeptProData(null) // K8 / 15.E: Start fresh also deletes kept ex-Pro data
      // uploadDay intentionally unchanged (v16.3 E4)
      logDataAction({
        eventType: 'start fresh',
        at: new Date().toISOString(),
        accountId: user?.id ?? null,
        plan,
        deleted: {
          orderLines: ownLines + sampleCounts.orderLines,
          costRows: ownCosts + sampleCounts.costRows,
          adRows: ownAds + sampleCounts.adRows,
          savedDatasets: datasetsN,
          scenarios: scenariosN,
          overheadsCleared: monthlyOverheads > 0,
        },
      })
    },
    recordSuccessfulUpload: () => {
      if (!user?.emailVerified) {
        setAuthOpen(true)
        return false
      }
      if (!hasPaidAccess(access)) {
        setUpgradeOpen(true)
        return false
      }
      return true
    },
    replaceOrders: (next) => {
      const hadSample = usingSampleData
      const counts = countSample(lines, costs, ads)
      setLines(next.map((l) => ({ ...l, isSample: false })))
      if (hadSample) {
        setCosts((prev) => prev.filter((c) => !c.isSample))
        setAds((prev) => prev.filter((a) => !a.isSample))
        setSampleClearedNotice(SAMPLE_CLEARED_NOTE)
        logDataAction({
          eventType: 'sample data cleared (automatic)',
          at: new Date().toISOString(),
          accountId: user?.id ?? null,
          plan,
          deleted: {
            orderLines: counts.orderLines,
            costRows: counts.costRows,
            adRows: counts.adRows,
            savedDatasets: 0,
            scenarios: 0,
            overheadsCleared: false,
          },
        })
      }
    },
    importPlatformOrders: (input) => {
      if (!user?.emailVerified) {
        setAuthOpen(true)
        return { ok: false, message: 'Verify your email before your first upload.' }
      }
      if (!isProfileComplete(user)) {
        setAuthOpen(true)
        return {
          ok: false,
          message: 'Complete your profile (name, business name, phone) and choose your platforms.',
        }
      }
      if (!hasPaidAccess(access)) {
        setUpgradeOpen(true)
        return { ok: false, message: en.verifyEmail || 'Start a trial to upload your own orders.' }
      }
      const slotLimit = platformSlotLimitFor(entitlementPlan ?? plan)
      const enabled =
        user.enabledPlatforms && user.enabledPlatforms.length > 0
          ? user.enabledPlatforms
          : slotLimit >= LAUNCH_PLATFORMS.length
            ? [...LAUNCH_PLATFORMS]
            : null
      if (!enabled || enabled.length < 1) {
        setAuthOpen(true)
        return {
          ok: false,
          message: `Your plan includes ${slotLimit} of 3 platforms. Open Account and choose which platform(s) to use.`,
        }
      }
      if (enabled.length > slotLimit) {
        setAuthOpen(true)
        return {
          ok: false,
          message: `Your plan allows ${slotLimit} of 3 platforms. Open Account and remove extras.`,
        }
      }
      if (!enabled.includes(input.platform as Platform) && input.platform !== 'manual') {
        return {
          ok: false,
          message: `${input.platform} is not one of your chosen platforms. Open Account to change your ${slotLimit} of 3 selection, or upgrade.`,
        }
      }
      const parsed = importPlatformFiles(input)
      if (!parsed.ok) {
        // Failed upload leaves sample data in place (v16.3 E9)
        return { ok: false, message: parsed.errors.join(' ') || 'Import failed.' }
      }
      // Fail closed on empty “success” — never wipe the shop (BUG-013).
      if (!parsed.lines.length) {
        return {
          ok: false,
          message:
            parsed.errors.join(' ') ||
            'No order rows found in that file. Your existing data was left unchanged.',
        }
      }
      const limit = orderLimitFor(entitlementPlan ?? plan)
      if (hasPaidAccess(access) && limit != null) {
        const existingForUsage =
          usageUniqueOrderIds.length > 0
            ? usageUniqueOrderIds.map((orderId) => ({ orderId, isSample: false }) as OrderLine)
            : lines
        const check = evaluateOrderImport({
          existing: existingForUsage,
          incoming: parsed.lines,
          limit,
        })
        if (!check.allowed) {
          // Suggest next plan from entitlement (trial Pro), not chosen plan (BUG-017).
          const ent = entitlementPlan ?? plan
          const tier: PlanId =
            ent === 'legacy' ? 'pro' : ent === 'none' ? 'starter' : (ent as PlanId)
          const next = nextPlanAfter(tier)
          return {
            ok: false,
            message: en.orderLimitBlocked(
              check.newUnique,
              check.projected,
              limit ?? check.projected,
              check.overage,
              next ? PLANS[next].name : 'a higher plan',
            ),
          }
        }
      }
      const hadSample = usingSampleData
      const counts = countSample(lines, costs, ads)
      const ownLines = parsed.lines.map((l) => ({ ...l, isSample: false as const }))
      const incomingPlatform = input.platform
      const incomingIds = [...uniqueOrderIds(ownLines)]
      setUsageUniqueOrderIds((prev) => [...new Set([...prev, ...incomingIds])])
      // Merge by platform: replace only this platform’s lines, keep others (BUG-013).
      setLines((prev) => {
        const base = hadSample ? prev.filter((l) => !l.isSample) : prev
        const kept = base.filter((l) => l.platform !== incomingPlatform)
        return [...kept, ...ownLines]
      })
      setFreeDataDeletedNotice(null)
      setFreeClocks([])
      if (hadSample) {
        setCosts((prev) => prev.filter((c) => !c.isSample))
        setAds((prev) => {
          const kept = prev.filter((a) => !a.isSample)
          if (parsed.ads.length && hasPaidAccess(access)) return [...parsed.ads, ...kept]
          return kept
        })
        setSampleClearedNotice(SAMPLE_CLEARED_NOTE)
        logDataAction({
          eventType: 'sample data cleared (automatic)',
          at: new Date().toISOString(),
          accountId: user?.id ?? null,
          plan,
          deleted: {
            orderLines: counts.orderLines,
            costRows: counts.costRows,
            adRows: counts.adRows,
            savedDatasets: 0,
            scenarios: 0,
            overheadsCleared: false,
          },
        })
      } else if (parsed.ads.length) {
        setAds((prev) => (hasPaidAccess(access) ? [...parsed.ads, ...prev] : prev))
      }
      setSelectedSku(ownLines[0]?.sku ?? null)
      // Raw file never stored after import (v16.4 F5)
      const msg = [
        `Imported ${parsed.summary.newRows ?? parsed.lines.length} lines (${incomingPlatform}).`,
        'Other platforms were kept.',
        'Original file deleted after import.',
        hadSample ? SAMPLE_CLEARED_NOTE : null,
        ...parsed.warnings.slice(0, 3),
        ...parsed.mathsNotes.slice(0, 2),
      ]
        .filter(Boolean)
        .join(' ')
      return { ok: true, message: msg }
    },
    replaceTemplate: (nextCosts, nextAds) => {
      const hadSample = usingSampleData
      const counts = countSample(lines, costs, ads)
      const ownCosts = nextCosts.map((c) => ({ ...c, isSample: false as const }))
      setCosts(ownCosts)
      setFreeDataDeletedNotice(null)
      if (hadSample) {
        setLines((prev) => prev.filter((l) => !l.isSample))
        if (nextAds) {
          setAds(nextAds.map((a) => ({ ...a, isSample: false as const })))
        } else {
          setAds((prev) => prev.filter((a) => !a.isSample))
        }
        setSampleClearedNotice(SAMPLE_CLEARED_NOTE)
        logDataAction({
          eventType: 'sample data cleared (automatic)',
          at: new Date().toISOString(),
          accountId: user?.id ?? null,
          plan,
          deleted: {
            orderLines: counts.orderLines,
            costRows: counts.costRows,
            adRows: counts.adRows,
            savedDatasets: 0,
            scenarios: 0,
            overheadsCleared: false,
          },
        })
      } else if (nextAds) {
        setAds(nextAds.map((a) => ({ ...a, isSample: false as const })))
      }
      setSelectedSku(ownCosts[0]?.sku ?? null)
      return { deletionNote: null }
    },
    failDelayedPayment: () => {
      if (hasPaidAccess(access)) {
        setPaymentPending(false)
        return { ok: true, message: 'Payment pending cleared.' }
      }
      const now = Date.now()
      const { keep, expiredKinds } = applyPaymentFailure(freeClocks, now)
      setPaymentPending(false)
      if (expiredKinds.includes('orders')) {
        setLines((prev) => prev.filter((l) => l.isSample))
      }
      if (expiredKinds.includes('template') || expiredKinds.includes('manual')) {
        setCosts((prev) => prev.filter((c) => c.isSample))
        setAds((prev) => prev.filter((a) => a.isSample))
      }
      setFreeClocks(keep)
      if (expiredKinds.length) {
        setSelectedSku(null)
        setFreeDataDeletedNotice(
          'Your Free data was deleted because payment failed after the 24-hour window. Upload again, or upgrade to Pro.',
        )
        return { ok: true, message: en.paymentFailedPastDueDeleted }
      }
      return { ok: true, message: en.paymentFailedClocksResumed }
    },
    updateCost: (sku, patch) => {
      setCosts((prev) => prev.map((c) => (c.sku === sku ? { ...c, ...patch } : c)))
      // K2: digital is manual — sync requiresShipping on matching order lines
      if (typeof patch.digital === 'boolean') {
        setLines((prev) =>
          prev.map((l) =>
            l.sku === sku
              ? {
                  ...l,
                  requiresShipping: !patch.digital,
                  shippingCost: patch.digital ? 0 : l.shippingCost,
                }
              : l,
          ),
        )
      }
    },
    setAdTotalManual: (amount) => {
      setAds([
        {
          id: createId('ad'),
          channel: hasFeature(entitlementPlan ?? plan, 'perChannelRoas') ? 'Meta' : 'Blended',
          amount,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          isSample: false,
        },
      ])
    },
    unlockProDemo: async (billingCountry, planId = 'growth', interval = 'month') => {
      if (!user) {
        setAuthOpen(true)
        return { ok: false, message: 'Sign in to start a trial.' }
      }
      const res = await startCheckout({
        accountId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        billingCountry,
        currency,
        planId,
        interval,
        foundingSold,
        trialUsed,
        alreadySubscribed: hasPaidAccess(access),
        paymentPending,
      })
      if (res.checkoutUrl) {
        window.location.assign(res.checkoutUrl)
        return res
      }
      if (res.ok) {
        const lic = res.licence
        const chosen = lic?.planId ?? planId
        setPlan(chosen)
        setAccess('trial')
        setTrialEntitlement(trialEntitlementFor(chosen))
        setBillingInterval(lic?.interval ?? interval)
        setTrialEndsAt(
          lic?.trialEndsAt ??
            new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        )
        setTrialUsed(true)
        // K72 — mock/local: reserve a founding place when places remain
        if (foundingEligible && foundingLeft > 0) {
          setFoundingSold((n) => n + 1)
        }
        setPaymentPending(false)
        setFreeClocks([])
        setFreeDataDeletedNotice(null)
        // K8: restore kept ex-subscriber data if present
        if (keptProData) {
          setLines(keptProData.lines)
          setCosts(keptProData.costs)
          setAds(keptProData.ads)
          setSavedDatasets(keptProData.savedDatasets)
          setScenarios(keptProData.scenarios)
          setMonthlyOverheads(keptProData.monthlyOverheads)
          setKeptProData(null)
        } else if (lines.some((l) => !l.isSample)) {
          setSavedDatasets((prev) => [
            {
              id: createId('ds'),
              name: 'Upgraded from sample',
              start: result.totals.period.start,
              end: result.totals.period.end,
              platforms: [...new Set(lines.map((l) => l.platform))],
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ])
        }
        setUpgradeOpen(false)
      }
      return { ok: res.ok, message: res.message }
    },
    switchToFree: () => {
      // Demo harness: end access — keep shop snapshot for CSV export only
      const ownLines = lines.filter((l) => !l.isSample)
      const ownCosts = costs.filter((c) => !c.isSample)
      const ownAds = ads.filter((a) => !a.isSample)
      if (ownLines.length || ownCosts.length || savedDatasets.length) {
        setKeptProData({
          lines: ownLines,
          costs: ownCosts,
          ads: ownAds,
          savedDatasets,
          scenarios,
          monthlyOverheads,
          keptAt: new Date().toISOString(),
        })
      }
      setLines([])
      setCosts([])
      setAds([])
      setSavedDatasets([])
      setScenarios([])
      setMonthlyOverheads(0)
      setSelectedSku(null)
      setFreeClocks([])
      setPlan('none')
      setAccess('none')
      setBillingInterval(null)
      setTrialEndsAt(null)
      setAccessEndsAt(null)
    },
    deleteAccount: (confirmEmail) => {
      if (!user) return { ok: false, message: 'Sign in first.' }
      if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        return { ok: false, message: 'Type your account email to confirm deletion.' }
      }
      logDataAction({
        eventType: 'account deleted',
        at: new Date().toISOString(),
        accountId: user.id,
        plan,
        deleted: {
          orderLines: lines.length,
          costRows: costs.length,
          adRows: ads.length,
          savedDatasets: savedDatasets.length,
          scenarios: scenarios.length,
          overheadsCleared: monthlyOverheads > 0,
        },
      })
      clearAllState(user.id)
      setUser(null)
      setPlatformFilter(null)
      setPlan('none')
      setAccess('none')
      setBillingInterval(null)
      setTrialEndsAt(null)
      setAccessEndsAt(null)
      setUsageUniqueOrderIds([])
      setLines([])
      setCosts([])
      setAds([])
      setScenarios(defaultScenarios())
      setSavedDatasets([])
      setMonthlyOverheads(0)
      setKeptProData(null)
      setFreeClocks([])
      setFreeDataDeletedNotice(null)
      setPaymentPending(false)
      setSelectedSku(null)
      setAuthOpen(false)
      return { ok: true, message: 'Account deleted from this browser. This cannot be undone.' }
    },
    createScenario: () => {
      if (!hasFeature(entitlementPlan ?? plan, 'scenarios')) {
        setUpgradeOpen(true)
        return
      }
      const limit = scenarioSaveLimit(entitlementPlan ?? plan)
      if (limit !== null && scenarios.length >= limit) {
        setUpgradeOpen(true)
        return
      }
      setScenarios((prev) => [
        ...prev,
        { id: createId('scn'), name: `Scenario ${prev.length + 1}`, adjustments: emptyAdj() },
      ])
    },
    updateScenario: (id, patch) =>
      setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    removeScenario: (id) => setScenarios((prev) => prev.filter((s) => s.id !== id)),
    saveDataset: (name) => {
      if (!hasPaidAccess(access)) {
        setUpgradeOpen(true)
        return
      }
      setSavedDatasets((prev) => [
        {
          id: createId('ds'),
          name,
          start: result.totals.period.start,
          end: result.totals.period.end,
          platforms: [...new Set(lines.map((l) => l.platform))],
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
    },
    exportDataCsv: () => {
      // Cleaned rows only — never the original file (v16.4 F3 / F5).
      // K8: ex-Pro kept data is exportable from settings when results are empty.
      const sourceLines = lines.length ? lines : (keptProData?.lines ?? [])
      const sourceCosts = costs.length ? costs : (keptProData?.costs ?? [])
      if (result.products.length) {
        const header = 'sku,name,revenue,net_profit,net_margin_pct,verdict'
        const rows = result.products.map(
          (p) =>
            `${p.sku},"${p.name}",${p.revenue},${p.netProfit},${p.netMarginPct},${p.verdict}`,
        )
        return [header, ...rows].join('\n')
      }
      const costHeader = 'sku,name,unit_cost,packaging_cost,shipping_cost_per_unit,return_cost_per_returned_unit'
      const costRows = sourceCosts.map(
        (c) =>
          `${c.sku},"${c.name}",${c.unitCost},${c.packagingCost},${c.shippingCostPerUnit},${c.returnCostPerReturnedUnit}`,
      )
      const orderHeader = 'order_id,sku,name,quantity,line_value,platform,order_date'
      const orderRows = sourceLines.map(
        (l) =>
          `${l.orderId},${l.sku},"${l.name}",${l.quantity},${l.lineValue},${l.platform},${l.orderDate}`,
      )
      return [
        '# costs',
        costHeader,
        ...costRows,
        '# orders',
        orderHeader,
        ...orderRows,
      ].join('\n')
    },
    platformFilter,
    setPlatformFilter,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export { EARLY_BIRD_CAP }
