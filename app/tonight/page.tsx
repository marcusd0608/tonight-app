'use client'

import { createClient } from '@/utils/supabase/client'
import { useCallback, useEffect, useState } from 'react'
import { trackEvent } from '@/utils/analytics'

type Profile = {
  id: string
  display_name: string | null
  photo_url: string | null
  tower: string | null
  floor: number | null
  major: string | null
  interests: string[] | null
  instagram_handle: string | null
}

type FeedScope = 'floor' | 'dorm' | 'other-dorms'

type GoingOut = {
  user_id: string
  note: string | null
  expires_at: string
  created_at: string
  visibility?: FeedScope | null
}

type Connection = {
  requester_id: string
  recipient_id: string
  status: string
}

const cardStyle = { padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '14px', background: '#fff' }

function getLosAngelesExpiration(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const localHour = Number(values.hour)
  const target = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 4))

  if (localHour >= 4) target.setUTCDate(target.getUTCDate() + 1)

  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset'
  }).formatToParts(target)
  const offset = offsetParts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-08:00'
  const match = offset.match(/GMT([+-])(\d{2}):?(\d{2})/)
  const offsetMinutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1) : -480
  return new Date(target.getTime() - offsetMinutes * 60 * 1000).toISOString()
}

export default function TonightPage() {
  const [userId, setUserId] = useState('')
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [goingOut, setGoingOut] = useState<GoingOut[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [note, setNote] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedScope, setFeedScope] = useState<FeedScope>('floor')
  const [statusVisibility, setStatusVisibility] = useState<FeedScope>('floor')
  const [myStatus, setMyStatus] = useState<GoingOut | null>(null)

  const loadFeed = useCallback(async (scope: FeedScope = feedScope) => {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) return
    setUserId(authData.user.id)
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${authData.user.id},blocked_id.eq.${authData.user.id}`)
    const blockedIds = (blocks ?? []).map((block) => block.blocker_id === authData.user.id ? block.blocked_id : block.blocker_id)

    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, photo_url, tower, floor, major, interests, instagram_handle')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (profileError || !currentProfile?.tower) {
      setError(profileError?.message ?? 'Finish your profile setup before going out tonight.')
      return
    }
    setMyProfile(currentProfile)

    const { data: towerProfiles, error: towerError } = await supabase
      .from('profiles')
      .select('id, display_name, photo_url, tower, floor, major, interests, instagram_handle')
    if (towerError) {
      setError(towerError.message)
      return
    }

    const scopedProfiles = (towerProfiles ?? []).filter((profile) => {
      if (scope === 'floor') return profile.tower === currentProfile.tower && profile.floor === currentProfile.floor
      if (scope === 'dorm') return profile.tower === currentProfile.tower
      return true
    })
    const visibleTowerProfiles = scopedProfiles.filter((profile) => !blockedIds.includes(profile.id))
    const towerIds = visibleTowerProfiles.map((profile) => profile.id)
    setProfiles(visibleTowerProfiles)
    setTotalUsers(towerIds.length)

    if (towerIds.length === 0) {
      setGoingOut([])
      setMyStatus(null)
      setConnections([])
      return
    }

    const [{ data: statuses, error: statusError }, { data: connectionRows, error: connectionError }] = await Promise.all([
      supabase.from('going_out').select('user_id, note, expires_at, created_at, visibility').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
      supabase.from('connections').select('requester_id, recipient_id, status').or(`requester_id.eq.${authData.user.id},recipient_id.eq.${authData.user.id}`)
    ])
    if (statusError || connectionError) {
      setError(statusError?.message ?? connectionError?.message ?? 'Unable to load tonight.')
      return
    }

    const normalizedStatuses = (statuses ?? []).map((status) => ({
      ...status,
      visibility: (status.visibility ?? 'dorm') as FeedScope,
    }))

    const profileById = new Map(towerProfiles.map((profile) => [profile.id, profile]))
    const visibleStatuses = normalizedStatuses.filter((status) => {
      const profile = profileById.get(status.user_id)
      if (!profile || !profile.tower) return false

      const sameTower = profile.tower === currentProfile.tower
      const sameFloor = sameTower && profile.floor === currentProfile.floor

      if (scope === 'floor') {
        return sameFloor && (
          status.visibility === 'floor' ||
          status.visibility === 'dorm' ||
          (status.visibility === 'other-dorms' && status.user_id === authData.user.id)
        )
      }

      if (scope === 'dorm') {
        return sameTower && (
          status.visibility === 'dorm' ||
          (status.visibility === 'floor' && sameFloor) ||
          (status.visibility === 'other-dorms' && status.user_id === authData.user.id)
        )
      }

      return status.visibility === 'other-dorms'
    })

    setGoingOut(visibleStatuses)
    setMyStatus(normalizedStatuses.find((status) => status.user_id === authData.user.id) ?? null)
    setConnections((connectionRows ?? []).filter((connection) => !blockedIds.includes(connection.requester_id) && !blockedIds.includes(connection.recipient_id)))
  }, [feedScope])

  useEffect(() => {
    queueMicrotask(() => { void loadFeed(feedScope) })
  }, [feedScope, loadFeed])

  useEffect(() => {
    const now = new Date()
    const isFriday = now.getDay() === 5
    const localHour = now.getHours()
    const isNightWindow = localHour >= 17 || localHour < 4

    if (!isFriday || !isNightWindow) return

    const storageKey = 'tonight_friday_night_open_logged'
    const alreadyLogged = window.sessionStorage.getItem(storageKey)
    if (alreadyLogged) return

    void trackEvent('friday_night_open', {
      day: 'friday',
      hour: localHour,
      user_id: userId || null,
    })

    window.sessionStorage.setItem(storageKey, 'true')
  }, [userId])

  const incomingRequests = connections.filter((connection) => connection.recipient_id === userId && connection.status === 'pending')

  const submitGoingOut = async () => {
    if (!userId) return
    setIsSubmitting(true)
    setError('')
    const supabase = createClient()
    const selectedScope = statusVisibility
    const { error: deleteError } = await supabase.from('going_out').delete().eq('user_id', userId).gt('expires_at', new Date().toISOString())
    if (deleteError) {
      setError(deleteError.message)
      setIsSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('going_out').insert({
      user_id: userId,
      note: note.trim() || null,
      visibility: selectedScope,
      expires_at: getLosAngelesExpiration()
    })
    if (insertError) setError(insertError.message)
    else {
      setIsModalOpen(false)
      setNote('')
      setStatusVisibility(feedScope)
      await loadFeed(feedScope)
    }
    setIsSubmitting(false)
  }

  const cancelGoingOut = async () => {
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('going_out').delete().eq('user_id', userId).gt('expires_at', new Date().toISOString())
    if (deleteError) setError(deleteError.message)
    else {
      setMyStatus(null)
      await loadFeed(feedScope)
    }
  }

  const connectWith = async (recipientId: string) => {
    const supabase = createClient()
    const { error: connectError } = await supabase.from('connections').insert({ requester_id: userId, recipient_id: recipientId, status: 'pending' })
    if (connectError) setError(connectError.message)
    else await loadFeed(feedScope)
  }

  const acceptRequest = async (requesterId: string) => {
    const supabase = createClient()
    const { error: acceptError } = await supabase.from('connections').update({ status: 'accepted' }).eq('requester_id', requesterId).eq('recipient_id', userId).eq('status', 'pending')
    if (acceptError) setError(acceptError.message)
    else await loadFeed(feedScope)
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const hasAcceptedConnection = (otherId: string) => connections.some((connection) => connection.status === 'accepted' && ((connection.requester_id === userId && connection.recipient_id === otherId) || (connection.recipient_id === userId && connection.requester_id === otherId)))

  return (
    <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div><p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>{feedScope === 'floor' ? 'YOUR FLOOR' : feedScope === 'dorm' ? 'YOUR DORM' : 'OTHER DORMS'}</p><h1 style={{ margin: '0.25rem 0 0' }}>Tonight</h1></div>
        {incomingRequests.length > 0 ? <span style={{ background: '#dc2626', color: '#fff', borderRadius: '999px', padding: '0.4rem 0.7rem', fontWeight: 700 }}>{incomingRequests.length} request{incomingRequests.length === 1 ? '' : 's'}</span> : null}
      </header>

      {error ? <p style={{ color: '#b91c1c', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px' }}>{error}</p> : null}
      <div role="tablist" aria-label="Tonight feed scope" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem', marginBottom: '1.25rem', padding: '0.25rem', background: '#f1f5f9', borderRadius: '10px' }}>
        {([['floor', 'My floor'], ['dorm', 'My dorm'], ['other-dorms', 'Other dorms']] as [FeedScope, string][]).map(([scope, label]) => <button key={scope} type="button" role="tab" aria-selected={feedScope === scope} onClick={() => setFeedScope(scope)} style={{ padding: '0.65rem 0.4rem', border: 0, borderRadius: '8px', background: feedScope === scope ? '#fff' : 'transparent', color: '#111827', fontWeight: feedScope === scope ? 800 : 600, cursor: 'pointer', boxShadow: feedScope === scope ? '0 1px 4px rgba(15,23,42,0.12)' : 'none' }}>{label}</button>)}
      </div>
      <section style={{ ...cardStyle, marginBottom: '1.25rem', background: '#111827', color: '#fff' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>{myStatus ? 'You are going out tonight' : (feedScope === 'floor' ? 'Make tonight less ordinary on your floor' : feedScope === 'dorm' ? 'Make tonight less ordinary in your dorm' : 'Make tonight less ordinary across campus')}</h2>
        <p style={{ margin: '0 0 1rem', color: '#cbd5e1' }}>{myStatus?.note || (feedScope === 'floor' ? 'Let people on your floor know you are open to plans.' : feedScope === 'dorm' ? 'Let people in your dorm know you are open to plans.' : 'Let people across campus know you are open to plans.')}</p>
        {myStatus ? <button type="button" onClick={cancelGoingOut} style={{ padding: '0.7rem 1rem', border: '1px solid #64748b', borderRadius: '8px', background: 'transparent', color: '#fff', fontWeight: 700 }}>Turn off status</button> : <button type="button" onClick={() => { setStatusVisibility(feedScope); setIsModalOpen(true) }} style={{ padding: '0.8rem 1rem', border: 'none', borderRadius: '8px', background: '#fbbf24', color: '#111827', fontWeight: 800 }}>I&apos;m going out tonight</button>}
      </section>

      {incomingRequests.length > 0 ? <section style={{ marginBottom: '1.25rem' }}><h2 style={{ fontSize: '1.1rem' }}>Connection requests</h2>{incomingRequests.map((request) => { const requester = profileById.get(request.requester_id); return <div key={request.requester_id} style={{ ...cardStyle, marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}><span>{requester?.display_name || 'Someone in your tower'} wants to connect</span><button type="button" onClick={() => acceptRequest(request.requester_id)} style={{ padding: '0.55rem 0.8rem', border: 'none', borderRadius: '8px', background: '#16a34a', color: '#fff', fontWeight: 700 }}>Accept</button></div> })}</section> : null}

      <section><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ fontSize: '1.1rem' }}>{feedScope === 'floor' ? `Out on Floor ${myProfile?.floor ?? '—'}` : feedScope === 'dorm' ? `Out in ${myProfile?.tower || 'your dorm'}` : 'Out in other dorms'}</h2><span style={{ color: '#64748b', fontSize: '0.9rem' }}>{totalUsers} onboarded</span></div>
        {goingOut.length === 0 ? <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem 1rem' }}><p style={{ margin: 0, fontWeight: 700 }}>Nobody&apos;s out yet. Be the one who starts it.</p><p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>{totalUsers} people are part of Tonight in your tower.</p></div> : <div style={{ display: 'grid', gap: '0.8rem' }}>{goingOut.map((status) => { const profile = profileById.get(status.user_id); if (!profile) return null; const connected = hasAcceptedConnection(profile.id); const existing = connections.find((connection) => connection.requester_id === userId && connection.recipient_id === profile.id || connection.recipient_id === userId && connection.requester_id === profile.id); return <article key={status.user_id} style={cardStyle}><div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>{profile.photo_url ? <img src={profile.photo_url} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '50%' }} /> : <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#e5e7eb' }} />}<div><h3 style={{ margin: 0 }}>{profile.display_name || 'Tonight user'}</h3><p style={{ margin: '0.2rem 0 0', color: '#64748b' }}>Floor {profile.floor ?? '—'} · {profile.major || 'Major not listed'}</p></div></div><p style={{ margin: '0.9rem 0 0' }}>{status.note || 'Open to making plans.'}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.7rem 0' }}>{(profile.interests ?? []).map((interest) => <span key={interest} style={{ padding: '0.3rem 0.55rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontSize: '0.8rem' }}>{interest}</span>)}</div>{connected ? <p style={{ margin: '0.6rem 0 0', color: '#15803d', fontWeight: 700 }}>Instagram: {profile.instagram_handle || 'No handle added'}</p> : profile.id === userId ? <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Your status</span> : <button type="button" disabled={Boolean(existing)} onClick={() => connectWith(profile.id)} style={{ padding: '0.6rem 0.9rem', border: 'none', borderRadius: '8px', background: existing ? '#cbd5e1' : '#2563eb', color: '#fff', fontWeight: 700 }}>{existing ? existing.status === 'accepted' ? 'Connected' : 'Request sent' : 'Connect'}</button>}</article> })}</div>}
      </section>

      {isModalOpen ? <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: '1rem', zIndex: 2000 }}><div style={{ ...cardStyle, width: '100%', maxWidth: '420px' }}><h2 style={{ marginTop: 0 }}>Going out tonight?</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>{(['floor', 'dorm', 'other-dorms'] as FeedScope[]).map((scope) => <button key={scope} type="button" onClick={() => setStatusVisibility(scope)} style={{ padding: '0.7rem 0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: statusVisibility === scope ? '#111827' : '#fff', color: statusVisibility === scope ? '#fff' : '#111827', fontWeight: 700 }}>{scope === 'floor' ? 'Floor only' : scope === 'dorm' ? 'My dorm' : 'Other dorms'}</button>)}</div><label htmlFor="going-out-note">Add a short note (optional)</label><textarea id="going-out-note" value={note} onChange={(event) => setNote(event.target.value.slice(0, 60))} maxLength={60} placeholder="Looking for a group" rows={3} style={{ width: '100%', boxSizing: 'border-box', margin: '0.6rem 0 0.3rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical' }} /><p style={{ margin: '0 0 1rem', color: '#64748b', textAlign: 'right', fontSize: '0.8rem' }}>{note.length}/60</p><div style={{ display: 'flex', gap: '0.7rem' }}><button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button><button type="button" onClick={submitGoingOut} disabled={isSubmitting} style={{ flex: 1, padding: '0.7rem', borderRadius: '8px', border: 'none', background: '#111827', color: '#fff', fontWeight: 700 }}>{isSubmitting ? 'Saving...' : 'Post status'}</button></div></div></div> : null}
    </main>
  )
}