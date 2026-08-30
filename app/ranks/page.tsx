'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'

type Profile = { id: string; tower: string | null; floor: number | null }
type Post = { user_id: string; event_id: string; created_at: string }
type GoingOut = { user_id: string; created_at: string }
type Rank = { tower: string; floor: number; points: number; population: number; activeUsers: number }

const MAX_POINTS_PER_NIGHT = 20
const POST_POINTS = 10
const GOING_OUT_POINTS = 5
const FIRST_EVENT_POINTS = 5

const getLosAngelesDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

const getWeekStart = () => {
  const current = getLosAngelesDateParts(new Date())
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(current.weekday)
  const localDate = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) - weekday))
  return localDate.toISOString()
}

export default function RanksPage() {
  const [ranks, setRanks] = useState<Rank[]>([])
  const [weekStart, setWeekStart] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadRanks = async () => {
      const supabase = createClient()
      const start = getWeekStart()
      setWeekStart(start)
      const [{ data: profiles, error: profileError }, { data: posts, error: postError }, { data: goingOut, error: goingOutError }] = await Promise.all([
        supabase.from('profiles').select('id, tower, floor'),
        supabase.from('posts').select('user_id, event_id, created_at').gte('created_at', start).order('created_at', { ascending: true }),
        supabase.from('going_out').select('user_id, created_at').gte('created_at', start)
      ])

      if (profileError || postError || goingOutError) {
        setMessage(profileError?.message ?? postError?.message ?? goingOutError?.message ?? 'Could not load ranks.')
        setLoading(false)
        return
      }

      const typedProfiles = (profiles ?? []) as Profile[]
      const typedPosts = (posts ?? []) as Post[]
      const typedGoingOut = (goingOut ?? []) as GoingOut[]
      const firstPostByEvent = new Map<string, string>()
      typedPosts.forEach((post) => {
        if (!firstPostByEvent.has(post.event_id)) firstPostByEvent.set(post.event_id, post.user_id)
      })

      const pointsByUserNight = new Map<string, Map<string, number>>()
      const addPoints = (userId: string, createdAt: string, points: number) => {
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(createdAt))
        const nights = pointsByUserNight.get(userId) ?? new Map<string, number>()
        nights.set(date, Math.min(MAX_POINTS_PER_NIGHT, (nights.get(date) ?? 0) + points))
        pointsByUserNight.set(userId, nights)
      }

      typedPosts.forEach((post) => addPoints(post.user_id, post.created_at, POST_POINTS + (firstPostByEvent.get(post.event_id) === post.user_id ? FIRST_EVENT_POINTS : 0)))
      typedGoingOut.forEach((status) => addPoints(status.user_id, status.created_at, GOING_OUT_POINTS))

      const grouped = new Map<string, { tower: string; floor: number; population: number; points: number; users: Set<string> }>()
      typedProfiles.forEach((profile) => {
        if (!profile.tower || profile.floor === null) return
        const key = `${profile.tower}-${profile.floor}`
        const group = grouped.get(key) ?? { tower: profile.tower, floor: profile.floor, population: 0, points: 0, users: new Set<string>() }
        group.population += 1
        const userPoints = Array.from(pointsByUserNight.get(profile.id)?.values() ?? []).reduce((sum, points) => sum + points, 0)
        group.points += userPoints
        if (userPoints > 0) group.users.add(profile.id)
        grouped.set(key, group)
      })

      setRanks(Array.from(grouped.values()).map((group) => ({ tower: group.tower, floor: group.floor, points: group.population > 0 ? group.points / group.population : 0, population: group.population, activeUsers: group.users.size })).sort((left, right) => right.points - left.points))
      setLoading(false)
    }

    queueMicrotask(() => { void loadRanks() })
  }, [])

  return (
    <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>WEEKLY LEADERBOARD</p>
      <h1 style={{ margin: '0.25rem 0 0.4rem' }}>Ranks</h1>
      <p style={{ margin: '0 0 1.5rem', color: '#64748b' }}>Floor energy, normalized by the number of residents.</p>
      {message ? <p role="alert" style={{ padding: '0.75rem', color: '#b91c1c', background: '#fef2f2', borderRadius: '8px' }}>{message}</p> : null}
      {loading ? <p>Loading ranks...</p> : ranks.length === 0 ? <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: '12px' }}>No ranked floors yet.</div> : <div style={{ display: 'grid', gap: '0.75rem' }}>{ranks.map((rank, index) => <article key={`${rank.tower}-${rank.floor}`} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '14px', background: index === 0 ? '#111827' : '#fff', color: index === 0 ? '#fff' : '#111827' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}><div><p style={{ margin: 0, color: index === 0 ? '#fbbf24' : '#64748b', fontWeight: 800 }}>#{index + 1}</p><h2 style={{ margin: '0.2rem 0', fontSize: '1.2rem' }}>{rank.tower}, Floor {rank.floor}</h2><p style={{ margin: 0, color: index === 0 ? '#cbd5e1' : '#64748b', fontSize: '0.85rem' }}>{rank.activeUsers} active of {rank.population} residents</p></div><strong style={{ fontSize: '1.5rem' }}>{rank.points.toFixed(1)}<span style={{ display: 'block', fontSize: '0.7rem', textAlign: 'right', color: index === 0 ? '#cbd5e1' : '#64748b' }}>points / resident</span></strong></div></article>)}</div>}
      {weekStart ? <p style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.78rem' }}>This leaderboard resets every Sunday at midnight Pacific.</p> : null}
    </main>
  )
}