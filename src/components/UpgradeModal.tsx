import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { en } from '../i18n/en'
import { PRODUCT_NAME } from '../lib/brand'
import { isDemoHarnessEnabled } from '../lib/demoFlags'
import { ALLOWED_BUYER_COUNTRIES } from '../lib/payments/provider'
import {
  FOUNDING_MONTHS,
  PLANS,
  PLAN_ORDER,
  PRIMARY_TRIAL_CTA,
  TRIAL_DAYS,
  formatGbp,
  foundingAnnualGbp,
  foundingOfferLine,
  hasPaidAccess,
  trialChargeDateLabel,
  trialEntitlementFor,
  type BillingInterval,
  type PlanId,
} from '../lib/plans'
import { Button, Modal } from './ui'

const BUYER_COUNTRY_LABELS: Record<string, string> = {
  GB: 'United Kingdom',
  US: 'United States',
  CA: 'Canada',
  AU: 'Australia',
  IE: 'Ireland',
  FR: 'France',
  DE: 'Germany',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  BE: 'Belgium',
  AT: 'Austria',
  PT: 'Portugal',
  SE: 'Sweden',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  NZ: 'New Zealand',
  CH: 'Switzerland',
  NO: 'Norway',
}

const BUYER_COUNTRY_OPTIONS = [...ALLOWED_BUYER_COUNTRIES].sort((a, b) =>
  (BUYER_COUNTRY_LABELS[a] ?? a).localeCompare(BUYER_COUNTRY_LABELS[b] ?? b),
)

function isPlanId(v: string | null | undefined): v is PlanId {
  return Boolean(v && PLAN_ORDER.includes(v as PlanId))
}

export function UpgradeModal() {
  const {
    upgradeOpen,
    setUpgradeOpen,
    unlockProDemo,
    user,
    access,
    plan,
    billingInterval,
    foundingLeft,
    paymentPending,
    setPaymentPending,
    failDelayedPayment,
  } = useApp()
  const changing = hasPaidAccess(access)
  const [country, setCountry] = useState('GB')
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [selected, setSelected] = useState<PlanId>('growth')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [acceptLegal, setAcceptLegal] = useState(false)

  useEffect(() => {
    if (!upgradeOpen) return
    setMessage(null)
    setBusy(false)
    setAcceptLegal(false)
    if (changing) {
      if (isPlanId(plan)) setSelected(plan)
      if (billingInterval === 'year' || billingInterval === 'month') setInterval(billingInterval)
    }
  }, [upgradeOpen, changing, plan, billingInterval])

  const chargeHint = useMemo(() => trialChargeDateLabel(), [])
  const entitlement = trialEntitlementFor(selected)
  const showFounding = !changing && foundingLeft > 0
  const normalPrice =
    interval === 'year' ? PLANS[selected].annualGbp : PLANS[selected].monthlyGbp
  const foundingPrice =
    interval === 'year'
      ? foundingAnnualGbp(selected)
      : PLANS[selected].foundingMonthlyGbp
  const price = showFounding ? foundingPrice : normalPrice
  const foundingLine = foundingOfferLine(foundingLeft)

  const changePlan = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selected, interval }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
      }
      if (!res.ok || !data.ok) {
        setMessage(data.message || 'We couldn’t change your plan. Nothing has changed. Please try again.')
        return
      }
      setMessage(data.message || 'Plan updated.')
      window.setTimeout(() => {
        window.location.reload()
      }, 1200)
    } catch {
      setMessage('We couldn’t change your plan. Nothing has changed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={upgradeOpen}
      onClose={() => setUpgradeOpen(false)}
      title={changing ? `Change your ${PRODUCT_NAME} plan` : `${PRODUCT_NAME} plans`}
    >
      {changing ? (
        <p className="mb-3 text-sm text-subtle">
          Upgrades apply immediately (prorated when you are past trial). Downgrades and billing-interval
          changes take effect at renewal. During a trial, any plan change is immediate with no charge
          today — your trial end date stays the same.
        </p>
      ) : (
        <p className="mb-3 text-sm text-subtle">
          {PRIMARY_TRIAL_CTA}. You pay nothing today. Cancel any time before {chargeHint} in Plan &amp;
          billing — it takes one click.
        </p>
      )}
      {foundingLine && !changing ? (
        <p className="mb-3 rounded-[10px] border border-accent/30 bg-accent-soft/40 px-3 py-2 text-sm text-ink">
          {foundingLine}
        </p>
      ) : null}

      <div className="mb-4 flex gap-2 rounded-[10px] bg-muted p-1">
        {(['month', 'year'] as BillingInterval[]).map((iv) => (
          <button
            key={iv}
            type="button"
            className={`min-h-11 flex-1 rounded-[8px] text-sm font-medium transition ${
              interval === iv ? 'bg-elevated text-ink shadow-sm' : 'text-subtle hover:text-ink'
            }`}
            onClick={() => setInterval(iv)}
          >
            {iv === 'month' ? 'Monthly' : 'Annual (10 months for 12)'}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {PLAN_ORDER.map((id) => {
          const def = PLANS[id]
          const cardNormal = interval === 'year' ? def.annualGbp : def.monthlyGbp
          const cardFounding =
            interval === 'year' ? foundingAnnualGbp(id) : def.foundingMonthlyGbp
          const cardPrice = showFounding ? cardFounding : cardNormal
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={`min-h-11 rounded-2xl border p-4 text-left transition ${
                active ? 'border-accent bg-accent-soft/40' : 'border-border bg-elevated hover:border-accent/40'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-display text-lg font-semibold text-ink">{def.name}</span>
                {def.mostPopular ? (
                  <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className="font-display text-2xl font-bold text-navy">
                {formatGbp(cardPrice)}
                <span className="text-sm font-medium text-subtle">
                  {interval === 'year' ? '/year' : '/month'}
                </span>
              </p>
              {showFounding ? (
                <p className="mt-0.5 text-[11px] text-subtle">
                  then {formatGbp(cardNormal)} after{' '}
                  {interval === 'year' ? 'year 1' : `${FOUNDING_MONTHS} months`}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-subtle">
                {def.orderLimit.toLocaleString('en-GB')} unique orders / month · {def.maxPlatforms} of 3
                platforms
              </p>
            </button>
          )
        })}
      </div>

      {changing ? (
        <div className="mb-4 rounded-[12px] border border-border bg-muted/60 p-3 text-sm leading-relaxed text-ink">
          <p>
            Selected: <strong>{PLANS[selected].name}</strong> (
            {interval === 'year' ? 'annual' : 'monthly'}) at {formatGbp(normalPrice)} including VAT.
            We’ll confirm the change in Stripe, then email you the old plan, new plan, effective date,
            price in pence, proration and new order limit.
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded-[12px] border border-border bg-muted/60 p-3 text-sm leading-relaxed text-ink">
          <p>
            Your {TRIAL_DAYS}-day free trial of <strong>{PLANS[selected].name}</strong> starts today.
            We’ll ask for a card now so your plan can continue after the trial. You pay nothing today.
            Unless you cancel, we will automatically charge {formatGbp(price)} including VAT on{' '}
            {chargeHint}
            {showFounding
              ? interval === 'year'
                ? ` (founding 25% off year 1; then ${formatGbp(normalPrice)}/year)`
                : ` (founding 50% off for ${FOUNDING_MONTHS} months; then ${formatGbp(normalPrice)}/month)`
              : ''}{' '}
            for your {interval === 'year' ? 'annual' : 'monthly'} {PLANS[selected].name} plan. Cancel any
            time before {chargeHint} in Plan &amp; billing — it takes one click. We’ll email you a reminder
            before you’re charged.
          </p>
          <p className="mt-2 text-subtle">There is no email cancellation route.</p>
        </div>
      )}

      {!changing ? (
        <ul className="mb-4 space-y-1.5 text-sm text-ink">
          {[
            `${PLANS[entitlement].name} features and order limit for ${TRIAL_DAYS} days`,
            'True profit, Health Score, six leaks with £ impact',
            'TikTok Shop UK (Beta): Excel import coming soon',
          ].map((p) => (
            <li key={p} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              {p}
            </li>
          ))}
        </ul>
      ) : null}

      {!changing ? (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
            Billing country
          </span>
          <select
            className="min-h-11 w-full rounded-[10px] border border-border bg-elevated px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-[var(--ring)]"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            {BUYER_COUNTRY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {BUYER_COUNTRY_LABELS[code] ?? code}
              </option>
            ))}
          </select>
          {!ALLOWED_BUYER_COUNTRIES.has(country.toUpperCase()) ? (
            <span className="mt-1 block text-xs text-danger">{en.countryBlocked}</span>
          ) : null}
        </label>
      ) : null}

      {!changing ? (
        <label className="mb-3 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={acceptLegal}
            onChange={(e) => setAcceptLegal(e.target.checked)}
          />
          <span>
            I agree to the{' '}
            <a className="text-accent underline-offset-2 hover:underline" href="/legal/terms">
              Terms
            </a>{' '}
            and{' '}
            <a className="text-accent underline-offset-2 hover:underline" href="/legal/refunds">
              Refunds policy
            </a>{' '}
            before starting Checkout.
          </span>
        </label>
      ) : null}

      {message ? <p className="mb-3 text-sm text-subtle">{message}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() => {
            if (!user) {
              setMessage('Sign in with a verified email first.')
              return
            }
            if (changing) {
              void changePlan()
              return
            }
            if (!acceptLegal) {
              setMessage('Accept the Terms and Refunds policy before Checkout.')
              return
            }
            void unlockProDemo(country, selected, interval).then((res) => setMessage(res.message))
          }}
        >
          {changing ? (busy ? 'Updating…' : `Change to ${PLANS[selected].name}`) : PRIMARY_TRIAL_CTA}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setUpgradeOpen(false)}>
          Not now
        </Button>
      </div>

      {!hasPaidAccess(access) && isDemoHarnessEnabled() ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
            Demo · delayed payment
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={paymentPending}
              onClick={() => {
                setPaymentPending(true)
                setMessage(en.paymentProcessing)
              }}
            >
              Mark payment pending
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!paymentPending}
              onClick={() => {
                const res = failDelayedPayment()
                setMessage(res.message)
              }}
            >
              Simulate payment failed
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
