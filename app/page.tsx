'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

const supabase = createClient()

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const isRedirecting = useRef(false)
  const redirectTimer = useRef<number | null>(null)

  const routeAuthenticatedUser = useCallback(async (userId: string) => {
    if (isRedirecting.current) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, tower, floor, major, interests')
      .eq('id', userId)
      .maybeSingle()

    const hasInterests = Array.isArray(profile?.interests) && profile.interests.length > 0
    const hasCompletedProfile = Boolean(
      profile?.display_name &&
      profile.tower &&
      profile.floor !== null &&
      profile.major &&
      hasInterests
    )
    const destination = hasCompletedProfile ? '/tonight' : '/onboarding'

    isRedirecting.current = true
    router.refresh()
    router.push(destination)
    redirectTimer.current = window.setTimeout(() => {
      window.location.href = destination
    }, 1500)
  }, [router])

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        void routeAuthenticatedUser(session.user.id)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current)
      }
    }
  }, [routeAuthenticatedUser])

// 1. Client-side validation & send OTP
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim().toLowerCase().endsWith('@uci.edu')) {
      setError('You must use a valid @uci.edu email address.')
      return
    }

    setLoading(true)
    
    // Explicitly request OTP code delivery
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined,
      },
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setStep('otp')
    }
  }

  // 2. Verify OTP & route based on profile existence
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { session }, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })

    if (verifyError || !session) {
      setLoading(false)
      setError(verifyError?.message || 'Verification failed')
      return
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData.session) {
      setLoading(false)
      setError(sessionError?.message || 'Your session could not be established. Please try again.')
      return
    }

    await routeAuthenticatedUser(sessionData.session.user.id)
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Welcome to Tonight</h1>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {step === 'email' ? (
        <form onSubmit={handleSendCode}>
          <input
            type="email"
            placeholder="netid@uci.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
          />
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px' }}>
            {loading ? 'Sending...' : 'Send Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <input
            type="text"
            placeholder="Enter 6-digit OTP code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
          />
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px' }}>
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>
      )}
    </main>
  )
}