import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { en } from '../i18n/en'
import { PRODUCT_NAME } from '../lib/brand'
import { isDemoHarnessEnabled } from '../lib/demoFlags'
import { ALLOWED_BUYER_COUNTRIES } from '../lib/payments/provider'
import {
  PLANS,
  PLAN_ORDER,
  PRIMARY_TRIAL_CTA,
  TRIAL_DAYS,
  formatGbp,
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

export function UpgradeModal() {
  const {
    upgradeOpen,
    setUpgradeOpen,
    unlockProDemo,
    user,
    access,
    paymentPending,
    setPaymentPending,
    failDelayedPayment,
  } = useApp()
  const [country, setCountry] = useState('GB')
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [selected, setSelected] = useState<PlanId>('growth')
  const [message, setMessage] = useState<string | null>(null)

  const chargeHint = useMemo(() => trialChargeDateLabel(), [])
  const entitlement = trialEntitlementFor(selected)
  const price =
    interval === 'year' ? PLANS[selected].annualGbp : PLANS[selected].monthlyGbp

  return (
    <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title={`${PRODUCT_NAME} plans`}>
      <p className="mb-3 text-sm text-subtle">
        {PRIMARY_TRIAL_CTA}. You pay nothing today. Cancel any time before {chargeHint} in Plan &amp;
        billing — it takes one click.
      </p>

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
          const cardPrice = interval === 'year' ? def.annualGbp : def.monthlyGbp
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
              <p className="mt-1 text-xs text-subtle">
                {def.orderLimit.toLocaleString('en-GB')} unique orders / month · {def.maxPlatforms} of 3
                platforms
              </p>
            </button>
          )
        })}
      </div>

      {/* K69 checkout disclosure — trial of chosen plan */}
      <div className="mb-4 rounded-[12px] border border-border bg-muted/60 p-3 text-sm leading-relaxed text-ink">
        <p>
          Your {TRIAL_DAYS}-day free trial of <strong>{PLANS[selected].name}</strong> starts today.
          We’ll ask for a card now so your plan can continue after the trial. You pay nothing today.
          Unless you cancel, we will automatically charge {formatGbp(price)} including VAT on{' '}
          {chargeHint} for your {interval === 'year' ? 'annual' : 'monthly'} {PLANS[selected].name}{' '}
          plan. Cancel any time before {chargeHint} in Plan &amp; billing — it takes one click. We’ll
          email you a reminder before you’re charged.
        </p>
        <p className="mt-2 text-subtle">There is no email cancellation route.</p>
      </div>

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

      {message ? <p className="mb-3 text-sm text-subtle">{message}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="flex-1"
          onClick={() => {
            if (!user) {
              setMessage('Sign in with a verified email first.')
              return
            }
            if (hasPaidAccess(access)) {
              setMessage(en.alreadySubscribed)
              return
            }
            void unlockProDemo(country, selected, interval).then((res) => setMessage(res.message))
          }}
        >
          {PRIMARY_TRIAL_CTA}
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
