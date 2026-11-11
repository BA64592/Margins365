import { useState } from 'react'
import {
  HARD_LIMITS_FAQ,
  HARD_LIMITS_FAQ_GROUPS,
  HARD_LIMITS_FAQ_HELP_ORDER,
  HELP_SIGN_IN_FAQ,
  type HardLimitsFaqEntry,
} from '../../content/hard-limits-faq'
import { useApp } from '../../context/AppContext'
import { PRODUCT_NAME } from '../../lib/brand'
import { FaqAccordion } from '../FaqAccordion'
import { Button, Input, Modal } from '../ui'

/** K65 / K84 / K87 — Help centre: shared FAQ + Contact us. */
export function HelpPage() {
  const { user, setAuthOpen, setRoute } = useApp()
  const [name, setName] = useState(user?.fullName || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [business, setBusiness] = useState(user?.businessName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [country, setCountry] = useState('GB')
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [filledAt] = useState(() => Date.now())
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)

  const submit = async () => {
    setStatus(null)
    if (!name.trim() || !email.trim().includes('@') || !country.trim() || !message.trim()) {
      setStatus('Name, email, country and message are required.')
      return
    }
    if (message.trim().length < 10 || message.trim().length > 5000) {
      setStatus('Message must be 10–5,000 characters.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          businessName: business.trim(),
          email: email.trim(),
          country: country.trim(),
          message: message.trim(),
          companyWebsite: honeypot,
          filledAt,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      if (!res.ok || !data.ok) {
        setStatus(data.message || 'Could not send your message. Try again shortly.')
        return
      }
      setMessage('')
      setStatus(data.message || 'Thanks — we have your message.')
      setPopupOpen(true)
    } catch {
      setStatus('We couldn’t reach Margins365. Check your connection and try again.')
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
        <div className="mt-6 space-y-8">
          {HARD_LIMITS_FAQ_GROUPS.map((group: { id: HardLimitsFaqEntry['group']; title: string }) => {
            const ids = HARD_LIMITS_FAQ_HELP_ORDER[group.id]
            const entries = ids
              .map((id: string) => HARD_LIMITS_FAQ.find((e: HardLimitsFaqEntry) => e.id === id))
              .filter((e): e is HardLimitsFaqEntry => Boolean(e))
            return (
              <div key={group.id}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                  {group.title}
                </h3>
                <FaqAccordion
                  entries={entries}
                  itemClassName="border-t border-border"
                  renderAnswer={(entry: HardLimitsFaqEntry) => {
                    if (entry.id === 'suggest-feature') {
                      return (
                        <div className="space-y-2">
                          <p>{entry.answer}</p>
                          <p>
                            <button
                              type="button"
                              className="font-semibold text-accent underline underline-offset-2"
                              onClick={() => {
                                if (user) {
                                  setRoute('account-billing')
                                  window.location.hash = 'suggest-feature'
                                } else {
                                  try {
                                    sessionStorage.setItem('m365:afterAuth', 'suggest')
                                  } catch {
                                    /* ignore */
                                  }
                                  setAuthOpen(true)
                                }
                              }}
                            >
                              Suggest a feature
                            </button>
                            {!user ? ' — sign in first, then we’ll take you to the form.' : '.'}
                          </p>
                          <p>
                            <a
                              href="/help#contact"
                              className="font-semibold text-accent underline underline-offset-2"
                              onClick={(e) => {
                                e.preventDefault()
                                document.getElementById('contact')?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'start',
                                })
                                window.history.replaceState({}, '', '/help#contact')
                              }}
                            >
                              Contact us
                            </a>
                          </p>
                        </div>
                      )
                    }
                    return <p>{entry.answer}</p>
                  }}
                />
              </div>
            )
          })}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-navy">Sign-in and account</h2>
        <FaqAccordion
          entries={HELP_SIGN_IN_FAQ.map((e: { id: string; question: string; answer: string }) => ({
            id: e.id,
            order: 0,
            group: 'feedback-contact' as const,
            question: e.question,
            answer: e.answer,
          }))}
        />
      </section>

      <section id="contact" className="mt-12 scroll-mt-24">
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
              maxLength={5000}
              required
            />
          </label>
          {/* K84 honeypot — hidden from users */}
          <label className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            Company website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
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

      <Modal open={popupOpen} onClose={() => setPopupOpen(false)} title="Message sent">
        <p className="text-sm text-ink">
          Thanks — we have your message. We read every message, but we can’t promise a reply time.
        </p>
        <Button className="mt-4" onClick={() => setPopupOpen(false)}>
          Close
        </Button>
      </Modal>
    </main>
  )
}
