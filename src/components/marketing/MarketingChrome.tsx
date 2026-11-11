import { LEGAL_FOOTER_LINKS } from '../../content/legal'
import { useApp } from '../../context/AppContext'
import { en } from '../../i18n/en'
import { PRODUCT_NAME } from '../../lib/brand'
import { hasPaidAccess, PRIMARY_TRIAL_CTA } from '../../lib/plans'
import type { AppRoute } from '../../lib/routes'
import { AccountMenu } from '../AccountMenu'
import { BrandLockup } from '../BrandMark'
import { Button } from '../ui'
import { StickyOfferBanner } from './StickyOfferBanner'

const NAV: { id: AppRoute; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'sample', label: 'Sample shop' },
  { id: 'pricing', label: 'Pricing' },
]

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  const { route, setRoute, setAuthOpen, setUpgradeOpen, user, access } = useApp()
  const signedInPaid = Boolean(user && hasPaidAccess(access))

  const primaryCta = () => {
    if (signedInPaid) {
      setRoute('app')
      return
    }
    if (route === 'pricing') {
      const el = document.getElementById('plan-cards')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.setTimeout(() => {
        document.getElementById('plan-card-pro')?.focus({ preventScroll: true })
      }, 400)
      return
    }
    setUpgradeOpen(true)
  }

  const openLegal = (r: AppRoute) => {
    const path =
      r === 'legal-terms'
        ? '/legal/terms'
        : r === 'legal-privacy'
          ? '/legal/privacy'
          : r === 'legal-refunds'
            ? '/legal/refunds-and-cancellation'
            : r === 'legal-dpa'
              ? '/legal/dpa'
              : '/legal/cookies'
    window.open(path, '_blank', 'noopener,noreferrer')
  }

  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="sticky top-0 z-50">
        <StickyOfferBanner showCta={false} />
        <header className="border-b border-border/70 bg-bg/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <a href="/" onClick={(e) => { e.preventDefault(); setRoute('home') }} aria-label={PRODUCT_NAME}>
              <BrandLockup />
            </a>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={
                    item.id === 'home' ? '/' : item.id === 'sample' ? '/sample-shop' : '/pricing'
                  }
                  onClick={(e) => {
                    e.preventDefault()
                    setRoute(item.id)
                  }}
                  className={`inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-medium transition ${
                    route === item.id ? 'bg-muted text-navy' : 'text-subtle hover:text-ink'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              {user ? (
                <AccountMenu variant="marketing" />
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setAuthOpen(true)}>
                  Sign in
                </Button>
              )}
              {!signedInPaid ? (
                <Button size="sm" onClick={primaryCta}>
                  {user ? 'Choose a plan' : PRIMARY_TRIAL_CTA}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={item.id === 'home' ? '/' : item.id === 'sample' ? '/sample-shop' : '/pricing'}
                onClick={(e) => {
                  e.preventDefault()
                  setRoute(item.id)
                }}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-medium ${
                  route === item.id ? 'bg-muted text-navy' : 'text-subtle'
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </header>
      </div>

      {children}

      <footer className="border-t border-border bg-elevated px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-sm">
            <BrandLockup />
            <p className="mt-3 text-sm text-subtle">{en.tagline}</p>
            <p className="mt-2 text-sm text-subtle">{en.platformsLaunchLine}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div className="space-y-2">
              <p className="font-semibold text-navy">Product</p>
              <a href="/" className="block text-subtle hover:text-ink" onClick={(e) => { e.preventDefault(); setRoute('home') }}>
                Home
              </a>
              <a href="/sample-shop" className="block text-subtle hover:text-ink" onClick={(e) => { e.preventDefault(); setRoute('sample') }}>
                Sample shop
              </a>
              <a href="/pricing" className="block text-subtle hover:text-ink" onClick={(e) => { e.preventDefault(); setRoute('pricing') }}>
                Pricing
              </a>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-navy">Help</p>
              <a href="/help" className="block text-subtle hover:text-ink" onClick={(e) => { e.preventDefault(); setRoute('help') }}>
                Help centre
              </a>
              {signedInPaid ? (
                <a href="/app" className="block text-subtle hover:text-ink" onClick={(e) => { e.preventDefault(); setRoute('app') }}>
                  Control room
                </a>
              ) : (
                <button type="button" className="block text-subtle hover:text-ink" onClick={() => setAuthOpen(true)}>
                  Sign in
                </button>
              )}
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-navy">Legal</p>
              {LEGAL_FOOTER_LINKS.map((item) => (
                <button
                  key={item.route}
                  type="button"
                  className="block text-left text-subtle hover:text-ink"
                  onClick={() => openLegal(item.route)}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                className="block text-left text-subtle hover:text-ink"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('m365:cookie-settings'))
                }}
              >
                Cookie settings
              </button>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl text-xs text-subtle">
          © {year} {PRODUCT_NAME}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
