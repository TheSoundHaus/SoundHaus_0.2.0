import { useState, useCallback } from 'react'
import gitService from '../services/gitService'
import type { PullPushResult } from '../types'

export type GitErrorType = 'conflict' | 'network' | 'unknown' | null

export interface GitError {
  type: GitErrorType
  message: string
  conflictingFiles?: string[]
}

/**
 * Parses error message to determine error type and extract details
 */
function parseGitError(error: unknown): GitError {
  const errorStr = error instanceof Error ? error.message : String(error)

  // Check for conflict errors
  if (errorStr.includes('conflicts')) {
    return {
      type: 'conflict',
      message: 'Your changes have conflicts with recent changes from your collaborators.',
      conflictingFiles: [],
    }
  }

  // Check for network/fetch errors
  if (errorStr.includes('Fetch failed') || errorStr.includes('ENOTFOUND') || errorStr.includes('Connection refused')) {
    return {
      type: 'network',
      message: 'Unable to connect to the server. Please check your internet connection and try again.',
    }
  }

  // Unknown error
  return {
    type: 'unknown',
    message: errorStr,
  }
}

export function useProjectGitActions() {
    const [isPulling, setIsPulling] = useState(false)
    const [isCommitting, setIsCommitting] = useState(false)
    const [isPushing, setIsPushing] = useState(false)
    const [pullError, setPullError] = useState<GitError | null>(null)

    const runPull = useCallback(async (
        projectPath: string,
        opts?: { skipMissingSampleCheck?: boolean },
    ): Promise<PullPushResult> => {
        setIsPulling(true)
        setPullError(null)
        try {
            const result = await gitService.pullRepo(projectPath, opts)
            if (!result.ok) {
                return result
            }
            return result
        } catch (error) {
            const parsedError = parseGitError(error)
            setPullError(parsedError)
            throw parsedError
        } finally {
            setIsPulling(false)
        }
    }, [])

    const runCommit = useCallback(async (projectPath: string): Promise<string> => {
        setIsCommitting(true)
        try {
            return await gitService.commitChange(projectPath)
        } finally {
            setIsCommitting(false)
        }
    }, [])

    const runPush = useCallback(async (
        projectPath: string,
        opts?: { skipMissingSampleCheck?: boolean },
    ): Promise<PullPushResult> => {
        setIsPushing(true)
        try {
            return await gitService.pushRepo(projectPath, opts)
        } finally {
            setIsPushing(false)
        }
    }, [])

    const clearPullError = useCallback(() => {
        setPullError(null)
    }, [])

    return { 
        runPull, 
        runCommit, 
        runPush, 
        isPulling, 
        isCommitting, 
        isPushing,
        pullError,
        clearPullError,
    }
}

export default useProjectGitActions
