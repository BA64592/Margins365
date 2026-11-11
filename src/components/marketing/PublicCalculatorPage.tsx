import { useMemo, useState } from 'react'
import { PRODUCT_NAME } from '../../lib/brand'
import { roundMoney } from '../../lib/money'
import { Button, Input } from '../ui'

type CalcKind = 'etsy' | 'amazon' | 'shopify' | 'ecommerce'

const COPY: Record<
  CalcKind,
  { title: string; blurb: string; feePct: number; feeFixed: number }
> = {
  etsy: {
    title: 'Etsy profit calculator (UK)',
    blurb: 'Estimate true profit on an Etsy UK order after fees, shipping and returns.',
    feePct: 6.5,
    feeFixed: 0.2,
  },
  amazon: {
    title: 'Amazon fee calculator (UK)',
    blurb: 'Estimate contribution after Amazon UK referral-style fees (Everything else preset).',
    feePct: 15,
    feeFixed: 0.25,
  },
  shopify: {
    title: 'Shopify profit calculator',
    blurb: 'Estimate true profit on a Shopify order after payment fees and costs.',
    feePct: 1.5,
    feeFixed: 0.2,
  },
  ecommerce: {
    title: 'Ecommerce profit margin calculator',
    blurb: 'Generic margin calculator for online sellers — same rounding as Margins365.',
    feePct: 3,
    feeFixed: 0,
  },
}

/** K76 — free public calculators; values stay in the browser. */
export function PublicCalculatorPage({ kind }: { kind: CalcKind }) {
  const meta = COPY[kind]
  const [price, setPrice] = useState('30')
  const [unitCost, setUnitCost] = useState('8')
  const [packaging, setPackaging] = useState('1')
  const [shippingCost, setShippingCost] = useState('3.5')
  const [shippingCharged, setShippingCharged] = useState('3.5')
  const [adSpend, setAdSpend] = useState('0')
  const [returnRate, setReturnRate] = useState('5')

  const result = useMemo(() => {
    const p = Number(price) || 0
    const c = Number(unitCost) || 0
    const pack = Number(packaging) || 0
    const shipC = Number(shippingCost) || 0
    const shipCh = Number(shippingCharged) || 0
    const ads = Number(adSpend) || 0
    const rr = Math.min(100, Math.max(0, Number(returnRate) || 0)) / 100
    const revenue = p + shipCh
    const fees = roundMoney((p * meta.feePct) / 100 + meta.feeFixed)
    const productCost = c + pack
    const returnCost = roundMoney((productCost + shipC) * rr)
    const trueProfit = roundMoney(revenue - productCost - shipC - fees - ads - returnCost)
    const netMargin = revenue > 0 ? roundMoney((trueProfit / revenue) * 100) : 0
    const beRoas = ads > 0 ? roundMoney(revenue / ads) : null
    return { revenue, fees, productCost, returnCost, trueProfit, netMargin, beRoas }
  }, [price, unitCost, packaging, shippingCost, shippingCharged, adSpend, returnRate, meta])

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Free calculator</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy sm:text-4xl">{meta.title}</h1>
      <p className="mt-2 text-sm text-subtle">
        {meta.blurb} Values never leave your browser. Not tax advice. Part of {PRODUCT_NAME}.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {(
          [
            ['Selling price', price, setPrice],
            ['Unit cost', unitCost, setUnitCost],
            ['Packaging', packaging, setPackaging],
            ['Shipping cost', shippingCost, setShippingCost],
            ['Shipping charged', shippingCharged, setShippingCharged],
            ['Ad spend', adSpend, setAdSpend],
            ['Return rate %', returnRate, setReturnRate],
          ] as const
        ).map(([label, val, set]) => (
          <label key={label} className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-subtle">{label}</span>
            <Input type="number" inputMode="decimal" value={val} onChange={(e) => set(e.target.value)} />
          </label>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-elevated p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Results</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-subtle">Revenue</dt>
            <dd className="font-display text-lg font-semibold">£{result.revenue.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Fees (est.)</dt>
            <dd className="font-display text-lg font-semibold">£{result.fees.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">True profit</dt>
            <dd className="font-display text-lg font-semibold text-accent">
              £{result.trueProfit.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Net margin</dt>
            <dd className="font-display text-lg font-semibold">{result.netMargin.toFixed(1)}%</dd>
          </div>
          {result.beRoas != null ? (
            <div>
              <dt className="text-xs text-subtle">ROAS</dt>
              <dd className="font-display text-lg font-semibold">{result.beRoas.toFixed(2)}x</dd>
            </div>
          ) : null}
        </dl>
        <details className="mt-4 text-sm text-subtle">
          <summary className="cursor-pointer font-semibold text-ink">Show the maths</summary>
          <p className="mt-2">
            Revenue = price + shipping charged. Fees ≈ {meta.feePct}% + £{meta.feeFixed.toFixed(2)}.
            True profit = revenue − product − shipping cost − fees − ads − return cost.
          </p>
        </details>
      </div>
      <div className="mt-6">
        <Button onClick={() => (window.location.href = '/pricing')}>Start 14-day free trial</Button>
      </div>
    </main>
  )
}
