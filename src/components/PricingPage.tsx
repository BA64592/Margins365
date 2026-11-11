import { Fragment, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { PRODUCT_NAME } from '../lib/brand'
import { en } from '../i18n/en'
import {
  PLANS,
  PLAN_ORDER,
  PRIMARY_TRIAL_CTA,
  SEAT_HELP,
  SHOP_HELP,
  TIKTOK_COMING_SOON,
  TRIAL_DAYS,
  formatGbp,
  trialChargeDateLabel,
  type BillingInterval,
  type PlanId,
} from '../lib/plans'
import { Button } from './ui'

type CompRow = {
  label: string
  /** Plain sub-text under the label (K55 — no (i) / ? on Shops & Seats). */
  sub?: string
  group?: string
  values: Record<PlanId, string>
}

const COMPARISON: CompRow[] = [
  // Diagnosis
  {
    group: 'Diagnosis',
    label: 'True profit & net margin',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Health Score + full breakdown',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Six ranked leaks with £ impact',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Ranked fixes (what to do first)',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Product verdicts',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'SKU charts',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: `${en.showTheMaths} on every figure`,
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  // Calculators
  {
    group: 'Calculators',
    label: 'Target-margin pricing',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Break-even ROAS / ACOS',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Per-channel ROAS',
    values: { starter: '—', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  // Planning
  {
    group: 'Planning',
    label: 'Saved scenarios',
    values: {
      starter: '—',
      growth: '2 saved',
      pro: 'Unlimited',
      scale: 'Unlimited',
    },
  },
  {
    label: 'PDF beside results',
    values: { starter: '—', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  // Costs and tax
  {
    group: 'Costs & tax',
    label: 'Overheads',
    values: { starter: '—', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Own FX rates',
    values: { starter: '—', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: 'Tax',
    values: {
      starter: 'Simple UK/VAT',
      growth: 'Full per-order',
      pro: 'Full',
      scale: 'Full',
    },
  },
  // Account and data (K53 — of 3 usable platforms)
  {
    group: 'Account & data',
    label: 'Unique orders / billing month',
    values: { starter: '500', growth: '2,000', pro: '5,000', scale: '15,000' },
  },
  {
    label: 'Platforms',
    values: {
      starter: '1 of 3',
      growth: 'Up to 2 of 3',
      pro: 'All 3',
      scale: 'All 3',
    },
  },
  {
    label: 'TikTok Shop UK import',
    values: {
      starter: TIKTOK_COMING_SOON,
      growth: TIKTOK_COMING_SOON,
      pro: TIKTOK_COMING_SOON,
      scale: TIKTOK_COMING_SOON,
    },
  },
  {
    label: 'Shops',
    sub: SHOP_HELP,
    values: { starter: '1', growth: '1', pro: '1', scale: 'Up to 3' },
  },
  {
    label: 'History',
    values: {
      starter: '3 months',
      growth: '12 months',
      pro: '24 months',
      scale: 'All history, fair use',
    },
  },
  {
    label: 'Seats',
    sub: SEAT_HELP,
    values: { starter: '1', growth: '1', pro: '2', scale: '5' },
  },
  {
    label: 'Download my data',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Yes' },
  },
  {
    label: '14-day free trial (Pro features on Starter/Growth/Pro)',
    values: { starter: 'Yes', growth: 'Yes', pro: 'Yes', scale: 'Scale trial' },
  },
]

const FAQ = [
  {
    q: 'How do I use this platform?',
    a: 'Start a 14-day free trial and choose a plan. Add your shop and pick the platform it uses (Shopify, Amazon or Etsy). Download the reports you already get from that platform and upload them — we never connect to your store. Add your product costs (and ads, shipping or overheads if you have them). Review the import, then see your true profit, a Health Score and the ranked fixes to make first. You can look at the sample report first if you prefer. TikTok Shop UK Excel import is coming soon.',
  },
  {
    q: 'What exactly is needed to get started?',
    a: 'A verified account and a payment card to start the 14-day free trial — you pay nothing today. You upload reports you already download from your sales platforms. For Shopify, export the Orders CSV (the Shopify Payments transactions CSV is optional). For Amazon, download a Custom Unified Transaction CSV. For Etsy, download both the Orders CSV and the Order Items CSV (the Monthly Statement is optional). TikTok Shop UK (Beta): Excel import coming soon. You can also enter costs with the product CSV template or type them in. Buyer names, emails, addresses and similar personal details are removed at import. Your plan decides how many platforms you can use at once (Starter 1 of 3, Growth up to 2 of 3, Pro and Scale all 3, while TikTok is coming soon).',
  },
  {
    q: 'How can I recommend a new feature I want to see?',
    a: 'Signed in, open Suggest a feature, write a short note and send it. We save it for review. We don’t publish an email address for this, and we can’t promise a reply.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel only in Plan & billing (Cancel trial or Cancel subscription). Only the account owner can cancel. There is no email, phone or support-ticket cancellation. You keep access until the trial or paid period ends; then the account is closed, the login is removed, and product data is permanently deleted. Download my data before then.',
  },
  {
    q: 'What happens after the 14-day trial?',
    a: `Your trial includes the plan you choose — its features and order limit — for ${TRIAL_DAYS} days. Unless you cancel in Plan & billing, we charge that plan on day 15. Cancel any time before then in one click.`,
  },
  {
    q: 'What are shops?',
    a: `${SHOP_HELP} Starter, Growth and Pro include 1 shop. Scale includes up to 3. On Scale, the unique-order limit is counted account-wide across those shops.`,
  },
  {
    q: 'What are seats?',
    a: `${SEAT_HELP} Starter and Growth include 1 seat (the owner). Pro includes 2. Scale includes 5. Only the account owner can cancel.`,
  },
  {
    q: 'What happens if I hit my order limit?',
    a: 'We warn at 80% of your unique-order allowance and name the next plan. If a file would take you over the limit, we import nothing and show the overage — there is no partial import. Your trial uses your chosen plan’s order limit. Re-uploading the same order IDs does not use allowance again.',
  },
  {
    q: 'Is my data safe, and where is it stored?',
    a: 'Buyer names, emails, addresses and similar personal details are stripped at import and are never stored. Original upload files are deleted as soon as they are imported. Product diagnosis data is held for your account while you have access; when access ends after cancel, product data is permanently wiped and the login is removed. Hosting is on DigitalOcean (London) with Stripe for payments and Amazon SES for mail.',
  },
  {
    q: 'Do you connect to my store?',
    a: 'No. You upload the CSV reports you already download from Shopify, Amazon or Etsy. There is no live API connection to your store.',
  },
  {
    q: 'Can I change plan?',
    a: 'Yes. Choose a different plan from Pricing or Plan & billing. During a trial you may change plan; the trial end date stays the same and you are not charged today. Paid upgrades follow the checkout terms shown.',
  },
  {
    q: 'Does the price include VAT?',
    a: 'Yes. Published prices include VAT. Checkout shows the amount including VAT and the charge date before you confirm.',
  },
  {
    q: 'How do order limits work?',
    a: 'Orders count once per billing month — re-uploading the same orders does not use allowance again. Your trial uses your chosen plan’s order limit. We warn at 80% and name the next plan. If a file would take you over, we import nothing and show the overage.',
  },
  {
    q: 'What happens on annual plans?',
    a: 'Pay for 10 months and receive 12. Order usage still resets monthly inside the annual period. Renewal date and terms are shown before checkout.',
  },
]

export function PricingPage() {
  const { setUpgradeOpen, setRoute, setAuthOpen, user } = useApp()
  const [interval, setInterval] = useState<BillingInterval>('month')

  const chargeHint = useMemo(() => trialChargeDateLabel(), [])

  return (
    <main>
      <section
        className="border-b border-border px-4 py-14 sm:px-6 sm:py-16"
        style={{
          background:
            'radial-gradient(90% 60% at 0% 0%, #e7f7f6 0%, transparent 55%), #f5f7fb',
        }}
      >
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Pricing</p>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-marketing)] text-[1.75rem] font-semibold tracking-tight text-navy sm:text-4xl lg:text-5xl">
            {PRODUCT_NAME} plans — {TRIAL_DAYS} days free on every tier
          </h1>
          <p className="mt-4 max-w-2xl text-base text-subtle sm:text-lg">
            14 days free, then your chosen plan. You won’t be charged until{' '}
            <span className="font-semibold text-ink">{chargeHint}</span>. Cancel any time before then in
            one click in Plan &amp; billing. All prices include VAT. Your trial includes the plan you choose
            (Scale trials include Scale). {TIKTOK_COMING_SOON}.
          </p>

          <div className="mt-8 inline-flex rounded-[10px] bg-muted p-1">
            {(['month', 'year'] as BillingInterval[]).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setInterval(iv)}
                className={`min-h-11 rounded-[8px] px-4 text-sm font-semibold transition ${
                  interval === iv ? 'bg-elevated text-navy shadow-sm' : 'text-subtle hover:text-ink'
                }`}
              >
                {iv === 'month' ? 'Monthly' : 'Annual · 10 months for 12'}
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-4 rounded-[14px] border border-navy/15 bg-elevated/90 p-5 sm:grid-cols-[1.2fr_0.8fr] sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-navy">Pro command centre</p>
              <p className="mt-2 font-display text-xl font-semibold text-navy">
                Pro · {formatGbp(interval === 'year' ? PLANS.pro.annualGbp : PLANS.pro.monthlyGbp)}
                {interval === 'year' ? '/year' : '/month'}
              </p>
              <p className="mt-2 text-sm text-subtle">
                5,000 unique orders · all 3 platforms · 24 months history · 2 seats · unlimited
                scenarios. Built for multi-channel merchants who live in the control room daily.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button onClick={() => setUpgradeOpen(true)}>Choose Pro</Button>
              <Button
                variant="ghost"
                onClick={() =>
                  document.getElementById('plan-comparison')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Full comparison
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="plan-cards" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-12 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const def = PLANS[id]
            const price = interval === 'year' ? def.annualGbp : def.monthlyGbp
            return (
              <div
                key={id}
                id={`plan-card-${id}`}
                tabIndex={-1}
                className={`flex flex-col border bg-elevated p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                  def.mostPopular
                    ? 'border-accent ring-1 ring-accent/30'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold text-navy">{def.name}</h2>
                  {id === 'pro' ? (
                    <div className="flex flex-col items-end gap-1">
                      {/* K55 — Command centre above Most popular on Pro */}
                      <span className="rounded-[6px] bg-navy px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Command centre
                      </span>
                      {def.mostPopular ? (
                        <span className="rounded-[6px] bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Most popular
                        </span>
                      ) : null}
                    </div>
                  ) : def.mostPopular ? (
                    <span className="rounded-[6px] bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 font-display text-3xl font-bold text-navy">
                  {formatGbp(price)}
                  <span className="text-sm font-medium text-subtle">
                    {interval === 'year' ? '/year' : '/month'}
                  </span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-subtle">
                  14 days free, then {formatGbp(price)} {interval === 'year' ? 'a year' : 'a month'}{' '}
                  including VAT. You won’t be charged until {chargeHint}. Cancel any time before then in
                  one click.
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-ink">
                  <li>{def.orderLimit.toLocaleString('en-GB')} unique orders / month</li>
                  <li>
                    {def.maxPlatforms} of 3 platforms · {def.shops} shop{def.shops > 1 ? 's' : ''}
                  </li>
                  <li>
                    History:{' '}
                    {def.historyMonths == null ? 'All history, fair use' : `${def.historyMonths} months`}
                  </li>
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={def.mostPopular ? 'primary' : 'secondary'}
                  onClick={() => setUpgradeOpen(true)}
                >
                  Choose {def.name}
                </Button>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-center text-sm text-subtle">{TIKTOK_COMING_SOON}.</p>
      </section>

      <section id="plan-comparison" className="scroll-mt-28 border-y border-border bg-elevated px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-[family-name:var(--font-marketing)] text-[1.75rem] font-semibold text-navy sm:text-3xl">
            Full comparison
          </h2>
          <p className="mt-2 text-sm text-subtle sm:text-base">
            Every plan includes true profit, Health Score, six leaks with £ impact and calculators.
            Your trial matches the plan you choose. {TIKTOK_COMING_SOON}.
          </p>
          <div className="mt-8 overflow-x-auto">
            <p className="mb-2 text-xs text-subtle lg:hidden">Swipe sideways to see all plans →</p>
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-elevated py-3 pr-4 font-semibold text-subtle">
                    Capability
                  </th>
                  {PLAN_ORDER.map((id) => (
                    <th key={id} className="px-3 py-3 font-semibold text-navy">
                      {PLANS[id].name}
                      {PLANS[id].mostPopular ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          · Popular
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <Fragment key={row.label}>
                    {row.group ? (
                      <tr className="border-b border-border/40 bg-muted/40">
                        <td
                          colSpan={5}
                          className="sticky left-0 py-2 pr-4 text-xs font-semibold uppercase tracking-[0.12em] text-subtle"
                        >
                          {row.group}
                        </td>
                      </tr>
                    ) : null}
                    <tr className="border-b border-border/70">
                      <td className="sticky left-0 z-10 bg-elevated py-3 pr-4 text-subtle">
                        <span className="font-medium text-ink">{row.label}</span>
                        {row.sub ? (
                          <span className="mt-1 block max-w-[16rem] text-xs leading-relaxed text-subtle">
                            {row.sub}
                          </span>
                        ) : null}
                      </td>
                      {PLAN_ORDER.map((id) => (
                        <td key={id} className="px-3 py-3 text-ink">
                          {row.values[id]}
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="font-[family-name:var(--font-marketing)] text-[1.75rem] font-semibold text-navy sm:text-3xl">
          Hard limits &amp; billing FAQ
        </h2>
        <div className="mt-8 space-y-0">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-t border-border py-4">
              <summary className="min-h-11 cursor-pointer list-none font-semibold text-navy outline-none marker:content-none">
                <span className="flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-accent transition group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-subtle sm:text-base">{item.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button onClick={() => setUpgradeOpen(true)}>{PRIMARY_TRIAL_CTA}</Button>
          <Button variant="ghost" onClick={() => setRoute('sample')}>
            View sample report
          </Button>
          <Button variant="ghost" onClick={() => setAuthOpen(true)}>
            {user ? 'Account' : 'Sign in'}
          </Button>
        </div>
      </section>
    </main>
  )
}
