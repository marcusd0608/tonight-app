'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { trackEvent } from '@/utils/analytics'
import Link from 'next/link'

const supabase = createClient()

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [step, setStep] = useState<'mode' | 'signup' | 'signin' | 'verify'>('mode')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const isRedirecting = useRef(false)
  const isInSignUpFlow = useRef(false)

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
    router.replace(destination)
  }, [router])

  const validateEmail = (email: string): boolean => {
    return email.toLowerCase().endsWith('@uci.edu')
  }

  const validatePassword = (pass: string): boolean => {
    return pass.length >= 8
  }

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      // Only auto-route if:
      // 1. User is signed in
      // 2. Email is verified
      // 3. Not in the middle of signup flow (awaiting email verification)
      if (event === 'SIGNED_IN' && session && session.user.email_confirmed_at && !isInSignUpFlow.current) {
        void routeAuthenticatedUser(session.user.id)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [routeAuthenticatedUser])

  // Sign Up with Email + Password
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!validateEmail(email)) {
      setError('You must use a valid @uci.edu email address.')
      return
    }

    if (!validatePassword(password)) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    isInSignUpFlow.current = true

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    setLoading(false)

    if (signUpError) {
      isInSignUpFlow.current = false
      setError(signUpError.message)
      console.error('Sign up error:', signUpError)
    } else {
      console.log('Sign up successful for:', email)
      console.log('User session:', data?.user?.user_metadata)
      setSuccess('Account created! Check your email for the verification code.')
      setStep('verify')
      setPassword('')
      setConfirmPassword('')
    }
  }

  // Resend verification code
  const handleResendCode = async () => {
    if (!email) {
      setError('Email is required to resend code.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })
    setLoading(false)

    if (error) {
      setError(error.message)
      console.error('Resend error:', error)
    } else {
      setSuccess('Code resent! Check your email (including spam folder).')
    }
  }

  // Sign In with Email + Password
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!validateEmail(email)) {
      setError('You must use a valid @uci.edu email address.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
    } else {
      setSuccess('Signed in successfully!')
      // Track event, but don't crash if it fails (profile might not exist yet)
      trackEvent('user_signed_in', {
        email,
        method: 'password',
      }).catch(() => {
        // Silent fail - analytics is non-critical
      })
    }
  }

  // Verify Email via OTP (after sign up)
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'signup',
    })

    setLoading(false)

    if (verifyError) {
      setError(verifyError.message || 'Verification failed. Please try again.')
      return
    }

    const { error: refreshError } = await supabase.auth.refreshSession()

    if (refreshError) {
      setError(refreshError.message || 'Unable to refresh your session. Please try again.')
      return
    }

    // Create a basic profile entry so foreign key constraint is satisfied
    if (data?.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        // These will be completed during onboarding
      }, { onConflict: 'id' })

      if (!profileError) {
        await trackEvent('user_signed_up', {
          email,
          method: 'password',
          user_id: data.user.id,
        }).catch(() => {
          // Silent fail
        })
      }
    }

    setSuccess('Email verified!')
    setOtpCode('')
    isInSignUpFlow.current = false
    router.refresh()
    router.replace('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Tonight</h1>
          <p className="text-slate-400">Find your people. Create your night.</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Mode Selection */}
          {step === 'mode' && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setIsSignUp(true)
                  setStep('signup')
                  setError('')
                  setSuccess('')
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 ease-in-out transform hover:scale-105"
              >
                Create Account
              </button>
              <button
                onClick={() => {
                  setIsSignUp(false)
                  setStep('signin')
                  setError('')
                  setSuccess('')
                }}
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-3 px-4 rounded-lg transition duration-200 ease-in-out transform hover:scale-105"
              >
                Sign In
              </button>
            </div>
          )}

          {/* Sign Up Form */}
          {step === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  placeholder="your-netid@uci.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>}
              {success && <p className="text-green-600 text-sm bg-green-50 p-3 rounded">{success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('mode')
                  setError('')
                }}
                className="w-full text-slate-600 hover:text-slate-900 font-medium py-2"
              >
                Back
              </button>
            </form>
          )}

          {/* Sign In Form */}
          {step === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  placeholder="your-netid@uci.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                <input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>}
              {success && <p className="text-green-600 text-sm bg-green-50 p-3 rounded">{success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('mode')
                  setError('')
                }}
                className="w-full text-slate-600 hover:text-slate-900 font-medium py-2"
              >
                Back
              </button>
            </form>
          )}

          {/* Verify Email Form */}
          {step === 'verify' && (
            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  We sent a verification code to <strong>{email}</strong>. Please check your email and enter the code below.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Verification Code</label>
                <input
                  type="text"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  className="w-full px-4 py-2 text-center text-2xl tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
              </div>

              {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>}
              {success && <p className="text-green-600 text-sm bg-green-50 p-3 rounded">{success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
              >
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="w-full bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-900 font-medium py-2 px-4 rounded-lg transition duration-200"
              >
                {loading ? 'Resending...' : 'Resend Code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('signup')
                  setError('')
                  setOtpCode('')
                }}
                className="w-full text-slate-600 hover:text-slate-900 font-medium py-2"
              >
                Back
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-sm mt-8">
          Only @uci.edu email addresses are allowed
        </p>
      </div>
    </div>
  )
}