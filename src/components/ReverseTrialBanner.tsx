import { useApp } from '../context/AppContext'
import { PLANS } from '../lib/plans'

/**
 * K69 — trial shows the chosen tier (no reverse-trial / Keep Pro).
 */
export function ReverseTrialBanner() {
  const { access, plan, trialEntitlement, trialEndsAt } = useApp()
  if (access !== 'trial' || !trialEndsAt) return null

  const end = new Date(trialEndsAt)
  const endLabel = end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const entitlement =
    trialEntitlement ?? (plan !== 'none' && plan !== 'legacy' ? plan : null)
  if (!entitlement) return null

  return (
    <div className="border-b border-accent/25 bg-accent-soft px-4 py-2.5 text-sm text-navy sm:px-6">
      You’re on your {PLANS[entitlement].name} free trial until {endLabel}.
    </div>
  )
}
