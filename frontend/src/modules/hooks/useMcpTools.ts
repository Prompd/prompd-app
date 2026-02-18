/**
 * useMcpTools - Hook for discovering tools on an MCP server connection.
 *
 * Connects to the server (if not already) and lists available tools.
 * Caches results in state and provides a refresh() to force re-fetch.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { McpToolDefinition } from '../../electron.d'

interface UseMcpToolsResult {
  tools: McpToolDefinition[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useMcpTools(serverName: string | undefined): UseMcpToolsResult {
  const [tools, setTools] = useState<McpToolDefinition[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  const fetchTools = useCallback(async () => {
    if (!serverName || !window.electronAPI?.mcp) {
      setTools([])
      setError(null)
      return
    }

    const fetchId = ++fetchIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      // Connect first (no-op if already connected)
      const connectResult = await window.electronAPI.mcp.connect(serverName)
      if (fetchId !== fetchIdRef.current) return // stale

      if (connectResult.success && connectResult.tools) {
        setTools(connectResult.tools)
        setError(null)
      } else if (!connectResult.success) {
        // Connect failed — try listTools anyway in case it's already connected
        const listResult = await window.electronAPI.mcp.listTools(serverName)
        if (fetchId !== fetchIdRef.current) return // stale

        if (listResult.success && listResult.tools) {
          setTools(listResult.tools)
          setError(null)
        } else {
          setTools([])
          setError(connectResult.error || listResult.error || 'Failed to discover tools')
        }
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return // stale
      setTools([])
      setError(err instanceof Error ? err.message : 'Failed to discover tools')
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [serverName])

  useEffect(() => {
    fetchTools()
  }, [fetchTools])

  return { tools, isLoading, error, refresh: fetchTools }
}
