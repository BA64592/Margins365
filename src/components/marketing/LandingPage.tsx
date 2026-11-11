import { PRODUCT_NAME } from '../../lib/brand'
import { Button } from '../ui'

/** K77 — keyword landing pages (prerender-friendly content). */
export function LandingPage({ kind }: { kind: 'profit-leak' | 'multi-channel' }) {
  if (kind === 'multi-channel') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-navy sm:text-4xl">
          Multi-channel profit for Shopify, Amazon and Etsy
        </h1>
        <p className="mt-3 text-subtle">
          {PRODUCT_NAME} diagnoses true profit across the channels you sell on — from the CSV reports
          you already download. No live store connection.
        </p>
        <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-ink">
          <li>One Control room for Shopify, Amazon and Etsy uploads</li>
          <li>Ranked margin leaks with monthly £ impact</li>
          <li>Plan slots: Starter 1 of 3 platforms, Growth up to 2, Pro and Scale all 3</li>
        </ul>
        <Button className="mt-8" onClick={() => (window.location.href = '/pricing')}>
          Start 14-day free trial
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-semibold text-navy sm:text-4xl">
        Profit leak checklist for online sellers
      </h1>
      <p className="mt-3 text-subtle">
        Use this checklist with {PRODUCT_NAME} to find where margin leaks — ads, returns, fees,
        shipping subsidy, thin pricing and loss-making products.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm text-ink">
        <li>Upload last month’s platform orders (buyer PII is stripped at import).</li>
        <li>Enter unit, packaging and shipping costs — or use the cost template.</li>
        <li>Check Health Score and the six ranked leaks by monthly £ impact.</li>
        <li>Fix the highest-£ leak first; re-upload after the change.</li>
        <li>Use Show the maths on every figure before you change price or ads.</li>
      </ol>
      <Button className="mt-8" onClick={() => (window.location.href = '/sample-shop')}>
        See a sample diagnosis
      </Button>
    </main>
  )
}
