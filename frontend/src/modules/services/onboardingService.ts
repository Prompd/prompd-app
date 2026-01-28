/**
 * Onboarding Service - Centralized state management for onboarding/wizard/hints
 *
 * Consolidates all onboarding-related localStorage state into a single key.
 */

const STORAGE_KEY = 'prompd_onboarding'

export interface OnboardingState {
  /** User has interacted with the wizard (completed or closed) */
  onboardingComplete: boolean
  /** User checked "Don't show again" on the wizard */
  wizardDismissed: boolean
  /** User clicked "Don't show tips" on InlineHints */
  hintsDismissed: boolean
  /** IDs of hints the user has seen/dismissed */
  seenHints: string[]
}

const DEFAULT_STATE: OnboardingState = {
  onboardingComplete: false,
  wizardDismissed: false,
  hintsDismissed: false,
  seenHints: []
}

/**
 * Get the current onboarding state from localStorage.
 */
export function getOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_STATE, ...JSON.parse(raw) }
    }
  } catch {
    // Invalid JSON, return default
  }
  return { ...DEFAULT_STATE }
}

/**
 * Update the onboarding state in localStorage.
 * Merges partial updates with existing state.
 */
export function updateOnboardingState(updates: Partial<OnboardingState>): OnboardingState {
  const current = getOnboardingState()
  const updated = { ...current, ...updates }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

/**
 * Reset all onboarding state (for testing or re-showing wizard/hints)
 */
export function resetOnboardingState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// Convenience getters
export function isOnboardingComplete(): boolean {
  return getOnboardingState().onboardingComplete
}

export function isWizardDismissed(): boolean {
  return getOnboardingState().wizardDismissed
}

export function areHintsDismissed(): boolean {
  return getOnboardingState().hintsDismissed
}

export function getSeenHints(): string[] {
  return getOnboardingState().seenHints
}

// Convenience setters
export function markOnboardingComplete(): void {
  updateOnboardingState({ onboardingComplete: true })
}

export function dismissWizard(): void {
  updateOnboardingState({ wizardDismissed: true })
}

export function dismissHints(): void {
  updateOnboardingState({ hintsDismissed: true })
}

export function markHintSeen(hintId: string): void {
  const current = getOnboardingState()
  if (!current.seenHints.includes(hintId)) {
    updateOnboardingState({ seenHints: [...current.seenHints, hintId] })
  }
}

export function isHintSeen(hintId: string): boolean {
  return getOnboardingState().seenHints.includes(hintId)
}
