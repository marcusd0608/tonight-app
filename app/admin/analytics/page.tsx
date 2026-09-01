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

const trackedMetrics = [
  {
    eventName: 'user_signed_up',
    title: 'Signups',
    description: 'Users who completed email verification.',
  },
  {
    eventName: 'completed_onboarding',
    title: 'Activations',
    description: 'Users who completed profile onboarding.',
  },
  {
    eventName: 'friday_night_open',
    title: 'Friday-night opens',
    description: 'Opens of Tonight on Friday night.',
  },
]

const plannedMetrics = [
  { title: 'Page views', description: 'Provided by Vercel Analytics.', status: 'External dashboard' },
  { title: 'Activation rate', description: 'Activations divided by signups.', status: 'Calculated when data exists' },
  { title: 'October retention', description: 'Returning users after signup.', status: 'Not tracked yet' },
]

export default function AdminAnalyticsPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})
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

      const [eventCountsResult, recentEventsResult] = await Promise.all([
        Promise.all(trackedMetrics.map(async (metric) => {
          const { count, error } = await supabase
            .from('analytics_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_name', metric.eventName)
          return { eventName: metric.eventName, count: count ?? 0, error }
        })),
        supabase
          .from('analytics_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      const countError = eventCountsResult.find((result) => result.error)?.error
      if (countError || recentEventsResult.error) {
        setMessage((countError ?? recentEventsResult.error)?.message ?? 'Analytics could not be loaded.')
      } else {
        setEventCounts(Object.fromEntries(eventCountsResult.map((result) => [result.eventName, result.count])))
        setEvents(recentEventsResult.data ?? [])
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

      <section>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Checkpoint overview</h2>
        <p style={{ color: '#64748b', marginTop: 0 }}>The core numbers needed for the October retention checkpoint.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
          {trackedMetrics.map((metric) => {
            const matchingEvents = events.filter((event) => event.event_name === metric.eventName)
            const uniqueRecentUsers = new Set(matchingEvents.map((event) => event.user_id).filter(Boolean)).size
            const eventCount = eventCounts[metric.eventName] ?? 0

            return (
              <article key={metric.eventName} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', background: '#fff' }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>{metric.title}</p>
                <strong style={{ display: 'block', margin: '0.35rem 0', fontSize: '2rem', color: '#111827' }}>
                  {loading ? '...' : eventCount}
                </strong>
                <p style={{ margin: 0, color: '#475569', fontSize: '0.82rem' }}>{metric.description}</p>
                <p style={{ margin: '0.65rem 0 0', color: '#64748b', fontSize: '0.78rem' }}>
                  {loading ? 'Loading...' : eventCount === 0 ? 'Empty' : `${uniqueRecentUsers} unique users in recent log`}
                </p>
              </article>
            )
          })}
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Analytics outline</h2>
        <p style={{ color: '#64748b', marginTop: 0 }}>What is available now and what still needs instrumentation.</p>
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {plannedMetrics.map((metric) => (
            <article key={metric.title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '1px solid #e5e7eb', padding: '0.75rem 0' }}>
              <div>
                <strong>{metric.title}</strong>
                <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>{metric.description}</p>
              </div>
              <span style={{ color: '#64748b', fontSize: '0.78rem', textAlign: 'right' }}>{metric.status}</span>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Recent event log</h2>
        {loading ? <p>Loading event log...</p> : events.length === 0 ? <p style={{ color: '#64748b' }}>Empty. Events will appear here after users trigger tracked actions.</p> : <div style={{ display: 'grid', gap: '0.75rem' }}>{events.map((event) => <article key={event.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', background: '#fff' }}><p style={{ margin: '0 0 0.35rem', color: '#64748b', fontSize: '0.8rem' }}>{new Date(event.created_at).toLocaleString()}</p><p style={{ margin: '0 0 0.2rem' }}><strong>Event:</strong> {event.event_name}</p><p style={{ margin: '0 0 0.2rem' }}><strong>User:</strong> {event.user_id ?? 'anonymous'}</p><pre style={{ margin: 0, background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(event.metadata ?? {}, null, 2)}</pre></article>)}</div>}
      </section>
    </main>
  )
}
