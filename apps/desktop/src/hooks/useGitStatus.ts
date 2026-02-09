import { useState, useEffect, useCallback } from 'react'
import gitService from '../services/gitService'
import type { GitStatus } from '../types'

/**
 * Hook for monitoring git status
 * Optionally auto-refreshes at interval
 */
export function useGitStatus(repoPath: string | null, autoRefresh = false, intervalMs = 5000) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!repoPath) {
      setStatus(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const gitStatus = await gitService.getStatus(repoPath)
      setStatus(gitStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get git status')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  // Fetch on mount and when repoPath changes
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh || !repoPath) return

    const interval = setInterval(fetchStatus, intervalMs)
    return () => clearInterval(interval)
  }, [autoRefresh, repoPath, intervalMs, fetchStatus])

  return {
    status,
    loading,
    error,
    refresh: fetchStatus,
    hasChanges: status?.hasChanges ?? false,
    formatStatus: status ? gitService.formatStatus(status) : 'No repository selected'
  }
}

export default useGitStatus
