import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { Button, Input, SectionHeading } from '../ui'

/** K70 — Info (business profile). Phone optional. */
export function AccountInfoPage() {
  const { user, setAuthOpen, updateProfile, setRoute } = useApp()
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('GB')
  const [address, setAddress] = useState('')
  const [vat, setVat] = useState('')
  const [website, setWebsite] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setFullName(user.fullName || '')
    setBusinessName(user.businessName || '')
    setPhone(user.phone || '')
  }, [user, setAuthOpen])

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-subtle">Sign in to manage your Info.</p>
      </main>
    )
  }

  const save = async () => {
    setMsg(null)
    if (!fullName.trim() || !businessName.trim()) {
      setMsg('Name and business name are required.')
      return
    }
    setBusy(true)
    try {
      const res = await updateProfile({
        fullName: fullName.trim(),
        businessName: businessName.trim(),
        phone: phone.trim(),
        enabledPlatforms: user.enabledPlatforms || undefined,
      })
      // Local-only extras until server columns ship
      try {
        localStorage.setItem(
          'm365_info_extra',
          JSON.stringify({ country, address, vat, website }),
        )
      } catch {
        // ignore
      }
      setMsg(res.ok ? res.message : res.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <SectionHeading
        eyebrow="Account"
        title="Info"
        description="Business profile and sign-in details. Phone is optional."
      />
      <div className="grid gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Name</span>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Business name</span>
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Email</span>
          <Input value={user.email} disabled />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Phone (optional)</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Country</span>
          <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Business address (optional)</span>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">VAT number (optional)</span>
          <Input value={vat} onChange={(e) => setVat(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Website (optional)</span>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save Info'}
        </Button>
        <Button variant="ghost" onClick={() => setRoute('app')}>
          Control room
        </Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-subtle">{msg}</p> : null}
    </main>
  )
}
