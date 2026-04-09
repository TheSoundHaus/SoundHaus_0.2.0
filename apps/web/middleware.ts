import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware to protect routes that require authentication.
 * Redirects to /login when access token is missing on protected paths.
 */
export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value
  const refreshToken = request.cookies.get('sb-refresh-token')?.value

  // Define protected routes
  const protectedPaths = ['/dashboard', '/repositories', '/settings', '/repository']
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  // If no access token AND no refresh token, session is fully expired — force redirect
  if (isProtectedPath && !accessToken && !refreshToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    loginUrl.searchParams.set('expired', '1')
    return NextResponse.redirect(loginUrl)
  }

  // If no access token but refresh token exists, let through — client-side refresh will handle it
  if (isProtectedPath && !accessToken && refreshToken) {
    return NextResponse.next()
  }

  // Redirect to dashboard if already logged in and trying to access auth pages
  const authPaths = ['/login', '/signup']
  const isAuthPath = authPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isAuthPath && accessToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
