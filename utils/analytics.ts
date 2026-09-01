import { createClient } from '@/utils/supabase/client'

export async function trackEvent(
  eventName: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError) {
    console.error('Failed to resolve user for analytics event:', authError.message)
    return { success: false, error: authError }
  }

  const { error } = await supabase.from('analytics_events').insert({
    user_id: authData.user?.id ?? null,
    event_name: eventName,
    metadata,
  })

  if (error) {
    console.error('Failed to track analytics event:', eventName, error.message)
    return { success: false, error }
  }

  return { success: true }
}
