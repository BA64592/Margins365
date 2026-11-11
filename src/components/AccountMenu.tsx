import { useEffect, useId, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { PLANS, hasPaidAccess, type PlanId } from '../lib/plans'
import type { AppRoute } from '../lib/routes'
import { Button } from './ui'

function accountLabel(user: {
  businessName?: string | null
  fullName?: string | null
  email: string
}) {
  const biz = user.businessName?.trim()
  if (biz) return biz
  const first = user.fullName?.trim()?.split(/\s+/)[0]
  if (first) return first
  return user.email
}

/** K67 — business-name account button + menu. */
export function AccountMenu({ variant = 'app' }: { variant?: 'app' | 'marketing' }) {
  const {
    user,
    plan,
    access,
    trialEndsAt,
    setRoute,
    setAuthOpen,
    setUpgradeOpen,
    signOut,
  } = useApp()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAuthOpen(true)}>
        Sign in
      </Button>
    )
  }

  const label = accountLabel(user)
  const subscribed = hasPaidAccess(access)
  const planName =
    plan === 'starter' || plan === 'growth' || plan === 'pro' || plan === 'scale'
      ? PLANS[plan as PlanId].name
      : plan === 'legacy'
        ? 'Legacy'
        : 'No plan'
  const planBadge =
    access === 'trial' && trialEndsAt
      ? `${planName} · Trial ends ${new Date(trialEndsAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        })}`
      : planName

  const go = (route: AppRoute) => {
    setOpen(false)
    setRoute(route)
  }

  const isScale = plan === 'scale'
  const isOwner = true // single-owner accounts until team roles land server-side

  return (
    <div className="relative" ref={rootRef}>
      <Button
        size="sm"
        variant={variant === 'marketing' && subscribed ? 'primary' : 'secondary'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="max-w-[10rem] truncate sm:max-w-[14rem]">{label}</span>
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-border bg-elevated p-2 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{user.businessName || label}</p>
            <p className="truncate text-xs text-subtle">{user.fullName || '—'}</p>
            <p className="truncate text-xs text-subtle">{user.email}</p>
            <p className="mt-1 text-xs font-medium text-accent">
              Owner · {planBadge}
            </p>
          </div>
          <MenuItem label="Info" onClick={() => go('account-info')} />
          <MenuItem label="Control room" onClick={() => go('app')} />
          {isOwner ? <MenuItem label="Shops" onClick={() => go('app-shops')} /> : null}
          {isOwner && (plan === 'pro' || isScale) ? (
            <MenuItem label="Team" onClick={() => go('app-team')} />
          ) : null}
          {isOwner ? <MenuItem label="Plan & billing" onClick={() => go('account-billing')} /> : null}
          {isOwner ? <MenuItem label="Data & privacy" onClick={() => go('account-data')} /> : null}
          {isScale ? (
            <MenuItem
              label="Add shop"
              onClick={() => {
                setOpen(false)
                setRoute('app-shops')
              }}
            />
          ) : isOwner ? (
            <MenuItem
              label="Add shop (Scale)"
              onClick={() => {
                setOpen(false)
                setUpgradeOpen(true)
              }}
            />
          ) : null}
          <MenuItem label="Help centre" onClick={() => go('help')} />
          <MenuItem
            label="Sign out"
            onClick={() => {
              setOpen(false)
              signOut()
              setRoute('home')
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex min-h-11 w-full items-center rounded-[10px] px-3 text-left text-sm text-ink hover:bg-muted"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
