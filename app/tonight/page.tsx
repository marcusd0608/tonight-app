'use client'

import { createClient } from '@/utils/supabase/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { trackEvent } from '@/utils/analytics'
import AppHeader from '@/components/AppHeader'

type FeedScope = 'floor' | 'dorm' | 'other-dorms'
type ActivityCategory = 'Sports' | 'Gym' | 'Boba' | 'Food' | 'Study' | 'Party' | 'Other'
type Profile = { id: string; display_name: string | null; photo_url: string | null; tower: string | null; floor: number | null; major: string | null; interests: string[] | null; instagram_handle?: string | null }
type GoingOut = { id: string; user_id: string; note: string | null; expires_at: string; created_at: string; visibility: FeedScope; activity_category: ActivityCategory; activity_details: string | null; max_capacity: number | null }
type JoinRequest = { id: string; status_id: string; requester_id: string; status: 'pending' | 'approved' | 'rejected'; created_at: string }

const activityCategories: ActivityCategory[] = ['Sports', 'Gym', 'Boba', 'Food', 'Study', 'Party', 'Other']
const cardStyle = { padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '14px', background: '#fff' }

function getExpiration() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const target = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 4))
  if (Number(values.hour) >= 4) target.setUTCDate(target.getUTCDate() + 1)
  return target.toISOString()
}

export default function TonightPage() {
  const [userId, setUserId] = useState('')
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allStatuses, setAllStatuses] = useState<GoingOut[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [revealedHandles, setRevealedHandles] = useState<Record<string, string | null>>({})
  const [totalUsers, setTotalUsers] = useState(0)
  const [note, setNote] = useState('')
  const [activityCategory, setActivityCategory] = useState<ActivityCategory>('Sports')
  const [activityDetails, setActivityDetails] = useState('')
  const [maxCapacity, setMaxCapacity] = useState<number | null>(4)
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | 'All'>('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [feedScope, setFeedScope] = useState<FeedScope>('floor')
  const [statusVisibility, setStatusVisibility] = useState<FeedScope>('floor')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadFeed = useCallback(async (scope: FeedScope = feedScope) => {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) return
    const currentUserId = authData.user.id
    setUserId(currentUserId)
    const { data: blocks } = await supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`)
    const blockedIds = (blocks ?? []).map((block) => block.blocker_id === currentUserId ? block.blocked_id : block.blocker_id)
    const { data: currentProfile, error: profileError } = await supabase.from('profiles').select('id, display_name, photo_url, tower, floor, major, interests, instagram_handle').eq('id', currentUserId).maybeSingle()
    if (profileError || !currentProfile?.tower) { setError(profileError?.message ?? 'Finish your profile setup before going out tonight.'); return }
    setMyProfile(currentProfile)
    const { data: allProfiles, error: profilesError } = await supabase.from('profiles').select('id, display_name, photo_url, tower, floor, major, interests')
    if (profilesError) { setError(profilesError.message); return }
    const scopedProfiles = (allProfiles ?? []).filter((profile) => scope === 'floor' ? profile.tower === currentProfile.tower && profile.floor === currentProfile.floor : scope === 'dorm' ? profile.tower === currentProfile.tower : true).filter((profile) => !blockedIds.includes(profile.id))
    setProfiles(scopedProfiles); setTotalUsers(scopedProfiles.length)
    const { data: statusRows, error: statusError } = await supabase.from('going_out').select('id, user_id, note, expires_at, created_at, visibility, activity_category, activity_details, max_capacity').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
    if (statusError) { setError(statusError.message); return }
    const profileById = new Map((allProfiles ?? []).map((profile) => [profile.id, profile]))
    const normalized = (statusRows ?? []).map((status) => ({ ...status, visibility: (status.visibility ?? 'dorm') as FeedScope, activity_category: (status.activity_category ?? 'Other') as ActivityCategory, activity_details: status.activity_details ?? null, max_capacity: status.max_capacity ?? null }))
    const visible = normalized.filter((status) => {
      const profile = profileById.get(status.user_id)
      if (!profile || !profile.tower || blockedIds.includes(profile.id)) return false
      const sameTower = profile.tower === currentProfile.tower
      const sameFloor = sameTower && profile.floor === currentProfile.floor
      if (scope === 'floor') return sameFloor && (status.visibility === 'floor' || status.visibility === 'dorm' || (status.visibility === 'other-dorms' && status.user_id === currentUserId))
      if (scope === 'dorm') return sameTower && (status.visibility === 'dorm' || (status.visibility === 'floor' && sameFloor) || (status.visibility === 'other-dorms' && status.user_id === currentUserId))
      return status.visibility === 'other-dorms'
    })
    const statusIds = visible.map((status) => status.id)
    const { data: requestRows, error: requestError } = statusIds.length ? await supabase.from('join_requests').select('id, status_id, requester_id, status, created_at').in('status_id', statusIds) : { data: [] as JoinRequest[], error: null }
    if (requestError) { setError(requestError.message); return }
    const approvedIds = new Set<string>()
    ;(requestRows ?? []).forEach((request) => { const status = normalized.find((item) => item.id === request.status_id); if (request.status === 'approved' && status) { if (request.requester_id === currentUserId) approvedIds.add(status.user_id); if (status.user_id === currentUserId) approvedIds.add(request.requester_id) } })
    const { data: handles } = approvedIds.size ? await supabase.from('profiles').select('id, instagram_handle').in('id', [...approvedIds]) : { data: [] as { id: string; instagram_handle: string | null }[] }
    setRevealedHandles(Object.fromEntries((handles ?? []).map((profile) => [profile.id, profile.instagram_handle])))
    setJoinRequests(requestRows ?? []); setAllStatuses(visible)
  }, [feedScope])

  useEffect(() => { queueMicrotask(() => { void loadFeed(feedScope) }) }, [feedScope, loadFeed])
  useEffect(() => { const now = new Date(); if (now.getDay() !== 5 || (now.getHours() < 17 && now.getHours() >= 4)) return; const key = 'tonight_friday_night_open_logged'; if (window.sessionStorage.getItem(key)) return; void trackEvent('friday_night_open', { day: 'friday', hour: now.getHours() }); window.sessionStorage.setItem(key, 'true') }, [])

  const myStatus = allStatuses.find((status) => status.user_id === userId) ?? null
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))
  const requestsForMyStatus = myStatus ? joinRequests.filter((request) => request.status_id === myStatus.id) : []
  const pendingJoinRequests = requestsForMyStatus.filter((request) => request.status === 'pending')
  const statuses = useMemo(() => allStatuses
    .filter((status) => {
      const matchesCategory = categoryFilter === 'All' || status.activity_category === categoryFilter
      const text = `${status.activity_category} ${status.activity_details ?? ''} ${status.note ?? ''}`.toLowerCase()
      return matchesCategory && text.includes(searchTerm.trim().toLowerCase())
    })
    .sort((left, right) => {
      const leftIsMine = left.user_id === userId ? 1 : 0
      const rightIsMine = right.user_id === userId ? 1 : 0
      if (leftIsMine !== rightIsMine) return rightIsMine - leftIsMine
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    }), [allStatuses, categoryFilter, searchTerm, userId])

  const submitGoingOut = async () => { if (!userId) return; setIsSubmitting(true); setError(''); const supabase = createClient(); const { error: deleteError } = await supabase.from('going_out').delete().eq('user_id', userId).gt('expires_at', new Date().toISOString()); if (deleteError) { setError(deleteError.message); setIsSubmitting(false); return }; const { error: insertError } = await supabase.from('going_out').insert({ user_id: userId, note: note.trim() || null, visibility: statusVisibility, expires_at: getExpiration(), activity_category: activityCategory, activity_details: activityCategory === 'Other' ? activityDetails.trim() || null : null, max_capacity: maxCapacity }); if (insertError) setError(insertError.message); else { setIsModalOpen(false); setNote(''); setActivityDetails(''); await loadFeed(feedScope) }; setIsSubmitting(false) }
  const cancelGoingOut = async () => { const { error: deleteError } = await createClient().from('going_out').delete().eq('user_id', userId).gt('expires_at', new Date().toISOString()); if (deleteError) setError(deleteError.message); else await loadFeed(feedScope) }
  const sendPush = (requestId: string, kind: 'join_request' | 'join_approved') => {
    void fetch('/api/push/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, kind }) })
  }

  const requestToJoin = async (statusId: string) => {
    const { data, error: requestError } = await createClient().from('join_requests').insert({ status_id: statusId, requester_id: userId, status: 'pending' }).select('id').single()
    if (requestError) setError(requestError.message)
    else { if (data) sendPush(data.id, 'join_request'); await loadFeed(feedScope) }
  }

  const reviewJoinRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    const { error: reviewError } = await createClient().from('join_requests').update({ status }).eq('id', requestId)
    if (reviewError) setError(reviewError.message)
    else { if (status === 'approved') sendPush(requestId, 'join_approved'); await loadFeed(feedScope) }
  }

  return <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
    <AppHeader title="Tonight" />
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}><div><p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>{feedScope === 'floor' ? 'YOUR FLOOR' : feedScope === 'dorm' ? 'YOUR DORM' : 'OTHER DORMS'}</p></div>{pendingJoinRequests.length ? <span style={{ background: '#dc2626', color: '#fff', borderRadius: '999px', padding: '0.4rem 0.7rem', fontWeight: 700 }}>{pendingJoinRequests.length} request{pendingJoinRequests.length === 1 ? '' : 's'}</span> : null}</header>
    {error ? <p role="alert" style={{ color: '#b91c1c', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px' }}>{error}</p> : null}
    <div role="tablist" aria-label="Tonight feed scope" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem', marginBottom: '1rem', padding: '0.25rem', background: '#f1f5f9', borderRadius: '10px' }}>{([['floor', 'My floor'], ['dorm', 'My dorm'], ['other-dorms', 'Other dorms']] as [FeedScope, string][]).map(([scope, label]) => <button key={scope} type="button" onClick={() => setFeedScope(scope)} style={{ padding: '0.65rem 0.4rem', border: 0, borderRadius: '8px', background: feedScope === scope ? '#fff' : 'transparent', color: '#111827', fontWeight: 700 }}>{label}</button>)}</div>
    <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search activities and notes" aria-label="Search activities and notes" style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.8rem', marginBottom: '0.7rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '1rem' }} />
    <div aria-label="Filter activities" style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>{['All', ...activityCategories].map((category) => <button key={category} type="button" onClick={() => setCategoryFilter(category as ActivityCategory | 'All')} style={{ flexShrink: 0, padding: '0.45rem 0.7rem', borderRadius: '999px', border: '1px solid #cbd5e1', background: categoryFilter === category ? '#111827' : '#fff', color: categoryFilter === category ? '#fff' : '#334155', fontWeight: 700 }}>{category}</button>)}</div>
    <section style={{ ...cardStyle, marginBottom: '1.25rem', background: '#111827', color: '#fff' }}><h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>{myStatus ? 'You are going out tonight' : 'Make tonight less ordinary'}</h2><p style={{ margin: '0 0 1rem', color: '#cbd5e1' }}>{myStatus?.note || `Let people in your ${feedScope === 'floor' ? 'floor' : feedScope === 'dorm' ? 'dorm' : 'school'} know you are open to plans.`}</p>{myStatus ? <button type="button" onClick={() => void cancelGoingOut()} style={{ padding: '0.7rem 1rem', border: '1px solid #64748b', borderRadius: '8px', background: 'transparent', color: '#fff', fontWeight: 700 }}>Turn off status</button> : <button type="button" onClick={() => { setStatusVisibility(feedScope); setIsModalOpen(true) }} style={{ padding: '0.8rem 1rem', border: 0, borderRadius: '8px', background: '#fbbf24', color: '#111827', fontWeight: 800 }}>I&apos;m going out tonight</button>}</section>
    {pendingJoinRequests.length ? <section style={{ marginBottom: '1.25rem' }}><h2 style={{ fontSize: '1.1rem' }}>Join requests</h2>{pendingJoinRequests.map((request) => <div key={request.id} style={{ ...cardStyle, marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}><span>{profilesById.get(request.requester_id)?.display_name || 'Someone'} wants to join</span><div style={{ display: 'flex', gap: '0.4rem' }}><button type="button" onClick={() => void reviewJoinRequest(request.id, 'approved')} style={{ padding: '0.5rem 0.65rem', background: '#16a34a', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 700 }}>Approve</button><button type="button" onClick={() => void reviewJoinRequest(request.id, 'rejected')} style={{ padding: '0.5rem 0.65rem', background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '7px', fontWeight: 700 }}>Decline</button></div></div>)}</section> : null}
    <section><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ fontSize: '1.1rem' }}>Out tonight</h2><span style={{ color: '#64748b', fontSize: '0.9rem' }}>{totalUsers} onboarded</span></div>{statuses.length ? <div style={{ display: 'grid', gap: '0.8rem' }}>{statuses.map((status) => { const profile = profilesById.get(status.user_id); if (!profile) return null; const requests = joinRequests.filter((request) => request.status_id === status.id); const joined = requests.filter((request) => request.status === 'approved').length + 1; const request = requests.find((item) => item.requester_id === userId); const handle = revealedHandles[profile.id]; return <article key={status.id} style={cardStyle}><div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>{profile.photo_url ? <img src={profile.photo_url} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '50%' }} /> : <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#e5e7eb' }} />}<div><h3 style={{ margin: 0 }}>{profile.display_name || 'Tonight user'}</h3><p style={{ margin: '0.2rem 0 0', color: '#64748b' }}>Floor {profile.floor ?? '—'} · {profile.major || 'Major not listed'}</p></div></div><div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.8rem 0' }}><span style={{ padding: '0.3rem 0.55rem', borderRadius: '999px', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>{status.activity_category === 'Other' && status.activity_details ? `Other - ${status.activity_details}` : status.activity_category}</span><span style={{ color: '#64748b' }}>{joined}{status.max_capacity ? `/${status.max_capacity}` : ''} joined</span></div><p style={{ margin: '0.6rem 0' }}>{status.note || 'Open to making plans.'}</p>{handle ? <p style={{ margin: '0.6rem 0', color: '#15803d', fontWeight: 700 }}>Instagram: {handle}</p> : null}{profile.id === userId ? <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Your status</span> : request?.status === 'approved' ? <span style={{ color: '#15803d', fontWeight: 700 }}>Approved</span> : request?.status === 'pending' ? <span style={{ color: '#64748b', fontWeight: 700 }}>Requested</span> : <button type="button" onClick={() => void requestToJoin(status.id)} disabled={Boolean(status.max_capacity && joined >= status.max_capacity)} style={{ padding: '0.6rem 0.8rem', border: 0, borderRadius: '8px', background: status.max_capacity && joined >= status.max_capacity ? '#cbd5e1' : '#2563eb', color: '#fff', fontWeight: 700 }}>{status.max_capacity && joined >= status.max_capacity ? 'Full' : 'Request to Join'}</button>}</article> })}</div> : <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem 1rem' }}><p style={{ margin: 0, fontWeight: 700 }}>No matching activities yet.</p><p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>Try another category or search.</p></div>}</section>
    {isModalOpen ? <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: '1rem', zIndex: 2000 }}><div style={{ ...cardStyle, width: '100%', maxWidth: '420px' }}><h2 style={{ marginTop: 0 }}>Going out tonight?</h2><label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Activity</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>{activityCategories.map((category) => <button key={category} type="button" onClick={() => setActivityCategory(category)} style={{ padding: '0.5rem 0.7rem', borderRadius: '999px', border: '1px solid #cbd5e1', background: activityCategory === category ? '#111827' : '#fff', color: activityCategory === category ? '#fff' : '#111827', fontWeight: 700 }}>{category}</button>)}</div>{activityCategory === 'Other' ? <input value={activityDetails} onChange={(event) => setActivityDetails(event.target.value.slice(0, 40))} placeholder="What are you doing? e.g. Painting" aria-label="Custom Other activity" style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem', border: '1px solid #cbd5e1', borderRadius: '8px', marginBottom: '1rem' }} /> : null}<label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Max group size</label><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.65rem' }}><button type="button" aria-label="Decrease max group size" onClick={() => setMaxCapacity((current) => current === null ? 2 : Math.max(2, current - 1))} disabled={maxCapacity === null || maxCapacity <= 2} style={{ width: '38px', height: '38px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '1.3rem' }}>-</button><strong>{maxCapacity === null ? 'Unlimited' : `${maxCapacity} people`}</strong><button type="button" aria-label="Increase max group size" onClick={() => setMaxCapacity((current) => current === null ? 2 : Math.min(50, current + 1))} disabled={maxCapacity === null} style={{ width: '38px', height: '38px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '1.3rem' }}>+</button></div><label style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}><input type="checkbox" checked={maxCapacity === null} onChange={(event) => setMaxCapacity(event.target.checked ? null : 4)} /> Unlimited</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>{(['floor', 'dorm', 'other-dorms'] as FeedScope[]).map((scope) => <button key={scope} type="button" onClick={() => setStatusVisibility(scope)} style={{ padding: '0.7rem 0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: statusVisibility === scope ? '#111827' : '#fff', color: statusVisibility === scope ? '#fff' : '#111827', fontWeight: 700 }}>{scope === 'floor' ? 'Floor only' : scope === 'dorm' ? 'My dorm' : 'Other dorms'}</button>)}</div><label htmlFor="going-out-note">Add a short note (optional)</label><textarea id="going-out-note" value={note} onChange={(event) => setNote(event.target.value.slice(0, 60))} maxLength={60} placeholder="Looking for a group" rows={3} style={{ width: '100%', boxSizing: 'border-box', margin: '0.6rem 0 0.3rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical' }} /><div style={{ display: 'flex', gap: '0.7rem' }}><button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button><button type="button" onClick={() => void submitGoingOut()} disabled={isSubmitting || (activityCategory === 'Other' && !activityDetails.trim())} style={{ flex: 1, padding: '0.7rem', borderRadius: '8px', border: 0, background: '#111827', color: '#fff', fontWeight: 700 }}>{isSubmitting ? 'Saving...' : 'Post status'}</button></div></div></div> : null}
  </main>
}
