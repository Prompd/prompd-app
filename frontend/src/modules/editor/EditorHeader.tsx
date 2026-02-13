import { Code2, Palette, Settings, Play, Square, LogOut, User, Moon, Sun, HelpCircle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PreviewToggle, ChatToggle } from './SplitViewToggles'
import { useAuthenticatedUser, useElectronAuth, isElectron } from '../auth/ClerkWrapper'
import { UserButton } from '@clerk/clerk-react'
import { useUIStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { ProviderModelSelector } from '../components/ProviderModelSelector'
import { EnvFileSelector } from '../components/EnvFileSelector'

// Help dropdown with links to syntax documentation
function HelpDropdown({ theme, isVeryCompact }: { theme: 'light' | 'dark'; isVeryCompact?: boolean }) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      })
    }
    setShowMenu(true)
  }

  const closeMenu = () => {
    setShowMenu(false)
    setMenuPos(null)
  }

  const openLink = (url: string) => {
    const electronAPI = (window as Window & { electronAPI?: { openExternal?: (url: string) => Promise<void> } }).electronAPI
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    closeMenu()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        className="btn"
        onClick={() => {
          if (showMenu) {
            closeMenu()
          } else {
            openMenu()
          }
        }}
        title="Syntax Help"
        style={{
          padding: isVeryCompact ? '4px' : '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: isVeryCompact ? '28px' : '32px',
          height: isVeryCompact ? '28px' : '32px',
          borderRadius: '6px',
          flexShrink: 0
        }}
      >
        <HelpCircle size={isVeryCompact ? 14 : 16} />
      </button>

      {showMenu && menuPos && (
        <>
          <div
            onClick={closeMenu}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 998
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              border: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: theme === 'dark'
                ? '0 10px 40px rgba(0, 0, 0, 0.5)'
                : '0 10px 40px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              zIndex: 999,
              minWidth: '220px'
            }}
          >
            <div style={{ padding: '8px 0' }}>
              <button
                onClick={() => openLink('https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax')}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                  fontSize: '14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                📝 Markdown Syntax
              </button>

              <button
                onClick={() => openLink('https://mozilla.github.io/nunjucks/templating.html')}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                  fontSize: '14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                🔧 Nunjucks/Jinja2 Syntax
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Custom user button for Electron (since Clerk's UserButton doesn't work with OAuth flow)
function ElectronUserButton({ email, theme, onSignOut, onOpenSettings }: { email?: string; theme: 'light' | 'dark'; onSignOut: () => void; onOpenSettings: () => void }) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      })
    }
    setShowMenu(true)
  }

  const closeMenu = () => {
    setShowMenu(false)
    setMenuPos(null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => {
          if (showMenu) {
            closeMenu()
          } else {
            openMenu()
          }
        }}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={email || 'User'}
      >
        {email ? email[0].toUpperCase() : <User size={16} />}
      </button>

      {showMenu && menuPos && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={closeMenu}
          />
          <div style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            background: theme === 'dark' ? '#1e293b' : '#ffffff',
            border: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            minWidth: '200px',
            zIndex: 9999,
            overflow: 'hidden'
          }}>
            {email && (
              <div style={{
                padding: '12px 16px',
                borderBottom: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0',
                fontSize: '13px',
                color: 'var(--text-secondary)'
              }}>
                {email}
              </div>
            )}
            <button
              onClick={() => {
                closeMenu()
                onOpenSettings()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Settings size={14} />
              Settings
            </button>
            <button
              onClick={() => {
                closeMenu()
                onSignOut()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

type Props = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  mode: 'wizard' | 'design' | 'code'
  onModeChange: (mode: 'wizard' | 'design' | 'code') => void
  onOpenSettings: () => void
  isPrompdFile?: boolean
  isWorkflowFile?: boolean  // Whether current file is a .pdflow workflow
  canSwitchViewMode?: boolean  // Whether wizard/design modes are available (only for .prmd files)
  onExecutePrompd?: () => void
  onExecuteWorkflow?: () => void  // Execute workflow (.pdflow files)
  workspacePath?: string | null  // For .env file detection
  showPreview?: boolean  // Whether split preview is shown
  onTogglePreview?: () => void  // Toggle split preview
  showChat?: boolean  // Whether chat pane is shown in split view
  onToggleChat?: () => void  // Toggle chat pane
}

export default function EditorHeader({
  theme,
  onToggleTheme,
  mode,
  onModeChange,
  onOpenSettings,
  isPrompdFile = false,
  isWorkflowFile = false,
  canSwitchViewMode = true,
  onExecutePrompd,
  onExecuteWorkflow,
  workspacePath,
  showPreview = false,
  onTogglePreview,
  showChat = false,
  onToggleChat
}: Props) {
  const { isAuthenticated, isLoaded, getToken, email } = useAuthenticatedUser()
  const headerRef = useRef<HTMLDivElement>(null)
  const [isCompact, setIsCompact] = useState(false)
  const [isMediumCompact, setIsMediumCompact] = useState(false)
  const [isVeryCompact, setIsVeryCompact] = useState(false)
  const isFirstMeasure = useRef(true)

  // Workflow execution state for play/stop button behavior
  const isExecuting = useWorkflowStore(state => state.isExecuting)
  const executionStatus = useWorkflowStore(state => state.executionState?.status)
  const isPaused = isExecuting && executionStatus === 'paused'

  // Responsive breakpoints based on container width
  // Priority: Right side controls (Design/Code, Execute) should hide LAST
  // Breakpoints with hysteresis to prevent flickering at edges:
  // - 1100px (shrink) / 1130px (expand): Hide pricing, force provider dropdown mode
  // - 900px (shrink) / 930px (expand): Hide Design/Code/Preview labels
  // - 700px (shrink) / 730px (expand): Icon-only mode, hide provider selector entirely
  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || 0
      const hysteresis = 30

      // On first measurement, set states based on actual width without hysteresis
      if (isFirstMeasure.current) {
        isFirstMeasure.current = false
        setIsCompact(width < 1100)
        setIsMediumCompact(width < 900)
        setIsVeryCompact(width < 700)
        return
      }

      // Use hysteresis for subsequent changes to prevent flickering
      setIsCompact(prev => {
        if (prev && width > 1100 + hysteresis) return false
        if (!prev && width < 1100) return true
        return prev
      })

      setIsMediumCompact(prev => {
        if (prev && width > 900 + hysteresis) return false
        if (!prev && width < 900) return true
        return prev
      })

      setIsVeryCompact(prev => {
        if (prev && width > 700 + hysteresis) return false
        if (!prev && width < 700) return true
        return prev
      })
    })

    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // Sign out handler for Electron - use the auth context's signOut
  const electronAuth = useElectronAuth()
  const handleSignOut = () => {
    if (electronAuth?.signOut) {
      electronAuth.signOut()
    } else {
      // Fallback if context not available
      localStorage.removeItem('prompd_auth_tokens')
    }
    window.location.reload()
  }

  // Centralized LLM provider state and env file selection
  const { llmProvider, setLLMProvider, setLLMModel, initializeLLMProviders, selectedEnvFile, setSelectedEnvFile } = useUIStore(
    useShallow(state => ({
      llmProvider: state.llmProvider,
      setLLMProvider: state.setLLMProvider,
      setLLMModel: state.setLLMModel,
      initializeLLMProviders: state.initializeLLMProviders,
      selectedEnvFile: state.selectedEnvFile,
      setSelectedEnvFile: state.setSelectedEnvFile
    }))
  )

  // Initialize LLM providers when authenticated
  useEffect(() => {
    // Only initialize if not already initialized
    if (isLoaded && isAuthenticated && !llmProvider.isInitialized) {
      console.log('[EditorHeader] Initializing LLM providers...')
      initializeLLMProviders(getToken)
    }
  }, [isLoaded, isAuthenticated, llmProvider.isInitialized])


  return (
    <div
      ref={headerRef}
      className="header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isVeryCompact ? '6px' : isCompact ? '8px' : '12px',
        padding: isVeryCompact ? '8px 12px' : '8px 20px',
        minHeight: '38px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel)',
        overflow: 'hidden'
      }}>

      {/* LLM Provider/Model Selector - Show when user is logged in and providers are loaded */}
      {/* Hide entirely in very compact mode, use responsive layout at other breakpoints */}
      {!isVeryCompact && isAuthenticated && !llmProvider.isLoading && llmProvider.providersWithPricing && llmProvider.providersWithPricing.length > 0 && (
        <ProviderModelSelector
          providers={llmProvider.providersWithPricing}
          selectedProvider={llmProvider.provider}
          selectedModel={llmProvider.model}
          onProviderChange={(providerId: string) => {
            setLLMProvider(providerId)
          }}
          onModelChange={(modelId: string) => {
            setLLMModel(modelId)
          }}
          layout="compact"
          showPricing={!isCompact}
          forceDropdown={isCompact}
          shrinkModel={isMediumCompact}
        />
      )}
      {/* Loading indicator while providers are being fetched */}
      {!isVeryCompact && isAuthenticated && llmProvider.isLoading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}>
          <span style={{ animation: 'pulse 1.5s infinite' }}>Loading...</span>
        </div>
      )}
      {/* Fallback when providers failed to load */}
      {!isVeryCompact && isAuthenticated && !llmProvider.isLoading && (!llmProvider.providersWithPricing || llmProvider.providersWithPricing.length === 0) && (
        <button
          onClick={onOpenSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isCompact ? '0' : '6px',
            padding: isCompact ? '6px 8px' : '6px 12px',
            fontSize: '12px',
            color: 'var(--warning, #f59e0b)',
            background: 'var(--panel-2)',
            borderRadius: '6px',
            border: '1px solid var(--warning, #f59e0b)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0
          }}
          title="Configure LLM providers"
        >
          <Settings size={14} />
          {!isCompact && <span>Configure Providers</span>}
        </button>
      )}

      {/* Right spacer - pushes right side items to the right */}
      <div style={{ flex: 1, minWidth: '8px' }} />

      {/* Right side group - filename, view toggle, theme toggle, and user avatar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: isVeryCompact ? '6px' : isCompact ? '8px' : '12px',
        flexShrink: 0
      }}>
        {/* Execute Button - Icon only, positioned before Design/Code toggle */}
        {/* Height matches Design/Code toggle: padding 4px + 14px icon + 2px container padding + 2px border = 26px */}
        {/* Show for .prmd files */}
        {isPrompdFile && onExecutePrompd && (
          <button
            onClick={onExecutePrompd}
            data-hint-target="execute-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isVeryCompact ? '4px 8px' : '5px 10px',
              border: '1px solid #10b981',
              borderRadius: '6px',
              background: 'transparent',
              color: '#10b981',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#10b981'
              e.currentTarget.style.color = 'white'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#10b981'
            }}
            title="Execute prompt (F5)"
          >
            <Play size={14} />
          </button>
        )}
        {/* Show for .pdflow workflow files — play/continue + stop */}
        {isWorkflowFile && onExecuteWorkflow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {/* Play / Continue button */}
            <button
              onClick={() => {
                if (isPaused) {
                  window.dispatchEvent(new CustomEvent('resume-workflow'))
                } else if (!isExecuting) {
                  onExecuteWorkflow()
                }
              }}
              disabled={isExecuting && !isPaused}
              data-hint-target="execute-workflow-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isVeryCompact ? '4px 8px' : '5px 10px',
                border: `1px solid ${isExecuting && !isPaused ? 'var(--border)' : '#10b981'}`,
                borderRadius: '6px',
                background: 'transparent',
                color: isExecuting && !isPaused ? 'var(--text-secondary)' : '#10b981',
                cursor: isExecuting && !isPaused ? 'default' : 'pointer',
                transition: 'all 0.2s',
                opacity: isExecuting && !isPaused ? 0.5 : 1,
                flexShrink: 0,
              }}
              onMouseOver={(e) => {
                if (isExecuting && !isPaused) return
                e.currentTarget.style.background = '#10b981'
                e.currentTarget.style.color = 'white'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isExecuting && !isPaused ? 'var(--text-secondary)' : '#10b981'
              }}
              title={isPaused ? 'Continue execution' : isExecuting ? 'Running...' : 'Run workflow (F5)'}
            >
              <Play size={14} />
            </button>
            {/* Stop button — only visible while executing */}
            {isExecuting && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('stop-workflow'))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: isVeryCompact ? '4px 8px' : '5px 10px',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#ef4444'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#ef4444'
                }}
                title="Stop execution"
              >
                <Square size={14} />
              </button>
            )}
          </div>
        )}

        {/* Env File Selector - Show when workspace is open (visible on execution tabs too) */}
        {workspacePath && (
          <EnvFileSelector
            workspacePath={workspacePath}
            selectedEnvFile={selectedEnvFile}
            onEnvFileChange={setSelectedEnvFile}
            compact={isCompact}
            theme={theme}
          />
        )}

        {/* Design/Code View Toggle - Show for .prmd and prompd.json files */}
        {/* HIGH PRIORITY: Always show this toggle, only hide text labels when very compact */}
        {canSwitchViewMode && (
          <div
            data-hint-target="view-toggle"
            style={{
              display: 'flex',
              background: 'var(--panel-2)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border)',
              flexShrink: 0
            }}
          >
            <button
              onClick={() => canSwitchViewMode && onModeChange('design')}
              disabled={!canSwitchViewMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMediumCompact ? '0' : '4px',
                padding: isMediumCompact ? '4px 6px' : '4px 10px',
                fontSize: '11px',
                fontWeight: 500,
                border: 'none',
                borderRadius: '4px',
                background: mode === 'design' ? 'var(--accent)' : 'transparent',
                color: mode === 'design' ? 'white' : 'var(--text-secondary)',
                cursor: canSwitchViewMode ? 'pointer' : 'not-allowed',
                opacity: canSwitchViewMode ? 1 : 0.4,
                transition: 'all 0.2s'
              }}
              title={canSwitchViewMode ? 'Visual design view' : 'Design view only available for .prmd files'}
            >
              <Palette size={14} />
              {!isMediumCompact && <span>Design</span>}
            </button>
            <button
              onClick={() => onModeChange('code')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMediumCompact ? '0' : '4px',
                padding: isMediumCompact ? '4px 6px' : '4px 10px',
                fontSize: '11px',
                fontWeight: 500,
                border: 'none',
                borderRadius: '4px',
                background: mode === 'code' ? 'var(--accent)' : 'transparent',
                color: mode === 'code' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Code editor"
            >
              <Code2 size={14} />
              {!isMediumCompact && <span>Code</span>}
            </button>
            {/* Preview toggle - available in Code mode for .prmd files, visible but disabled in Design mode */}
            {isPrompdFile && onTogglePreview && (
              <PreviewToggle
                active={showPreview && mode === 'code'}
                onClick={onTogglePreview}
                disabled={mode !== 'code'}
                compact={isMediumCompact}
              />
            )}
            {/* Chat toggle - opens AI chat in split view, available in Code mode for .prmd files */}
            {isPrompdFile && onToggleChat && (
              <ChatToggle
                active={showChat && mode === 'code'}
                onClick={onToggleChat}
                disabled={mode !== 'code'}
                compact={isMediumCompact}
              />
            )}
          </div>
        )}

        {/* Help Button - Dropdown with syntax references */}
        <HelpDropdown theme={theme} isVeryCompact={isVeryCompact} />

        {/* Theme Toggle - Sleek Single Icon */}
        <button
          className="btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          style={{
            padding: isVeryCompact ? '4px' : '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: isVeryCompact ? '28px' : '32px',
            height: isVeryCompact ? '28px' : '32px',
            borderRadius: '6px',
            flexShrink: 0
          }}
        >
          {theme === 'dark' ? <Sun size={isVeryCompact ? 14 : 16} /> : <Moon size={isVeryCompact ? 14 : 16} />}
        </button>

        {/* User Profile Button - Different for Electron vs Web */}
        {isAuthenticated && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: isVeryCompact ? '28px' : '32px',
            flexShrink: 0
          }}>
            {isElectron ? (
              <ElectronUserButton email={email} theme={theme} onSignOut={handleSignOut} onOpenSettings={onOpenSettings} />
            ) : (
              <UserButton
                appearance={{
                  baseTheme: undefined,
                  variables: {
                    colorPrimary: '#3b82f6',
                    colorText: theme === 'dark' ? '#ffffff' : '#0f172a',
                    colorTextSecondary: theme === 'dark' ? '#94a3b8' : '#475569',
                    colorBackground: theme === 'dark' ? '#1e293b' : '#ffffff',
                    colorInputBackground: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : '#f8fafc',
                    colorInputText: theme === 'dark' ? '#ffffff' : '#0f172a',
                    borderRadius: '0.5rem',
                    fontFamily: 'Inter, system-ui, Arial'
                  },
                  elements: {
                    avatarBox: {
                      width: '32px',
                      height: '32px',
                      backgroundColor: "none"
                    },
                    userButtonPopoverCard: {
                      background: theme === 'dark' ? '#1e293b' : '#ffffff',
                      border: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      borderRadius: '1rem'
                    },
                    userButtonPopoverActionButton: {
                      color: theme === 'dark' ? '#ffffff' : '#0f172a',
                      '&:hover': {
                        background: theme === 'dark' ? '#111827' : '#f1f3f9'
                      }
                    },
                    userButtonPopoverActionButtonText: {
                      color: theme === 'dark' ? '#ffffff' : '#0f172a'
                    },
                    userButtonPopoverFooter: {
                      display: 'none'
                    },
                    card: {
                      background: theme === 'dark' ? '#1e293b' : '#ffffff',
                      border: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0'
                    },
                    modalContent: {
                      background: theme === 'dark' ? '#1e293b' : '#ffffff',
                      border: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0',
                      borderRadius: '1rem'
                    },
                    profileSection: {
                      background: 'transparent'
                    },
                    formFieldInput: {
                      background: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : '#f8fafc',
                      border: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0',
                      color: theme === 'dark' ? '#ffffff' : '#0f172a',
                      borderRadius: '0.5rem'
                    },
                    formButtonPrimary: {
                      background: '#3b82f6',
                      color: '#ffffff',
                      borderRadius: '0.5rem',
                      '&:hover': {
                        background: '#2563eb'
                      }
                    }
                  }
                }}
                showName={false}
                afterSignOutUrl="/"
              >
                <UserButton.MenuItems>
                  <UserButton.Action
                    label="Settings"
                    labelIcon={<Settings size={16} />}
                    onClick={onOpenSettings}
                  />
                </UserButton.MenuItems>
              </UserButton>
            )}
          </div>
        )}
      </div>{/* End right side group */}

    </div>
  )
}
