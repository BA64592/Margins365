import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PLANS, type PlanId } from '../../lib/plans'
import { Button, Input, SectionHeading } from '../ui'

type Invite = { id: string; email: string; status: string; expiresAt?: string }

/** K68 — team / seats UI backed by `/api/team` (server SoT for invites). */
export function TeamPage() {
  const { user, plan, setAuthOpen, setUpgradeOpen } = useApp()
  const [email, setEmail] = useState('')
  const [invites, setInvites] = useState<Invite[]>([])
  const [seatsMax, setSeatsMax] = useState(1)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const planSeats =
    plan === 'starter' || plan === 'growth' || plan === 'pro' || plan === 'scale'
      ? PLANS[plan as PlanId].seats
      : 1

  const load = async () => {
    if (!user) return
    setBusy(true)
    try {
      const res = await fetch('/api/team', { credentials: 'include' })
      const data = (await res.json()) as {
        ok?: boolean
        invites?: Invite[]
        seatsMax?: number
        message?: string
      }
      if (!res.ok || !data.ok) {
        setMsg(data.message || 'Could not load team.')
        return
      }
      setInvites(data.invites || [])
      setSeatsMax(data.seatsMax || planSeats)
      setMsg(null)
    } catch {
      setMsg('Could not reach team API.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    void load()
  }, [user, setAuthOpen])

  const seats = seatsMax || planSeats
  const used = 1 + invites.length

  const invite = async () => {
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
    setBusy(true)
    try {
      const res = await fetch('/api/team/invites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        invites?: Invite[]
        seatsMax?: number
        message?: string
      }
      if (!res.ok || !data.ok) {
        setMsg(data.message || 'Could not create invite.')
        return
      }
      setInvites(data.invites || [])
      if (data.seatsMax) setSeatsMax(data.seatsMax)
      setEmail('')
      setMsg('Invite saved on the server (expires in 7 days). Email delivery follows the seats EML suite.')
    } catch {
      setMsg('Could not create invite.')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/team/invites/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = (await res.json()) as { ok?: boolean; invites?: Invite[]; message?: string }
      if (!res.ok || !data.ok) {
        setMsg(data.message || 'Could not revoke invite.')
        return
      }
      setInvites(data.invites || [])
    } catch {
      setMsg('Could not revoke invite.')
    } finally {
      setBusy(false)
    }
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
        description={`${used} of ${seats} seats used (owner counts as one). Pending invites are stored on the server.`}
      />
      <ul className="space-y-2 text-sm">
        <li className="rounded-2xl border border-border bg-elevated px-4 py-3">
          <span className="font-semibold">{user.businessName || user.email}</span>
          <span className="ml-2 text-subtle">Owner · active</span>
        </li>
        {invites.map((inv) => (
          <li key={inv.id} className="rounded-2xl border border-border bg-elevated px-4 py-3">
            {inv.email}
            <span className="ml-2 text-subtle">Pending invite</span>
            <button
              type="button"
              className="ml-3 text-xs font-semibold text-danger"
              disabled={busy}
              onClick={() => void revoke(inv.id)}
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Invite email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        <Button disabled={busy} onClick={() => void invite()}>
          Send invite
        </Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-subtle">{msg}</p> : null}
    </main>
  )
}
