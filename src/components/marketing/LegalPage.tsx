import { LEGAL_BY_ROUTE } from '../../content/legal'
import type { AppRoute } from '../../lib/routes'
import { Button } from '../ui'

/** K74 — public legal document page with Download PDF. */
export function LegalPage({ route }: { route: AppRoute }) {
  const doc = LEGAL_BY_ROUTE[route]
  if (!doc) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-navy">Document not found</h1>
      </main>
    )
  }
  const { meta, body } = doc
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
        {meta.title}
      </h1>
      <p className="mt-2 text-sm text-subtle">
        Version {meta.version} · Effective {meta.effectiveDate}
      </p>
      <div className="mt-4">
        <a href={meta.pdfHref} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="sm">
            Download PDF
          </Button>
        </a>
      </div>
      <article className="prose-legal mt-10 space-y-4 text-sm leading-relaxed text-ink whitespace-pre-wrap">
        {body}
      </article>
    </main>
  )
}
