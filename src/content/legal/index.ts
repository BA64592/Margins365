import { legalBody as cookiesBody, legalMeta as cookiesMeta } from './cookies'
import { legalBody as dpaBody, legalMeta as dpaMeta } from './dpa'
import { legalBody as privacyBody, legalMeta as privacyMeta } from './privacy'
import { legalBody as refundsBody, legalMeta as refundsMeta } from './refunds'
import { legalBody as termsBody, legalMeta as termsMeta } from './terms'
import type { AppRoute } from '../../lib/routes'

export type LegalMeta = {
  id: string
  title: string
  version: string
  effectiveDate: string
  slug: string
  pdfHref: string
}

export type LegalDoc = {
  meta: LegalMeta
  body: string
}

export const LEGAL_BY_ROUTE: Partial<Record<AppRoute, LegalDoc>> = {
  'legal-terms': { meta: termsMeta, body: termsBody },
  'legal-privacy': { meta: privacyMeta, body: privacyBody },
  'legal-refunds': { meta: refundsMeta, body: refundsBody },
  'legal-dpa': { meta: dpaMeta, body: dpaBody },
  'legal-cookies': { meta: cookiesMeta, body: cookiesBody },
}

export const LEGAL_FOOTER_LINKS: { route: AppRoute; label: string }[] = [
  { route: 'legal-terms', label: 'Terms' },
  { route: 'legal-privacy', label: 'Privacy' },
  { route: 'legal-refunds', label: 'Refunds & cancellation' },
  { route: 'legal-dpa', label: 'DPA & subprocessors' },
  { route: 'legal-cookies', label: 'Cookies' },
]
