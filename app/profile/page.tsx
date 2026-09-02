'use client'

import {
  onboardingInterestTags,
  onboardingMajors
} from '@/app/lib/constants'
import LogoutButton from '@/components/LogoutButton'
import AppHeader from '@/components/AppHeader'
import PushNotifications from '@/components/PushNotifications'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { ChangeEvent, useEffect, useRef, useState } from 'react'

type ProfileData = {
  id: string
  display_name: string | null
  photo_url: string | null
  tower: string | null
  floor: number | null
  major: string | null
  instagram_handle: string | null
  interests: string[] | null
  is_admin?: boolean | null
}

type PostedNight = {
  id: string
  eventName: string
  vibeTags: string[]
  photoUrl: string | null
  createdAt: string
}

type BlockedUser = { id: string; displayName: string }

const getStoragePathFromSignedUrl = (photoUrl: string) => {
  try {
    const path = new URL(photoUrl).pathname
    const match = path.match(/\/storage\/v1\/object\/(?:sign|public)\/profiles\/(.+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [major, setMajor] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [postedNights, setPostedNights] = useState<PostedNight[]>([])
  const [connectionCount, setConnectionCount] = useState(0)
  const [deletingPostId, setDeletingPostId] = useState('')
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.getUser()

      if (authError || !authData.user) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, photo_url, tower, floor, major, instagram_handle, interests, is_admin')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (!error) {
        setProfile(data)
        setMajor(data?.major ?? '')
        setInstagramHandle(data?.instagram_handle ?? '')
        setInterests(Array.isArray(data?.interests) ? data.interests : [])

        const { data: posts } = await supabase
          .from('posts')
          .select('id, event_id, vibe_tags, photo_url, created_at')
          .eq('user_id', authData.user.id)
          .order('created_at', { ascending: false })

        const eventIds = (posts ?? []).map((post) => post.event_id)
        const { data: events } = eventIds.length > 0
          ? await supabase.from('events').select('id, name').in('id', eventIds)
          : { data: [] as { id: string; name: string }[] }
        const eventNames = new Map((events ?? []).map((event) => [event.id, event.name]))

        setPostedNights((posts ?? []).map((post) => ({
          id: post.id,
          eventName: eventNames.get(post.event_id) ?? 'Unnamed event',
          vibeTags: Array.isArray(post.vibe_tags) ? post.vibe_tags : [],
          photoUrl: post.photo_url,
          createdAt: post.created_at
        })))

        const { data: connections } = await supabase
          .from('connections')
          .select('requester_id, recipient_id')
          .or(`requester_id.eq.${authData.user.id},recipient_id.eq.${authData.user.id}`)
          .eq('status', 'accepted')

        setConnectionCount(connections?.length ?? 0)

        const { data: blocks } = await supabase
          .from('blocks')
          .select('blocked_id')
          .eq('blocker_id', authData.user.id)
        const blockedIds = (blocks ?? []).map((block) => block.blocked_id)
        const { data: blockedProfiles } = blockedIds.length > 0
          ? await supabase.from('profiles').select('id, display_name').in('id', blockedIds)
          : { data: [] as { id: string; display_name: string | null }[] }
        setBlockedUsers((blockedProfiles ?? []).map((blockedProfile) => ({
          id: blockedProfile.id,
          displayName: blockedProfile.display_name ?? 'Tonight user'
        })))
      }

      setLoading(false)
    }

    void loadProfile()
  }, [])

  const toggleInterest = (tag: string) => {
    setInterests((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    )
  }

  const saveProfileChanges = async () => {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return
    }

    setIsSaving(true)

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: authData.user.id,
          major: major || null,
          instagram_handle: instagramHandle.trim() || null,
          interests: interests
        },
        { onConflict: 'id' }
      )

    if (!error) {
      setProfile((current) => current ? { ...current, major: major || null, instagram_handle: instagramHandle.trim() || null, interests } : current)
      setIsEditing(false)
    }

    setIsSaving(false)
  }

  const startEditing = () => {
    if (!profile) return
    setMajor(profile.major ?? '')
    setInstagramHandle(profile.instagram_handle ?? '')
    setInterests(Array.isArray(profile.interests) ? profile.interests : [])
    setIsEditing(true)
  }

  const toggleSettings = () => {
    if (isEditing) {
      setIsEditing(false)
      return
    }

    startEditing()
  }

  const deletePost = async (postId: string) => {
    if (!window.confirm('Delete this post?')) return

    setDeletingPostId(postId)
    const { error } = await createClient().from('posts').delete().eq('id', postId)

    if (error) {
      console.error('Failed to delete post:', error)
    } else {
      setPostedNights((current) => current.filter((post) => post.id !== postId))
    }

    setDeletingPostId('')
  }

  const unblockUser = async (userId: string) => {
    if (!profile) return
    const { error } = await createClient()
      .from('blocks')
      .delete()
      .eq('blocker_id', profile.id)
      .eq('blocked_id', userId)

    if (error) {
      console.error('Failed to unblock user:', error)
    } else {
      setBlockedUsers((current) => current.filter((user) => user.id !== userId))
    }
  }

  const profilePhotoInputRef = useRef<HTMLInputElement>(null)

  const compressProfilePhoto = (file: File): Promise<File> => new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Canvas is unavailable.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl)
        if (!blob) reject(new Error('Photo compression failed.'))
        else resolve(new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.8)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('The selected photo could not be read.'))
    }
    image.src = objectUrl
  })

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !profile) return

    setIsUploadingPhoto(true)
    const supabase = createClient()
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData.user) throw new Error('You must be signed in to change your profile photo.')

      const compressedPhoto = await compressProfilePhoto(file)
      const path = `private/${authData.user.id}/avatar-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage.from('profiles').upload(path, compressedPhoto, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data: signedUrl, error: signedUrlError } = await supabase.storage.from('profiles').createSignedUrl(path, 60 * 60 * 24 * 365)
      if (signedUrlError) throw signedUrlError

      const { error: profileError } = await supabase.from('profiles').update({ photo_url: signedUrl.signedUrl }).eq('id', authData.user.id)
      if (profileError) throw profileError

      setProfile((current) => current ? { ...current, photo_url: signedUrl.signedUrl } : current)

      if (profile.photo_url) {
        const oldPhotoPath = getStoragePathFromSignedUrl(profile.photo_url)
        if (oldPhotoPath) {
          const { error: deleteError } = await supabase.storage.from('profiles').remove([oldPhotoPath])
          if (deleteError) console.error('Failed to delete old profile photo:', deleteError)
        }
      }
    } catch (error) {
      console.error('Failed to update profile photo:', error)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  if (loading) {
    return <main style={{ padding: '2rem' }}><h1>Profile</h1><p>Loading profile...</p></main>
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <AppHeader title="Profile" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <LogoutButton />
      </div>

      {!profile ? (
        <p>No profile saved yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '0.25rem' }}>
            <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoChange} disabled={isUploadingPhoto} style={{ display: 'none' }} />
            <button type="button" aria-label="Change profile picture" title="Change profile picture" onClick={() => profilePhotoInputRef.current?.click()} disabled={isUploadingPhoto} style={{ padding: 0, border: 0, borderRadius: '50%', background: 'transparent', cursor: isUploadingPhoto ? 'wait' : 'pointer', flexShrink: 0 }}>
              {profile.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt="Profile"
                  style={{ display: 'block', width: '92px', height: '92px', objectFit: 'cover', borderRadius: '50%', border: '3px solid #e2e8f0', opacity: isUploadingPhoto ? 0.5 : 1 }}
                />
              ) : <div style={{ width: '92px', height: '92px', borderRadius: '50%', background: '#e2e8f0', opacity: isUploadingPhoto ? 0.5 : 1 }} />}
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.display_name || 'Your profile'}</h2>
              <p style={{ margin: '0.25rem 0', color: '#64748b', fontSize: '0.85rem' }}>{profile.tower || 'Tower not set'}{profile.floor ? ` · Floor ${profile.floor}` : ''}</p>
              <p style={{ margin: 0, color: '#475569', fontSize: '0.85rem' }}>{profile.major || 'Major not set'}</p>
              <p style={{ margin: '0.25rem 0 0', color: '#2563eb', fontSize: '0.85rem', fontWeight: 600 }}>{profile.instagram_handle || 'Instagram not set'}</p>
            </div>
            <button
              type="button"
              aria-label="Profile settings"
              title="Profile settings"
              onClick={toggleSettings}
              style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #d1d5db', background: '#fff', color: '#334155', fontSize: '1.25rem', cursor: 'pointer', flexShrink: 0 }}
            >
              &#9881;
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '-0.25rem' }}>
            {(profile.interests ?? []).length > 0 ? profile.interests?.map((interest) => <span key={interest} style={{ padding: '0.3rem 0.55rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontSize: '0.75rem' }}>{interest}</span>) : <span style={{ color: '#64748b', fontSize: '0.8rem' }}>No interests selected</span>}
          </div>

          {profile.is_admin ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.7rem 1rem', borderRadius: '10px', background: '#111827', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>View admin</Link>
            </div>
          ) : null}

          <PushNotifications />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.5rem' }}>
            <div style={{ padding: '0.8rem 0.45rem', textAlign: 'center', background: '#111827', color: '#fff', borderRadius: '12px' }}>
              <strong style={{ display: 'block', fontSize: '1.35rem' }}>{postedNights.length}</strong>
              <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>Nights out</span>
            </div>
            <div style={{ padding: '0.8rem 0.45rem', textAlign: 'center', background: '#f1f5f9', borderRadius: '12px' }}>
              <strong style={{ display: 'block', fontSize: '1.35rem' }}>{profile.floor ? `F${profile.floor}` : '—'}</strong>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Floor</span>
            </div>
            <div style={{ padding: '0.8rem 0.45rem', textAlign: 'center', background: '#f1f5f9', borderRadius: '12px' }}>
              <strong style={{ display: 'block', fontSize: '1.35rem' }}>{profile.interests?.length ?? 0}</strong>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Interests</span>
            </div>
            <div style={{ padding: '0.8rem 0.45rem', textAlign: 'center', background: '#f1f5f9', borderRadius: '12px' }}>
              <strong style={{ display: 'block', fontSize: '1.35rem' }}>{connectionCount}</strong>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Connections</span>
            </div>
          </div>

          {!isEditing ? (
            <>
              <section>
                <h2 style={{ fontSize: '1.15rem' }}>Your night history</h2>
                {postedNights.length === 0 ? <p style={{ color: '#64748b' }}>Your posted nights will appear here.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>{postedNights.map((night) => <article key={night.id} style={{ overflow: 'hidden', border: '1px solid #e5e7eb', borderRadius: '12px', background: '#fff' }}>{night.photoUrl ? <img src={night.photoUrl} alt="" style={{ display: 'block', width: '100%', aspectRatio: '1', objectFit: 'contain', background: '#f1f5f9' }} /> : <div style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', background: '#e2e8f0', color: '#64748b', fontSize: '0.85rem' }}>No photo</div>}<div style={{ padding: '0.7rem' }}><h3 style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{night.eventName}</h3><p style={{ margin: '0.3rem 0', color: '#64748b', fontSize: '0.72rem' }}>{new Date(night.createdAt).toLocaleDateString()}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>{night.vibeTags.slice(0, 2).map((tag) => <span key={tag} style={{ padding: '0.2rem 0.4rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontSize: '0.7rem' }}>{tag}</span>)}</div><button type="button" onClick={() => deletePost(night.id)} disabled={deletingPostId === night.id} style={{ marginTop: '0.65rem', padding: '0.45rem 0.6rem', border: '1px solid #fecaca', borderRadius: '7px', background: '#fff', color: '#b91c1c', fontSize: '0.75rem', fontWeight: 700, cursor: deletingPostId === night.id ? 'not-allowed' : 'pointer' }}>{deletingPostId === night.id ? 'Deleting...' : 'Delete'}</button></div></article>)}</div>}
              </section>
            </>
          ) : (
            <>
              {blockedUsers.length > 0 ? <section style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px', background: '#f8fafc' }}><h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Blocked users</h2><div style={{ display: 'grid', gap: '0.6rem' }}>{blockedUsers.map((blockedUser) => <div key={blockedUser.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}><span>{blockedUser.displayName}</span><button type="button" onClick={() => unblockUser(blockedUser.id)} style={{ padding: '0.45rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: '7px', background: '#fff', color: '#334155', fontWeight: 700 }}>Unblock</button></div>)}</div></section> : null}

              <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                <label htmlFor="profile-major" style={{ display: 'block', marginBottom: '0.5rem', color: '#64748b', fontWeight: 600 }}>
                  Major
                </label>
                <select
                  id="profile-major"
                  value={major}
                  onChange={(event) => setMajor(event.target.value)}
                  style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '1rem' }}
                >
                  <option value="">Select a major</option>
                  {onboardingMajors.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontWeight: 600 }}>Interests</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {onboardingInterestTags.map((tag) => {
                    const isSelected = interests.includes(tag)

                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleInterest(tag)}
                        style={{
                          padding: '0.6rem 0.9rem',
                          borderRadius: '999px',
                          border: isSelected ? '1px solid #2563eb' : '1px solid #d1d5db',
                          background: isSelected ? '#dbeafe' : '#fff',
                          color: isSelected ? '#1d4ed8' : '#111827',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                <label htmlFor="profile-instagram" style={{ display: 'block', marginBottom: '0.5rem', color: '#64748b', fontWeight: 600 }}>
                  Instagram handle
                </label>
                <input
                  id="profile-instagram"
                  type="text"
                  value={instagramHandle}
                  onChange={(event) => setInstagramHandle(event.target.value)}
                  placeholder="@yourhandle"
                  maxLength={30}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '1rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  style={{
                    flex: 1,
                    padding: '0.8rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#111827',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProfileChanges}
                  disabled={isSaving}
                  style={{
                    flex: 1,
                    padding: '0.8rem 1rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: isSaving ? '#a5b4fc' : '#10b981',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: isSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', fontSize: '0.85rem' }}>
        <Link href="/terms" style={{ color: '#64748b' }}>Terms of Service</Link>
        <Link href="/privacy" style={{ color: '#64748b' }}>Privacy Policy</Link>
      </div>
    </main>
  )
}