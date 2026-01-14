import { useState, useCallback } from 'react'
import electronAPI from '../services/electronAPI'
import type { AlsMetadata } from '../types'

/**
 * Hook for parsing Ableton Live Set files
 */
export function useAlsParser() {
  const [metadata, setMetadata] = useState<AlsMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseAls = useCallback(async (alsPath: string) => {
    setLoading(true)
    setError(null)
    setMetadata(null)

    try {
      const content = await electronAPI.getAlsContent(alsPath)
      if (content) {
        setMetadata(content)
      } else {
        setError('Failed to parse ALS file')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse ALS file')
      setMetadata(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const findAndParse = useCallback(async (folderPath: string) => {
    setLoading(true)
    setError(null)

    try {
      const alsPath = await electronAPI.findAls(folderPath)
      if (alsPath) {
        await parseAls(alsPath)
      } else {
        setError('No .als file found in folder')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find ALS file')
      setMetadata(null)
    } finally {
      setLoading(false)
    }
  }, [parseAls])

  const clear = useCallback(() => {
    setMetadata(null)
    setError(null)
  }, [])

  return {
    metadata,
    loading,
    error,
    parseAls,
    findAndParse,
    clear
  }
}

export default useAlsParser
