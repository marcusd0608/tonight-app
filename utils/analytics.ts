import { createClient } from '@/utils/supabase/client'

export async function trackEvent(
  eventName: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    const error = authError ?? new Error('No authenticated user session.')
    console.error('Failed to resolve user for analytics event:', error.message)
    return { success: false, error }
  }

  // Check if profile exists (required by foreign key constraint)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    console.warn('Profile does not exist yet for user, skipping analytics event:', authData.user.id)
    return { success: false, error: new Error('Profile does not exist yet') }
  }

  const { error } = await supabase.from('analytics_events').insert({
    user_id: authData.user.id,
    event_name: eventName,
    metadata,
  })

  if (error) {
    console.error('Failed to track analytics event:', eventName, error.message)
    return { success: false, error }
  }

  return { success: true }
}
