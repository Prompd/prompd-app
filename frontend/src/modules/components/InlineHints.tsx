import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Lightbulb, ChevronRight, ChevronLeft } from 'lucide-react'
import {
  isOnboardingComplete,
  areHintsDismissed,
  dismissHints,
  getSeenHints,
  markHintSeen as markHintSeenInService,
  resetOnboardingState
} from '../services/onboardingService'

/**
 * Hint definition structure
 */
export interface Hint {
  id: string
  title: string
  description: string
  targetSelector?: string // CSS selector for element to highlight
  category: 'editor' | 'sidebar' | 'execution' | 'packages' | 'general' | 'wizard'
  /** Event type that triggers auto-advance to next hint (e.g., 'click', 'input', 'focus') */
  autoAdvanceOn?: 'click' | 'input' | 'focus' | 'change'
}

/**
 * Default hints for the application with target selectors for highlighting
 */
export const DEFAULT_HINTS: Hint[] = [
  // Getting started hint - shows on WelcomeView before user enters wizard
  {
    id: 'getting-started',
    title: 'Create Your First Prompt',
    description: 'Click "+ New Prompd" to create your first AI prompt. You can also open an existing folder or browse the registry for templates.',
    targetSelector: '[data-hint-target="new-prompd-button"]',
    category: 'wizard',
    autoAdvanceOn: 'click'
  },
  // Wizard flow hints - dismissed together when first prompd is created
  {
    id: 'wizard-metadata',
    title: 'Name Your Prompt',
    description: 'Give your prompt a descriptive name. The ID will be auto-generated from the name you enter.',
    targetSelector: '[data-hint-target="wizard-metadata"]',
    category: 'wizard',
    autoAdvanceOn: 'input'
  },
  {
    id: 'wizard-packages',
    title: 'Select Packages',
    description: 'Search the registry to find packages and optionally select a base template to inherit from.',
    targetSelector: '[data-hint-target="wizard-packages"]',
    category: 'wizard',
    autoAdvanceOn: 'change'
  },
  {
    id: 'wizard-next',
    title: 'Continue to Customize',
    description: 'Click "Next: Customize Prompt" to finish creating your prompt and switch to Design View.',
    targetSelector: '[data-hint-target="wizard-next-button"]',
    category: 'wizard',
    autoAdvanceOn: 'click'
  },
  // Editor hints - shown after wizard flow is complete
  {
    id: 'design-view',
    title: 'Design View',
    description: 'Switch between Design and Code views using the toggle in the header. Design view lets you visually edit your prompt structure.',
    targetSelector: '[data-hint-target="view-toggle"]',
    category: 'editor'
  },
  {
    id: 'parameters',
    title: 'Using Parameters',
    description: 'Add parameters to make your prompts reusable. Use {{parameterName}} syntax in your prompt text to reference them.',
    targetSelector: '[data-hint-target="parameters-section"]',
    category: 'editor'
  },
  {
    id: 'execute-prompt',
    title: 'Execute Prompts',
    description: 'Click the Play button or press F5 to execute your prompt with the selected AI provider.',
    targetSelector: '[data-hint-target="execute-button"]',
    category: 'execution'
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'Press Ctrl+Shift+P to open the Command Palette for quick access to all actions.',
    category: 'general'
  },
  {
    id: 'package-inheritance',
    title: 'Package Inheritance',
    description: 'Use the "inherits" field in your prompt to extend templates from the registry or local files.',
    targetSelector: '[data-hint-target="inherits-section"]',
    category: 'packages'
  },
  {
    id: 'ai-assistant',
    title: 'AI Assistant',
    description: 'Click the AI icon in the sidebar to chat with the assistant. It can help you create, edit, and improve your prompts.',
    targetSelector: '[data-hint-target="ai-assistant"]',
    category: 'sidebar'
  },
  {
    id: 'file-explorer',
    title: 'File Explorer',
    description: 'Open a folder to work with multiple .prmd files. Right-click files for more options.',
    targetSelector: '[data-hint-target="file-explorer"]',
    category: 'sidebar'
  },
  {
    id: 'execution-history',
    title: 'Execution History',
    description: 'Access your past executions from the History panel in the sidebar to review previous results.',
    targetSelector: '[data-hint-target="execution-history"]',
    category: 'sidebar'
  }
]

interface InlineHintsProps {
  theme: 'light' | 'dark'
  /** Filter hints by category (only show hints matching this category) */
  category?: Hint['category']
  /** Exclude hints matching this category (show all except this category) */
  excludeCategory?: Hint['category']
  /** Custom hints to show instead of defaults */
  hints?: Hint[]
  /** Whether to show as a floating panel */
  floating?: boolean
  /** Callback when all hints are dismissed */
  onAllDismissed?: () => void
}

/**
 * Reset hints (for testing or showing them again)
 */
export function resetHints(): void {
  resetOnboardingState()
}

/**
 * Mark all wizard-related hints as seen (called when user completes creating their first prompd)
 * All wizard-category hints including 'getting-started'
 */
export function dismissWizardHints(): void {
  // Dismiss all wizard category hints
  const wizardHintIds = DEFAULT_HINTS
    .filter(hint => hint.category === 'wizard')
    .map(hint => hint.id)

  wizardHintIds.forEach(id => markHintSeenInService(id))
}

/**
 * HighlightOverlay - Renders a spotlight effect with the target element highlighted
 * Features:
 * - Dimmed overlay (spotlight effect) to focus attention
 * - Gentle bounce animation on the target element
 * - Click anywhere on hint to flash/intensify the highlight
 */
interface HighlightOverlayProps {
  targetSelector?: string
  theme: 'light' | 'dark'
  isFlashing?: boolean
}

function HighlightOverlay({ targetSelector, theme, isFlashing }: HighlightOverlayProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const targetElementRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!targetSelector) {
      setTargetRect(null)
      setIsVisible(false)
      return
    }

    const updatePosition = () => {
      const element = document.querySelector(targetSelector)
      if (element) {
        const rect = element.getBoundingClientRect()
        setTargetRect(rect)
        setIsVisible(true)
        targetElementRef.current = element

        // Add bounce animation class to target element
        element.classList.add('hint-target-bounce')
      } else {
        setTargetRect(null)
        setIsVisible(false)
        targetElementRef.current = null
      }
    }

    // Initial position
    updatePosition()

    // Update on scroll/resize
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    // Use MutationObserver to detect DOM changes
    const observer = new MutationObserver(updatePosition)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      observer.disconnect()
      // Clean up animation class
      if (targetElementRef.current) {
        targetElementRef.current.classList.remove('hint-target-bounce')
      }
    }
  }, [targetSelector])

  if (!isVisible || !targetRect) {
    return null
  }

  const accentColor = '#8b5cf6'
  const padding = 8
  const spotlightPadding = 12
  const overlayColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.35)'

  // Calculate spotlight cutout bounds
  const cutoutTop = targetRect.top - spotlightPadding
  const cutoutLeft = targetRect.left - spotlightPadding
  const cutoutRight = targetRect.right + spotlightPadding
  const cutoutBottom = targetRect.bottom + spotlightPadding

  return createPortal(
    <>
      {/* Inject keyframes animations */}
      <style>
        {`
          @keyframes hint-pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.8;
            }
          }
          @keyframes hint-flash {
            0% {
              box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.8), 0 0 40px rgba(139, 92, 246, 0.7);
              border-color: #a78bfa;
            }
            100% {
              box-shadow: 0 0 0 4px ${theme === 'dark' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.3)'}, 0 0 20px ${theme === 'dark' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.3)'};
              border-color: ${accentColor};
            }
          }
          @keyframes hint-target-bounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-2px);
            }
          }
          .hint-target-bounce {
            animation: hint-target-bounce 2s ease-in-out infinite;
          }
        `}
      </style>

      {/* Dimmed overlay using 4 divs instead of clip-path to avoid rendering artifacts */}
      {/* Top overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(0, cutoutTop),
          background: overlayColor,
          pointerEvents: 'none',
          zIndex: 8998
        }}
      />
      {/* Bottom overlay */}
      <div
        style={{
          position: 'fixed',
          top: cutoutBottom,
          left: 0,
          right: 0,
          bottom: 0,
          background: overlayColor,
          pointerEvents: 'none',
          zIndex: 8998
        }}
      />
      {/* Left overlay */}
      <div
        style={{
          position: 'fixed',
          top: cutoutTop,
          left: 0,
          width: Math.max(0, cutoutLeft),
          height: cutoutBottom - cutoutTop,
          background: overlayColor,
          pointerEvents: 'none',
          zIndex: 8998
        }}
      />
      {/* Right overlay */}
      <div
        style={{
          position: 'fixed',
          top: cutoutTop,
          left: cutoutRight,
          right: 0,
          height: cutoutBottom - cutoutTop,
          background: overlayColor,
          pointerEvents: 'none',
          zIndex: 8998
        }}
      />

      {/* Highlight border around target */}
      <div
        style={{
          position: 'fixed',
          top: targetRect.top - padding,
          left: targetRect.left - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
          pointerEvents: 'none',
          zIndex: 8999,
          borderRadius: '10px',
          border: `3px solid ${accentColor}`,
          boxShadow: `0 0 0 4px ${theme === 'dark' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.3)'}, 0 0 20px ${theme === 'dark' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.3)'}`,
          animation: isFlashing ? 'hint-flash 0.4s ease-out' : 'hint-pulse 3s ease-in-out infinite',
          transition: 'top 0.2s ease-out, left 0.2s ease-out, width 0.2s ease-out, height 0.2s ease-out'
        }}
      />
    </>,
    document.body
  )
}

/**
 * InlineHint - A single hint tooltip/banner
 */
interface InlineHintProps {
  hint: Hint
  theme: 'light' | 'dark'
  onDismiss: () => void
  onNext?: () => void
  onPrev?: () => void
  showNavigation?: boolean
  currentIndex?: number
  totalCount?: number
}

function InlineHint({
  hint,
  theme,
  onDismiss,
  onNext,
  onPrev,
  showNavigation,
  currentIndex = 0,
  totalCount = 1
}: InlineHintProps) {
  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    primary: '#3b82f6',
    accent: '#8b5cf6',
    accentBg: theme === 'dark' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)',
    accentBorder: theme === 'dark' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.3)'
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        background: colors.accentBg,
        border: `1px solid ${colors.accentBorder}`,
        borderRadius: '10px',
        position: 'relative'
      }}
    >
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: colors.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <Lightbulb size={16} color="white" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 600,
          color: colors.text,
          marginBottom: '4px'
        }}>
          {hint.title}
        </div>
        <div style={{
          fontSize: '13px',
          color: colors.textSecondary,
          lineHeight: 1.5
        }}>
          {hint.description}
        </div>

        {/* Navigation */}
        {showNavigation && totalCount > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '12px'
          }}>
            <button
              onClick={onPrev}
              disabled={currentIndex === 0}
              style={{
                padding: '6px',
                background: colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                opacity: currentIndex === 0 ? 0.5 : 1,
                color: colors.textSecondary
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '12px', color: colors.textSecondary }}>
              {currentIndex + 1} of {totalCount}
            </span>

            {currentIndex === totalCount - 1 ? (
              <button
                onClick={onDismiss}
                style={{
                  padding: '6px 12px',
                  background: colors.accent,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 500
                }}
              >
                Got it!
              </button>
            ) : (
              <button
                onClick={onNext}
                style={{
                  padding: '6px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: colors.textSecondary
                }}
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onDismiss}
        title="Dismiss"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          color: colors.textSecondary,
          transition: 'all 0.15s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = colors.bgSecondary
          e.currentTarget.style.color = colors.text
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'none'
          e.currentTarget.style.color = colors.textSecondary
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

/**
 * InlineHints - Progressive hint system for the application
 * Shows contextual tips after onboarding is complete
 * Highlights target elements when a hint has a targetSelector
 */
export function InlineHints({
  theme,
  category,
  excludeCategory,
  hints: customHints,
  floating = false,
  onAllDismissed
}: InlineHintsProps) {
  const [currentHintIndex, setCurrentHintIndex] = useState(0)
  const [visibleHints, setVisibleHints] = useState<Hint[]>([])
  const [isDismissed, setIsDismissed] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)

  // Flash the highlight when user clicks the hint panel
  const handleFlash = useCallback(() => {
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 400)
  }, [])

  // Initialize visible hints
  useEffect(() => {
    // Don't show hints if they've been dismissed or onboarding isn't complete
    if (areHintsDismissed() || !isOnboardingComplete()) {
      setIsDismissed(true)
      return
    }

    const allHints = customHints || DEFAULT_HINTS
    const seenHintsArray = getSeenHints()

    // Filter by category if specified, exclude category if specified, and exclude seen hints
    const filteredHints = allHints.filter(hint => {
      const matchesCategory = !category || hint.category === category
      const notExcluded = !excludeCategory || hint.category !== excludeCategory
      const notSeen = !seenHintsArray.includes(hint.id)
      return matchesCategory && notExcluded && notSeen
    })

    setVisibleHints(filteredHints)

    if (filteredHints.length === 0) {
      setIsDismissed(true)
      onAllDismissed?.()
    }
  }, [category, excludeCategory, customHints, onAllDismissed])

  const handleDismiss = useCallback(() => {
    const currentHint = visibleHints[currentHintIndex]
    if (currentHint) {
      markHintSeenInService(currentHint.id)
    }

    if (currentHintIndex < visibleHints.length - 1) {
      // Move to next hint
      setCurrentHintIndex(prev => prev + 1)
    } else {
      // All hints seen
      setIsDismissed(true)
      onAllDismissed?.()
    }
  }, [currentHintIndex, visibleHints, onAllDismissed])

  const handleDismissAll = useCallback(() => {
    dismissHints()
    setIsDismissed(true)
    onAllDismissed?.()
  }, [onAllDismissed])

  const handleNext = useCallback(() => {
    if (currentHintIndex < visibleHints.length - 1) {
      setCurrentHintIndex(prev => prev + 1)
    }
  }, [currentHintIndex, visibleHints.length])

  const handlePrev = useCallback(() => {
    if (currentHintIndex > 0) {
      setCurrentHintIndex(prev => prev - 1)
    }
  }, [currentHintIndex])

  // Auto-advance when user interacts with target element
  useEffect(() => {
    const currentHint = visibleHints[currentHintIndex]
    if (!currentHint?.targetSelector || !currentHint.autoAdvanceOn) return

    const targetElement = document.querySelector(currentHint.targetSelector)
    if (!targetElement) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleAutoAdvance = () => {
      // Small delay to let the user see the interaction
      setTimeout(() => {
        handleDismiss()
      }, 300)
    }

    // For 'input' events, use debounce - wait until user stops typing for 2.5 seconds
    if (currentHint.autoAdvanceOn === 'input') {
      const inputs = targetElement.querySelectorAll('input, textarea')

      const handleInputWithDebounce = () => {
        // Clear any existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }
        // Set new timer - advance after 2.5 seconds of no typing
        debounceTimer = setTimeout(() => {
          handleDismiss()
        }, 2500)
      }

      inputs.forEach(input => {
        input.addEventListener('input', handleInputWithDebounce)
      })
      return () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }
        inputs.forEach(input => {
          input.removeEventListener('input', handleInputWithDebounce)
        })
      }
    }

    // For 'change' events, listen on select elements and custom dropdowns within the target
    if (currentHint.autoAdvanceOn === 'change') {
      const selects = targetElement.querySelectorAll('select')
      // Also listen for clicks on dropdown options (custom dropdowns)
      const dropdownOptions = targetElement.querySelectorAll('[class*="dropdown-option"], [class*="search-result"]')

      selects.forEach(select => {
        select.addEventListener('change', handleAutoAdvance, { once: true })
      })
      dropdownOptions.forEach(option => {
        option.addEventListener('click', handleAutoAdvance, { once: true })
      })
      return () => {
        selects.forEach(select => {
          select.removeEventListener('change', handleAutoAdvance)
        })
        dropdownOptions.forEach(option => {
          option.removeEventListener('click', handleAutoAdvance)
        })
      }
    }

    // For click events on the target or its children
    targetElement.addEventListener(currentHint.autoAdvanceOn, handleAutoAdvance, { once: true })
    return () => {
      targetElement.removeEventListener(currentHint.autoAdvanceOn!, handleAutoAdvance)
    }
  }, [currentHintIndex, visibleHints, handleDismiss])

  // Don't render if dismissed or no hints
  if (isDismissed || visibleHints.length === 0) {
    return null
  }

  const currentHint = visibleHints[currentHintIndex]
  if (!currentHint) return null

  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b'
  }

  // Check if target element is near the bottom of the screen
  const getHintPosition = () => {
    if (!currentHint.targetSelector) return { bottom: '20px', top: 'auto' }
    const targetElement = document.querySelector(currentHint.targetSelector)
    if (!targetElement) return { bottom: '20px', top: 'auto' }

    const rect = targetElement.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const hintHeight = 200 // Approximate hint panel height

    // If target is in the bottom 250px of the viewport, position hint at top
    if (rect.bottom > viewportHeight - 250) {
      return { bottom: 'auto', top: '20px' }
    }
    return { bottom: '20px', top: 'auto' }
  }

  // Floating panel variant
  if (floating) {
    const hintPosition = getHintPosition()

    return (
      <>
        {/* Highlight overlay for target element */}
        <HighlightOverlay
          targetSelector={currentHint.targetSelector}
          theme={theme}
          isFlashing={isFlashing}
        />

        <div
          onClick={handleFlash}
          style={{
            position: 'fixed',
            bottom: hintPosition.bottom,
            top: hintPosition.top,
            right: '20px',
            width: '360px',
            maxWidth: 'calc(100vw - 40px)',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            boxShadow: theme === 'dark' ? '0 10px 40px rgba(0, 0, 0, 0.5)' : '0 10px 40px rgba(0, 0, 0, 0.15)',
            zIndex: 9000,
            overflow: 'hidden',
            cursor: 'pointer'
          }}
          title="Click to highlight the target element"
        >
          <InlineHint
            hint={currentHint}
            theme={theme}
            onDismiss={handleDismiss}
            onNext={handleNext}
            onPrev={handlePrev}
            showNavigation
            currentIndex={currentHintIndex}
            totalCount={visibleHints.length}
          />

          {/* Dismiss all link */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: `1px solid ${colors.border}`,
              background: colors.bgSecondary,
              display: 'flex',
              justifyContent: 'flex-end'
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDismissAll()
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: colors.textSecondary,
                textDecoration: 'underline'
              }}
            >
              Don't show tips
            </button>
          </div>
        </div>
      </>
    )
  }

  // Inline variant (for embedding in specific areas)
  return (
    <>
      {/* Highlight overlay for target element */}
      <HighlightOverlay
        targetSelector={currentHint.targetSelector}
        theme={theme}
        isFlashing={isFlashing}
      />

      <div style={{ marginBottom: '16px' }}>
        <InlineHint
          hint={currentHint}
          theme={theme}
          onDismiss={handleDismiss}
          onNext={handleNext}
          onPrev={handlePrev}
          showNavigation={visibleHints.length > 1}
          currentIndex={currentHintIndex}
          totalCount={visibleHints.length}
        />
      </div>
    </>
  )
}

/**
 * useHints - Hook for accessing hint state and actions
 */
export function useHints() {
  const [seenHints, setSeenHints] = useState<Set<string>>(() => new Set(getSeenHints()))
  const [dismissed, setDismissed] = useState(() => areHintsDismissed())

  const markSeen = useCallback((hintId: string) => {
    markHintSeenInService(hintId)
    setSeenHints(prev => new Set([...prev, hintId]))
  }, [])

  const dismissAll = useCallback(() => {
    dismissHints()
    setDismissed(true)
  }, [])

  const reset = useCallback(() => {
    resetHints()
    setSeenHints(new Set())
    setDismissed(false)
  }, [])

  const isHintSeen = useCallback((hintId: string) => {
    return seenHints.has(hintId)
  }, [seenHints])

  return {
    seenHints,
    dismissed,
    markSeen,
    dismissAll,
    reset,
    isHintSeen
  }
}

export default InlineHints
