import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PLANS, hasPaidAccess, type PlanId } from '../../lib/plans'
import { Button, Input, SectionHeading } from '../ui'

type Shop = { id: string; name: string }

/** K68 — shops UI backed by `/api/shops` (server SoT). */
export function ShopsPage() {
  const { user, plan, access, setAuthOpen, setUpgradeOpen, setRoute } = useApp()
  const [shops, setShops] = useState<Shop[]>([])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const maxShops =
    plan === 'starter' || plan === 'growth' || plan === 'pro' || plan === 'scale'
      ? PLANS[plan as PlanId].shops
      : 1

  const load = async () => {
    if (!user) return
    setBusy(true)
    try {
      const res = await fetch('/api/shops', { credentials: 'include' })
      const data = (await res.json()) as { ok?: boolean; shops?: Shop[]; message?: string }
      if (!res.ok || !data.ok) {
        setMsg(data.message || 'Could not load shops.')
        return
      }
      setShops(data.shops || [])
      setMsg(null)
    } catch {
      setMsg('Could not reach shops API.')
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

  const canAdd = hasPaidAccess(access) && plan === 'scale' && shops.length < maxShops

  const add = async () => {
    setMsg(null)
    if (plan !== 'scale') {
      setUpgradeOpen(true)
      setMsg('Add up to 3 shops on Scale (£199/mo).')
      return
    }
    if (!canAdd) {
      setMsg('Scale includes up to 3 shops.')
      return
    }
    const n = name.trim()
    if (!n || n.length > 60) {
      setMsg('Shop name must be 1–60 characters.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      })
      const data = (await res.json()) as { ok?: boolean; shops?: Shop[]; message?: string }
      if (!res.ok || !data.ok) {
        setMsg(data.message || 'Could not add shop.')
        return
      }
      setShops(data.shops || [])
      setName('')
    } catch {
      setMsg('Could not add shop.')
    } finally {
      setBusy(false)
    }
  }

  const rename = async (id: string, nextName: string) => {
    const n = nextName.trim()
    if (!n || n.length > 60) return
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      })
      const data = (await res.json()) as { ok?: boolean; shops?: Shop[]; message?: string }
      if (!res.ok || !data.ok) {
        setMsg(data.message || 'Could not rename shop.')
        return
      }
      setShops(data.shops || [])
    } catch {
      setMsg('Could not rename shop.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (shops.length <= 1) {
      setMsg('The last shop cannot be removed — use Start Fresh to empty it.')
      return
    }
    const shop = shops.find((s) => s.id === id)
    if (!shop) return
    const typed = window.prompt(`Type ${shop.name} to confirm permanent deletion`)
    if (typed !== shop.name) {
      setMsg('Removal cancelled.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = (await res.json()) as { ok?: boolean; shops?: Shop[]; message?: string }
      if (!res.ok || !data.ok) {
        setMsg(data.message || 'Could not remove shop.')
        return
      }
      setShops(data.shops || [])
    } catch {
      setMsg('Could not remove shop.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-subtle">Sign in to manage shops.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <SectionHeading
        eyebrow="Account"
        title="Shops"
        description={`Your plan allows ${maxShops} shop${maxShops === 1 ? '' : 's'}. Order limits are account-wide. Saved on the server.`}
      />
      <ul className="space-y-3">
        {shops.map((s) => (
          <li key={s.id} className="rounded-2xl border border-border bg-elevated p-4">
            <Input
              defaultValue={s.name}
              onBlur={(e) => void rename(s.id, e.target.value)}
              aria-label={`Rename ${s.name}`}
              disabled={busy}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRoute('app')}>
                Open Control room
              </Button>
              {shops.length > 1 ? (
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove(s.id)}>
                  Remove
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">New shop name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={busy} />
        </label>
        <Button disabled={busy} onClick={() => void add()}>
          {plan === 'scale' ? 'Add shop' : 'Add shop (Scale)'}
        </Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-subtle">{msg}</p> : null}
    </main>
  )
}
