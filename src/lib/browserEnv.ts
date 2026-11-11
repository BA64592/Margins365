/**
 * Spec v17 §15.2 — unsupported / in-app browser helpers.
 * Best-effort UA checks only; never blocks email/password sign-in.
 */

export function isInAppBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  const u = ua.toLowerCase()
  return (
    u.includes('fbav') ||
    u.includes('fban') ||
    u.includes('fb_iab') ||
    u.includes('instagram') ||
    u.includes('line/') ||
    u.includes('tiktok') ||
    u.includes('musical_ly') ||
    u.includes('gsa/') || // Google Search App
    (u.includes('wv') && (u.includes('android') || u.includes('iphone')))
  )
}

/** Very old / exotic UAs — show supported-browser note (best effort). */
export function isLikelyUnsupportedBrowser(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  if (!ua) return false
  const u = ua.toLowerCase()
  // IE / legacy EdgeHTML
  if (u.includes('msie ') || u.includes('trident/')) return true
  if (u.includes('edge/') && !u.includes('edg/')) return true
  return false
}

export const SUPPORTED_BROWSERS_COPY =
  'Margins365 works best in the latest two versions of Safari, Chrome, Edge, Firefox, and Samsung Internet.'

export const IN_APP_BROWSER_COPY =
  'You’re in an in-app browser. Email sign-in still works here. For Google sign-in, open Margins365 in Safari or Chrome.'
