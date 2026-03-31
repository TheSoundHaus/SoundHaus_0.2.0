/**
 * Client-side Auth Utilities
 * For use in Client Components ('use client')
 *
 * Unlike authUtil.ts which uses Next.js cookies() (server-side only),
 * this uses browser fetch which automatically includes cookies
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Make authenticated API request to FastAPI backend (CLIENT-SIDE)
 *
 * Browser automatically sends cookies with fetch requests to same origin.
 * For cross-origin, cookies are sent if credentials: 'include' is set.
 *
 * Note: Cookies must be accessible to JavaScript (httpOnly=false) OR
 * we rely on browser's automatic cookie handling for same-origin requests.
 */
export async function clientAuthenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies in cross-origin requests
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
    },
  })
}
