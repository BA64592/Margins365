/**
 * DEF-SEC-001 / G10 — baseline security headers for HTML, JSON and redirects.
 */

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://plausible.io https://accounts.google.com https://apis.google.com https://js.stripe.com",
  "connect-src 'self' https://plausible.io https://api.stripe.com https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://accounts.google.com",
].join('; ')

/** Headers applied to every successful origin response. */
export function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': CSP,
    ...extra,
  }
}
