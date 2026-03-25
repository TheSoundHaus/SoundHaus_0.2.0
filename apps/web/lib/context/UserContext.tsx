'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getAccessToken } from '../utils/auth'

/**
 * User profile data structure
 */
export interface User {
  id: string
  email: string
  username: string
  display_name?: string | null
  bio?: string | null
  avatar_url?: string | null
  is_public?: boolean
  created_at?: string
  updated_at?: string
}

interface UserContextType {
  user: User | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

/**
 * UserProvider - Manages user profile data
 *
 * This provider fetches and caches the user's profile data from the backend.
 * It provides a refreshUser function to reload the profile when needed.
 *
 * API Call: GET /api/auth/profile
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUserProfile = useCallback(async () => {
    try {
      const token = await getAccessToken()

      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success && data.user) {
        setUser(data.user)
        setError(null)
      } else {
        throw new Error(data.message || 'Failed to load user profile')
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    setLoading(true)
    await fetchUserProfile()
  }, [fetchUserProfile])

  useEffect(() => {
    fetchUserProfile()
  }, [fetchUserProfile])

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        error,
        refreshUser,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

/**
 * useUser hook - Access user profile data
 *
 * @example
 * const { user, loading, refreshUser } = useUser()
 * if (loading) return <Spinner />
 * if (!user) return <LoginPrompt />
 * return <ProfileView user={user} onUpdate={refreshUser} />
 */
export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
