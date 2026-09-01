'use client'

import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type AnalyticsEvent = {
  id: string
  user_id: string | null
  event_name: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export default function AdminAnalyticsPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    const loadEvents = async () => {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.getUser()

      if (authError || !authData.user) {
        router.replace('/profile')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (profileError || !profile?.is_admin) {
        router.replace('/profile')
        return
      }

      const { data, error } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        setMessage(error.message)
      } else {
        setEvents(data ?? [])
      }

      setLoading(false)
    }

    void loadEvents()
  }, [router])

  return (
    <main style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 0.9rem', borderRadius: '10px', border: '1px solid #d1d5db', background: '#fff', color: '#111827', textDecoration: 'none', fontWeight: 700 }}>
          ← Back
        </Link>
        <h1 style={{ margin: 0 }}>Analytics</h1>
      </div>

      {message ? <p role="alert" style={{ color: '#b91c1c' }}>{message}</p> : null}

      {loading ? (
        <p>Loading analytics...</p>
      ) : events.length === 0 ? (
        <p>No analytics events yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {events.map((event) => (
            <article key={event.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', background: '#fff' }}>
              <p style={{ margin: '0 0 0.35rem', color: '#64748b', fontSize: '0.8rem' }}>{new Date(event.created_at).toLocaleString()}</p>
              <p style={{ margin: '0 0 0.2rem' }}><strong>Event:</strong> {event.event_name}</p>
              <p style={{ margin: '0 0 0.2rem' }}><strong>User:</strong> {event.user_id ?? 'anonymous'}</p>
              <pre style={{ margin: 0, background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(event.metadata ?? {}, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
