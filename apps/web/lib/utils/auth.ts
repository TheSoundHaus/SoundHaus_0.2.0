import { cookies } from 'next/headers'

/**
 * Get the current user's access token from cookies
 * Used for authenticated API requests to FastAPI backend
 */
export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get('sb-access-token')?.value
}

/**
 * Get the current user's refresh token from cookies
 */
export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get('sb-refresh-token')?.value
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken()
  return !!token
}

/**
 * Set auth cookies after successful login/signup
 */
export async function setAuthCookies(accessToken: string, refreshToken: string, expiresIn?: number) {
  const cookieStore = await cookies()

  // Store access token
  cookieStore.set('sb-access-token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: expiresIn || 60 * 60, // Use provided expiry or default to 1 hour
    path: '/',
  })

  // Store refresh token (longer expiry)
  cookieStore.set('sb-refresh-token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  console.log('✅ Session tokens stored in cookies')
}

/**
 * Clear auth cookies (logout)
 */
export async function clearAuthCookies() {
  const cookieStore = await cookies()
  cookieStore.delete('sb-access-token')
  cookieStore.delete('sb-refresh-token')
}

/**
 * Make authenticated API request to FastAPI backend
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken()
  const API_BASE_URL = process.env.API_URL || 'http://localhost:8000'

  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
  })
}
