'use client'

import { useEffect, useState } from 'react'

function encodeVapidKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

export default function PushNotifications() {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const available = process.env.NODE_ENV !== 'development' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(available)
    if (!available) return
    void navigator.serviceWorker.ready.then(async (registration) => {
      setEnabled(Boolean(await registration.pushManager.getSubscription()))
    })
  }, [])

  const enablePush = async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) { setMessage('Push notifications are not configured yet.'); return }
    setBusy(true); setMessage('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: encodeVapidKey(publicKey) })
      const response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) })
      if (!response.ok) throw new Error('The push subscription could not be saved.')
      setEnabled(true)
      setMessage('Push notifications are on.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Push notifications could not be enabled.')
    } finally { setBusy(false) }
  }

  if (!supported) return null
  return <section style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}><strong>Phone notifications</strong><p style={{ margin: '0.35rem 0 0.75rem', color: '#64748b', fontSize: '0.85rem' }}>Get join request and approval alerts in your notification center.</p><button type="button" onClick={() => void enablePush()} disabled={busy || enabled} style={{ padding: '0.6rem 0.8rem', border: 0, borderRadius: '8px', background: enabled ? '#dcfce7' : '#111827', color: enabled ? '#166534' : '#fff', fontWeight: 700 }}>{busy ? 'Enabling...' : enabled ? 'Enabled' : 'Enable notifications'}</button>{message ? <p role="status" style={{ margin: '0.6rem 0 0', color: '#475569', fontSize: '0.82rem' }}>{message}</p> : null}</section>
}