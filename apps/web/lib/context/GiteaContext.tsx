'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { getGiteaCredentials } from '../services/gitea.service'
import type { GiteaCredentials } from '../services/gitea.service'

interface GiteaContextType {
credentials: GiteaCredentials | null
error: string | null
isLoading: boolean
refetch: () => Promise<void>
}

const GiteaContext = createContext<GiteaContextType | undefined>(undefined)

export function GiteaProvider({ children }: { children: React.ReactNode }) {
const [credentials, setCredentials] = useState<GiteaCredentials | null>(null)
const [error, setError] = useState<string | null>(null)
const [isLoading, setIsLoading] = useState(true)

const fetchCredentials = async () => {
    setIsLoading(true)
    setError(null)

    const result = await getGiteaCredentials()

    if (result.success) {
        setCredentials(result)
    } else {
        setError('error' in result ? result.error : 'Unknown error')
    }

    setIsLoading(false)
}

useEffect(() => {
    fetchCredentials()
}, [])

return (
    <GiteaContext.Provider
    value={{
        credentials,
        error,
        isLoading,
        refetch: fetchCredentials
    }}
    >
    {children}
    </GiteaContext.Provider>
)
}

export function useGitea() {
const context = useContext(GiteaContext)
if (context === undefined) {
    throw new Error('useGitea must be used within a GiteaProvider')
}
return context
}