import { useState, useCallback } from 'react'
import gitService from '../services/gitService'

export function useProjectGitActions() {
    const [isPulling, setIsPulling] = useState(false)
    const [isCommitting, setIsCommitting] = useState(false)
    const [isPushing, setIsPushing] = useState(false)

    const runPull = useCallback(async (projectPath: string): Promise<string> => {
        setIsPulling(true)
        try {
            return await gitService.pullRepo(projectPath)
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

    const runPush = useCallback(async (projectPath: string): Promise<string> => {
        setIsPushing(true)
        try {
            return await gitService.pushRepo(projectPath)
        } finally {
            setIsPushing(false)
        }
    }, [])

    return { runPull, runCommit, runPush, isPulling, isCommitting, isPushing }
}

export default useProjectGitActions
