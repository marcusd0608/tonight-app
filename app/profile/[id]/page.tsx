'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type PublicProfile = {
  id: string
  display_name: string | null
  photo_url: string | null
  tower: string | null
  floor: number | null
  major: string | null
  interests: string[] | null
  instagram_handle: string | null
}

type PublicPost = { id: string; eventName: string; photoUrl: string | null; vibeTags: string[]; createdAt: string }

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [posts, setPosts] = useState<PublicPost[]>([])
  const [showInstagram, setShowInstagram] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user || !id) return

      const { data, error } = await supabase.from('profiles').select('id, display_name, photo_url, tower, floor, major, interests, instagram_handle').eq('id', id).maybeSingle()
      if (error || !data) { setMessage(error?.message ?? 'Profile not found.'); return }
      setProfile(data)

      const { data: connections } = await supabase.from('connections').select('requester_id, recipient_id, status').or(`requester_id.eq.${authData.user.id},recipient_id.eq.${authData.user.id}`)
      setShowInstagram(authData.user.id === id || Boolean(connections?.some((connection) => connection.status === 'accepted' && ((connection.requester_id === authData.user.id && connection.recipient_id === id) || (connection.recipient_id === authData.user.id && connection.requester_id === id)))))

      const { data: rows } = await supabase.from('posts').select('id, event_id, vibe_tags, photo_url, created_at').eq('user_id', id).order('created_at', { ascending: false })
      const eventIds = (rows ?? []).map((row) => row.event_id)
      const { data: events } = eventIds.length ? await supabase.from('events').select('id, name').in('id', eventIds) : { data: [] as { id: string; name: string }[] }
      const eventNames = new Map((events ?? []).map((event) => [event.id, event.name]))
      setPosts((rows ?? []).map((row) => ({ id: row.id, eventName: eventNames.get(row.event_id) ?? 'Unnamed event', photoUrl: row.photo_url, vibeTags: Array.isArray(row.vibe_tags) ? row.vibe_tags : [], createdAt: row.created_at })))
    }
    void loadProfile()
  }, [id])

  if (!profile) return <main style={{ padding: '1.5rem' }}><p>{message || 'Loading profile...'}</p></main>

  return <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
    <Link href="/post" style={{ color: '#64748b', fontSize: '0.85rem' }}>Back to Posts</Link>
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
      {profile.photo_url ? <img src={profile.photo_url} alt="" style={{ width: '92px', height: '92px', objectFit: 'cover', borderRadius: '50%' }} /> : <div style={{ width: '92px', height: '92px', borderRadius: '50%', background: '#e2e8f0' }} />}
      <div><h1 style={{ margin: 0 }}>{profile.display_name || 'Tonight user'}</h1><p style={{ margin: '0.3rem 0', color: '#64748b' }}>{profile.tower || 'Tower not listed'}{profile.floor ? ` · Floor ${profile.floor}` : ''}</p><p style={{ margin: 0 }}>{profile.major || 'Major not listed'}</p>{showInstagram && profile.instagram_handle ? <p style={{ margin: '0.3rem 0 0', color: '#2563eb' }}>Instagram: {profile.instagram_handle}</p> : null}</div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>{(profile.interests ?? []).map((interest) => <span key={interest} style={{ padding: '0.3rem 0.55rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontSize: '0.8rem' }}>{interest}</span>)}</div>
    <h2>Your night posts</h2>
    {posts.length === 0 ? <p style={{ color: '#64748b' }}>No night posts yet.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>{posts.map((post) => <article key={post.id} style={{ overflow: 'hidden', border: '1px solid #e5e7eb', borderRadius: '12px' }}>{post.photoUrl ? <img src={post.photoUrl} alt="" style={{ display: 'block', width: '100%', aspectRatio: '1', objectFit: 'contain', background: '#f1f5f9' }} /> : <div style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', background: '#f1f5f9', color: '#64748b' }}>No photo</div>}<div style={{ padding: '0.7rem' }}><strong>{post.eventName}</strong><p style={{ margin: '0.3rem 0', color: '#64748b', fontSize: '0.75rem' }}>{new Date(post.createdAt).toLocaleDateString()}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>{post.vibeTags.slice(0, 2).map((tag) => <span key={tag} style={{ fontSize: '0.7rem', color: '#475569' }}>{tag}</span>)}</div></div></article>)}</div>}
  </main>
}
