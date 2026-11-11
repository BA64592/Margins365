import { useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../lib/cn'

/** K80 — lock document scroll while a dialog is open (phone + desktop). */
function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyTouchAction = body.style.touchAction
    const scrollY = window.scrollY
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    // iOS Safari: pin position so background can't rubber-band
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.touchAction = prevBodyTouchAction
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      className={cn(
        // Spec v17 §15.4 + brand §22: ≥44px, radius 10, never a pill; teal buttons stay #34726B
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 text-sm' : 'px-4 text-sm',
        variant === 'primary' &&
          'bg-accent text-white shadow-sm hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]',
        variant === 'secondary' &&
          'border border-border bg-elevated text-ink hover:bg-muted',
        variant === 'ghost' && 'text-subtle hover:bg-muted hover:text-ink',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-[10px] border border-border bg-elevated px-3 text-sm text-ink outline-none transition placeholder:text-subtle/70 focus:border-accent focus:ring-2 focus:ring-[var(--ring)]',
        className,
      )}
      {...props}
    />
  )
}

export function Card({
  className,
  children,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  interactive?: boolean
}) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-2xl border border-border bg-elevated p-4 sm:p-5',
        interactive && 'transition hover:border-accent/40',
        className,
      )}
      style={{ boxShadow: 'var(--shadow)', ...props.style }}
    >
      {children}
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-subtle sm:text-[15px]">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'pro'
}) {
  return (
    <span
      className={cn(
        // Verdict/band chips: pill ≤28px; plan Pro chip is navy (neutral), outside logo clear space
        'inline-flex max-h-7 items-center px-2 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'rounded-md bg-muted text-subtle',
        tone === 'accent' && 'rounded-md bg-accent-soft text-accent',
        tone === 'ok' && 'rounded-full border border-ok/30 bg-ok-soft text-ok',
        tone === 'warn' && 'rounded-full border border-warn/30 bg-warn-soft text-warn',
        tone === 'danger' && 'rounded-full border border-danger/30 bg-danger-soft text-danger',
        tone === 'pro' && 'rounded-md bg-navy text-white',
      )}
    >
      {children}
    </span>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useBodyScrollLock(open)
  if (!open) return null
  // K80 — fit visible viewport (dvh), scroll inside, sticky title/Close, safe-area bottom
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      onWheel={(e) => {
        // Wheel on the dimmed backdrop must not scroll the page behind
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        onWheel={(e) => e.preventDefault()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-xl animate-fade-up"
        style={{ maxHeight: 'calc(100dvh - 1.5rem)' }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 bg-elevated px-5 pb-3 pt-5">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-subtle hover:bg-muted hover:text-ink"
          >
            Close
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** Confirm dialog with Cancel as the safe default (v16.3). Escape / backdrop = Cancel. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
  danger = false,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  /** Safe primary dismiss — Easy Cancel uses "Go Back". */
  cancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
  danger?: boolean
}) {
  useBodyScrollLock(open)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <button
        type="button"
        aria-label={cancelLabel}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        onClick={onCancel}
        onWheel={(e) => e.preventDefault()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-xl animate-fade-up"
        style={{ maxHeight: 'calc(100dvh - 1.5rem)' }}
      >
        <h3
          id="confirm-dialog-title"
          className="shrink-0 px-5 pt-5 font-display text-lg font-semibold text-ink"
        >
          {title}
        </h3>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 text-sm text-subtle"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {children}
        </div>
        <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-5">
          <Button autoFocus variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
