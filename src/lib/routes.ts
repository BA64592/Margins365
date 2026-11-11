/**
 * K63 — real URL routes for public + app screens (spec 23.1).
 * Path is the source of truth for refresh / deep links / back-forward.
 */
export type AppRoute =
  | 'home'
  | 'pricing'
  | 'sample'
  | 'help'
  | 'app'
  | 'legal-terms'
  | 'legal-privacy'
  | 'legal-refunds'
  | 'legal-dpa'
  | 'legal-cookies'
  | 'not-found'

const PATH_BY_ROUTE: Record<AppRoute, string> = {
  home: '/',
  pricing: '/pricing',
  sample: '/sample-shop',
  help: '/help',
  app: '/app',
  'legal-terms': '/legal/terms',
  'legal-privacy': '/legal/privacy',
  'legal-refunds': '/legal/refunds-and-cancellation',
  'legal-dpa': '/legal/dpa',
  'legal-cookies': '/legal/cookies',
  'not-found': '/404',
}

const ROUTE_BY_PATH: Record<string, AppRoute> = Object.fromEntries(
  Object.entries(PATH_BY_ROUTE).map(([route, path]) => [path, route as AppRoute]),
) as Record<string, AppRoute>

/** Legacy Sample report → Sample shop (K60). */
export function normalizePathname(pathname: string): string {
  const raw = pathname.replace(/\/+$/, '') || '/'
  if (raw === '/sample-report') return '/sample-shop'
  return raw
}

export function pathToRoute(pathname: string): AppRoute {
  const path = normalizePathname(pathname)
  return ROUTE_BY_PATH[path] ?? 'not-found'
}

export function routeToPath(route: AppRoute): string {
  return PATH_BY_ROUTE[route] ?? '/'
}

export function pageTitle(route: AppRoute): string {
  switch (route) {
    case 'home':
      return 'Margins365 | True Profit & Margin Leaks for Online Sellers'
    case 'pricing':
      return 'Margins365 Pricing | Plans from £39/mo'
    case 'sample':
      return 'Margins365 Sample Shop | See a Margin Diagnosis'
    case 'help':
      return 'Margins365 Help Centre | Limits, Billing & Contact'
    case 'legal-terms':
      return 'Margins365 Terms of Service'
    case 'legal-privacy':
      return 'Margins365 Privacy Policy'
    case 'legal-refunds':
      return 'Margins365 Refunds & Cancellation'
    case 'legal-dpa':
      return 'Margins365 DPA & Subprocessors'
    case 'legal-cookies':
      return 'Margins365 Cookie Notice'
    case 'app':
      return 'Margins365 — Control room'
    case 'not-found':
      return 'Page not found | Margins365'
    default:
      return 'Margins365'
  }
}

export function pageDescription(route: AppRoute): string {
  switch (route) {
    case 'home':
      return 'See your true profit across Shopify, Amazon and Etsy, and the margin leaks costing you money. 14-day free trial.'
    case 'pricing':
      return 'Starter, Growth, Pro and Scale plans from £39 a month including VAT. 14-day free trial on every plan.'
    case 'sample':
      return 'Browse a sample Margins365 diagnosis: true profit, health score and ranked margin leaks.'
    case 'help':
      return 'Hard limits & billing FAQ, and a Contact us form for Margins365.'
    case 'legal-terms':
      return 'Terms of Service for Margins365 (v20).'
    case 'legal-privacy':
      return 'Privacy Policy for Margins365 (v20).'
    case 'legal-refunds':
      return 'Refunds and cancellation policy for Margins365 (v20).'
    case 'legal-dpa':
      return 'Data Processing Agreement and subprocessors for Margins365 (v20).'
    case 'legal-cookies':
      return 'Cookie notice for Margins365 (v20.1).'
    default:
      return 'Find where your margin leaks and what each leak costs you.'
  }
}
