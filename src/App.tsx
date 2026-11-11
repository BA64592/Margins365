import { useEffect } from 'react'
import { AccountInfoPage } from './components/account/AccountInfoPage'
import { ShopsPage } from './components/account/ShopsPage'
import { TeamPage } from './components/account/TeamPage'
import { AuthModal } from './components/AuthModal'
import { BrowserSupportBanner } from './components/BrowserSupportBanner'
import { ConsentBanner } from './components/ConsentBanner'
import { CalculatorsPanel } from './components/CalculatorsPanel'
import { CostCharts } from './components/CostCharts'
import {
  DashboardShell,
  dashDomId,
  type DashSection,
} from './components/dashboard/DashboardShell'
import { LazyMount } from './components/dashboard/LazyMount'
import { HealthScorePanel } from './components/HealthScorePanel'
import { InactivityBanner } from './components/InactivityBanner'
import { ReverseTrialBanner } from './components/ReverseTrialBanner'
import { LeaksPanel } from './components/LeaksPanel'
import { MetricStrip } from './components/MetricStrip'
import { HelpPage } from './components/marketing/HelpPage'
import { HomePage } from './components/marketing/HomePage'
import { LegalPage } from './components/marketing/LegalPage'
import { MarketingChrome } from './components/marketing/MarketingChrome'
import { NotFoundPage } from './components/marketing/NotFoundPage'
import { LandingPage } from './components/marketing/LandingPage'
import { PublicCalculatorPage } from './components/marketing/PublicCalculatorPage'
import { SampleReportPage } from './components/marketing/SampleReportPage'
import { PricingPage } from './components/PricingPage'
import { SettingsBar } from './components/SettingsBar'
import { LEGAL_BY_ROUTE } from './content/legal'
import { ProductWorkspace } from './components/ProductWorkspace'
import { RecommendationsPanel } from './components/RecommendationsPanel'
import { SavedDatasets } from './components/SavedDatasets'
import { ScenarioCompare } from './components/ScenarioCompare'
import { UpgradeModal } from './components/UpgradeModal'
import { Button, Modal } from './components/ui'
import { AppProvider, useApp } from './context/AppContext'
import { en } from './i18n/en'
import { PRODUCT_NAME } from './lib/brand'

/** K90 — trial-start confirmation after Checkout return. */
function TrialConfirmHost() {
  const { trialConfirm, dismissTrialConfirm } = useApp()
  if (!trialConfirm?.open) return null
  return (
    <Modal open onClose={dismissTrialConfirm} title={trialConfirm.title}>
      <p className="text-sm text-ink">{trialConfirm.body}</p>
      <Button className="mt-4" onClick={dismissTrialConfirm}>
        Close
      </Button>
    </Modal>
  )
}

/** K87 — after sign-in from Suggest a feature, open the form. */
function AfterAuthRedirect() {
  const { user, setRoute, setAuthOpen } = useApp()
  useEffect(() => {
    if (!user) return
    let intent: string | null = null
    try {
      intent = sessionStorage.getItem('m365:afterAuth')
      if (intent) sessionStorage.removeItem('m365:afterAuth')
    } catch {
      return
    }
    if (intent !== 'suggest') return
    setAuthOpen(false)
    setRoute('account-billing')
    requestAnimationFrame(() => {
      window.location.hash = 'suggest-feature'
      document.getElementById('suggest-feature')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [user, setRoute, setAuthOpen])
  return null
}

function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrowserSupportBanner />
      <MarketingChrome>{children}</MarketingChrome>
      <UpgradeModal />
      <AuthModal />
      <ConsentBanner />
    </>
  )
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <BrowserSupportBanner />
      <MarketingChrome>{children}</MarketingChrome>
      <UpgradeModal />
      <AuthModal />
      <ConsentBanner />
    </div>
  )
}

function SectionFrame({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: DashSection
  eyebrow: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={dashDomId(id)}
      data-dash-section={id}
      className="scroll-mt-[8.5rem] space-y-6 border-b border-border/70 pb-12 last:border-b-0 last:pb-4"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{eyebrow}</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-navy sm:text-3xl">
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-subtle">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** Continuous-scroll Control Room — every module on one canvas. */
function DashboardMain() {
  const { setRoute } = useApp()

  return (
    <>
      <InactivityBanner />
      <ReverseTrialBanner />
      <main className="mx-auto max-w-6xl space-y-12 px-4 py-6 sm:px-6 sm:py-8">
        <SectionFrame
          id="overview"
          eyebrow="Overview"
          title="Profit diagnosis"
          description="KPI summary first, then ranked fixes. Sticky filters above recalculate the canvas for period and platforms."
        >
          <MetricStrip />
          <RecommendationsPanel />
        </SectionFrame>

        <SectionFrame
          id="workspace"
          eyebrow="Upload"
          title="Connect your channels"
          description="Import Shopify, Amazon or Etsy files. TikTok Shop UK (Beta): Excel import coming soon. No live store connection required."
        >
          <div id="workspace">
            <ProductWorkspace />
          </div>
        </SectionFrame>

        <SectionFrame
          id="leaks"
          eyebrow="Leaks"
          title="Six margin leaks, ranked by £"
          description={`Monthly impact in your currency — with ${en.showTheMaths} on every figure.`}
        >
          <LazyMount label="Preparing leaks…" minHeight={320}>
            <LeaksPanel />
          </LazyMount>
        </SectionFrame>

        <SectionFrame
          id="charts"
          eyebrow="Charts"
          title="Where the money goes"
          description="Allocation and true profit by product. Losses marked in red — platform chips above filter the bars."
        >
          <LazyMount label="Preparing charts…" minHeight={420} rootMargin="360px 0px">
            <div className="space-y-10">
              <HealthScorePanel />
              <CostCharts />
            </div>
          </LazyMount>
        </SectionFrame>

        <SectionFrame
          id="calculators"
          eyebrow="Calculators"
          title="Break-even and target pricing"
          description="ROAS, ACOS and price tools beside the diagnosis — not a separate app."
        >
          <LazyMount label="Preparing calculators…" minHeight={280}>
            <CalculatorsPanel />
          </LazyMount>
        </SectionFrame>

        <SectionFrame
          id="scenarios"
          eyebrow="Scenarios"
          title="Model a change before you ship it"
          description="Compare price or cost adjustments and save scenarios on Growth and above."
        >
          <LazyMount label="Preparing scenarios…" minHeight={280}>
            <ScenarioCompare />
          </LazyMount>
        </SectionFrame>

        <SectionFrame
          id="settings"
          eyebrow="Settings"
          title="Plan, data and preferences"
          description="Saved datasets, billing, tax and download my data."
        >
          <LazyMount label="Preparing settings…" minHeight={240}>
            <div className="space-y-10">
              <SavedDatasets />
              <SettingsBar />
            </div>
          </LazyMount>
        </SectionFrame>
      </main>
      <footer className="border-t border-border px-4 py-8 text-center text-sm text-subtle sm:px-6">
        <p className="font-display text-base font-bold text-navy">{PRODUCT_NAME}</p>
        <p className="mt-1">{en.tagline}</p>
        <p className="mt-2">{en.platformsLaunchLine}</p>
        <p className="mt-4 flex flex-wrap justify-center gap-3 text-xs">
          <Button variant="ghost" size="sm" onClick={() => setRoute('home')}>
            Home
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRoute('sample')}>
            Sample shop
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRoute('pricing')}>
            Pricing
          </Button>
        </p>
      </footer>
    </>
  )
}

function ProductShell() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <BrowserSupportBanner />
      <DashboardShell>
        <DashboardMain />
      </DashboardShell>
      <UpgradeModal />
      <AuthModal />
      <ConsentBanner />
    </div>
  )
}

function AppShell() {
  return (
    <>
      <AfterAuthRedirect />
      <TrialConfirmHost />
      <AppShellRoutes />
    </>
  )
}

function AppShellRoutes() {
  const { route } = useApp()

  if (route === 'home') {
    return (
      <MarketingShell>
        <HomePage />
      </MarketingShell>
    )
  }
  if (route === 'pricing') {
    return (
      <MarketingShell>
        <PricingPage />
      </MarketingShell>
    )
  }
  if (route === 'sample') {
    return (
      <MarketingShell>
        <SampleReportPage />
      </MarketingShell>
    )
  }
  if (route === 'help') {
    return (
      <MarketingShell>
        <HelpPage />
      </MarketingShell>
    )
  }
  if (route === 'account-info') {
    return (
      <AccountShell>
        <AccountInfoPage />
      </AccountShell>
    )
  }
  if (route === 'account-billing' || route === 'account-data') {
    return (
      <AccountShell>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <SettingsBar />
        </main>
      </AccountShell>
    )
  }
  if (route === 'app-shops') {
    return (
      <AccountShell>
        <ShopsPage />
      </AccountShell>
    )
  }
  if (route === 'app-team') {
    return (
      <AccountShell>
        <TeamPage />
      </AccountShell>
    )
  }
  if (route === 'calc-etsy') {
    return (
      <MarketingShell>
        <PublicCalculatorPage kind="etsy" />
      </MarketingShell>
    )
  }
  if (route === 'calc-amazon') {
    return (
      <MarketingShell>
        <PublicCalculatorPage kind="amazon" />
      </MarketingShell>
    )
  }
  if (route === 'calc-shopify') {
    return (
      <MarketingShell>
        <PublicCalculatorPage kind="shopify" />
      </MarketingShell>
    )
  }
  if (route === 'calc-ecommerce') {
    return (
      <MarketingShell>
        <PublicCalculatorPage kind="ecommerce" />
      </MarketingShell>
    )
  }
  if (route === 'landing-profit-leak') {
    return (
      <MarketingShell>
        <LandingPage kind="profit-leak" />
      </MarketingShell>
    )
  }
  if (route === 'landing-multi-channel') {
    return (
      <MarketingShell>
        <LandingPage kind="multi-channel" />
      </MarketingShell>
    )
  }
  if (route in LEGAL_BY_ROUTE) {
    return (
      <MarketingShell>
        <LegalPage route={route} />
      </MarketingShell>
    )
  }
  if (route === 'not-found') {
    return (
      <MarketingShell>
        <NotFoundPage />
      </MarketingShell>
    )
  }

  return <ProductShell />
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
