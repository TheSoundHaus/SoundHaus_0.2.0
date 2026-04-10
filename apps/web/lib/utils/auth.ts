"use server"

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
    maxAge: expiresIn || 60 * 60 * 24, // Use provided expiry or default to 24 hours
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
 * Attempt to refresh the access token using the stored refresh token.
 * Updates cookies on success. Returns the new access token, or null on failure.
 */
async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null

  const API_BASE_URL = process.env.API_URL || 'http://localhost:8000'
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null

    const data = await res.json()
    if (!data?.session?.access_token) return null

    const { access_token, refresh_token, expires_at } = data.session
    const expiresIn = expires_at
      ? Math.max(60, expires_at - Math.floor(Date.now() / 1000))
      : 60 * 60

    await setAuthCookies(access_token, refresh_token, expiresIn)
    return access_token
  } catch {
    return null
  }
}

/**
 * Make authenticated API request to FastAPI backend.
 * Automatically refreshes the access token if it is missing or expired.
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  let token = await getAccessToken()
  const API_BASE_URL = process.env.API_URL || 'http://localhost:8000'

  // If no access token try to refresh before sending the request
  if (!token) {
    token = await tryRefreshToken() ?? undefined
  }

  // When sending FormData (multipart), let the browser set Content-Type
  // automatically so the boundary is included. Only set JSON for other requests.
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })

  // If we get a 401 and haven't already tried refreshing, attempt once more
  if (response.status === 401 && token) {
    const newToken = await tryRefreshToken()
    if (newToken) {
      const retryHeaders: Record<string, string> = {
        ...options.headers as Record<string, string>,
        'Authorization': `Bearer ${newToken}`,
      }
      if (!isFormData) retryHeaders['Content-Type'] = 'application/json'

      return fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: retryHeaders,
      })
    }
  }

  return response
}

