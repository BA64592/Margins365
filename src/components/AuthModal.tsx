import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { en } from '../i18n/en'
import { isGoogleSignInConfigured, requestGoogleSignIn } from '../lib/auth/google'
import { isInAppBrowser } from '../lib/browserEnv'
import { LAUNCH_PLATFORMS } from '../lib/plans'
import { platformLabel } from '../lib/platforms'
import { isProfileComplete, type Platform } from '../lib/types'
import { Button, Input, Modal } from './ui'

/** K6 / K57 — enabled when VITE_GOOGLE_CLIENT_ID (or built-in client id) is present. */
const GOOGLE_SIGN_IN_ENABLED = isGoogleSignInConfigured()

type AuthMode = 'signIn' | 'create' | 'forgot' | 'reset'

export function AuthModal() {
  const {
    authOpen,
    setAuthOpen,
    signInEmail,
    signInGoogle,
    requestVerificationEmail,
    requestPasswordReset,
    resetPassword,
    passwordResetToken,
    clearPasswordResetToken,
    refreshSession,
    updateProfile,
    platformSlotLimit,
    user,
    signOut,
  } = useApp()
  const [mode, setMode] = useState<AuthMode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [canResendReset, setCanResendReset] = useState(false)
  const [acceptLegal, setAcceptLegal] = useState(false)
  const [inApp] = useState(() =>
    typeof navigator !== 'undefined' ? isInAppBrowser() : false,
  )

  useEffect(() => {
    if (passwordResetToken && authOpen) {
      setMode('reset')
      setError(null)
      setStatus(null)
      setPassword('')
      setConfirmPassword('')
      setCanResendReset(false)
    }
  }, [passwordResetToken, authOpen])

  useEffect(() => {
    if (!authOpen || typeof window === 'undefined') return
    const err = new URLSearchParams(window.location.search).get('error')
    if (err === 'unverified_google_account') {
      setError(
        'Your Google account email is not verified. Use a verified Google account or continue with email.',
      )
    }
  }, [authOpen])

  useEffect(() => {
    if (!user) return
    setFullName(user.fullName || '')
    setBusinessName(user.businessName || '')
    setPhone(user.phone || '')
    setPlatforms(user.enabledPlatforms?.length ? [...user.enabledPlatforms] : [])
  }, [user])

  // Poll server while waiting for email verification (works across iPad / phone)
  useEffect(() => {
    if (!authOpen || !user || user.emailVerified) return
    const tick = () => {
      void refreshSession().then((next) => {
        if (next?.emailVerified) {
          setStatus('Email verified. Complete your profile to continue.')
        }
      })
    }
    tick()
    const id = window.setInterval(tick, 4000)
    return () => window.clearInterval(id)
  }, [authOpen, user, refreshSession])

  const resetFeedback = () => {
    setError(null)
    setStatus(null)
  }

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p)
      if (prev.length >= platformSlotLimit) return prev
      return [...prev, p]
    })
  }

  const submitProfile = async () => {
    resetFeedback()
    if (!fullName.trim() || !businessName.trim()) {
      setError('Name and business name are required.')
      return
    }
    if (platforms.length < 1) {
      setError(`Choose ${platformSlotLimit === 1 ? 'your platform' : `up to ${platformSlotLimit} platforms`}.`)
      return
    }
    if (platforms.length > platformSlotLimit) {
      setError(`Your plan allows ${platformSlotLimit} of 3 platforms.`)
      return
    }
    setBusy(true)
    try {
      const res = await updateProfile({
        fullName,
        businessName,
        phone,
        enabledPlatforms: platforms,
      })
      if (!res.ok) setError(res.message)
      else {
        setStatus(res.message)
        setAuthOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    resetFeedback()
    const trimmed = email.trim()
    if (mode === 'forgot') {
      if (!trimmed || !trimmed.includes('@')) {
        setError('Enter a valid email address.')
        return
      }
      setBusy(true)
      try {
        const res = await requestPasswordReset(trimmed)
        if (!res.ok) setError(res.message)
        else setStatus(res.message)
      } finally {
        setBusy(false)
      }
      return
    }
    if (mode === 'reset') {
      if (!passwordResetToken) {
        setError('This reset link is invalid or expired.')
        setCanResendReset(true)
        return
      }
      if (password.length < 15) {
        setError('Password must be at least 15 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
      setBusy(true)
      try {
        const res = await resetPassword(passwordResetToken, password)
        if (!res.ok) {
          setError(res.message)
          if (/invalid or expired/i.test(res.message)) setCanResendReset(true)
          return
        }
        setStatus(res.message)
        setPassword('')
        setConfirmPassword('')
        setMode('signIn')
      } finally {
        setBusy(false)
      }
      return
    }
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 15) {
      setError('Password must be at least 15 characters.')
      return
    }
    if (mode === 'create' && !acceptLegal) {
      setError('Accept the Terms and Refunds policy to create an account.')
      return
    }
    setBusy(true)
    try {
      const res = await signInEmail(trimmed, password, {
        acceptLegal: mode === 'create' ? acceptLegal : false,
      })
      if (!res.ok) {
        if (res.code === 'google_only') {
          setError('This account uses Google Sign-In. Please use Continue with Google above.')
          return
        }
        const msg = (res.message || '').trim()
        if (mode === 'create' && (!msg || /sign-?in failed/i.test(msg))) {
          setError('Could not create account. Try again, or sign in if you already have one.')
        } else {
          setError(msg || (mode === 'create' ? 'Could not create account.' : 'Sign-in failed.'))
        }
        return
      }
      setStatus(res.message)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const needsVerify = Boolean(user && !user.emailVerified)
  const needsProfile = Boolean(user && user.emailVerified && !isProfileComplete(user))
  const title = user
    ? needsVerify
      ? 'Verify your email'
      : needsProfile
        ? 'Complete your profile'
        : 'Account'
    : mode === 'create'
      ? 'Create account'
      : mode === 'forgot'
        ? 'Forgot password'
        : mode === 'reset'
          ? 'Set a new password'
          : 'Sign in'

  return (
    <Modal
      open={authOpen}
      onClose={() => {
        // Keep open through verify + mandatory profile (same class of bug as premature dismiss)
        if (user && (!user.emailVerified || !isProfileComplete(user))) {
          setStatus(
            !user.emailVerified
              ? 'This window stays open until you confirm your email.'
              : 'Finish your profile (name, business, phone) and choose your platform(s).',
          )
          return
        }
        setAuthOpen(false)
        resetFeedback()
        clearPasswordResetToken()
        if (!user) setMode('signIn')
      }}
      title={title}
    >
      {user ? (
        <div className="space-y-3 text-sm">
          <p className="text-ink">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>

          {needsVerify ? (
            <div className="space-y-3 rounded-[10px] border border-warn/40 bg-warn-soft px-3 py-3">
              <p className="font-medium text-warn">Check your inbox</p>
              <p className="text-xs text-ink">
                We sent a verification link to <strong>{user.email}</strong>. Open it on any device
                and tap <strong>Confirm email</strong>. There is no code to type — this window
                updates automatically when the link is used.
              </p>
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => {
                  resetFeedback()
                  setBusy(true)
                  void requestVerificationEmail()
                    .then((res) => {
                      if (!res.ok) setError(res.message)
                      else setStatus('Verification email resent. Check inbox and spam.')
                    })
                    .finally(() => setBusy(false))
                }}
              >
                Resend verification email
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => {
                  resetFeedback()
                  void refreshSession().then((next) => {
                    if (next?.emailVerified) setStatus('Email verified.')
                    else setStatus('Not verified yet — open the link from your email.')
                  })
                }}
              >
                I’ve confirmed — refresh status
              </Button>
            </div>
          ) : null}

          {user.emailVerified ? (
            <div className="space-y-3">
              {!isProfileComplete(user) ? (
                <p className="rounded-[10px] bg-accent-soft px-3 py-2 text-xs text-accent">
                  Tell us who you are, then choose which platform(s) your plan includes (
                  {platformSlotLimit} of 3).
                </p>
              ) : null}
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  Full name
                </span>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Your name"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  Business name
                </span>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  autoComplete="organization"
                  placeholder="Trading or company name"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  Phone number (optional)
                </span>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+44…"
                />
              </label>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                  Platforms ({platforms.length}/{platformSlotLimit} of 3)
                </p>
                <p className="mb-2 text-xs text-subtle">
                  Pick which marketplace(s) you will upload. TikTok Shop UK import is coming soon.
                </p>
                <div className="flex flex-wrap gap-2">
                  {LAUNCH_PLATFORMS.map((p) => {
                    const on = platforms.includes(p)
                    const blocked = !on && platforms.length >= platformSlotLimit
                    return (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant={on ? 'primary' : 'secondary'}
                        disabled={blocked}
                        onClick={() => togglePlatform(p)}
                      >
                        {platformLabel(p)}
                      </Button>
                    )
                  })}
                </div>
              </div>
              <Button className="w-full" disabled={busy} onClick={() => void submitProfile()}>
                {busy ? 'Saving…' : isProfileComplete(user) ? 'Save profile' : 'Save and continue'}
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {status ? <p className="text-xs text-subtle">{status}</p> : null}
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {mode === 'forgot' ? (
            <>
              <p className="text-sm text-subtle">
                Enter your email and we’ll send a reset link if an account exists.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  Email
                </span>
                <Input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    resetFeedback()
                  }}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                />
              </label>
              {error ? (
                <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {status ? <p className="text-sm text-subtle">{status}</p> : null}
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : 'Send reset link'}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-accent underline-offset-2 hover:underline"
                onClick={() => {
                  setMode('signIn')
                  resetFeedback()
                }}
              >
                Back to sign in
              </button>
            </>
          ) : mode === 'reset' ? (
            <>
              <p className="text-sm text-subtle">
                Choose a new password (at least 15 characters). Other devices will be signed out.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  New password
                </span>
                <Input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    resetFeedback()
                  }}
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 15 characters"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  Confirm password
                </span>
                <Input
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    resetFeedback()
                  }}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                />
              </label>
              {error ? (
                <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {status ? <p className="text-sm text-subtle">{status}</p> : null}
              <Button className="w-full" type="submit" disabled={busy || canResendReset}>
                {busy ? 'Please wait…' : 'Update password'}
              </Button>
              {canResendReset ? (
                <Button
                  className="w-full"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    clearPasswordResetToken()
                    setMode('forgot')
                    setCanResendReset(false)
                    resetFeedback()
                  }}
                >
                  Send a new link
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {inApp ? (
                <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
                  {en.inAppBrowserGoogleHint}
                </p>
              ) : null}
              <Button
                className="w-full"
                type="button"
                disabled={!GOOGLE_SIGN_IN_ENABLED || inApp || googleBusy}
                onClick={() => {
                  if (!GOOGLE_SIGN_IN_ENABLED || inApp || googleBusy) return
                  resetFeedback()
                  setGoogleBusy(true)
                  void requestGoogleSignIn()
                    .then((claims) => signInGoogle(claims))
                    .then((res) => {
                      if (!res.ok) {
                        if (res.code === 'unverified_google_account') {
                          setAuthOpen(false)
                          const url = new URL(window.location.href)
                          url.searchParams.set('error', 'unverified_google_account')
                          window.history.replaceState({}, '', url.toString())
                          setError(
                            'Your Google account email is not verified. Use a verified Google account or continue with email.',
                          )
                          setAuthOpen(true)
                          return
                        }
                        setError(res.message)
                      } else setStatus(res.message)
                    })
                    .catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
                    })
                    .finally(() => setGoogleBusy(false))
                }}
              >
                {googleBusy ? 'Connecting to Google…' : 'Continue with Google'}
              </Button>
              {!GOOGLE_SIGN_IN_ENABLED ? (
                <p className="text-xs text-subtle">{en.googleSignInPendingK6}</p>
              ) : inApp ? null : (
                <p className="text-xs text-subtle">
                  Google sign-in uses your Google account. We never see your Google password.
                </p>
              )}
              <div className="relative py-1 text-center text-xs text-subtle">
                <span className="bg-elevated px-2">or continue with email</span>
              </div>
              <div className="flex gap-2 rounded-[10px] bg-muted p-1">
                <button
                  type="button"
                  className={`min-h-10 flex-1 rounded-[8px] text-sm font-medium transition ${
                    mode === 'signIn' ? 'bg-elevated text-ink shadow-sm' : 'text-subtle hover:text-ink'
                  }`}
                  onClick={() => {
                    setMode('signIn')
                    resetFeedback()
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`min-h-10 flex-1 rounded-[8px] text-sm font-medium transition ${
                    mode === 'create' ? 'bg-elevated text-ink shadow-sm' : 'text-subtle hover:text-ink'
                  }`}
                  onClick={() => {
                    setMode('create')
                    resetFeedback()
                  }}
                >
                  Create account
                </button>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  Email
                </span>
                <Input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    resetFeedback()
                  }}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                  Password
                </span>
                <Input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    resetFeedback()
                  }}
                  type="password"
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  placeholder="At least 15 characters"
                />
              </label>
              {mode === 'signIn' ? (
                <button
                  type="button"
                  className="text-left text-sm text-accent underline-offset-2 hover:underline"
                  onClick={() => {
                    setMode('forgot')
                    setPassword('')
                    resetFeedback()
                  }}
                >
                  Forgot password?
                </button>
              ) : null}
              {mode === 'create' ? (
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={acceptLegal}
                    onChange={(e) => {
                      setAcceptLegal(e.target.checked)
                      resetFeedback()
                    }}
                  />
                  <span>
                    I agree to the{' '}
                    <a className="text-accent underline-offset-2 hover:underline" href="/legal/terms">
                      Terms
                    </a>{' '}
                    and{' '}
                    <a className="text-accent underline-offset-2 hover:underline" href="/legal/refunds">
                      Refunds policy
                    </a>
                    .
                  </span>
                </label>
              ) : null}
              {error ? (
                <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {status ? <p className="text-sm text-subtle">{status}</p> : null}
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'create' ? 'Create account' : 'Continue with email'}
              </Button>
            </>
          )}
        </form>
      )}
    </Modal>
  )
}
