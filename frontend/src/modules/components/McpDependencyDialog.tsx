/**
 * McpDependencyDialog - Shown after installing a package that requires
 * MCP servers that are not yet configured locally.
 *
 * Lists missing servers with a "Configure" button per server (opens
 * McpServerSetupFlow) and a "Skip" button to dismiss.
 */

import { useState, useEffect, useCallback } from 'react'
import { Server, AlertTriangle, Check, X } from 'lucide-react'

export interface McpDependencyDialogProps {
  isOpen: boolean
  missingMcps: string[]
  packageName: string
  onConfigure: (serverName: string) => void
  onDismiss: () => void
  theme?: 'light' | 'dark'
}

export function McpDependencyDialog({
  isOpen,
  missingMcps,
  packageName,
  onConfigure,
  onDismiss,
  theme = 'dark'
}: McpDependencyDialogProps) {
  const [configuredServers, setConfiguredServers] = useState<Set<string>>(new Set())

  // Reset when dialog opens with new data
  useEffect(() => {
    if (isOpen) {
      setConfiguredServers(new Set())
    }
  }, [isOpen, missingMcps])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onDismiss])

  const handleConfigure = useCallback((serverName: string) => {
    onConfigure(serverName)
    // Mark as configured (optimistic — the parent handles actual setup)
    setConfiguredServers(prev => new Set(prev).add(serverName))
  }, [onConfigure])

  if (!isOpen || missingMcps.length === 0) return null

  const remaining = missingMcps.filter(s => !configuredServers.has(s))
  const allConfigured = remaining.length === 0

  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    warning: '#f59e0b',
    warningBg: 'rgba(245, 158, 11, 0.1)',
    warningBorder: 'rgba(245, 158, 11, 0.3)',
    success: '#10b981',
    successBg: 'rgba(16, 185, 129, 0.1)',
    successBorder: 'rgba(16, 185, 129, 0.3)',
    primary: '#3b82f6',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    itemBg: theme === 'dark' ? '#0f172a' : '#f8fafc'
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: '24px',
          minWidth: '400px',
          maxWidth: '520px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
          <AlertTriangle size={20} style={{ color: colors.warning, flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{
              margin: '0 0 4px 0',
              fontSize: '16px',
              fontWeight: 600,
              color: colors.text
            }}>
              MCP Servers Required
            </h3>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: colors.textSecondary,
              lineHeight: 1.5
            }}>
              <strong>{packageName}</strong> requires the following MCP servers that are not yet configured on this machine.
            </p>
          </div>
        </div>

        {/* Server list */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '20px'
        }}>
          {missingMcps.map((serverName) => {
            const isConfigured = configuredServers.has(serverName)
            return (
              <div
                key={serverName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: colors.itemBg,
                  border: `1px solid ${isConfigured ? colors.successBorder : colors.warningBorder}`,
                  borderRadius: '6px',
                  transition: 'border-color 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Server size={14} style={{ color: isConfigured ? colors.success : colors.warning }} />
                  <code style={{
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '13px',
                    color: colors.text
                  }}>
                    {serverName}
                  </code>
                  {isConfigured && (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: colors.success,
                      background: colors.successBg,
                      border: `1px solid ${colors.successBorder}`,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      Configured
                    </span>
                  )}
                </div>
                {!isConfigured && (
                  <button
                    onClick={() => handleConfigure(serverName)}
                    style={{
                      padding: '6px 12px',
                      background: colors.primary,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                  >
                    Configure
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onDismiss}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              color: colors.text,
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {allConfigured ? 'Done' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default McpDependencyDialog
