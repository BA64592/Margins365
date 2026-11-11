import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PRODUCT_NAME } from '../../lib/brand'
import { en } from '../../i18n/en'
import {
  MULTI_PLATFORM_LINE,
  PRIMARY_TRIAL_CTA,
  TIKTOK_COMING_SOON,
  TRIAL_DAYS,
  formatGbp,
  PLANS,
} from '../../lib/plans'
import { Button } from '../ui'
import { HelpTip } from '../ui/HelpTip'
import {
  ChartsDashboardMock,
  LeaksDashboardMock,
  OverviewDashboardMock,
  ToolsDashboardMock,
} from './DashboardShowcase'
import { DiagnosisPreview } from './DiagnosisPreview'

function SectionIntro({
  eyebrow,
  title,
  body,
  className = '',
}: {
  eyebrow: string
  title: string
  body: string
  className?: string
}) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 font-[family-name:var(--font-marketing)] text-[1.75rem] font-semibold tracking-tight text-navy sm:text-3xl lg:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-base text-subtle sm:text-lg">{body}</p>
    </div>
  )
}

function Expandable({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-display text-lg font-semibold text-navy">{title}</span>
        <span className={`text-accent transition ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open ? <div className="pb-5 text-sm leading-relaxed text-subtle sm:text-base">{children}</div> : null}
    </div>
  )
}

const PRODUCT_CARDS = [
  {
    title: 'True profit',
    body: 'See what you actually keep after product, packaging, shipping, ads, fees and returns.',
    tip: `Every figure has ${en.showTheMaths}. Net margin is true profit divided by revenue. Overheads are included on Growth, Pro and Scale.`,
  },
  {
    title: 'Health Score',
    body: 'Get a 0–100 score for each shop, with a plain-English reading of how healthy it is.',
    tip: 'The score has a band (Strong, Needs attention or At risk) and a confidence label based on the data you uploaded. The full score and breakdown are included on every plan.',
  },
  {
    title: 'Ranked leaks, in pounds',
    body: 'See the six leaks that are costing you money this month, largest first.',
    tip: 'The six leaks are unprofitable ads, high returns, loss-making products, shipping subsidy, fee drag (fees higher than the usual platform rate) and thin pricing.',
  },
  {
    title: 'Where the money goes',
    body: 'See how costs split across your products, with losses marked clearly.',
    tip: 'A chart shows the share of costs and true profit by product. Some people call the cost-share chart an allocation chart.',
  },
  {
    title: 'Price and ads calculators',
    body: 'See the price you need to hit your target margin, and whether your ads are paying for themselves.',
    tip: 'Break-even ROAS is how much revenue you need per £1 of ads. ACOS is ad spend as a share of revenue. Target-margin pricing works across the platforms you use.',
  },
  {
    title: 'Try a change before you make it',
    body: 'Model a price or cost change and download a PDF of the results — on Growth, Pro and Scale.',
    tip: 'Growth includes two saved scenarios; Pro and Scale include unlimited saved scenarios. The PDF sits beside the results, not in the page header. Starter does not include saved scenarios or the PDF.',
  },
]

export function HomePage() {
  const { setRoute, setUpgradeOpen, setAuthOpen, user } = useApp()

  return (
    <div>
      {/* K48 + K54: content-fit hero — sample card centred in green panel */}
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-2 lg:gap-10 lg:py-16">
          <div className="mkt-hero-copy min-w-0">
            <p className="font-display text-4xl font-bold tracking-tight text-navy sm:text-5xl lg:text-6xl">
              {PRODUCT_NAME}
            </p>
            <p className="mt-3 text-sm font-medium text-accent sm:text-base">{MULTI_PLATFORM_LINE}</p>
            <h1 className="mt-4 font-[family-name:var(--font-marketing)] text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-navy sm:text-4xl lg:text-[2.5rem]">
              Know your true profit and where it leaks
            </h1>
            <p className="mt-4 max-w-xl text-base text-subtle sm:text-lg">
              Connect your channels and fix margin leaks in under 60 seconds. {en.positioning}
            </p>
          </div>
          {/* K55 — revert K54 equal-inset green panel; restore K48 paired visual */}
          <div className="mkt-hero-visual min-h-[280px] overflow-hidden rounded-[14px] sm:min-h-[340px]">
            <DiagnosisPreview className="h-full min-h-[280px] sm:min-h-[340px]" />
          </div>
        </div>
      </section>

      {/* K49 + K54/K55 — centred Product section; headline drops “in pounds” */}
      <section className="border-b border-border bg-elevated">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-14 text-center sm:px-6 sm:py-16">
          <SectionIntro
            className="mx-auto text-center [&_p]:mx-auto"
            eyebrow="Product"
            title="See where your profit is leaking."
            body="Upload your platform reports. We’ll show your true profit, a Health Score and the six leaks that are costing you the most this month — then the first fix to make."
          />
          <p className="mt-5 w-full max-w-2xl rounded-[10px] border border-border bg-bg px-4 py-3 text-left text-sm text-ink sm:text-center">
            <span className="font-semibold">Sample result:</span> on this example shop, the biggest leak
            is costing £840 a month.
            <span className="mt-1 block text-xs text-subtle">
              True profit for the period shown is £2,691. Health Score 69. This is labelled sample data,
              not a live customer result.
            </span>
          </p>
          <div className="mt-10 grid w-full gap-x-8 gap-y-6 text-left sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_CARDS.map((item) => (
              <div key={item.title} className="border-t border-accent/30 pt-4">
                <h3 className="font-display text-lg font-semibold text-navy">
                  <HelpTip label={item.title}>{item.tip}</HelpTip>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-subtle sm:text-base">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <SectionIntro
            eyebrow="Dashboard"
            title="KPI summary first — then the work"
            body="Persistent sidebar, period and platform filters, and modular widgets on one continuous canvas."
          />
          <OverviewDashboardMock />
        </div>
      </section>

      <section className="border-y border-border bg-[linear-gradient(180deg,#f5f7fb_0%,#eef6f5_48%,#f5f7fb_100%)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="order-2 lg:order-1">
              <LeaksDashboardMock />
            </div>
            <div className="order-1 lg:order-2">
              <SectionIntro
                eyebrow="Leaks"
                title="Six margin leaks with monthly £ impact"
                body={`Every leak is ordered by what it costs you this month — with ${en.showTheMaths} on every figure.`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <SectionIntro
            eyebrow="Visuals"
            title="Charts built for decisions, not decoration"
            body="Minimal grids, high-contrast bars, and losses marked in red — teal and navy do the rest."
          />
          <ChartsDashboardMock />
        </div>
      </section>

      <section className="border-y border-border bg-elevated">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="order-2 lg:order-1">
              <ToolsDashboardMock />
            </div>
            <div className="order-1 lg:order-2">
              <SectionIntro
                eyebrow="Tools"
                title="Calculators and scenarios in the same shell"
                body="Break-even ROAS / ACOS / price, target-margin pricing, saved scenarios on Growth+, and PDF export beside the diagnosis."
              />
            </div>
          </div>
        </div>
      </section>

      {/* K54 — Get Started directly under Tools, centred */}
      <section className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-14 text-center sm:px-6 sm:py-16">
          <SectionIntro
            className="mx-auto text-center [&_p]:mx-auto"
            eyebrow="Get started"
            title="What you need, and how it works"
            body="Tap to open. Designed for phone and tablet — no hover-only help."
          />
          <div className="mt-8 w-full max-w-3xl text-left">
            <Expandable title="What files do I need?">
              <p>You upload reports you already download from your sales platforms. We never connect to your store.</p>
              <ul className="mt-3 space-y-3">
                <li>
                  <strong className="text-ink">Shopify.</strong> In Shopify Admin go to Orders → Export and
                  download the Orders CSV. For actual payment fees, also download your Shopify Payments
                  transactions CSV (optional).
                </li>
                <li>
                  <strong className="text-ink">Amazon.</strong> In Seller Central go to Payments → Reports
                  Repository → Transaction, and download a Custom Unified Transaction CSV. This file uses
                  posting dates.
                </li>
                <li>
                  <strong className="text-ink">Etsy.</strong> Download both the Orders CSV and the Order Items
                  CSV (both are required). The Monthly Statement is optional and is used for actual
                  card-processing fees.
                </li>
                <li>
                  <strong className="text-ink">{TIKTOK_COMING_SOON}.</strong> Upload is not available yet —
                  no export steps until the reader ships.
                </li>
              </ul>
              <p className="mt-3">
                You can also enter costs with the product CSV template or type them in. Buyer names, emails,
                addresses and similar personal details are removed at import and are never stored.
              </p>
              <p className="mt-3">
                Your plan decides how many of these platforms you can use at once (Starter 1 of 3, Growth up
                to 2 of 3, Pro and Scale all 3). {TIKTOK_COMING_SOON}.
              </p>
            </Expandable>
            <Expandable title="How to use this platform">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Start your 14-day free trial and choose a plan.</li>
                <li>Add your shop and pick the platform it uses.</li>
                <li>Download the Shopify, Amazon or Etsy files above and upload them.</li>
                <li>Add your product costs (and ads, shipping or overheads if you have them).</li>
                <li>
                  Review the import, then see your true profit, Health Score and the ranked fixes to make
                  first.
                </li>
              </ol>
              <p className="mt-3">
                Prefer to look around first?{' '}
                <button
                  type="button"
                  className="font-semibold text-accent underline"
                  onClick={() => setRoute('sample')}
                >
                  Open the sample report
                </button>
                .
              </p>
            </Expandable>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-[linear-gradient(135deg,#061f45_0%,#0a3d38_55%,#34726b_100%)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7FC4BA]">Start here</p>
              <h2 className="mt-2 font-[family-name:var(--font-marketing)] text-[1.75rem] font-semibold tracking-tight text-white sm:text-4xl">
                {TRIAL_DAYS} days free on every plan
              </h2>
              <p className="mt-3 max-w-xl text-base text-white/75">
                Cancel before your trial ends (date shown at Checkout and in Plan & billing) and pay nothing. Your trial includes the plan you choose —
                its features and order limit. Same charge date shown at checkout.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  className="bg-white text-navy hover:bg-white/90"
                  onClick={() => setUpgradeOpen(true)}
                >
                  {PRIMARY_TRIAL_CTA}
                </Button>
                <Button
                  variant="ghost"
                  className="text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => setRoute('sample')}
                >
                  Sample shop
                </Button>
                <Button
                  variant="ghost"
                  className="text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => setRoute('pricing')}
                >
                  Compare plans
                </Button>
              </div>
            </div>
            <div className="rounded-[14px] border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7FC4BA]">Most popular</p>
              <p className="mt-2 font-display text-2xl font-semibold text-white">
                Pro · {formatGbp(PLANS.pro.monthlyGbp)}/mo
              </p>
              <p className="mt-2 text-sm text-white/75">
                {PLANS.pro.orderLimit.toLocaleString('en-GB')} orders · all 3 platforms · 24 months history
                · scenarios &amp; PDF. Try Pro free for 14 days.
              </p>
              <Button
                className="mt-5 bg-white text-navy hover:bg-white/90"
                size="sm"
                onClick={() => setUpgradeOpen(true)}
              >
                Choose Pro
              </Button>
            </div>
          </div>
          <p className="mt-10 text-sm text-white/55">
            {user ? 'Manage your account · ' : 'Already have an account? '}
            <button type="button" className="underline underline-offset-2" onClick={() => setAuthOpen(true)}>
              {user ? 'Account' : 'Sign in'}
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}
