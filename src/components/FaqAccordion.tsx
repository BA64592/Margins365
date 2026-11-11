import { useEffect, useState, type ReactNode } from 'react'
import type { HardLimitsFaqEntry } from '../content/hard-limits-faq'

/** K87 — accordion: several open at once; anchors open + scroll; refresh keeps open. */
export function FaqAccordion({
  entries,
  idPrefix = 'faq',
  renderAnswer,
  itemClassName = 'border-t border-border',
}: {
  entries: HardLimitsFaqEntry[]
  idPrefix?: string
  renderAnswer?: (entry: HardLimitsFaqEntry) => ReactNode
  itemClassName?: string
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const hash = window.location.hash.replace(/^#/, '')
    const match = entries.find((e) => `${idPrefix}-${e.id}` === hash)
    return match ? new Set([match.id]) : new Set()
  })

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, '')
      const match = entries.find((e) => `${idPrefix}-${e.id}` === hash)
      if (!match) return
      setOpenIds((prev) => {
        const next = new Set(prev)
        next.add(match.id)
        return next
      })
      requestAnimationFrame(() => {
        document.getElementById(`${idPrefix}-${match.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [entries, idPrefix])

  return (
    <div>
      {entries.map((item) => {
        const expanded = openIds.has(item.id)
        const anchor = `${idPrefix}-${item.id}`
        return (
          <details
            key={item.id}
            id={anchor}
            className={`group scroll-mt-24 ${itemClassName}`}
            open={expanded}
            onToggle={(e) => {
              const el = e.currentTarget
              setOpenIds((prev) => {
                const next = new Set(prev)
                if (el.open) next.add(item.id)
                else next.delete(item.id)
                return next
              })
            }}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-4 font-semibold text-navy outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <span className="text-accent transition group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            {/* Answer remains in the document when closed (K75 prerender / FQ-3). */}
            <div className="pb-4 text-sm leading-relaxed text-subtle sm:text-base">
              {renderAnswer ? renderAnswer(item) : <p>{item.answer}</p>}
            </div>
          </details>
        )
      })}
    </div>
  )
}
