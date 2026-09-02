'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useMemo, useState } from 'react'

type RequestRow = { id: string; status_id: string; requester_id: string; status: 'pending' | 'approved'; created_at: string }
type StatusRow = { id: string; user_id: string; activity_category: string; activity_details: string | null; note: string | null; max_capacity: number | null }
type ProfileRow = { id: string; display_name: string | null; instagram_handle: string | null }

export default function AppHeader({ title }: { title: string }) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [statuses, setStatuses] = useState<StatusRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [readAt, setReadAt] = useState(0)

  const loadNotifications = async () => {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) return
    setUserId(authData.user.id)
    const { data: requestRows } = await supabase.from('join_requests').select('id, status_id, requester_id, status, created_at').in('status', ['pending', 'approved']).order('created_at', { ascending: false }).limit(100)
    const rows = (requestRows ?? []) as RequestRow[]
    const statusIds = [...new Set(rows.map((row) => row.status_id))]
    const { data: statusRows } = statusIds.length ? await supabase.from('going_out').select('id, user_id, activity_category, activity_details, note, max_capacity').in('id', statusIds) : { data: [] as StatusRow[] }
    const profileIds = [...new Set([...rows.map((row) => row.requester_id), ...(statusRows ?? []).map((row) => row.user_id)])]
    const { data: profileRows } = profileIds.length ? await supabase.from('profiles').select('id, display_name, instagram_handle').in('id', profileIds) : { data: [] as ProfileRow[] }
    setRequests(rows)
    setStatuses((statusRows ?? []) as StatusRow[])
    setProfiles((profileRows ?? []) as ProfileRow[])
  }

  useEffect(() => {
    const storedReadAt = window.localStorage.getItem('tonight-notifications-read-at')
    setReadAt(storedReadAt ? Number(storedReadAt) : 0)
    void loadNotifications()
    const interval = window.setInterval(() => void loadNotifications(), 30000)
    return () => window.clearInterval(interval)
  }, [])

  const statusById = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses])
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const relevantRequests = requests.filter((request) => {
    const activity = statusById.get(request.status_id)
    return activity && (activity.user_id === userId || request.requester_id === userId)
  })
  const unreadCount = relevantRequests.filter((request) => new Date(request.created_at).getTime() > readAt).length

  const openDrawer = () => {
    const now = Date.now()
    window.localStorage.setItem('tonight-notifications-read-at', String(now))
    setReadAt(now)
    setOpen(true)
  }

  const review = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await createClient().from('join_requests').update({ status }).eq('id', id)
    if (!error) await loadNotifications()
  }

  return <>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
      <h1 style={{ margin: 0 }}>{title}</h1>
      <button type="button" aria-label="Notifications" title="Notifications" onClick={openDrawer} style={{ position: 'relative', width: '42px', height: '42px', border: '1px solid #cbd5e1', borderRadius: '50%', background: '#fff', color: '#111827', fontSize: '1.2rem', cursor: 'pointer' }}>
        &#128276;
        {unreadCount > 0 ? <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '19px', height: '19px', padding: '0 3px', borderRadius: '999px', background: '#dc2626', color: '#fff', fontSize: '0.7rem', fontWeight: 800, display: 'grid', placeItems: 'center' }}>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
    </header>
    {open ? <div role="dialog" aria-modal="true" aria-label="Notifications" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.35)' }}><aside onClick={(event) => event.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(390px, 92vw)', padding: '1.25rem', overflowY: 'auto', background: '#fff', boxShadow: '-8px 0 30px rgba(15,23,42,0.16)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>Notifications</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" style={{ border: 0, background: 'transparent', fontSize: '1.4rem' }}>×</button></div>{relevantRequests.length === 0 ? <p style={{ color: '#64748b' }}>No notifications yet.</p> : <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>{relevantRequests.map((request) => { const activity = statusById.get(request.status_id); if (!activity) return null; const isHost = activity.user_id === userId; const requester = profileById.get(request.requester_id); const host = profileById.get(activity.user_id); const label = activity.activity_category === 'Other' && activity.activity_details ? `Other - ${activity.activity_details}` : activity.activity_category; return <article key={request.id} style={{ padding: '0.85rem', border: '1px solid #e5e7eb', borderRadius: '10px' }}>{request.status === 'pending' && isHost ? <><strong>{requester?.display_name || 'Someone'} wants to join</strong><p style={{ color: '#64748b' }}>{label}{activity.note ? ` · ${activity.note}` : ''}</p><div style={{ display: 'flex', gap: '0.5rem' }}><button type="button" onClick={() => void review(request.id, 'approved')} style={{ padding: '0.5rem 0.7rem', border: 0, borderRadius: '7px', background: '#16a34a', color: '#fff', fontWeight: 700 }}>Approve</button><button type="button" onClick={() => void review(request.id, 'rejected')} style={{ padding: '0.5rem 0.7rem', border: '1px solid #fecaca', borderRadius: '7px', background: '#fff', color: '#b91c1c', fontWeight: 700 }}>Decline</button></div></> : request.status === 'approved' && !isHost ? <><strong>Request approved</strong><p style={{ color: '#475569' }}>{label}{activity.max_capacity ? ` · Group limit ${activity.max_capacity}` : ''}</p>{host?.instagram_handle ? <p style={{ color: '#15803d', fontWeight: 700 }}>Host Instagram: {host.instagram_handle}</p> : null}</> : null}</article> })}</div>}</aside></div> : null}
  </>
}
