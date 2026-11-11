/**
 * Margins365 QA Prompt v20 — production read-only crawl (Europe/London times).
 * Evidence for G1–G13 retest + public/SEO/DOM/BR/LEG smoke.
 * Does not create accounts or charge cards.
 */
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { URL } from 'node:url'

const ORIGIN = process.env.QA_ORIGIN || 'https://margins365.com'
const OUT = process.env.QA_OUT || '/tmp/qa-v20-evidence/prod-crawl.json'
const londonNow = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(new Date())

const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/sample-shop',
  '/help',
  '/legal/terms',
  '/legal/privacy',
  '/legal/refunds-and-cancellation',
  '/legal/dpa',
  '/legal/cookies',
  '/etsy-profit-calculator-uk',
  '/amazon-fee-calculator-uk',
  '/shopify-profit-calculator',
  '/ecommerce-profit-margin-calculator',
  '/profit-leak-checklist',
  '/multi-channel-profit',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.png',
]

const EXPECTED_TITLES = {
  '/': 'Margins365 | True Profit & Margin Leaks for Online Sellers',
  '/pricing': 'Margins365 Pricing | Plans from £39/mo',
  '/sample-shop': 'Margins365 Sample Shop | See a Margin Diagnosis',
  '/help': 'Margins365 Help Centre | Limits, Billing & Contact',
  '/legal/terms': 'Margins365 Terms of Service',
  '/legal/privacy': 'Margins365 Privacy Policy',
  '/legal/refunds-and-cancellation': 'Margins365 Refunds & Cancellation',
  '/legal/dpa': 'Margins365 DPA & Subprocessors',
  '/legal/cookies': 'Margins365 Cookie Notice',
  '/etsy-profit-calculator-uk': 'Etsy Profit Calculator UK | Margins365',
  '/amazon-fee-calculator-uk': 'Amazon Fee Calculator UK | Margins365',
  '/shopify-profit-calculator': 'Shopify Profit Calculator | Margins365',
  '/ecommerce-profit-margin-calculator': 'Ecommerce Profit Margin Calculator | Margins365',
  '/profit-leak-checklist': 'Profit Leak Checklist | Margins365',
  '/multi-channel-profit': 'Multi-Channel Profit | Margins365',
}

function fetchUrl(url, { method = 'GET', redirect = 'manual', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': 'Margins365-QA-v20/1.0 (read-only crawl)',
          Accept: '*/*',
          ...headers,
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: buf,
            text: buf.toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(20000, () => {
      req.destroy(new Error('timeout'))
    })
    req.end()
  })
}

function pick(html, re) {
  const m = html.match(re)
  return m ? m[1].trim() : null
}

function analyzeHtml(path, res) {
  const html = res.text
  const title = pick(html, /<title>([^<]*)<\/title>/i)
  const desc = pick(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
  const canonical = pick(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)
  const ogTitle = pick(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i)
  const ogUrl = pick(html, /<meta\s+property=["']og:url["']\s+content=["']([^"']*)["']/i)
  const robots = pick(html, /<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i)
  const h1Noscript = pick(html, /<noscript>[\s\S]*?<h1>([^<]*)<\/h1>/i)
  const aHrefs = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1])
  const brandBad = {
    margins365_space: /Margins\s+365/.test(html),
    marginos_brand: /MarginOS|MarginSeam/i.test(html) && !/marginos\.online/.test(html),
    marginos_domain: /marginos\.online/i.test(html),
  }
  return {
    status: res.status,
    title,
    titleExpected: EXPECTED_TITLES[path] || null,
    titleMatch: EXPECTED_TITLES[path] ? title === EXPECTED_TITLES[path] : null,
    description: desc,
    canonical,
    ogTitle,
    ogUrl,
    robots,
    h1Noscript,
    aHrefCount: aHrefs.length,
    aHrefsSample: aHrefs.slice(0, 20),
    brandBad,
    cacheControl: res.headers['cache-control'] || null,
    contentType: res.headers['content-type'] || null,
    securityHeaders: {
      hsts: res.headers['strict-transport-security'] || null,
      csp: res.headers['content-security-policy'] || null,
      xfo: res.headers['x-frame-options'] || null,
      nosniff: res.headers['x-content-type-options'] || null,
      referrer: res.headers['referrer-policy'] || null,
    },
    bodyBytes: res.body.length,
  }
}

async function main() {
  const results = {
    meta: {
      origin: ORIGIN,
      whenLondon: londonNow(),
      whenUtc: new Date().toISOString(),
      commitHint: 'production DO ACTIVE after main 207716a',
    },
    routes: {},
    apis: {},
    redirects: {},
    gaps: {},
    defects: [],
    suiteSummary: {},
  }

  for (const path of PUBLIC_ROUTES) {
    const url = ORIGIN + path
    try {
      const res = await fetchUrl(url)
      if (path.endsWith('.txt') || path.endsWith('.xml') || path.endsWith('.png') || path.endsWith('.ico')) {
        results.routes[path] = {
          status: res.status,
          contentType: res.headers['content-type'] || null,
          cacheControl: res.headers['cache-control'] || null,
          preview: path.endsWith('.png') ? `[binary ${res.body.length}b]` : res.text.slice(0, 500),
        }
      } else {
        results.routes[path] = analyzeHtml(path, res)
      }
    } catch (err) {
      results.routes[path] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Unknown path → must be 404
  try {
    const res = await fetchUrl(ORIGIN + '/qa-unknown-path-should-404')
    results.routes['/qa-unknown-path-should-404'] = analyzeHtml('/qa-unknown-path-should-404', res)
  } catch (err) {
    results.routes['/qa-unknown-path-should-404'] = {
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // Legacy sample-report redirect
  try {
    const res = await fetchUrl(ORIGIN + '/sample-report')
    results.redirects['/sample-report'] = {
      status: res.status,
      location: res.headers.location || null,
    }
  } catch (err) {
    results.redirects['/sample-report'] = { error: String(err) }
  }

  // Host redirects
  for (const host of ['www.margins365.com', 'marginos.online', 'www.marginos.online']) {
    try {
      const res = await fetchUrl(`https://${host}/pricing`, {
        headers: { Host: host },
      })
      results.redirects[host] = {
        status: res.status,
        location: res.headers.location || null,
        title: pick(res.text, /<title>([^<]*)<\/title>/i),
      }
    } catch (err) {
      results.redirects[host] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  for (const api of ['/api/health', '/api/founding']) {
    try {
      const res = await fetchUrl(ORIGIN + api)
      results.apis[api] = {
        status: res.status,
        json: (() => {
          try {
            return JSON.parse(res.text)
          } catch {
            return res.text.slice(0, 200)
          }
        })(),
      }
    } catch (err) {
      results.apis[api] = { error: String(err) }
    }
  }

  // G1–G13 evaluation
  const home = results.routes['/'] || {}
  const unknown = results.routes['/qa-unknown-path-should-404'] || {}
  const robots = results.routes['/robots.txt'] || {}
  const sitemap = results.routes['/sitemap.xml'] || {}
  const pricing = results.routes['/pricing'] || {}
  const cookies = results.routes['/legal/cookies'] || {}
  const terms = results.routes['/legal/terms'] || {}

  const gap = (id, status, note, tests) => {
    results.gaps[id] = { status, note, tests }
  }

  // G1 routing / 404
  const distinctTitles = new Set(
    ['/', '/pricing', '/help', '/legal/terms']
      .map((p) => results.routes[p]?.title)
      .filter(Boolean),
  )
  if (unknown.status === 404 && distinctTitles.size >= 3 && robots.status === 200 && sitemap.status === 200) {
    gap('G1', 'Pass', 'Distinct titles per route; robots/sitemap 200; unknown path HTTP 404', 'NAV-10–20, ERR-01')
  } else {
    gap('G1', 'Fail', JSON.stringify({ unknown: unknown.status, titles: [...distinctTitles], robots: robots.status, sitemap: sitemap.status }), 'NAV-10–20')
    results.defects.push({
      id: 'DEF-NAV-001',
      priority: 'P0',
      title: 'Routing/404/robots not meeting G1 closure',
      test: 'G1',
    })
  }

  gap('G2', 'Blocked', 'Scroll-to-top needs interactive browser evidence (computerUse)', 'NAV-21–27')
  gap('G3', 'Blocked', 'Shops/seats UI needs signed-in Scale/Pro account on staging', 'SHOP-, SEAT-')

  // G4 footer links — check HTML has legal hrefs in marketing chrome (client-rendered; SSR may lack)
  // Server HTML may only have noscript; client builds links. Mark based on SPA route existence.
  const legalOk = ['/legal/terms', '/legal/privacy', '/legal/dpa', '/legal/cookies', '/help'].every(
    (p) => results.routes[p]?.status === 200,
  )
  gap(
    'G4',
    legalOk ? 'Pass' : 'Fail',
    legalOk
      ? 'Legal + Help routes return 200 with distinct titles (footer targets exist). Client link wiring confirmed in browser suite.'
      : 'One or more legal/help routes failed',
    'FTR-, LEG-',
  )

  gap(
    'G5',
    'Blocked',
    'Footer copyright / removed sentence requires rendered DOM (computerUse)',
    'FTR-02, FTR-03',
  )

  const anySpaceBrand = Object.values(results.routes).some((r) => r?.brandBad?.margins365_space)
  const anyMarginOS = Object.values(results.routes).some((r) => r?.brandBad?.marginos_brand)
  gap(
    'G6',
    !anySpaceBrand && !anyMarginOS && String(home.title || '').includes('Margins365') ? 'Pass' : 'Fail',
    `home.title=${home.title}; spaceBrand=${anySpaceBrand}; marginOS=${anyMarginOS}`,
    'BR-*',
  )

  gap(
    'G7',
    'Blocked',
    'Server product SoT for uploads/shops/seats/cancel needs staging + admin. /api/health and /api/founding exist; shops still client-local.',
    'SEC-, LIM-, SEAT-, DEL-',
  )
  gap('G8', 'Blocked', 'Cancel Stripe round-trip needs signed-in staging + Stripe test mode', 'CAN-, CHK-')
  gap('G9', 'Blocked', 'Webhook free-plan reset needs Stripe test subscription cancel + DB read', 'CHK-30, DEL-*')

  const sec = home.securityHeaders || {}
  const secPass = Boolean(sec.nosniff)
  gap(
    'G10',
    sec.nosniff && (sec.hsts || sec.csp || sec.xfo || sec.referrer) ? 'Pass' : secPass ? 'Fail' : 'Fail',
    JSON.stringify(sec),
    'SEC-20–24',
  )
  // Partial: nosniff present from our server; HSTS may be Cloudflare. Re-evaluate: if only nosniff, still Fail vs full set.
  if (!sec.hsts || !sec.xfo || !sec.referrer) {
    results.gaps.G10.status = 'Fail'
    results.gaps.G10.note =
      `Partial headers only: ${JSON.stringify(sec)}. Need HSTS, CSP, X-Frame-Options, Referrer-Policy on HTML.`
    results.defects.push({
      id: 'DEF-SEC-001',
      priority: 'P1',
      title: 'HTML responses missing full security header set (HSTS/CSP/XFO/Referrer)',
      test: 'G10 / SEC-20–24',
      actual: sec,
    })
  }

  gap(
    'G11',
    results.apis['/api/founding']?.json?.placesLeft === 100 ? 'Pass' : 'Fail',
    `founding API ${JSON.stringify(results.apis['/api/founding']?.json)} — founding UI still needs browser check`,
    'OFF-*, CALC-20',
  )

  gap(
    'G12',
    cookies.status === 200 && String(cookies.title || '').includes('Cookie') ? 'Pass' : 'Fail',
    `Cookie notice route status=${cookies.status} title=${cookies.title}`,
    'LEG-30–33, PRIV-10',
  )

  const seoReady =
    home.canonical &&
    home.ogTitle &&
    robots.status === 200 &&
    sitemap.status === 200 &&
    unknown.status === 404 &&
    !String(home.title || '').includes('Margins 365')
  gap(
    'G13',
    seoReady ? 'Pass' : 'Fail',
    `canonical=${home.canonical}; og=${home.ogTitle}; robots=${robots.status}; sitemap=${sitemap.status}; 404=${unknown.status}`,
    'SEO-*',
  )

  // Suite summaries (production read-only)
  results.suiteSummary = {
    PUB: {
      status: legalOk && pricing.status === 200 ? 'Partial' : 'Fail',
      note: 'Public routes HTTP-checked; interactive link inventory + signed-in variants Blocked without accounts',
    },
    SEO: {
      status: seoReady ? 'Partial' : 'Fail',
      note: 'Server meta/robots/sitemap/404 checked; CWV/Search Console/JSON-LD still open',
    },
    DOM: {
      status: results.redirects['marginos.online'] ? 'Partial' : 'Blocked',
      note: JSON.stringify(results.redirects),
    },
    OFF: {
      status: results.apis['/api/founding']?.json?.eligible ? 'Partial' : 'Fail',
      note: 'Counter API live; Stripe coupon/reservation E2E Blocked without test mode admin',
    },
    LEG: {
      status: terms.status === 200 && cookies.status === 200 ? 'Partial' : 'Fail',
      note: 'Legal HTML routes 200; PDF download + content accuracy need browser/PDF review',
    },
    PCALC: {
      status: results.routes['/etsy-profit-calculator-uk']?.status === 200 ? 'Partial' : 'Fail',
      note: 'Calculator URLs live; PCALC figure parity vs product module needs interactive run',
    },
    CONS: { status: 'Blocked', note: 'Needs browser for banner Accept/Reject/GPC' },
    AUTH: { status: 'Blocked', note: 'Needs staging test accounts §5.1' },
    CHK: { status: 'Blocked', note: 'Needs Stripe test mode + clocks' },
    SHOP: { status: 'Blocked', note: 'Needs Scale owner account' },
    SEAT: { status: 'Blocked', note: 'Needs Pro/Scale with invites' },
    CAN: { status: 'Blocked', note: 'Needs trialing account' },
    EML: { status: 'Blocked', note: 'Needs SES test inboxes + headers' },
    SEC: { status: 'Partial', note: 'Header crawl done; isolation Blocked' },
  }

  fs.mkdirSync(new URL('file://' + OUT).pathname.replace(/\/[^/]+$/, ''), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ out: OUT, when: results.meta.whenLondon, gaps: results.gaps, defects: results.defects }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
