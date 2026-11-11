import { useApp } from '../../context/AppContext'
import { PRODUCT_NAME } from '../../lib/brand'
import { Button } from '../ui'

/** K63 / SEO — real 404 page (client route; server should also return 404 for unknown paths). */
export function NotFoundPage() {
  const { setRoute, user } = useApp()
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-start justify-center px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Page not found</h1>
      <p className="mt-2 text-sm text-subtle">
        That address isn’t part of {PRODUCT_NAME}. Try Home
        {user ? ' or your Control room' : ''}.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => setRoute('home')}>Home</Button>
        {user ? (
          <Button variant="secondary" onClick={() => setRoute('app')}>
            Control room
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setRoute('pricing')}>
            Pricing
          </Button>
        )}
      </div>
    </main>
  )
}
