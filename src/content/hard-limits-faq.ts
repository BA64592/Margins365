/**
 * K87 — Hard limits & billing FAQ (single source with JSON).
 * Pricing, Help centre and FAQPage JSON-LD all consume this module.
 */
import data from './hard-limits-faq.json'

export type FaqGroupId =
  | 'getting-started'
  | 'trial-plans-billing'
  | 'order-limits-shops-seats'
  | 'data-privacy'
  | 'feedback-contact'

export type HardLimitsFaqEntry = {
  id: string
  order: number
  group: FaqGroupId
  question: string
  answer: string
}

export const HARD_LIMITS_FAQ = data.HARD_LIMITS_FAQ as HardLimitsFaqEntry[]
export const HARD_LIMITS_FAQ_GROUPS = data.HARD_LIMITS_FAQ_GROUPS as {
  id: FaqGroupId
  title: string
}[]
export const HARD_LIMITS_FAQ_HELP_ORDER = data.HARD_LIMITS_FAQ_HELP_ORDER as Record<
  FaqGroupId,
  string[]
>
export const HELP_SIGN_IN_FAQ = data.HELP_SIGN_IN_FAQ as {
  id: string
  question: string
  answer: string
}[]

export function faqById(id: string): HardLimitsFaqEntry | null {
  return HARD_LIMITS_FAQ.find((e) => e.id === id) ?? null
}

export function faqPageJsonLd(canonicalPath: string) {
  const pageUrl = `https://margins365.com${canonicalPath}`
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: pageUrl,
    mainEntity: HARD_LIMITS_FAQ.map((e) => ({
      '@type': 'Question',
      name: e.question,
      url: `${pageUrl}#faq-${e.id}`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: e.answer,
      },
    })),
  }
}
