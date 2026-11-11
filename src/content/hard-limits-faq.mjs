/**
 * K87 — Node re-export of the Hard limits FAQ JSON (for seo-meta.mjs).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(dir, 'hard-limits-faq.json'), 'utf8'))

export const HARD_LIMITS_FAQ = data.HARD_LIMITS_FAQ
export const HARD_LIMITS_FAQ_GROUPS = data.HARD_LIMITS_FAQ_GROUPS
export const HARD_LIMITS_FAQ_HELP_ORDER = data.HARD_LIMITS_FAQ_HELP_ORDER
export const HELP_SIGN_IN_FAQ = data.HELP_SIGN_IN_FAQ

export function faqById(id) {
  return HARD_LIMITS_FAQ.find((e) => e.id === id) || null
}

export function faqPageJsonLd(canonicalPath) {
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
