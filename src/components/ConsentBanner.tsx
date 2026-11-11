import { useEffect, useState } from 'react'
import { PRODUCT_NAME } from '../lib/brand'
import { Button } from './ui'

const CONSENT_KEY = 'm365_consent'
const NOTICE_VERSION = 'v20.1'

type ConsentRecord = {
  choice: 'accepted' | 'rejected'
  version: string
  at: string
}

function readConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ConsentRecord
  } catch {
    return null
  }
}

function writeConsent(choice: 'accepted' | 'rejected') {
  const rec: ConsentRecord = {
    choice,
    version: NOTICE_VERSION,
    at: new Date().toISOString(),
  }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(rec))
  window.dispatchEvent(new CustomEvent('m365:consent', { detail: rec }))
}

function gpcRejects(): boolean {
  try {
    return Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl)
  } catch {
    return false
  }
}

function loadPlausible() {
  if (document.getElementById('m365-plausible')) return
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN || 'margins365.com'
  const s = document.createElement('script')
  s.id = 'm365-plausible'
  s.defer = true
  s.dataset.domain = domain
  s.src = import.meta.env.VITE_PLAUSIBLE_SRC || 'https://plausible.io/js/script.js'
  document.head.appendChild(s)
}

function removePlausible() {
  document.getElementById('m365-plausible')?.remove()
}

/** K79 — consent banner + cookieless Plausible on public pages only after Accept. */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const apply = (rec: ConsentRecord | null) => {
      if (rec?.choice === 'accepted' && rec.version === NOTICE_VERSION) {
        loadPlausible()
        setVisible(false)
        return
      }
      removePlausible()
      if (gpcRejects()) {
        writeConsent('rejected')
        setVisible(false)
        return
      }
      if (!rec || rec.version !== NOTICE_VERSION) setVisible(true)
      else setVisible(false)
    }
    apply(readConsent())
    const onSettings = () => setVisible(true)
    const onConsent = (e: Event) => apply((e as CustomEvent<ConsentRecord>).detail)
    window.addEventListener('m365:cookie-settings', onSettings)
    window.addEventListener('m365:consent', onConsent)
    return () => {
      window.removeEventListener('m365:cookie-settings', onSettings)
      window.removeEventListener('m365:consent', onConsent)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-elevated p-4 shadow-lg sm:p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink">
          {PRODUCT_NAME} uses essential cookies to sign you in and protect the site. We’d also like to
          use privacy-friendly analytics (Plausible — no cookies, no stored IP) on public pages only.
          You can change this any time in Cookie settings.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              writeConsent('rejected')
              removePlausible()
              setVisible(false)
            }}
          >
            Reject
          </Button>
          <Button
            size="sm"
            onClick={() => {
              writeConsent('accepted')
              loadPlausible()
              setVisible(false)
            }}
          >
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  )
}
