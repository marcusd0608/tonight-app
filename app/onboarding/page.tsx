'use client'

import LogoutButton from '@/components/LogoutButton'
import {
  mesaCourtFloors,
  mesaCourtTowers,
  onboardingInterestTags,
  onboardingMajors
} from '@/app/lib/constants'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { trackEvent } from '@/utils/analytics'

const stepLabels = ['Name + Photo', 'Tower + Floor', 'Major + Interest', 'Confirmation']

const emptyFormData = {
  name: '',
  photo: '',
  tower: '',
  floor: '',
  major: '',
  instagramHandle: '',
  interests: [] as string[]
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState(emptyFormData)
  const [isTowerFloorLocked, setIsTowerFloorLocked] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [selectedPhotoName, setSelectedPhotoName] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadSavedProgress = async () => {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.getUser()

      if (authError || !authData.user) {
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (error) {
        console.error('Failed to load onboarding progress:', error)
        return
      }

      if (!profile) {
        return
      }

      const rawInterests = profile.interests
      let parsedInterests: string[] = []

      if (Array.isArray(rawInterests)) {
        parsedInterests = rawInterests.filter((value): value is string => typeof value === 'string')
      } else if (typeof rawInterests === 'string') {
        try {
          parsedInterests = JSON.parse(rawInterests)
        } catch {
          parsedInterests = []
        }
      }

      const savedTower = typeof profile.tower === 'string' ? profile.tower : ''
      const savedFloor = typeof profile.floor === 'number'
        ? String(profile.floor)
        : typeof profile.floor === 'string'
          ? profile.floor
          : ''

      setFormData({
        name: typeof profile.display_name === 'string' ? profile.display_name : '',
        photo: typeof profile.photo_url === 'string' ? profile.photo_url : '',
        tower: savedTower,
        floor: savedFloor,
        major: typeof profile.major === 'string' ? profile.major : '',
        instagramHandle: typeof profile.instagram_handle === 'string' ? profile.instagram_handle : '',
        interests: parsedInterests
      })

      const shouldLockTowerFloor = Boolean(savedTower) && Boolean(savedFloor)
      setIsTowerFloorLocked(shouldLockTowerFloor)

      const hasName = typeof profile.display_name === 'string' && profile.display_name.trim().length > 0
      const hasTowerAndFloor = Boolean(savedTower) && Boolean(savedFloor)
      const hasMajorAndInterests = Boolean(profile.major) && parsedInterests.length > 0
      const resumeStep = !hasName ? 0 : !hasTowerAndFloor ? 1 : !hasMajorAndInterests ? 2 : 3
      setCurrentStep(resumeStep)
    }

    void loadSavedProgress()
  }, [])

  const canContinue = () => {
    if (currentStep === 0) return formData.name.trim().length > 1 && !isUploadingPhoto
    if (currentStep === 1) return Boolean(formData.tower) && Boolean(formData.floor)
    if (currentStep === 2) return Boolean(formData.major) && formData.interests.length > 0
    return true
  }

  const updateField = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
    setFormData((previous) => ({ ...previous, [field]: value }))
  }

  const toggleInterest = (tag: string) => {
    setFormData((previous) => ({
      ...previous,
      interests: previous.interests.includes(tag)
        ? previous.interests.filter((item) => item !== tag)
        : [...previous.interests, tag]
    }))
  }

  const compressImageFile = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)

      img.onload = () => {
        const maxDimension = 1200
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('Canvas is not available in this browser.'))
          return
        }

        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))

        context.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl)

            if (!blob) {
              reject(new Error('Image compression failed.'))
              return
            }

            const compressedFile = new File([blob], `${file.name.replace(/\.[^/.]+$/, '')}-compressed.jpg`, {
              type: 'image/jpeg'
            })

            resolve(compressedFile)
          },
          'image/jpeg',
          0.8
        )
      }

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('The selected image could not be read.'))
      }

      img.src = objectUrl
    })
  }

  const uploadAvatarImage = async (file: File) => {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      throw new Error('You must be signed in to upload a profile photo.')
    }

    const compressedFile = await compressImageFile(file)
    const storagePath = `private/${authData.user.id}/avatar-${Date.now()}.jpg`

    const { error: uploadError } = await supabase.storage.from('profiles').upload(storagePath, compressedFile, {
      upsert: true,
      contentType: 'image/jpeg'
    })

    if (uploadError) {
      throw uploadError
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('profiles')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

    if (signedUrlError) {
      throw signedUrlError
    }

    return signedUrlData?.signedUrl ?? ''
  }

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPhotoError('')
    setSelectedPhotoName(file.name)
    setIsUploadingPhoto(true)

    try {
      const uploadedPhotoUrl = await uploadAvatarImage(file)
      updateField('photo', uploadedPhotoUrl)
    } catch (error) {
      console.error('Failed to upload avatar:', error)
      setPhotoError(error instanceof Error ? error.message : 'Unable to upload profile photo.')
      updateField('photo', '')
    } finally {
      setIsUploadingPhoto(false)
      event.target.value = ''
    }
  }

  const skipPhoto = () => {
    updateField('photo', '')
    setSelectedPhotoName('')
    setPhotoError('')
  }

  const saveProgress = async () => {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return
    }

    const normalizedFloor = formData.floor ? Number(formData.floor) : null

    const payload = {
      id: authData.user.id,
      display_name: formData.name.trim() || null,
      photo_url: formData.photo || null,
      tower: formData.tower || null,
      floor: Number.isInteger(normalizedFloor) ? normalizedFloor : null,
      major: formData.major || null,
      instagram_handle: formData.instagramHandle.trim() || null,
      interests: formData.interests
    }

    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })

    if (error) {
      console.error('Failed to save onboarding progress:', error)
    }
  }

  const goToNextStep = async () => {
    if (!canContinue()) return

    const nextStep = Math.min(currentStep + 1, stepLabels.length - 1)
    await saveProgress()
    setCurrentStep(nextStep)
  }

  const goToPreviousStep = () => {
    setCurrentStep((previous) => Math.max(previous - 1, 0))
  }

  const completeOnboarding = async () => {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      router.push('/tonight')
      return
    }

    const normalizedFloor = formData.floor ? Number(formData.floor) : null

    const payload = {
      id: authData.user.id,
      display_name: formData.name.trim() || null,
      photo_url: formData.photo || null,
      tower: formData.tower || null,
      floor: Number.isInteger(normalizedFloor) ? normalizedFloor : null,
      major: formData.major || null,
      instagram_handle: formData.instagramHandle.trim() || null,
      interests: formData.interests
    }

    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })

    if (error) {
      console.error('Failed to complete onboarding:', error)
      router.push('/tonight')
      return
    }

    await trackEvent('completed_onboarding', {
      user_id: authData.user.id,
      tower: payload.tower,
      floor: payload.floor,
      major: payload.major,
    })

    router.push('/tonight')
  }

  const renderStep = () => {
    if (currentStep === 0) {
      return (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <div>
            <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="Enter your name"
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '1rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Profile photo
            </label>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} disabled={isUploadingPhoto} style={{ display: 'none' }} />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploadingPhoto}
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#334155', fontWeight: 600, cursor: isUploadingPhoto ? 'not-allowed' : 'pointer', opacity: isUploadingPhoto ? 0.7 : 1 }}
            >
              {selectedPhotoName || formData.photo ? 'Change profile photo' : 'Choose profile photo'}
            </button>
            {selectedPhotoName ? <p style={{ margin: '0.6rem 0 0', color: '#475569', fontSize: '0.9rem' }}>{selectedPhotoName}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', gap: '1rem' }}>
              <button
                type="button"
                onClick={skipPhoto}
                style={{ border: 'none', background: 'transparent', color: '#475569', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Skip photo
              </button>
              {isUploadingPhoto ? <span style={{ color: '#4f46e5', fontWeight: 600 }}>Uploading…</span> : null}
            </div>
            {photoError ? <p style={{ color: '#dc2626', marginTop: '0.75rem', marginBottom: 0 }}>{photoError}</p> : null}
            {formData.photo ? (
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                <img
                  src={formData.photo}
                  alt="Profile preview"
                  style={{ width: '110px', height: '110px', objectFit: 'cover', borderRadius: '50%', border: '3px solid #e2e8f0' }}
                />
              </div>
            ) : null}
          </div>
        </div>
      )
    }

    if (currentStep === 1) {
      return (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <div>
            <label htmlFor="tower" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Tower
            </label>
            <select
              id="tower"
              value={formData.tower}
              disabled={isTowerFloorLocked}
              onChange={(event) => updateField('tower', event.target.value)}
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '1rem', background: isTowerFloorLocked ? '#f1f5f9' : '#fff', cursor: isTowerFloorLocked ? 'not-allowed' : 'pointer' }}
            >
              <option value="">Select a tower</option>
              {mesaCourtTowers.map((tower) => (
                <option key={tower} value={tower}>
                  {tower}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="floor" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Floor
            </label>
            <select
              id="floor"
              value={formData.floor}
              disabled={isTowerFloorLocked}
              onChange={(event) => updateField('floor', event.target.value)}
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '1rem', background: isTowerFloorLocked ? '#f1f5f9' : '#fff', cursor: isTowerFloorLocked ? 'not-allowed' : 'pointer' }}
            >
              <option value="">Select a floor</option>
              {mesaCourtFloors.map((floor) => (
                <option key={floor} value={floor}>
                  Floor {floor}
                </option>
              ))}
            </select>
          </div>
        </div>
      )
    }

    if (currentStep === 2) {
      return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div>
            <label htmlFor="major" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Major
            </label>
            <select
              id="major"
              value={formData.major}
              onChange={(event) => updateField('major', event.target.value)}
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '1rem' }}
            >
              <option value="">Select a major</option>
              {onboardingMajors.map((major) => (
                <option key={major} value={major}>
                  {major}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="instagram-handle" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Instagram handle (optional)
            </label>
            <input
              id="instagram-handle"
              type="text"
              value={formData.instagramHandle}
              onChange={(event) => updateField('instagramHandle', event.target.value)}
              placeholder="@yourhandle"
              maxLength={30}
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>
              Interest tags
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              {onboardingInterestTags.map((tag) => {
                const isSelected = formData.interests.includes(tag)

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
        </div>
      )
    }

    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: '0 0 0.35rem', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Profile summary
          </p>
          <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{formData.name || 'Your Name'}</h3>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.9rem 1rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Tower</span>
            <strong>{formData.tower || 'Not selected'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.9rem 1rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Floor</span>
            <strong>{formData.floor ? `Floor ${formData.floor}` : 'Not selected'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.9rem 1rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Major</span>
            <strong>{formData.major || 'Not selected'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.9rem 1rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Instagram</span>
            <strong>{formData.instagramHandle.trim() || 'None'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.9rem 1rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Interests</span>
            <strong>{formData.interests.length > 0 ? formData.interests.join(', ') : 'No tags selected'}</strong>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <LogoutButton />
        </div>

        <section
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '24px',
            boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
            padding: '2rem'
          }}
        >
          <div style={{ marginBottom: '2rem' }}>
            <p style={{ margin: '0 0 0.5rem', color: '#4f46e5', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.76rem' }}>
              Setup profile
            </p>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>Welcome to Tonight</h1>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
            {stepLabels.map((label, index) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  height: '8px',
                  borderRadius: '999px',
                  background: index <= currentStep ? '#4f46e5' : '#e2e8f0'
                }}
              />
            ))}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ margin: '0 0 0.35rem', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Step {currentStep + 1} of {stepLabels.length}
            </p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{stepLabels[currentStep]}</h2>
          </div>

          {renderStep()}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '2rem' }}>
            <button
              type="button"
              onClick={goToPreviousStep}
              disabled={currentStep === 0}
              style={{
                padding: '0.85rem 1.2rem',
                borderRadius: '12px',
                border: '1px solid #d1d5db',
                background: currentStep === 0 ? '#f1f5f9' : '#ffffff',
                color: currentStep === 0 ? '#94a3b8' : '#111827',
                fontWeight: 600,
                cursor: currentStep === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Back
            </button>

            {currentStep < stepLabels.length - 1 ? (
              <button
                type="button"
                onClick={goToNextStep}
                disabled={!canContinue()}
                style={{
                  padding: '0.85rem 1.4rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: canContinue() ? '#4f46e5' : '#c7d2fe',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: canContinue() ? 'pointer' : 'not-allowed'
                }}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={completeOnboarding}
                style={{
                  padding: '0.85rem 1.4rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#10b981',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Complete setup
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}