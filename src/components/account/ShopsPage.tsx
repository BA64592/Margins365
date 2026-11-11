import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PLANS, hasPaidAccess, type PlanId } from '../../lib/plans'
import { Button, Input, SectionHeading } from '../ui'

type Shop = { id: string; name: string }

const STORE_KEY = 'm365_shops'

function loadShops(): Shop[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return [{ id: 'shop_default', name: 'Main shop' }]
    const parsed = JSON.parse(raw) as Shop[]
    return parsed.length ? parsed : [{ id: 'shop_default', name: 'Main shop' }]
  } catch {
    return [{ id: 'shop_default', name: 'Main shop' }]
  }
}

/** K68 — shops UI (client store until server SoT lands). */
export function ShopsPage() {
  const { user, plan, access, setAuthOpen, setUpgradeOpen, setRoute } = useApp()
  const [shops, setShops] = useState<Shop[]>(() => loadShops())
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!user) setAuthOpen(true)
  }, [user, setAuthOpen])

  const maxShops =
    plan === 'starter' || plan === 'growth' || plan === 'pro' || plan === 'scale'
      ? PLANS[plan as PlanId].shops
      : 1
  const canAdd = hasPaidAccess(access) && plan === 'scale' && shops.length < maxShops

  const persist = (next: Shop[]) => {
    setShops(next)
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  }

  const add = () => {
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
    if (shops.some((s) => s.name.toLowerCase() === n.toLowerCase())) {
      setMsg('That shop name is already used.')
      return
    }
    persist([...shops, { id: `shop_${crypto.randomUUID().slice(0, 8)}`, name: n }])
    setName('')
  }

  const rename = (id: string, nextName: string) => {
    const n = nextName.trim()
    if (!n || n.length > 60) return
    persist(shops.map((s) => (s.id === id ? { ...s, name: n } : s)))
  }

  const remove = (id: string) => {
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
    persist(shops.filter((s) => s.id !== id))
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
        description={`Your plan allows ${maxShops} shop${maxShops === 1 ? '' : 's'}. Order limits are account-wide.`}
      />
      <ul className="space-y-3">
        {shops.map((s) => (
          <li key={s.id} className="rounded-2xl border border-border bg-elevated p-4">
            <Input
              defaultValue={s.name}
              onBlur={(e) => rename(s.id, e.target.value)}
              aria-label={`Rename ${s.name}`}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRoute('app')}>
                Open Control room
              </Button>
              {shops.length > 1 ? (
                <Button size="sm" variant="danger" onClick={() => remove(s.id)}>
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
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <Button onClick={add}>{plan === 'scale' ? 'Add shop' : 'Add shop (Scale)'}</Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-subtle">{msg}</p> : null}
    </main>
  )
}
