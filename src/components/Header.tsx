import { Sparkles } from 'lucide-react'
import { AccountMenu } from './AccountMenu'
import { useApp } from '../context/AppContext'
import { PRODUCT_NAME } from '../lib/brand'
import { isDemoHarnessEnabled } from '../lib/demoFlags'
import { PLANS, PRIMARY_TRIAL_CTA, hasPaidAccess } from '../lib/plans'
import { isProfileComplete } from '../lib/types'
import { BrandLockup } from './BrandMark'
import { Badge, Button } from './ui'

function planBadgeLabel(plan: string, access: string, trialEntitlement: string | null | undefined) {
  if (access === 'trial' && trialEntitlement) {
    const id = trialEntitlement as 'starter' | 'growth' | 'pro' | 'scale'
    return `Trying ${PLANS[id].name}`
  }
  if (plan === 'legacy') return 'Pro (lifetime)'
  if (plan === 'starter' || plan === 'growth' || plan === 'pro' || plan === 'scale') {
    return PLANS[plan].name
  }
  return 'Sample'
}

export function Header({
  sticky = true,
  compact = false,
}: {
  sticky?: boolean
  compact?: boolean
}) {
  const {
    plan,
    access,
    trialEntitlement,
    setUpgradeOpen,
    switchToFree,
    setAuthOpen,
    user,
    setRoute,
  } = useApp()

  const subscribed = hasPaidAccess(access)

  return (
    <header
      className={`${sticky ? 'sticky top-0 z-40' : ''} ${compact ? '' : 'border-b border-border/80 bg-bg/80 backdrop-blur-xl'}`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 ${compact ? 'py-2.5' : 'py-3'}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="min-w-0"
            onClick={() => setRoute(user && subscribed ? 'app' : 'home')}
            aria-label={PRODUCT_NAME}
          >
            <BrandLockup />
          </button>
          <Badge tone={subscribed ? 'pro' : 'neutral'}>
            {planBadgeLabel(plan, access, trialEntitlement)}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setRoute('home')}>
            Home
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setRoute('sample')}
          >
            Sample shop
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setRoute('pricing')}
          >
            Pricing
          </Button>
          <AccountMenu variant="app" />
          {!subscribed ? (
            <Button size="sm" onClick={() => setUpgradeOpen(true)}>
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">
                {user ? 'Choose a plan' : PRIMARY_TRIAL_CTA}
              </span>
              <span className="sm:hidden">{user ? 'Plans' : 'Trial'}</span>
            </Button>
          ) : isDemoHarnessEnabled() ? (
            <Button size="sm" variant="secondary" onClick={switchToFree}>
              End access (demo)
            </Button>
          ) : null}
        </div>
      </div>
      {user && !user.emailVerified ? (
        <div className="border-t border-warn/30 bg-warn-soft px-4 py-2 text-center text-xs text-warn sm:px-6">
          Verify your email before your first upload.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setAuthOpen(true)}>
            Verify now
          </button>
        </div>
      ) : null}
      {user && user.emailVerified && !isProfileComplete(user) ? (
        <div className="border-t border-accent/30 bg-accent-soft px-4 py-2 text-center text-xs text-accent sm:px-6">
          Finish your Info (name and business) and choose your platform(s).{' '}
          <button type="button" className="font-semibold underline" onClick={() => setRoute('account-info')}>
            Open Info
          </button>
        </div>
      ) : null}
    </header>
  )
}
