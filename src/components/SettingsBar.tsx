import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { PRODUCT_NAME } from '../lib/brand'
import { en } from '../i18n/en'
import { hasPaidAccess } from '../lib/plans'
import type { HomeCurrency } from '../lib/types'
import { StartFreshButton } from './ConfirmActions'
import { Button, Card, ConfirmDialog, Input, SectionHeading } from './ui'
import { ProGate } from './ProGate'

const CURRENCIES: HomeCurrency[] = ['GBP', 'EUR', 'USD', 'CAD', 'AUD']

export function SettingsBar() {
  const {
    currency,
    setCurrency,
    tax,
    setTax,
    monthlyOverheads,
    setMonthlyOverheads,
    access,
    plan,
    entitlementPlan,
    trialEndsAt,
    accessEndsAt,
    usageUniqueOrderCount,
    orderLimit,
    hasFeature,
    exportDataCsv,
    user,
    keptProData,
    setUpgradeOpen,
    setAuthOpen,
    signOut,
    cancelAccess,
  } = useApp()
  const [overheadsText, setOverheadsText] = useState(() =>
    monthlyOverheads === 0 ? '' : String(monthlyOverheads),
  )
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [suggestText, setSuggestText] = useState('')
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null)
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [logoutAllBusy, setLogoutAllBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  useEffect(() => {
    setOverheadsText((prev) => {
      const parsed = prev.trim() === '' ? 0 : Number(prev)
      if (Number.isFinite(parsed) && parsed === monthlyOverheads) return prev
      return monthlyOverheads === 0 ? '' : String(monthlyOverheads)
    })
  }, [monthlyOverheads])

  const downloadCsv = () => {
    const csv = exportDataCsv()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${PRODUCT_NAME.replace(/\s+/g, '-').toLowerCase()}-data.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const endLabel = trialEndsAt
    ? new Date(trialEndsAt).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'the end of your access period'

  const authBadge =
    user?.authProvider === 'google' ? 'Connected via Google OAuth' : 'Password Auth Active'

  const limit = orderLimit
  const usageLine =
    limit != null
      ? en.orderUsage(usageUniqueOrderCount, limit)
      : `${usageUniqueOrderCount.toLocaleString('en-GB')} unique orders tracked`

  const submitSuggestion = async () => {
    setSuggestMsg(null)
    const text = suggestText.trim()
    if (!user) {
      setAuthOpen(true)
      setSuggestMsg('Sign in to suggest a feature.')
      return
    }
    if (!text) {
      setSuggestMsg('Write a short note.')
      return
    }
    if (text.length > 1000) {
      setSuggestMsg('Keep suggestions to 1,000 characters.')
      return
    }
    setSuggestBusy(true)
    try {
      const res = await fetch('/api/feature-suggestions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      if (!res.ok || !data.ok) {
        setSuggestMsg(data.message || 'Could not save suggestion.')
        return
      }
      setSuggestText('')
      setSuggestMsg(data.message || 'Thanks — saved for review.')
    } catch {
      setSuggestMsg('Could not reach the server.')
    } finally {
      setSuggestBusy(false)
    }
  }

  const signOutAll = async () => {
    setLogoutAllBusy(true)
    setStatusMsg(null)
    try {
      await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    } catch {
      // still clear local session
    }
    signOut()
    setLogoutAllBusy(false)
    setStatusMsg('Signed out of all devices.')
  }

  return (
    <section>
      <SectionHeading
        eyebrow="Account"
        title="Account workspace"
        description="Profile & sign-in, plan & billing, and data & privacy."
      />

      {/* Section 1 — Profile & Sign-In */}
      <Card>
        <p className="mb-1 text-sm font-semibold text-ink">1. Profile &amp; sign-in</p>
        {user ? (
          <div className="space-y-3 text-sm">
            <p className="text-ink">
              Signed in as <span className="font-semibold">{user.email}</span>
            </p>
            <p className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold text-ink">
              {authBadge}
            </p>
            {user.fullName || user.businessName ? (
              <p className="text-subtle">
                {[user.fullName, user.businessName].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAuthOpen(true)}>
                Edit profile
              </Button>
              <Button size="sm" variant="secondary" disabled={logoutAllBusy} onClick={() => void signOutAll()}>
                {logoutAllBusy ? 'Signing out…' : 'Sign out of all devices'}
              </Button>
              <Button size="sm" variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-subtle">Sign in to manage your account.</p>
            <Button size="sm" onClick={() => setAuthOpen(true)}>
              Sign in
            </Button>
          </div>
        )}
        {statusMsg ? <p className="mt-2 text-xs text-subtle">{statusMsg}</p> : null}
      </Card>

      {/* Section 2 — Plan & Billing */}
      <Card className="mt-4">
        <p className="mb-1 text-sm font-semibold text-ink">2. Plan &amp; billing</p>
        <p className="mb-2 text-sm text-subtle">
          {hasPaidAccess(access)
            ? `Access: ${access}${plan && plan !== 'none' ? ` · Plan: ${plan}` : ''}${
                entitlementPlan ? ` · Features: ${entitlementPlan}` : ''
              }`
            : 'Start a 14-day free trial on any plan. Cancel before day 14 and pay nothing.'}
        </p>
        <p className="mb-3 text-xs font-medium text-ink">{usageLine}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setUpgradeOpen(true)}>
            {hasPaidAccess(access) ? 'Change plan' : 'View plans & start trial'}
          </Button>
          {hasPaidAccess(access) && access !== 'canceled_access' ? (
            <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
              {access === 'trial' ? 'Cancel trial' : 'Cancel subscription'}
            </Button>
          ) : null}
          {access === 'canceled_access' ? (
            <p className="text-xs font-medium text-warn">
              Cancellation scheduled
              {accessEndsAt
                ? ` — access ends ${new Date(accessEndsAt).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}`
                : ''}
              . Download your data before then.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-subtle">
          Cancellation closes access at the end date and permanently deletes product data then.
          Download your data first.
        </p>
      </Card>

      {/* Section 3 — Data & Privacy */}
      <Card className="mt-4">
        <p className="mb-1 text-sm font-semibold text-ink">3. Data &amp; privacy</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <button
              type="button"
              className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
              onClick={downloadCsv}
            >
              Download My Data (CSV)
            </button>
            <p className="mt-1 text-xs text-subtle">
              Cleaned order rows and costs only — never the original upload file.
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm text-subtle">
              Start Fresh clears imported shop data while keeping your account and billing.
              {keptProData ? ' Includes any kept legacy data.' : ''}
            </p>
            <StartFreshButton />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
              Home currency
            </span>
            <select
              className="h-10 w-full rounded-lg border border-border bg-elevated px-3"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as HomeCurrency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 text-sm pb-2">
            <input
              type="checkbox"
              checked={tax.pricesIncludeTax}
              onChange={(e) => setTax({ pricesIncludeTax: e.target.checked })}
            />
            <span>Prices include VAT / sales tax / GST</span>
          </label>
        </div>
      </Card>

      {hasFeature('fullTax') || hasFeature('overheads') ? (
        <Card className="mt-4">
          <p className="mb-3 text-sm font-semibold text-ink">Tax settings (estimates, not tax advice)</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-subtle">Business country</span>
              <Input
                value={tax.businessCountry}
                onChange={(e) => setTax({ businessCountry: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm pt-6">
              <input
                type="checkbox"
                checked={tax.vatGstRegistered}
                onChange={(e) => setTax({ vatGstRegistered: e.target.checked })}
              />
              VAT/GST registered
            </label>
            <label className="flex items-center gap-2 text-sm pt-6">
              <input
                type="checkbox"
                checked={tax.euOss}
                onChange={(e) => setTax({ euOss: e.target.checked })}
              />
              EU OSS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tax.euIoss}
                onChange={(e) => setTax({ euIoss: e.target.checked })}
              />
              EU IOSS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tax.ukFlatRate}
                onChange={(e) => setTax({ ukFlatRate: e.target.checked })}
              />
              UK Flat Rate
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-subtle">Monthly overheads</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="0"
                value={overheadsText}
                onChange={(e) => {
                  const raw = e.target.value
                  setOverheadsText(raw)
                  if (raw.trim() === '') {
                    setMonthlyOverheads(0)
                    return
                  }
                  const n = Number(raw)
                  if (Number.isFinite(n)) setMonthlyOverheads(n)
                }}
              />
            </label>
          </div>
        </Card>
      ) : (
        <div className="mt-4">
          <ProGate label="Tax & overheads — Growth+" feature="overheads">
            <Card>
              <p className="text-sm text-subtle">Business country, OSS/IOSS, Flat Rate, US states, overheads.</p>
            </Card>
          </ProGate>
        </div>
      )}

      <Card className="mt-4">
        <p className="mb-1 text-sm font-semibold text-ink">Suggest a feature</p>
        <p className="mb-2 text-xs text-subtle">
          Signed-in only. We save your note for review — we don’t promise a reply.
        </p>
        <textarea
          className="min-h-24 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
          maxLength={1000}
          value={suggestText}
          onChange={(e) => setSuggestText(e.target.value)}
          placeholder="What would help your margins?"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-subtle">{suggestText.length}/1000</span>
          <Button size="sm" disabled={suggestBusy} onClick={() => void submitSuggestion()}>
            {suggestBusy ? 'Sending…' : 'Send suggestion'}
          </Button>
        </div>
        {suggestMsg ? <p className="mt-2 text-xs text-subtle">{suggestMsg}</p> : null}
      </Card>

      <ConfirmDialog
        open={cancelOpen}
        title={access === 'trial' ? 'Cancel trial?' : 'Cancel subscription?'}
        cancelLabel="Go Back"
        confirmLabel="Confirm Cancel"
        danger
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          // K71 — optional reason; never required; never delays Confirm Cancel
          try {
            const payload = {
              reason: cancelReason || null,
              note: cancelNote.trim().slice(0, 500) || null,
              at: new Date().toISOString(),
              access,
            }
            const prev = JSON.parse(localStorage.getItem('m365_cancel_reasons') || '[]') as unknown[]
            localStorage.setItem('m365_cancel_reasons', JSON.stringify([...prev, payload].slice(-50)))
          } catch {
            // ignore
          }
          const res = cancelAccess()
          setStatusMsg(res.message)
          setCancelOpen(false)
          setCancelReason('')
          setCancelNote('')
        }}
      >
        <p className="text-sm text-ink">
          {access === 'trial'
            ? `You will not be charged. You keep access until ${endLabel}. Your account will be closed and your data will be permanently deleted on ${endLabel}. Download your data before then. This cannot be undone.`
            : `Your subscription will not renew. You keep access until ${endLabel}. Your account will be closed and your data will be permanently deleted on ${endLabel}. Download your data before then. This cannot be undone.`}
        </p>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">
            Why are you cancelling? (optional)
          </span>
          <select
            className="h-11 w-full rounded-[10px] border border-border bg-elevated px-3"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          >
            <option value="">Prefer not to say</option>
            <option value="too_expensive">Too expensive</option>
            <option value="missing_feature">Missing a feature</option>
            <option value="switching">Switching tool</option>
            <option value="seasonal">Seasonal / pausing</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="mt-2 block text-sm">
          <span className="mb-1 block text-xs font-semibold text-subtle">Anything else? (optional)</span>
          <textarea
            className="min-h-20 w-full rounded-[10px] border border-border bg-elevated px-3 py-2 text-sm"
            maxLength={500}
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder="Optional note"
          />
        </label>
      </ConfirmDialog>
    </section>
  )
}
