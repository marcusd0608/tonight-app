'use client'

import { nightVibeTags } from '@/app/lib/constants'
import { createClient } from '@/utils/supabase/client'
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'

type EventOption = { id: string; name: string }

const getLosAngelesDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const getSimilarityScore = (query: string, candidate: string) => {
  const normalizedQuery = query.toLowerCase().trim()
  const normalizedCandidate = candidate.toLowerCase().trim()
  if (!normalizedQuery) return 0
  if (normalizedCandidate === normalizedQuery) return 1000
  if (normalizedCandidate.startsWith(normalizedQuery)) return 800 - normalizedCandidate.length
  if (normalizedCandidate.includes(normalizedQuery)) return 600 - normalizedCandidate.length
  const queryWords = normalizedQuery.split(/\s+/)
  const candidateWords = normalizedCandidate.split(/\s+/)
  const matchingWords = queryWords.filter((word) => candidateWords.some((candidateWord) => candidateWord.startsWith(word))).length
  return matchingWords * 100 - Math.abs(normalizedCandidate.length - normalizedQuery.length)
}

const compressImage = (file: File): Promise<File> => new Promise((resolve, reject) => {
  const image = new Image()
  const objectUrl = URL.createObjectURL(file)
  image.onload = () => {
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) { URL.revokeObjectURL(objectUrl); reject(new Error('Canvas is unavailable.')); return }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      URL.revokeObjectURL(objectUrl)
      if (!blob) reject(new Error('Photo compression failed.'))
      else resolve(new File([blob], 'night-photo.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.82)
  }
  image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('The selected photo could not be read.')) }
  image.src = objectUrl
})

export default function CreatePostPage() {
  const [eventName, setEventName] = useState('')
  const [description, setDescription] = useState('')
  const [events, setEvents] = useState<EventOption[]>([])
  const [selectedEvent, setSelectedEvent] = useState<EventOption | null>(null)
  const [vibes, setVibes] = useState<string[]>([])
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadEvents = async () => {
      const { data, error } = await createClient().from('events').select('id, name').order('name').limit(500)
      if (!error) setEvents(data ?? [])
      else setMessage(`Could not load events: ${error.message}`)
    }
    void loadEvents()
  }, [])

  const suggestions = useMemo(() => events
    .filter((event) => eventName.trim() && event.id !== selectedEvent?.id)
    .map((event) => ({ event, score: getSimilarityScore(eventName, event.name) }))
    .filter(({ score }) => score > -100)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map(({ event }) => event), [eventName, events, selectedEvent])

  const toggleVibe = (vibe: string) => setVibes((current) => current.includes(vibe) ? current.filter((item) => item !== vibe) : [...current, vibe])

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    event.target.value = ''
  }

  const removePhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(null)
    setPhotoPreview('')
  }

  const submitPost = async () => {
    const trimmedEventName = eventName.trim()
    if (!trimmedEventName || vibes.length === 0) { setMessage('Add an event name and at least one vibe.'); return }
    setIsSaving(true)
    setMessage('')
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { setMessage('You must be signed in to post a night.'); setIsSaving(false); return }

    let eventId = selectedEvent?.id
    if (!eventId) {
      const exactMatch = events.find((event) => event.name.toLowerCase().trim() === trimmedEventName.toLowerCase())
      if (exactMatch) eventId = exactMatch.id
      else {
        const { data: createdEvent, error: eventError } = await supabase.from('events').insert({ name: trimmedEventName, event_date: getLosAngelesDate() }).select('id, name').single()
        if (eventError || !createdEvent) { setMessage(eventError?.message ?? 'Could not create the event.'); setIsSaving(false); return }
        eventId = createdEvent.id
      }
    }

    let photoUrl: string | null = null
    if (photo) {
      try {
        const compressed = await compressImage(photo)
        const path = `night-posts/${authData.user.id}/${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage.from('profiles').upload(path, compressed, { contentType: 'image/jpeg' })
        if (uploadError) throw uploadError
        const { data: signedUrl, error: urlError } = await supabase.storage.from('profiles').createSignedUrl(path, 60 * 60 * 24 * 365)
        if (urlError) throw urlError
        photoUrl = signedUrl.signedUrl
      } catch (uploadError) { setMessage(uploadError instanceof Error ? uploadError.message : 'Could not upload the photo.'); setIsSaving(false); return }
    }

    const { error: postError } = await supabase.from('posts').insert({ user_id: authData.user.id, event_id: eventId, description: description.trim() || null, vibe_tags: vibes, photo_url: photoUrl })
    if (postError) setMessage(postError.message)
    else { setMessage('Your night was posted.'); setEventName(''); setDescription(''); setSelectedEvent(null); setVibes([]); removePhoto() }
    setIsSaving(false)
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>SHARE YOUR NIGHT</p>
      <h1 style={{ margin: '0.25rem 0 1.5rem' }}>Post a night</h1>
      {message ? <p role="status" style={{ padding: '0.75rem', borderRadius: '8px', background: '#f1f5f9' }}>{message}</p> : null}
      <section style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <label htmlFor="event-name" style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 700 }}>Event name</label>
          <input id="event-name" value={eventName} onChange={(event) => { setEventName(event.target.value); setSelectedEvent(null) }} placeholder="Search for a concert, rave, or event" autoComplete="off" style={{ width: '100%', boxSizing: 'border-box', padding: '0.85rem 1rem', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '1rem' }} />
          {suggestions.length > 0 ? <div role="listbox" style={{ marginTop: '0.35rem', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>{suggestions.map((event) => <button key={event.id} type="button" onClick={() => { setEventName(event.name); setSelectedEvent(event) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.75rem 1rem', border: 0, borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer' }}>{event.name}</button>)}</div> : null}
          {eventName.trim() && !selectedEvent ? <p style={{ margin: '0.45rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>A new event will be added if no existing event matches.</p> : null}
        </div>
        <div>
          <label htmlFor="night-description" style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 700 }}>Description (optional)</label>
          <textarea id="night-description" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="Tell people what makes this night fun" rows={4} style={{ width: '100%', boxSizing: 'border-box', padding: '0.85rem 1rem', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '1rem', resize: 'vertical' }} />
          <p style={{ margin: '0.35rem 0 0', textAlign: 'right', color: '#64748b', fontSize: '0.8rem' }}>{description.length}/500</p>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontWeight: 700, marginBottom: '0.55rem' }}>Vibe</legend><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>{nightVibeTags.map((vibe) => { const selected = vibes.includes(vibe); return <button key={vibe} type="button" aria-pressed={selected} onClick={() => toggleVibe(vibe)} style={{ padding: '0.6rem 0.8rem', borderRadius: '999px', border: selected ? '1px solid #111827' : '1px solid #cbd5e1', background: selected ? '#111827' : '#fff', color: selected ? '#fff' : '#334155', cursor: 'pointer', fontWeight: 600 }}>{vibe}</button> })}</div></fieldset>
        <div><input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} /><button type="button" onClick={() => photoInputRef.current?.click()} style={{ padding: '0.7rem 0.9rem', border: '1px dashed #94a3b8', borderRadius: '9px', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>{photo ? 'Change photo' : 'Add a photo (optional)'}</button>{photoPreview ? <div style={{ marginTop: '0.75rem' }}><img src={photoPreview} alt="Night preview" style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '10px', objectFit: 'cover' }} /><button type="button" onClick={removePhoto} style={{ display: 'block', marginTop: '0.45rem', border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>Remove photo</button></div> : null}</div>
        <button type="button" onClick={submitPost} disabled={isSaving} style={{ padding: '0.9rem 1rem', border: 0, borderRadius: '9px', background: isSaving ? '#94a3b8' : '#111827', color: '#fff', fontWeight: 800, cursor: isSaving ? 'not-allowed' : 'pointer' }}>{isSaving ? 'Posting...' : 'Post a night'}</button>
      </section>
    </main>
  )
}
