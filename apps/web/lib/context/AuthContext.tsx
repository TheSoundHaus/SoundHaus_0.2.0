'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { getAccessToken, isAuthenticated } from '../utils/authUtil'

interface User {
  id: string
  email: string
  // Add more user fields as needed
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuth: boolean
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * AuthProvider - Manages user authentication state
 *
 * This provider tracks whether the user is authenticated by checking
 * for the presence of a valid JWT token in cookies.
 *
 * Note: Actual login/logout is handled via server actions in auth.service.ts
 * This context only tracks the authentication state on the client side.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuth, setIsAuth] = useState(false)

  const checkAuth = async () => {
    setIsLoading(true)
    try {
      const authenticated = await isAuthenticated()
      setIsAuth(authenticated)

      if (authenticated) {
        // In a real app, you might want to fetch user details here
        // For now, we just know they're authenticated
        const token = await getAccessToken()
        if (token) {
          // You could decode the JWT to get user info, or fetch from API
          // For now, we'll just set a placeholder
          setUser({ id: 'unknown', email: 'unknown' })
        }
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuth(false)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuth,
        checkAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * useAuth hook - Access authentication state
 *
 * @example
 * const { isAuth, isLoading, user } = useAuth()
 * if (isLoading) return <Spinner />
 * if (!isAuth) return <LoginPrompt />
 * return <Dashboard user={user} />
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
