/**
 * Centralized Hotkey Manager
 *
 * Provides a single source of truth for all keyboard shortcuts.
 * Notifies consumers when hotkeys change so they can re-register.
 *
 * Architecture:
 * - Stores hotkey definitions with default and current configs
 * - Provides subscribe mechanism for change notifications
 * - Syncs with localStorage for persistence
 * - Can notify Electron to update menu accelerators
 */

import { HotkeyAction, HotkeyConfig, DEFAULT_HOTKEYS, hotkeyMatches, formatHotkey } from '../types/hotkeys'

// Monaco key codes and modifiers
// These are used to convert our HotkeyConfig to Monaco keybindings
export interface MonacoKeybinding {
  keyCode: number
  modifiers: number
}

// Re-export utility functions
export { hotkeyMatches, formatHotkey }

// Listener callback type
type HotkeyChangeListener = (hotkeys: Record<string, HotkeyAction>) => void

const STORAGE_KEY = 'prompd.hotkeys'

class HotkeyManagerClass {
  private hotkeys: Record<string, HotkeyAction>
  private listeners: Set<HotkeyChangeListener> = new Set()
  private handlers: Record<string, () => void> = {}

  constructor() {
    // Load from localStorage, merge with defaults
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Start with defaults
        this.hotkeys = { ...DEFAULT_HOTKEYS }
        // For each stored hotkey, only keep user's config if they explicitly customized it
        // (i.e., if their config differs from their stored defaultConfig)
        for (const [actionId, storedAction] of Object.entries(parsed) as [string, HotkeyAction][]) {
          if (this.hotkeys[actionId]) {
            // Check if user has a custom config (differs from their stored defaultConfig)
            const hasCustomConfig = storedAction.config && storedAction.defaultConfig &&
              JSON.stringify(storedAction.config) !== JSON.stringify(storedAction.defaultConfig)
            if (hasCustomConfig) {
              // User customized this hotkey - keep their config
              this.hotkeys[actionId] = {
                ...this.hotkeys[actionId],
                config: storedAction.config
              }
            }
            // Otherwise, use the new defaults from DEFAULT_HOTKEYS
          }
        }
      } catch {
        this.hotkeys = { ...DEFAULT_HOTKEYS }
      }
    } else {
      this.hotkeys = { ...DEFAULT_HOTKEYS }
    }

    // Set up global keyboard listener (for non-Monaco contexts)
    this.setupGlobalListener()
  }

  /**
   * Get all hotkeys
   */
  getHotkeys(): Record<string, HotkeyAction> {
    return { ...this.hotkeys }
  }

  /**
   * Get a single hotkey config
   */
  getHotkey(actionId: string): HotkeyConfig | undefined {
    return this.hotkeys[actionId]?.config
  }

  /**
   * Update a hotkey's configuration
   */
  updateHotkey(actionId: string, config: HotkeyConfig): void {
    if (!this.hotkeys[actionId]) return

    this.hotkeys[actionId] = {
      ...this.hotkeys[actionId],
      config
    }

    this.persist()
    this.notifyListeners()
    this.notifyElectron()
  }

  /**
   * Reset a single hotkey to default
   */
  resetHotkey(actionId: string): void {
    if (!this.hotkeys[actionId]) return

    this.hotkeys[actionId] = {
      ...this.hotkeys[actionId],
      config: this.hotkeys[actionId].defaultConfig
    }

    this.persist()
    this.notifyListeners()
    this.notifyElectron()
  }

  /**
   * Reset all hotkeys to defaults
   */
  resetAllHotkeys(): void {
    this.hotkeys = { ...DEFAULT_HOTKEYS }
    this.persist()
    this.notifyListeners()
    this.notifyElectron()
  }

  /**
   * Subscribe to hotkey changes
   * Returns unsubscribe function
   */
  subscribe(listener: HotkeyChangeListener): () => void {
    this.listeners.add(listener)
    // Immediately call with current state
    listener(this.getHotkeys())
    return () => this.listeners.delete(listener)
  }

  /**
   * Register a handler for an action
   * This is called when the hotkey is pressed
   */
  registerHandler(actionId: string, handler: () => void): void {
    this.handlers[actionId] = handler
  }

  /**
   * Unregister a handler
   */
  unregisterHandler(actionId: string): void {
    delete this.handlers[actionId]
  }

  /**
   * Convert a HotkeyConfig to Monaco keybinding
   * Returns the combined keycode with modifiers for editor.addCommand()
   */
  toMonacoKeybinding(config: HotkeyConfig, monaco: typeof import('monaco-editor')): number {
    // Map key strings to Monaco KeyCode
    const keyCodeMap: Record<string, number> = {
      'a': monaco.KeyCode.KeyA,
      'b': monaco.KeyCode.KeyB,
      'c': monaco.KeyCode.KeyC,
      'd': monaco.KeyCode.KeyD,
      'e': monaco.KeyCode.KeyE,
      'f': monaco.KeyCode.KeyF,
      'g': monaco.KeyCode.KeyG,
      'h': monaco.KeyCode.KeyH,
      'i': monaco.KeyCode.KeyI,
      'j': monaco.KeyCode.KeyJ,
      'k': monaco.KeyCode.KeyK,
      'l': monaco.KeyCode.KeyL,
      'm': monaco.KeyCode.KeyM,
      'n': monaco.KeyCode.KeyN,
      'o': monaco.KeyCode.KeyO,
      'p': monaco.KeyCode.KeyP,
      'q': monaco.KeyCode.KeyQ,
      'r': monaco.KeyCode.KeyR,
      's': monaco.KeyCode.KeyS,
      't': monaco.KeyCode.KeyT,
      'u': monaco.KeyCode.KeyU,
      'v': monaco.KeyCode.KeyV,
      'w': monaco.KeyCode.KeyW,
      'x': monaco.KeyCode.KeyX,
      'y': monaco.KeyCode.KeyY,
      'z': monaco.KeyCode.KeyZ,
      '0': monaco.KeyCode.Digit0,
      '1': monaco.KeyCode.Digit1,
      '2': monaco.KeyCode.Digit2,
      '3': monaco.KeyCode.Digit3,
      '4': monaco.KeyCode.Digit4,
      '5': monaco.KeyCode.Digit5,
      '6': monaco.KeyCode.Digit6,
      '7': monaco.KeyCode.Digit7,
      '8': monaco.KeyCode.Digit8,
      '9': monaco.KeyCode.Digit9,
      'f1': monaco.KeyCode.F1,
      'f2': monaco.KeyCode.F2,
      'f3': monaco.KeyCode.F3,
      'f4': monaco.KeyCode.F4,
      'f5': monaco.KeyCode.F5,
      'f6': monaco.KeyCode.F6,
      'f7': monaco.KeyCode.F7,
      'f8': monaco.KeyCode.F8,
      'f9': monaco.KeyCode.F9,
      'f10': monaco.KeyCode.F10,
      'f11': monaco.KeyCode.F11,
      'f12': monaco.KeyCode.F12,
      'enter': monaco.KeyCode.Enter,
      'escape': monaco.KeyCode.Escape,
      'backspace': monaco.KeyCode.Backspace,
      'tab': monaco.KeyCode.Tab,
      'space': monaco.KeyCode.Space,
      'delete': monaco.KeyCode.Delete,
      'home': monaco.KeyCode.Home,
      'end': monaco.KeyCode.End,
      '/': monaco.KeyCode.Slash,
      '?': monaco.KeyCode.Slash,  // Shift+/ produces '?' - but maps to same physical key
      '\\': monaco.KeyCode.Backslash,
      '|': monaco.KeyCode.Backslash,  // Shift+\ produces '|'
      '[': monaco.KeyCode.BracketLeft,
      '{': monaco.KeyCode.BracketLeft,  // Shift+[ produces '{'
      ']': monaco.KeyCode.BracketRight,
      '}': monaco.KeyCode.BracketRight,  // Shift+] produces '}'
      ';': monaco.KeyCode.Semicolon,
      ':': monaco.KeyCode.Semicolon,  // Shift+; produces ':'
      "'": monaco.KeyCode.Quote,
      '"': monaco.KeyCode.Quote,  // Shift+' produces '"'
      ',': monaco.KeyCode.Comma,
      '<': monaco.KeyCode.Comma,  // Shift+, produces '<'
      '.': monaco.KeyCode.Period,
      '>': monaco.KeyCode.Period,  // Shift+. produces '>'
      '-': monaco.KeyCode.Minus,
      '_': monaco.KeyCode.Minus,  // Shift+- produces '_'
      '=': monaco.KeyCode.Equal,
      '+': monaco.KeyCode.Equal,  // Shift+= produces '+'
      '`': monaco.KeyCode.Backquote,
      '~': monaco.KeyCode.Backquote,  // Shift+` produces '~'
      'pageup': monaco.KeyCode.PageUp,
      'pagedown': monaco.KeyCode.PageDown,
      'arrowup': monaco.KeyCode.UpArrow,
      'arrowdown': monaco.KeyCode.DownArrow,
      'arrowleft': monaco.KeyCode.LeftArrow,
      'arrowright': monaco.KeyCode.RightArrow,
    }

    const key = config.key.toLowerCase()
    const keyCode = keyCodeMap[key]
    if (!keyCode) {
      console.warn(`[HotkeyManager] Unknown key: ${config.key}`)
      return 0
    }

    // Build modifier mask
    let modifiers = 0
    if (config.ctrl) modifiers |= monaco.KeyMod.CtrlCmd
    if (config.shift) modifiers |= monaco.KeyMod.Shift
    if (config.alt) modifiers |= monaco.KeyMod.Alt

    return modifiers | keyCode
  }

  /**
   * Convert a HotkeyConfig to Electron accelerator string
   * e.g., "CmdOrCtrl+Shift+B"
   */
  toElectronAccelerator(config: HotkeyConfig): string {
    const parts: string[] = []
    if (config.ctrl) parts.push('CmdOrCtrl')
    if (config.shift) parts.push('Shift')
    if (config.alt) parts.push('Alt')

    // Electron uses uppercase single letters, special keys as-is
    const key = config.key.length === 1
      ? config.key.toUpperCase()
      : config.key.charAt(0).toUpperCase() + config.key.slice(1)
    parts.push(key)

    return parts.join('+')
  }

  /**
   * Get all hotkeys as a map of actionId -> MonacoKeybinding
   * Used by Monaco editor to register keybindings
   */
  getMonacoBindings(monaco: typeof import('monaco-editor')): Record<string, number> {
    const bindings: Record<string, number> = {}
    for (const [actionId, action] of Object.entries(this.hotkeys)) {
      bindings[actionId] = this.toMonacoKeybinding(action.config, monaco)
    }
    return bindings
  }

  // Private methods

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.hotkeys))
  }

  private notifyListeners(): void {
    const currentHotkeys = this.getHotkeys()
    for (const listener of this.listeners) {
      try {
        listener(currentHotkeys)
      } catch (err) {
        console.error('[HotkeyManager] Listener error:', err)
      }
    }
  }

  /**
   * Notify Electron to update menu accelerators
   */
  private notifyElectron(): void {
    const electronAPI = (window as any).electronAPI
    if (electronAPI?.updateHotkeys) {
      // Convert all hotkeys to electron accelerator format
      const accelerators: Record<string, string> = {}
      for (const [actionId, action] of Object.entries(this.hotkeys)) {
        accelerators[actionId] = this.toElectronAccelerator(action.config)
      }
      electronAPI.updateHotkeys(accelerators)
    }
  }

  /**
   * Set up global keyboard listener for non-Monaco contexts
   * NOTE: In Electron, menu accelerators handle most hotkeys directly.
   * This listener is primarily for web-only mode or actions without menu accelerators.
   */
  private setupGlobalListener(): void {
    // In Electron, menu accelerators handle hotkeys - don't double-dispatch
    const isElectron = !!(window as any).electronAPI?.isElectron
    if (isElectron) {
      console.log('[HotkeyManager] Electron detected - global listener disabled (menu accelerators handle hotkeys)')
      return
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Skip if user is typing in an input field or Monaco editor
      const target = e.target as HTMLElement

      // Check for Monaco editor - it uses a textarea with specific classes
      const isMonaco = target.closest('.monaco-editor') ||
        target.classList.contains('monaco-mouse-cursor-text') ||
        target.classList.contains('inputarea')

      const isTyping = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        isMonaco

      if (isTyping) return

      // Find matching hotkey
      for (const [actionId, action] of Object.entries(this.hotkeys)) {
        if (hotkeyMatches(e, action.config)) {
          e.preventDefault()
          e.stopPropagation()

          // Call registered handler
          const handler = this.handlers[actionId]
          if (handler) {
            handler()
          }

          // Also dispatch custom event for components listening via events
          this.dispatchHotkeyEvent(actionId)
          break
        }
      }
    })
  }

  /**
   * Dispatch a custom event for the hotkey action
   * This allows components to listen without registering handlers
   */
  private dispatchHotkeyEvent(actionId: string): void {
    // Map action IDs to custom event names
    // Actions that should work globally (outside Monaco editor)
    // Note: 'find' and 'toggleBlockComment' are editor-only actions handled by Monaco
    const eventMap: Record<string, { event: string; detail?: unknown }> = {
      'save': { event: 'prompd-save' },
      'newFile': { event: 'prompd-new-file' },
      'closeTab': { event: 'prompd-close-tab' },
      'wizardView': { event: 'set-view-mode', detail: 'wizard' },
      'designView': { event: 'set-view-mode', detail: 'design' },
      'codeView': { event: 'set-view-mode', detail: 'code' },
      'commandPalette': { event: 'toggle-command-palette' },
      'compile': { event: 'prompd-build-package' },
      'toggleExplorer': { event: 'toggle-sidebar', detail: 'explorer' },
      'toggleAiChat': { event: 'toggle-sidebar', detail: 'ai' },
      'toggleGitPanel': { event: 'toggle-sidebar', detail: 'git' },
      'toggleOutputPanel': { event: 'toggle-output-panel' },
    }

    const mapping = eventMap[actionId]
    if (mapping) {
      if (mapping.detail !== undefined) {
        window.dispatchEvent(new CustomEvent(mapping.event, { detail: mapping.detail }))
      } else {
        window.dispatchEvent(new CustomEvent(mapping.event))
      }
    }
  }
}

// Singleton instance
export const hotkeyManager = new HotkeyManagerClass()
