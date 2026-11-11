import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { hasPaidAccess } from '../lib/plans'
import { en } from '../i18n/en'
import { DEMO_STORES } from '../lib/demo/stores'
import { SAMPLE_ADS_TEMPLATE, SAMPLE_COST_TEMPLATE, parseCostTemplate } from '../lib/csv/template'
import { formatMoney, formatPct } from '../lib/format'
import { proUnlockPaywallCopy } from '../lib/pricing'
import { cn } from '../lib/cn'
import { ClearSampleDataButton } from './ConfirmActions'
import { FreeRetentionBanner } from './FreeRetentionBanner'
import { PlatformImport } from './PlatformImport'
import { SliderField } from './SliderField'
import { Badge, Button, Card, SectionHeading } from './ui'
import { MathsDisclosure } from './MathsDisclosure'

const VERDICT_TONE = {
  Healthy: 'ok',
  Thin: 'warn',
  'Losing money': 'danger',
  'No revenue': 'neutral',
} as const

export function ProductWorkspace() {
  const {
    result,
    plan,
    access,
    currency,
    costs,
    selectedSku,
    setSelectedSku,
    updateCost,
    loadSample,
    loadDemoStore,
    recordSuccessfulUpload,
    replaceTemplate,
    setAdTotalManual,
    ads,
    uploadsLeft,
    setUpgradeOpen,
    user,
    setAuthOpen,
    warnings,
    usingSampleData,
    isEmptyShop,
    sampleClearedNotice,
    dismissSampleClearedNotice,
    lines,
  } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvMsg, setCsvMsg] = useState<string | null>(null)
  const hasOwnData = lines.some((l) => !l.isSample) || costs.some((c) => !c.isSample)

  const freeTop = result.products.filter((p) => p.revenue > 0).slice(0, 10)
  const visibleProducts = hasPaidAccess(access) ? result.products : freeTop
  const hiddenCount = plan === 'none' ? Math.max(0, result.products.length - freeTop.length) : 0
  const selected = visibleProducts.find((p) => p.sku === selectedSku) ?? visibleProducts[0]
  const selectedCost = costs.find((c) => c.sku === selected?.sku)

  const onTemplate = async (file: File) => {
    if (!user) {
      setAuthOpen(true)
      setCsvMsg('Sign in and verify your email before uploading.')
      return
    }
    if (!user.emailVerified) {
      setAuthOpen(true)
      setCsvMsg('Verify your email before your first upload.')
      return
    }
    if (plan === 'none' && uploadsLeft <= 0) {
      setUpgradeOpen(true)
      setCsvMsg(en.uploadsExhausted)
      return
    }
    const text = await file.text()
    const parsed = parseCostTemplate(text, currency)
    if (!parsed.costs.length && !parsed.ads.length) {
      setCsvMsg(
        parsed.errors.length
          ? `Import failed: ${parsed.errors.join('; ')}`
          : 'Import failed — no valid rows.',
      )
      return
    }
    if (!recordSuccessfulUpload()) return
    const applied = parsed.costs.length
      ? replaceTemplate(parsed.costs, parsed.ads.length ? parsed.ads : undefined)
      : replaceTemplate(costs, parsed.ads)
    setCsvMsg(
      [
        parsed.costs.length ? `${parsed.costs.length} cost rows imported.` : null,
        parsed.ads.length ? `${parsed.ads.length} ad rows imported.` : null,
        'Original file deleted after import.',
        applied.deletionNote,
        parsed.errors.length ? `Skipped: ${parsed.errors.join('; ')}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  return (
    <section>
      <SectionHeading
        eyebrow="Inputs"
        title="Orders, costs & ads"
        description={
          isEmptyShop
            ? 'Upload a Shopify, Amazon or Etsy export — or load sample data to explore the calculator.'
            : usingSampleData
              ? 'Sample orders from Shopify, Amazon and Etsy are loaded so you can explore. Upload your own export when you’re ready.'
              : 'Edit unit costs below, or upload a Margins365 cost template and fresh platform orders.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            {!hasOwnData ? (
              <>
                <Button variant="secondary" size="sm" onClick={loadSample}>
                  Load sample
                </Button>
                {DEMO_STORES.map((s) => (
                  <Button
                    key={s.id}
                    variant="secondary"
                    size="sm"
                    title={s.story}
                    onClick={() => loadDemoStore(s.id)}
                  >
                    {s.label}
                  </Button>
                ))}
              </>
            ) : null}
            <ClearSampleDataButton />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (plan === 'none' && uploadsLeft <= 0) setUpgradeOpen(true)
                else fileRef.current?.click()
              }}
            >
              <Upload className="h-4 w-4" />
              Template CSV
            </Button>
          </div>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onTemplate(f)
          e.target.value = ''
        }}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
        {usingSampleData ? <Badge tone="warn">Sample data</Badge> : null}
        {plan === 'none' ? (
          <Badge tone={uploadsLeft === 0 ? 'danger' : 'warn'}>
            {uploadsLeft} of 3 uploads left today
          </Badge>
        ) : (
          <Badge tone="ok">Unlimited uploads</Badge>
        )}
        <Badge tone="neutral">{result.totals.orderCount} orders</Badge>
        <Badge tone="neutral">
          {result.totals.period.start} → {result.totals.period.end} ({result.totals.period.days} days)
        </Badge>
        <button
          type="button"
          className="font-medium text-accent underline-offset-2 hover:underline"
          onClick={() => {
            const blob = new Blob([SAMPLE_COST_TEMPLATE], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'margins365-cost-template.csv'
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Download cost template
        </button>
        <button
          type="button"
          className="font-medium text-accent underline-offset-2 hover:underline"
          onClick={() => {
            const blob = new Blob([SAMPLE_ADS_TEMPLATE], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'margins365-ads-template.csv'
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Ads template
        </button>
      </div>

      <div className="mb-4">
        <FreeRetentionBanner />
      </div>

      <PlatformImport />

      {isEmptyShop ? (
        <Card className="mb-4 border-accent/30 bg-accent-soft/30" id="empty-upload-prompt">
          <p className="text-sm font-semibold text-ink">Upload your orders to get started</p>
          <p className="mt-1 text-sm text-subtle">
            Choose Shopify, Amazon or Etsy above and import your export. Loading sample data does
            not use a Free upload.
          </p>
        </Card>
      ) : null}

      {sampleClearedNotice ? (
        <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
          <span>{sampleClearedNotice}</span>
          <button
            type="button"
            className="font-semibold underline-offset-2 hover:underline"
            onClick={dismissSampleClearedNotice}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {csvMsg ? (
        <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-ink">{csvMsg}</p>
      ) : null}
      {warnings.map((w) => (
        <p key={w} className="mb-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
          {w}
        </p>
      ))}
      {hiddenCount > 0 ? (
        <p className="mb-3 text-sm text-subtle">
          Showing top 10 products by revenue. {hiddenCount} more{' '}
          {hiddenCount === 1 ? 'product exists' : 'products exist'} — unlock detail in Pro.
        </p>
      ) : null}

      <div className="mb-4">
        <SliderField
          label="Ad spend for this period"
          value={ads.reduce((s, a) => s + a.amount, 0)}
          min={0}
          max={20000}
          step={50}
          suffix={currency}
          onChange={setAdTotalManual}
          hint={
            hasPaidAccess(access)
              ? 'Pro can split ads by channel and match spend to the revenue those ads drove.'
              : 'Enter your total ad spend for the period. Pro can split spend by channel.'
          }
        />
      </div>

      {isEmptyShop ? null : (
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="max-h-[560px] overflow-auto p-2 sm:p-3">
          <ul className="space-y-1">
            {visibleProducts.map((product) => {
              const active = product.sku === selected?.sku
              return (
                <li key={product.sku}>
                  <button
                    type="button"
                    onClick={() => setSelectedSku(product.sku)}
                    className={cn(
                      // Spec v17 §15.4–15.5: ≥44px tap; name + verdict + profit always visible
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition',
                      active ? 'bg-accent-soft text-ink' : 'hover:bg-muted',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{product.name}</span>
                      <span className="block text-xs text-subtle">
                        {plan === 'none'
                          ? `${formatPct(product.netMarginPct)} · ${product.unitsSold} units`
                          : `${formatMoney(product.netProfit, currency)} · ${formatPct(product.netMarginPct)} · ${product.unitsSold} units`}
                      </span>
                    </span>
                    <Badge tone={VERDICT_TONE[product.verdict]}>{product.verdict}</Badge>
                  </button>
                </li>
              )
            })}
          </ul>
          {plan === 'none' ? (
            <p className="mt-2 px-2 text-xs text-subtle">
              Free shows Losing money / Thin / Healthy on your top 10 products by revenue.
            </p>
          ) : null}
        </Card>

        {selected ? (
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-semibold text-ink">{selected.name}</h3>
              <Badge tone={VERDICT_TONE[selected.verdict]}>{selected.verdict}</Badge>
              {selectedCost?.digital ? <Badge tone="accent">Digital</Badge> : null}
              {selected.costMissing ? <Badge tone="danger">cost missing</Badge> : null}
            </div>
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(plan === 'none'
                ? [
                    ['Margin', formatPct(selected.netMarginPct)],
                    ['Revenue', formatMoney(selected.revenue, currency)],
                    ['Return rate', formatPct(selected.unitReturnRate * 100)],
                    ['Verdict', selected.verdict],
                  ]
                : [
                    ['True profit', formatMoney(selected.netProfit, currency)],
                    ['Margin', formatPct(selected.netMarginPct)],
                    ['Revenue', formatMoney(selected.revenue, currency)],
                    ['Return rate', formatPct(selected.unitReturnRate * 100)],
                  ]
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-muted/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
                  <p className="font-display text-lg font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>

              {hasPaidAccess(access) ? (
              <div className="mb-5 rounded-xl border border-accent/20 bg-accent-soft/40 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Target price</p>
                <p className="mt-1 font-display text-xl font-semibold text-ink">
                  {selected.targetPrice == null
                    ? '—'
                    : formatMoney(selected.targetPrice, currency)}
                </p>
                <p className="mt-1 text-sm text-subtle">{selected.targetPriceNote}</p>
                <MathsDisclosure lines={[selected.maths.target].filter(Boolean)} />
              </div>
            ) : (
              <p className="mb-4 text-sm text-subtle">
                Target price for every product is included with Pro.{' '}
                <button type="button" className="font-semibold text-accent" onClick={() => setUpgradeOpen(true)}>
                  {proUnlockPaywallCopy()}
                </button>
              </p>
            )}

            {selectedCost ? (
              <div className="space-y-5">
                <label className="flex items-start gap-2 rounded-xl bg-muted/80 px-3 py-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedCost.digital}
                    onChange={(e) => updateCost(selected.sku, { digital: e.target.checked })}
                  />
                  <span>
                    <span className="font-semibold">Digital product</span>
                    <span className="mt-0.5 block text-xs text-subtle">
                      Mark manually if this listing has no physical shipping (Etsy and others do not
                      auto-detect). Shipping cost is ignored for digital.
                    </span>
                  </span>
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <SliderField
                    label="Unit cost"
                    value={selectedCost.unitCost}
                    min={0}
                    max={100}
                    step={0.5}
                    suffix={currency}
                    onChange={(unitCost) => updateCost(selected.sku, { unitCost })}
                  />
                  <SliderField
                    label="Packaging"
                    value={selectedCost.packagingCost}
                    min={0}
                    max={20}
                    step={0.1}
                    suffix={currency}
                    onChange={(packagingCost) => updateCost(selected.sku, { packagingCost })}
                  />
                  <SliderField
                    label="Avg shipping cost / unit"
                    value={selectedCost.shippingCostPerUnit}
                    min={0}
                    max={20}
                    step={0.1}
                    suffix={currency}
                    onChange={(shippingCostPerUnit) =>
                      updateCost(selected.sku, { shippingCostPerUnit })
                    }
                    hint={
                      selectedCost.digital
                        ? 'Not used while this product is marked digital.'
                        : 'Used when an order line has no shipping cost of its own.'
                    }
                  />
                  <SliderField
                    label="Return cost / returned unit"
                    value={selectedCost.returnCostPerReturnedUnit}
                    min={0}
                    max={20}
                    step={0.1}
                    suffix={currency}
                    onChange={(returnCostPerReturnedUnit) =>
                      updateCost(selected.sku, { returnCostPerReturnedUnit })
                    }
                  />
                </div>
              </div>
            ) : null}

            <MathsDisclosure
              lines={[
                selected.maths.revenue,
                selected.maths.cm,
                selected.maths.net,
                selected.maths.fees,
              ].filter(Boolean)}
            />
            {hasPaidAccess(access) ? (
              <p className="mt-3 text-sm text-subtle">
                Return cost {formatMoney(selected.returnCost, currency)}
                {selected.refundUnitsEstimated ? ' (estimated from refund amount)' : ''}.
              </p>
            ) : (
              <p className="mt-3 text-xs text-subtle">
                A full refund breakdown per product is included with Pro.
              </p>
            )}
          </Card>
        ) : null}
      </div>
      )}
    </section>
  )
}
