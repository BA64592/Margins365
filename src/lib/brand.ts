/**
 * K59 / K73 — product name Margins365 (one word) + margins365.com only.
 */
export const PRODUCT_NAME =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRODUCT_NAME) || 'Margins365'

/** Live public host — margins365.com only (K73). */
export const PRODUCT_DOMAIN =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRODUCT_DOMAIN) || 'margins365.com'

/** Same as PRODUCT_DOMAIN after cutover; kept for env compatibility. */
export const TARGET_PRODUCT_DOMAIN =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TARGET_PRODUCT_DOMAIN) ||
  'margins365.com'

export const SUPPORT_EMAIL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPPORT_EMAIL) ||
  `info.marginos@gmail.com`

export const NOREPLY_EMAIL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NOREPLY_EMAIL) ||
  `noreply@${PRODUCT_DOMAIN}`

/**
 * Statement descriptor — ask Stripe to update from MARGINOS to Margins365 (K73).
 */
export const STATEMENT_DESCRIPTOR =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STATEMENT_DESCRIPTOR) ||
  'LINK.COM* MARGINS365'
