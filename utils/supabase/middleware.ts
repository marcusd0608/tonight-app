import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (request.nextUrl.pathname === '/') return supabaseResponse
    return NextResponse.redirect(new URL('/?auth_error=configuration', request.url), 303)
  }

  let supabase
  try {
    supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
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
  } catch (error) {
    console.error('Supabase middleware configuration error:', error)
    return NextResponse.redirect(new URL('/?auth_error=configuration', request.url), 303)
  }

  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (error) {
    console.error('Supabase session lookup error:', error)
    return NextResponse.redirect(new URL('/?auth_error=session', request.url), 303)
  }

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