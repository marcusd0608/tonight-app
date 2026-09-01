'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (isStandalone || window.localStorage.getItem('tonight-install-dismissed') === '1') return

    const userAgent = window.navigator.userAgent.toLowerCase()
    const isMobileDevice = /android|iphone|ipad|ipod/.test(userAgent) ||
      (/macintosh/.test(userAgent) && window.navigator.maxTouchPoints > 1)
    if (!isMobileDevice) return

    const isIos = /iphone|ipad|ipod/.test(userAgent)
    const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent)

    if (isIos && isSafari) setShowIosHelp(true)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  if (dismissed || (!installEvent && !showIosHelp)) return null

  const dismiss = () => {
    window.localStorage.setItem('tonight-install-dismissed', '1')
    setDismissed(true)
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setDismissed(true)
    setInstallEvent(null)
  }

  return (
    <aside
      role="status"
      style={{
        position: 'fixed',
        left: '1rem',
        right: '1rem',
        bottom: 'calc(80px + env(safe-area-inset-bottom))',
        zIndex: 1100,
        maxWidth: '568px',
        margin: '0 auto',
        padding: '1rem',
        border: '1px solid #1f2937',
        borderRadius: '14px',
        background: '#111827',
        color: '#fff',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.25)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <strong style={{ display: 'block', marginBottom: '0.3rem' }}>Add Tonight to your home screen</strong>
          {showIosHelp ? (
            <span style={{ color: '#d1d5db', fontSize: '0.85rem', lineHeight: 1.4 }}>
              Tap Share in Safari, then choose Add to Home Screen.
            </span>
          ) : (
            <span style={{ color: '#d1d5db', fontSize: '0.85rem', lineHeight: 1.4 }}>
              Open it faster and keep it in its own app window.
            </span>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" style={{ border: 0, background: 'transparent', color: '#cbd5e1', fontSize: '1.25rem', lineHeight: 1, cursor: 'pointer' }}>
          ×
        </button>
      </div>
      {installEvent ? (
        <button type="button" onClick={() => void install()} style={{ marginTop: '0.8rem', padding: '0.65rem 0.9rem', border: 0, borderRadius: '9px', background: '#fff', color: '#111827', fontWeight: 700, cursor: 'pointer' }}>
          Install app
        </button>
      ) : null}
    </aside>
  )
}
