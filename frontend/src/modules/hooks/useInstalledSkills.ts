/**
 * useInstalledSkills - Hook for discovering installed skill packages.
 *
 * Scans ~/.prompd/skills/ (global) and <workspace>/.prompd/skills/ (local)
 * via the skill:list IPC handler. Provides refresh() to force re-scan.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditorStore } from '../../stores/editorStore'

export interface InstalledSkill {
  name: string
  version: string
  description?: string
  tools?: string[]
  main?: string
  path: string
  scope: 'workspace' | 'user'
  parameters?: Record<string, unknown>
  allowedTools?: string[]
}

interface UseInstalledSkillsResult {
  skills: InstalledSkill[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useInstalledSkills(): UseInstalledSkillsResult {
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)
  const workspacePath = useEditorStore(state => state.explorerDirPath)

  const fetchSkills = useCallback(async () => {
    const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as
      { skill?: { list: (wp: string) => Promise<{ success: boolean; skills: InstalledSkill[]; error?: string }> } } | undefined

    if (!electronAPI?.skill) {
      setSkills([])
      return
    }

    const fetchId = ++fetchIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const result = await electronAPI.skill.list(workspacePath || '')
      if (fetchId !== fetchIdRef.current) return

      if (result.success) {
        setSkills(result.skills || [])
      } else {
        setError(result.error || 'Failed to list skills')
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to list skills')
    } finally {
      if (fetchId === fetchIdRef.current) setIsLoading(false)
    }
  }, [workspacePath])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  return { skills, isLoading, error, refresh: fetchSkills }
}
