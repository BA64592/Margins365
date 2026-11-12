/**
 * K75 — public-route metadata for server-injected HTML (SPA prerender stub).
 * Mirrors src/lib/routes.ts titles/descriptions for crawlers.
 * K87 — FAQPage JSON-LD + noscript FAQ from the single Hard limits source.
 */

import { HARD_LIMITS_FAQ, faqPageJsonLd } from './hard-limits-faq.mjs'

const CANONICAL = 'https://margins365.com'

/** @type {Record<string, { title: string; description: string; noindex?: boolean; h1?: string }>} */
export const PUBLIC_META = {
  '/': {
    title: 'Margins365 | True Profit & Margin Leaks for Online Sellers',
    description:
      'See your true profit across Shopify, Amazon and Etsy, and the margin leaks costing you money. 14-day free trial.',
    h1: 'Know your true profit and where it leaks',
  },
  '/pricing': {
    title: 'Margins365 Pricing | Plans from £39/mo',
    description:
      'Starter, Growth, Pro and Scale plans from £39 a month including VAT. 14-day free trial on every plan.',
    h1: 'Margins365 plans — 14 days free on every tier',
  },
  '/sample-shop': {
    title: 'Margins365 Sample Shop | See a Margin Diagnosis',
    description:
      'Browse a sample Margins365 diagnosis: true profit, health score and ranked margin leaks.',
    h1: 'Sample shop diagnosis',
  },
  '/sample-report': {
    title: 'Margins365 Sample Shop | See a Margin Diagnosis',
    description:
      'Browse a sample Margins365 diagnosis: true profit, health score and ranked margin leaks.',
    h1: 'Sample shop diagnosis',
  },
  '/help': {
    title: 'Margins365 Help Centre | Limits, Billing & Contact',
    description: 'Hard limits & billing FAQ, and a Contact us form for Margins365.',
    h1: 'Help centre',
  },
  '/legal/terms': {
    title: 'Margins365 Terms of Service',
    description: 'Terms of Service for Margins365 (v20).',
    h1: 'Terms of Service',
  },
  '/legal/privacy': {
    title: 'Margins365 Privacy Policy',
    description: 'Privacy Policy for Margins365 (v20).',
    h1: 'Privacy Policy',
  },
  '/legal/refunds-and-cancellation': {
    title: 'Margins365 Refunds & Cancellation',
    description: 'Refunds and cancellation policy for Margins365 (v20).',
    h1: 'Refunds & cancellation',
  },
  '/legal/dpa': {
    title: 'Margins365 DPA & Subprocessors',
    description: 'Data Processing Agreement and subprocessors for Margins365 (v20).',
    h1: 'DPA & subprocessors',
  },
  '/legal/cookies': {
    title: 'Margins365 Cookie Notice',
    description: 'Cookie notice for Margins365 (v20.1).',
    h1: 'Cookie notice',
  },
  // GA-60 / K76 — Phase 2 calculators + keyword landings held: reachable but noindex, not in sitemap
  '/etsy-profit-calculator-uk': {
    title: 'Etsy Profit Calculator UK | Margins365',
    description: 'Free Etsy UK profit calculator — fees, shipping and returns. Values stay in your browser.',
    h1: 'Etsy profit calculator (UK)',
    noindex: true,
  },
  '/amazon-fee-calculator-uk': {
    title: 'Amazon Fee Calculator UK | Margins365',
    description: 'Free Amazon UK fee and profit calculator. Values stay in your browser.',
    h1: 'Amazon fee calculator (UK)',
    noindex: true,
  },
  '/shopify-profit-calculator': {
    title: 'Shopify Profit Calculator | Margins365',
    description: 'Free Shopify profit calculator after payment fees and costs.',
    h1: 'Shopify profit calculator',
    noindex: true,
  },
  '/ecommerce-profit-margin-calculator': {
    title: 'Ecommerce Profit Margin Calculator | Margins365',
    description: 'Free ecommerce profit margin calculator for online sellers.',
    h1: 'Ecommerce profit margin calculator',
    noindex: true,
  },
  '/profit-leak-checklist': {
    title: 'Profit Leak Checklist | Margins365',
    description: 'Checklist to find where margin leaks for Shopify, Amazon and Etsy sellers.',
    h1: 'Profit leak checklist for online sellers',
    noindex: true,
  },
  '/multi-channel-profit': {
    title: 'Multi-Channel Profit | Margins365',
    description: 'True profit across Shopify, Amazon and Etsy from the CSVs you already download.',
    h1: 'Multi-channel profit for Shopify, Amazon and Etsy',
    noindex: true,
  },
  '/sign-in': {
    title: 'Sign in | Margins365',
    description: 'Sign in to Margins365.',
    h1: 'Sign in',
    noindex: true,
  },
  '/reset-password': {
    title: 'Reset password | Margins365',
    description: 'Set a new Margins365 password.',
    h1: 'Reset password',
    noindex: true,
  },
  '/welcome': {
    title: 'Welcome | Margins365',
    description: 'Welcome to Margins365.',
    h1: 'Welcome',
    noindex: true,
  },
  '/invite': {
    title: 'Team invite | Margins365',
    description: 'Accept a Margins365 team invite.',
    h1: 'Team invite',
    noindex: true,
  },
  '/404': {
    title: 'Page not found | Margins365',
    description: 'That page is not on Margins365.',
    h1: 'Page not found',
    noindex: true,
  },
}

const APP_PREFIXES = ['/app', '/account']

export function normalizeSeoPath(pathname) {
  const raw = String(pathname || '/').split('?')[0]
  const cleaned = raw.replace(/\/+$/, '') || '/'
  if (cleaned === '/sample-report') return '/sample-shop'
  return cleaned
}

export function metaForPath(pathname) {
  const path = normalizeSeoPath(pathname)
  if (PUBLIC_META[path]) return { path, ...PUBLIC_META[path], known: true }
  if (APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return {
      path,
      title: 'Margins365',
      description: 'Margins365 account',
      noindex: true,
      known: true,
      app: true,
    }
  }
  return {
    path,
    title: 'Page not found | Margins365',
    description: 'That page is not on Margins365.',
    h1: 'Page not found',
    noindex: true,
    known: false,
  }
}

export function injectHtmlMeta(html, pathname) {
  const meta = metaForPath(pathname)
  const url = `${CANONICAL}${meta.path === '/' ? '/' : meta.path}`
  const robots = meta.noindex ? 'noindex, nofollow' : 'index, follow'
  let out = html
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`)
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
  )
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  )
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
  )
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
  )
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
  )
  if (!/<meta\s+name="robots"/i.test(out)) {
    out = out.replace('</head>', `    <meta name="robots" content="${robots}" />\n  </head>`)
  } else {
    out = out.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="robots" content="${robots}" />`,
    )
  }
  if (meta.h1) {
    const faqBlock =
      meta.path === '/pricing' || meta.path === '/help'
        ? HARD_LIMITS_FAQ.map(
            (e) =>
              `<section id="faq-${escapeAttr(e.id)}"><h2>${escapeHtml(e.question)}</h2><p>${escapeHtml(e.answer)}</p></section>`,
          ).join('')
        : ''
    const snippet = `<noscript><main><h1>${escapeHtml(meta.h1)}</h1><p>${escapeHtml(meta.description)}</p>${faqBlock}</main></noscript>`
    if (!out.includes('</noscript>')) {
      out = out.replace('<div id="root"></div>', `<div id="root"></div>\n    ${snippet}`)
    }
  }
  if (meta.path === '/pricing' || meta.path === '/help') {
    const ld = faqPageJsonLd(meta.path)
    const script = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    if (!out.includes('"@type":"FAQPage"') && !out.includes('"@type": "FAQPage"')) {
      out = out.replace('</head>', `    ${script}\n  </head>`)
    }
  }
  return { html: out, meta, status: meta.known ? 200 : 404 }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;')
}
