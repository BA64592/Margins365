/**
 * Slice A — localStateFromLicence mapping (F2–F4).
 * Run: npx tsx src/lib/plans.licence.test.ts
 */
import { localStateFromLicence } from './plans'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

{
  const s = localStateFromLicence({ plan: 'starter', licenceState: 'trialing', billingInterval: 'month' })
  assert(s.plan === 'starter', 'starter plan')
  assert(s.access === 'trial', 'trial access')
  assert(s.trialEntitlement === 'starter', 'K69 trial → chosen tier entitlement')
  assert(s.billingInterval === 'month', 'month interval')
}

{
  const s = localStateFromLicence({ plan: 'scale', licenceState: 'trialing' })
  assert(s.trialEntitlement === 'scale', 'Scale trial keeps Scale entitlement')
}

{
  const s = localStateFromLicence({ plan: 'pro', licenceState: 'active' })
  assert(s.plan === 'pro', 'pro stays pro')
  assert(s.access === 'active', 'active not legacy')
  assert(s.trialEntitlement === null, 'no trial entitlement when active')
}

{
  const s = localStateFromLicence({ plan: 'pro', licenceState: 'legacy' })
  assert(s.plan === 'legacy', 'legacy plan')
  assert(s.access === 'legacy', 'legacy access')
}

{
  const s = localStateFromLicence({ plan: 'growth', licenceState: 'canceled' })
  assert(s.plan === 'none', 'canceled → none plan')
  assert(s.access === 'none', 'canceled → none access')
}

{
  const s = localStateFromLicence({ plan: 'free', licenceState: 'none' })
  assert(s.plan === 'none' && s.access === 'none', 'free/none')
}

console.log('plans.licence.test.ts: all assertions passed')
