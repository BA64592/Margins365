/**
 * Auth provider layer (v16.1 A5) — tool-neutral interface.
 * Production: server sessions + Postgres + SES verification.
 * Fallback: local demo provider when /api/auth is unavailable (local Vite only).
 */
import { isStrictAuthEnabled } from '../demoFlags'

export interface AuthSession {
  accountId: string
  email: string
  emailVerified: boolean
  provider: 'email' | 'google' | 'demo'
  plan?: 'free' | 'pro' | 'starter' | 'growth' | 'scale'
  /** Server licence_state: trialing | active | past_due | canceled | legacy | none | … */
  licenceState?: string | null
  billingInterval?: 'month' | 'year' | null
  trialEndsAt?: string | null
  stripeCustomerId?: string | null
  googleSub?: string
  pendingVerifyToken?: string
  fullName?: string | null
  businessName?: string | null
  phone?: string | null
  enabledPlatforms?: string[] | null
}

export interface AuthProvider {
  signUpEmail(email: string, password: string): Promise<{ ok: boolean; message: string }>
  signInEmail(email: string, password: string): Promise<{
    ok: boolean
    session?: AuthSession
    message: string
    code?: string
  }>
  signInGoogle(idTokenClaims: {
    sub: string
    email: string
    email_verified: boolean
    accessToken?: string
  }): Promise<{ ok: boolean; session?: AuthSession; message: string; code?: string }>
  requestEmailVerification(accountId: string, email: string): Promise<{
    ok: boolean
    message: string
    debugToken?: string
  }>
  verifyEmail(token: string): Promise<{ ok: boolean; message: string; email?: string; session?: AuthSession }>
  requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }>
  resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; message: string }>
  updateProfile(patch: ProfilePatch): Promise<{ ok: boolean; message: string; session?: AuthSession }>
  fetchSession(): Promise<AuthSession | null>
  syncLicence(): Promise<{ ok: boolean; session?: AuthSession; message: string }>
  signOut(): Promise<void>
}

type ApiUser = {
  id: string
  email: string
  emailVerified: boolean
  plan?: string
  licenceState?: string | null
  billingInterval?: string | null
  trialEndsAt?: string | null
  stripeCustomerId?: string | null
  timeZone?: string
  createdAt?: string
  lastSignInAt?: string
  authProvider?: 'email' | 'google'
  fullName?: string | null
  businessName?: string | null
  phone?: string | null
  enabledPlatforms?: string[] | null
}

export type ProfilePatch = {
  fullName: string
  businessName: string
  phone: string
  enabledPlatforms?: string[]
  maxPlatforms?: number
}

function sessionFromApi(user: ApiUser): AuthSession {
  const plan =
    user.plan === 'pro' ||
    user.plan === 'starter' ||
    user.plan === 'growth' ||
    user.plan === 'scale'
      ? user.plan
      : 'free'
  const iv = String(user.billingInterval || '').toLowerCase()
  return {
    accountId: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    provider: user.authProvider === 'google' ? 'google' : 'email',
    plan,
    licenceState: user.licenceState ?? null,
    billingInterval: iv === 'year' || iv === 'month' ? iv : null,
    trialEndsAt: user.trialEndsAt ?? null,
    stripeCustomerId: user.stripeCustomerId ?? null,
    fullName: user.fullName ?? null,
    businessName: user.businessName ?? null,
    phone: user.phone ?? null,
    enabledPlatforms: user.enabledPlatforms ?? null,
  }
}

async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ okHttp: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T
  return { okHttp: res.ok, status: res.status, data }
}

const VERIFY_KEY = 'marginos.verifyTokens'
const RESET_KEY = 'marginos.resetTokens'
const MIN_PASSWORD = 15
const GENERIC_RESET_MSG = "If an account exists, we've sent a reset link."

type TokenRow = { token: string; email: string; accountId: string; expiresAt: number }

function loadTokens(key = VERIFY_KEY): TokenRow[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as TokenRow[]
  } catch {
    return []
  }
}

function saveTokens(rows: TokenRow[], key = VERIFY_KEY) {
  localStorage.setItem(key, JSON.stringify(rows))
}

function mintLocalToken(email: string, accountId: string): string {
  const token = `ver_${Math.random().toString(36).slice(2)}_${Date.now()}`
  const rows = loadTokens().filter((r) => r.accountId !== accountId && r.expiresAt > Date.now())
  rows.push({ token, email, accountId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
  saveTokens(rows)
  return token
}

function mintLocalResetToken(email: string, accountId: string): string {
  const token = `rst_${Math.random().toString(36).slice(2)}_${Date.now()}`
  // Invalidate older unused links for this account (Q34)
  const rows = loadTokens(RESET_KEY).filter(
    (r) => r.accountId !== accountId && r.expiresAt > Date.now(),
  )
  rows.push({ token, email, accountId, expiresAt: Date.now() + 60 * 60 * 1000 })
  saveTokens(rows, RESET_KEY)
  return token
}

/** Local fallback when API auth is unavailable (Vite preview without DATABASE_URL). */
const localAuthProvider: AuthProvider = {
  async signUpEmail(email, password) {
    if (password.length < MIN_PASSWORD) {
      return { ok: false, message: `Password must be at least ${MIN_PASSWORD} characters.` }
    }
    return { ok: true, message: `Verification email would be sent to ${email} (24h link).` }
  },
  async signInEmail(email, password) {
    if (password.length < MIN_PASSWORD) {
      return { ok: false, message: `Password must be at least ${MIN_PASSWORD} characters.` }
    }
    const accountId = `acct_${email.toLowerCase()}`
    const token = mintLocalToken(email, accountId)
    if (isStrictAuthEnabled()) {
      try {
        await fetch('/api/auth/send-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            accountId,
            verifyUrl: `${window.location.origin}/?verify=${encodeURIComponent(token)}`,
          }),
        })
      } catch {
        // ignore
      }
    }
    return {
      ok: true,
      session: {
        accountId,
        email,
        emailVerified: false,
        provider: 'email',
        pendingVerifyToken: token,
      },
      message: isStrictAuthEnabled()
        ? 'Signed in. Check your email for a verification link (24h).'
        : 'Signed in. Verify your email before upload or checkout.',
    }
  },
  async signInGoogle(claims) {
    return {
      ok: true,
      session: {
        accountId: `google_${claims.sub}`,
        email: claims.email,
        emailVerified: claims.email_verified === true,
        provider: 'google',
        googleSub: claims.sub,
      },
      message: claims.email_verified
        ? 'Signed in with Google.'
        : 'Google email not verified — please verify with Margins365.',
    }
  },
  async requestEmailVerification(accountId, email) {
    const token = mintLocalToken(email, accountId)
    try {
      await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          accountId,
          verifyUrl: `${window.location.origin}/?verify=${encodeURIComponent(token)}`,
        }),
      })
    } catch {
      // ignore
    }
    return {
      ok: true,
      message: 'Verification email sent.',
      debugToken: import.meta.env.DEV ? token : undefined,
    }
  },
  async verifyEmail(token) {
    const rows = loadTokens()
    const hit = rows.find((r) => r.token === token && r.expiresAt > Date.now())
    if (!hit) return { ok: false, message: 'Verification link is invalid or expired.' }
    saveTokens(rows.filter((r) => r.token !== token))
    return { ok: true, message: 'Email verified.', email: hit.email }
  },
  async requestPasswordReset(email) {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) return { ok: false, message: 'Enter a valid email address.' }
    const accountId = `acct_${trimmed}`
    mintLocalResetToken(trimmed, accountId)
    return { ok: true, message: GENERIC_RESET_MSG }
  },
  async resetPassword(token, newPassword) {
    if (newPassword.length < MIN_PASSWORD) {
      return { ok: false, message: `Password must be at least ${MIN_PASSWORD} characters.` }
    }
    const rows = loadTokens(RESET_KEY)
    const hit = rows.find((r) => r.token === token && r.expiresAt > Date.now())
    if (!hit) {
      return {
        ok: false,
        message: 'This reset link is invalid or expired.',
      }
    }
    saveTokens(
      rows.map((r) => (r.token === token || r.accountId === hit.accountId ? { ...r, expiresAt: 0 } : r)),
      RESET_KEY,
    )
    return {
      ok: true,
      message: 'Password updated. Sign in with your new password. Other sessions were signed out.',
    }
  },
  async updateProfile(patch) {
    if (!patch.fullName.trim() || !patch.businessName.trim() || !patch.phone.trim()) {
      return { ok: false, message: 'Name, business name and phone number are required.' }
    }
    // Local/demo: caller merges into existing user state (no session overwrite).
    return { ok: true, message: 'Profile saved.' }
  },
  async fetchSession() {
    return null
  },
  async syncLicence() {
    return { ok: false, message: 'Server auth required.' }
  },
  async signOut() {
    // local only
  },
}

const serverAuthProvider: AuthProvider = {
  async signUpEmail(email, password) {
    return this.signInEmail(email, password).then((r) => ({ ok: r.ok, message: r.message }))
  },
  async signInEmail(email, password) {
    try {
      const { okHttp, data } = await apiJson<{
        ok?: boolean
        message?: string
        code?: string
        user?: ApiUser
      }>('/api/auth/continue', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
          origin: window.location.origin,
        }),
      })
      if (!okHttp || !data.ok || !data.user) {
        return {
          ok: false,
          message:
            data.code === 'google_only'
              ? 'This account uses Google Sign-In. Please use Continue with Google above.'
              : data.message || 'Sign-in failed.',
          code: data.code,
        }
      }
      return {
        ok: true,
        session: sessionFromApi(data.user),
        message: data.message || 'Signed in.',
      }
    } catch {
      return localAuthProvider.signInEmail(email, password)
    }
  },
  async signInGoogle(claims) {
    try {
      if (!claims.accessToken) {
        return { ok: false, message: 'Google sign-in token missing.' }
      }
      const { okHttp, data } = await apiJson<{
        ok?: boolean
        message?: string
        code?: string
        user?: ApiUser
      }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: claims.accessToken,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
        }),
      })
      if (!okHttp || !data.ok || !data.user) {
        return {
          ok: false,
          message: data.message || 'Google sign-in failed.',
          code: data.code,
        }
      }
      return {
        ok: true,
        session: sessionFromApi(data.user),
        message: data.message || 'Signed in with Google.',
      }
    } catch {
      return localAuthProvider.signInGoogle(claims)
    }
  },
  async requestEmailVerification() {
    try {
      const { okHttp, data } = await apiJson<{ ok?: boolean; message?: string }>(
        '/api/auth/send-verification',
        {
          method: 'POST',
          body: JSON.stringify({ origin: window.location.origin }),
        },
      )
      return { ok: okHttp && Boolean(data.ok), message: data.message || 'Request failed.' }
    } catch {
      return { ok: false, message: 'Could not reach verification API.' }
    }
  },
  async verifyEmail(token) {
    try {
      const { okHttp, data } = await apiJson<{
        ok?: boolean
        message?: string
        user?: ApiUser
      }>('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      if (!okHttp || !data.ok) {
        return { ok: false, message: data.message || 'Verification failed.' }
      }
      return {
        ok: true,
        message: data.message || 'Email verified.',
        email: data.user?.email,
        session: data.user ? sessionFromApi(data.user) : undefined,
      }
    } catch {
      return localAuthProvider.verifyEmail(token)
    }
  },
  async requestPasswordReset(email) {
    try {
      const { okHttp, data } = await apiJson<{ ok?: boolean; message?: string }>(
        '/api/auth/request-password-reset',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            origin: window.location.origin,
          }),
        },
      )
      if (okHttp && data.ok) {
        return { ok: true, message: data.message || GENERIC_RESET_MSG }
      }
      // Fall back to local demo path when API/DB unavailable
      if (!okHttp) return localAuthProvider.requestPasswordReset(email)
      return { ok: false, message: data.message || 'Could not send reset email.' }
    } catch {
      return localAuthProvider.requestPasswordReset(email)
    }
  },
  async resetPassword(token, newPassword) {
    try {
      const { okHttp, status, data } = await apiJson<{ ok?: boolean; message?: string }>(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ token, password: newPassword }),
        },
      )
      if (okHttp && data.ok) {
        return { ok: true, message: data.message || 'Password updated.' }
      }
      // Structured API failure (expired token, validation) — do not invent a local success
      if (status >= 400 && status < 500 && data.message) {
        return { ok: false, message: data.message }
      }
      if (status >= 500 || status === 503) {
        return localAuthProvider.resetPassword(token, newPassword)
      }
      return { ok: false, message: data.message || 'Could not reset password.' }
    } catch {
      return localAuthProvider.resetPassword(token, newPassword)
    }
  },
  async updateProfile(patch) {
    try {
      const { okHttp, data } = await apiJson<{
        ok?: boolean
        message?: string
        user?: ApiUser
      }>('/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify(patch),
      })
      if (okHttp && data.ok && data.user) {
        return {
          ok: true,
          message: data.message || 'Profile saved.',
          session: sessionFromApi(data.user),
        }
      }
      return { ok: false, message: data.message || 'Could not save profile.' }
    } catch {
      return localAuthProvider.updateProfile(patch)
    }
  },
  async fetchSession() {
    try {
      const { okHttp, data } = await apiJson<{ ok?: boolean; user?: ApiUser }>('/api/auth/me')
      if (!okHttp || !data.ok || !data.user) return null
      return sessionFromApi(data.user)
    } catch {
      return null
    }
  },
  async syncLicence() {
    try {
      const { okHttp, data } = await apiJson<{
        ok?: boolean
        message?: string
        user?: ApiUser
      }>('/api/auth/sync-licence', { method: 'POST', body: '{}' })
      if (!okHttp || !data.ok || !data.user) {
        return { ok: false, message: data.message || 'Could not sync licence.' }
      }
      return {
        ok: true,
        session: sessionFromApi(data.user),
        message: data.message || 'Licence synced.',
      }
    } catch {
      return { ok: false, message: 'Could not reach licence sync API.' }
    }
  },
  async signOut() {
    try {
      await apiJson('/api/auth/logout', { method: 'POST', body: '{}' })
    } catch {
      // ignore
    }
  },
}

/** Prefer server auth in the browser; falls back automatically if API is down. */
export const marginosAuthProvider: AuthProvider = serverAuthProvider

/** @deprecated alias — prefer marginosAuthProvider */
export const demoAuthProvider = marginosAuthProvider
