/**
 * Shared support inbox + From identity for SES.
 * Contact / suggestions → SUPPORT_INBOX.
 * Customer mail Reply-To → SUPPORT_INBOX.
 * From stays Margins365 <no-reply@margins365.com> (or SES_FROM_* override).
 */
export const SUPPORT_INBOX =
  process.env.CONTACT_INBOX || process.env.SUPPORT_INBOX || 'Margins365@gmail.com'

const DEFAULT_FROM = 'Margins365 <no-reply@margins365.com>'

/** SES FromEmailAddress with display name when env is a bare address. */
export function sesFromAddress() {
  const raw = String(process.env.SES_FROM_ADDRESS || process.env.SES_FROM_EMAIL || '').trim()
  if (!raw) return DEFAULT_FROM
  if (raw.includes('<') && raw.includes('>')) return raw
  // Bare address — attach product display name (K / support brief).
  if (/^no-?reply@margins365\.com$/i.test(raw) || /^noreply@margins365\.com$/i.test(raw)) {
    return `Margins365 <${raw.replace(/^noreply@/i, 'no-reply@')}>`
  }
  return raw
}
