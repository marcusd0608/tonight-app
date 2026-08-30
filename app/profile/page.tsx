'use client'

import {
  onboardingInterestTags,
  onboardingMajors
} from '@/app/lib/constants'
import LogoutButton from '@/components/LogoutButton'
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'

type ProfileData = {
  display_name: string | null
  photo_url: string | null
  tower: string | null
  floor: number | null
  major: string | null
  interests: string[] | null
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [major, setMajor] = useState('')
  const [interests, setInterests] = useState<string[]>([])
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
        .select('display_name, photo_url, tower, floor, major, interests')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (!error) {
        setProfile(data)
        setMajor(data?.major ?? '')
        setInterests(Array.isArray(data?.interests) ? data.interests : [])
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
          interests: interests
        },
        { onConflict: 'id' }
      )

    if (!error) {
      setProfile((current) => current ? { ...current, major: major || null, interests } : current)
      setIsEditing(false)
    }

    setIsSaving(false)
  }

  const startEditing = () => {
    if (!profile) return
    setMajor(profile.major ?? '')
    setInterests(Array.isArray(profile.interests) ? profile.interests : [])
    setIsEditing(true)
  }

  if (loading) {
    return <main style={{ padding: '2rem' }}><h1>Profile</h1><p>Loading profile...</p></main>
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Profile</h1>
        <LogoutButton />
      </div>

      {!profile ? (
        <p>No profile saved yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {profile.photo_url ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img
                src={profile.photo_url}
                alt="Profile"
                style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '50%', border: '3px solid #e2e8f0' }}
              />
            </div>
          ) : null}

          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
            <p style={{ margin: '0 0 0.25rem', color: '#64748b' }}>Name</p>
            <strong>{profile.display_name || 'Not set'}</strong>
          </div>

          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
            <p style={{ margin: '0 0 0.25rem', color: '#64748b' }}>Tower</p>
            <strong>{profile.tower || 'Not set'}</strong>
          </div>

          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
            <p style={{ margin: '0 0 0.25rem', color: '#64748b' }}>Floor</p>
            <strong>{profile.floor ? `Floor ${profile.floor}` : 'Not set'}</strong>
          </div>

          {!isEditing ? (
            <>
              <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                <p style={{ margin: '0 0 0.25rem', color: '#64748b' }}>Major</p>
                <strong>{profile.major || 'Not set'}</strong>
              </div>

              <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                <p style={{ margin: '0 0 0.25rem', color: '#64748b' }}>Interests</p>
                <strong>{profile.interests && profile.interests.length > 0 ? profile.interests.join(', ') : 'No interests selected'}</strong>
              </div>

              <button
                type="button"
                onClick={startEditing}
                style={{
                  padding: '0.8rem 1rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#4f46e5',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Edit major & interests
              </button>
            </>
          ) : (
            <>
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
    </main>
  )
}