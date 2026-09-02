import webpush from 'web-push'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type NotificationRequest = { requestId: string; kind: 'join_request' | 'join_approved' }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as NotificationRequest
  const { data: joinRequest, error: requestError } = await supabase
    .from('join_requests')
    .select('id, status_id, requester_id, status')
    .eq('id', body.requestId)
    .maybeSingle()
  if (requestError || !joinRequest) return NextResponse.json({ error: 'Join request not found' }, { status: 404 })

  const { data: activity } = await supabase.from('going_out').select('user_id, activity_category, activity_details, note, max_capacity').eq('id', joinRequest.status_id).maybeSingle()
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 })

  const recipientId = body.kind === 'join_request' && activity.user_id === authData.user.id && joinRequest.requester_id !== authData.user.id
    ? activity.user_id
    : body.kind === 'join_approved' && activity.user_id === authData.user.id && joinRequest.status === 'approved'
      ? joinRequest.requester_id
      : null
  if (!recipientId) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Push notifications are not configured' }, { status: 503 })
  }

  webpush.setVapidDetails(`mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`, publicKey, privateKey)
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: subscriptions } = await admin.from('push_subscriptions').select('id, subscription').eq('user_id', recipientId)
  const activityLabel = activity.activity_category === 'Other' && activity.activity_details ? `Other - ${activity.activity_details}` : activity.activity_category
  const payload = body.kind === 'join_request'
    ? { title: 'New join request', body: `Someone wants to join your ${activityLabel} group.`, url: '/tonight' }
    : { title: 'Join request approved', body: `Your request to join ${activityLabel} was approved.`, url: '/tonight' }

  await Promise.all((subscriptions ?? []).map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload))
    } catch (error) {
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null
      if (statusCode === 404 || statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', row.id)
    }
  }))

  return NextResponse.json({ success: true })
}