import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // If there's no user and they aren't on the landing page, redirect to '/'
  if (!user && request.nextUrl.pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Resume incomplete profiles instead of treating any profile row as complete.
  if (user && request.nextUrl.pathname === '/') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, tower, floor, major, interests')
      .eq('id', user.id)
      .maybeSingle()

    const hasInterests = Array.isArray(profile?.interests) && profile.interests.length > 0
    const hasCompletedProfile = Boolean(
      profile?.display_name &&
      profile.tower &&
      profile.floor !== null &&
      profile.major &&
      hasInterests
    )
    const url = request.nextUrl.clone()
    url.pathname = hasCompletedProfile ? '/tonight' : '/onboarding'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}