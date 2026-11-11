import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PRODUCT_NAME } from '../../lib/brand'
import { Button, Input } from '../ui'

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel only in Plan & billing (Cancel trial or Cancel subscription). Only the account owner can cancel. There is no email, phone or support-ticket cancellation. You keep access until the trial or paid period ends; then the account is closed, the login is removed, and product data is permanently deleted. Download my data before then.',
  },
  {
    q: 'What happens during the free trial?',
    a: 'Every plan starts with a 14-day free trial of the plan you choose, with that plan’s features and order limit. You add a card at checkout and pay nothing today. Unless you cancel before day 15, we charge your chosen plan automatically. Cancel any time in Plan & billing — one click.',
  },
  {
    q: 'What are the unique-order limits?',
    a: 'Starter 500, Growth 2,000, Pro 5,000, Scale 15,000 unique orders per billing month, shared across all shops. If an upload would take you over the limit, it is blocked and your existing results stay unchanged.',
  },
  {
    q: 'How many shops and seats do I get?',
    a: 'Starter and Growth: 1 shop and 1 seat (the owner). Pro: 1 shop and 2 seats. Scale: up to 3 shops and 5 seats. Only the account owner can cancel, change billing, manage shops or invite the team.',
  },
]

/** K65 — Help centre with Hard limits & billing FAQ + Contact us form. */
export function HelpPage() {
  const { user, setAuthOpen } = useApp()
  const [name, setName] = useState(user?.fullName || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [business, setBusiness] = useState(user?.businessName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [country, setCountry] = useState('GB')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setStatus(null)
    if (!name.trim() || !email.trim().includes('@') || !message.trim()) {
      setStatus('Name, email and message are required.')
      return
    }
    if (message.trim().length > 4000) {
      setStatus('Keep your message under 4,000 characters.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          businessName: business.trim(),
          email: email.trim(),
          country: country.trim(),
          message: message.trim(),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      if (!res.ok || !data.ok) {
        setStatus(data.message || 'Could not send your message. Try again shortly.')
        return
      }
      setMessage('')
      setStatus(data.message || 'Thanks — we have your message. A copy is on its way to your inbox.')
      window.alert('Message sent. Check your email for a copy.')
    } catch {
      setStatus('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Help</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
        Help centre
      </h1>
      <p className="mt-2 text-sm text-subtle">
        Hard limits &amp; billing for {PRODUCT_NAME}, and a Contact us form. This is not a cancellation
        route — cancel only in Plan &amp; billing.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-navy">Hard limits &amp; billing</h2>
        <div className="mt-4 space-y-4">
          {FAQ.map((item) => (
            <details key={item.q} className="rounded-2xl border border-border bg-elevated p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">{item.q}</summary>
              <p className="mt-2 text-sm text-subtle">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-navy">Contact us</h2>
        <p className="mt-1 text-sm text-subtle">
          We read every message. We don’t promise a reply time. Do not use this form to cancel.
        </p>
        {!user ? (
          <p className="mt-3 text-sm text-subtle">
            Already have an account?{' '}
            <button type="button" className="font-semibold text-accent underline" onClick={() => setAuthOpen(true)}>
              Sign in
            </button>{' '}
            so we can match your message faster.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-1">
            <span className="mb-1 block text-xs font-semibold text-subtle">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-subtle">Phone number</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-subtle">Business name</span>
            <Input value={business} onChange={(e) => setBusiness(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-subtle">Email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-subtle">Country</span>
            <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-subtle">Message</span>
            <textarea
              className="min-h-32 w-full rounded-[10px] border border-border bg-elevated px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              required
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? 'Sending…' : 'Send message'}
          </Button>
          {status ? <p className="text-sm text-subtle">{status}</p> : null}
        </div>
      </section>
    </main>
  )
}
