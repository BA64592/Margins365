import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PLANS, type PlanId } from '../../lib/plans'
import { Button, Input, SectionHeading } from '../ui'

/** K68 — team / seats UI (invite list local until server invites land). */
export function TeamPage() {
  const { user, plan, setAuthOpen, setUpgradeOpen } = useApp()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('m365_team_invites') || '[]') as string[]
    } catch {
      return []
    }
  })
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!user) setAuthOpen(true)
  }, [user, setAuthOpen])

  const seats =
    plan === 'starter' || plan === 'growth' || plan === 'pro' || plan === 'scale'
      ? PLANS[plan as PlanId].seats
      : 1
  const used = 1 + pending.length

  const invite = () => {
    setMsg(null)
    if (plan !== 'pro' && plan !== 'scale') {
      setUpgradeOpen(true)
      setMsg('Team seats are on Pro (2) and Scale (5).')
      return
    }
    const e = email.trim().toLowerCase()
    if (!e.includes('@')) {
      setMsg('Enter a valid email.')
      return
    }
    if (used >= seats) {
      setMsg(`This plan includes ${seats} seat${seats === 1 ? '' : 's'}.`)
      return
    }
    if (pending.includes(e) || e === user?.email) {
      setMsg('That person is already on the team or invited.')
      return
    }
    const next = [...pending, e]
    setPending(next)
    localStorage.setItem('m365_team_invites', JSON.stringify(next))
    setEmail('')
    setMsg('Invite saved for this browser. Server email invites ship with the seats API.')
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-subtle">Sign in to manage team seats.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <SectionHeading
        eyebrow="Account"
        title="Team"
        description={`${used} of ${seats} seats used (owner counts as one).`}
      />
      <ul className="space-y-2 text-sm">
        <li className="rounded-2xl border border-border bg-elevated px-4 py-3">
          <span className="font-semibold">{user.email}</span>
          <span className="ml-2 text-subtle">Owner · active</span>
        </li>
        {pending.map((e) => (
          <li key={e} className="rounded-2xl border border-border bg-elevated px-4 py-3">
            {e}
            <span className="ml-2 text-subtle">Pending invite</span>
            <button
              type="button"
              className="ml-3 text-xs font-semibold text-danger"
              onClick={() => {
                const next = pending.filter((x) => x !== e)
                setPending(next)
                localStorage.setItem('m365_team_invites', JSON.stringify(next))
              }}
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Invite email</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Button onClick={invite}>Send invite</Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-subtle">{msg}</p> : null}
    </main>
  )
}
