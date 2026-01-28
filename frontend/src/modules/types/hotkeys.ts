/**
 * Hotkey configuration types
 */

export interface HotkeyConfig {
  key: string              // e.g., 's', 'n', 'w'
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean          // Cmd on Mac
}

export interface HotkeyAction {
  id: string
  name: string
  description: string
  defaultConfig: HotkeyConfig
  config: HotkeyConfig
}

export const DEFAULT_HOTKEYS: Record<string, HotkeyAction> = {
  // File operations
  save: {
    id: 'save',
    name: 'Save File',
    description: 'Save the currently active file',
    defaultConfig: { key: 's', ctrl: true },
    config: { key: 's', ctrl: true }
  },
  newFile: {
    id: 'newFile',
    name: 'New File',
    description: 'Create a new file',
    defaultConfig: { key: 'n', ctrl: true },
    config: { key: 'n', ctrl: true }
  },
  closeTab: {
    id: 'closeTab',
    name: 'Close Tab',
    description: 'Close the currently active tab',
    defaultConfig: { key: 'w', ctrl: true },
    config: { key: 'w', ctrl: true }
  },
  find: {
    id: 'find',
    name: 'Find',
    description: 'Find text in current file',
    defaultConfig: { key: 'f', ctrl: true },
    config: { key: 'f', ctrl: true }
  },

  // View mode shortcuts
  wizardView: {
    id: 'wizardView',
    name: 'Wizard View',
    description: 'Switch to Wizard view',
    defaultConfig: { key: '1', ctrl: true },
    config: { key: '1', ctrl: true }
  },
  designView: {
    id: 'designView',
    name: 'Design View',
    description: 'Switch to Design view',
    defaultConfig: { key: '2', ctrl: true },
    config: { key: '2', ctrl: true }
  },
  codeView: {
    id: 'codeView',
    name: 'Code View',
    description: 'Switch to Code view',
    defaultConfig: { key: '3', ctrl: true },
    config: { key: '3', ctrl: true }
  },

  // Panel toggles
  toggleExplorer: {
    id: 'toggleExplorer',
    name: 'Toggle File Explorer',
    description: 'Show/hide the file explorer panel',
    defaultConfig: { key: 'b', ctrl: true },
    config: { key: 'b', ctrl: true }
  },
  toggleAiChat: {
    id: 'toggleAiChat',
    name: 'Toggle AI Chat',
    description: 'Show/hide the AI chat panel',
    defaultConfig: { key: 'a', ctrl: true, shift: true },
    config: { key: 'a', ctrl: true, shift: true }
  },
  toggleGitPanel: {
    id: 'toggleGitPanel',
    name: 'Toggle Git Panel',
    description: 'Show/hide the Git panel',
    defaultConfig: { key: 'g', ctrl: true, shift: true },
    config: { key: 'g', ctrl: true, shift: true }
  },
  toggleOutputPanel: {
    id: 'toggleOutputPanel',
    name: 'Toggle Output Panel',
    description: 'Show/hide the output panel',
    defaultConfig: { key: 'm', ctrl: true, shift: true },
    config: { key: 'm', ctrl: true, shift: true }
  },

  // Commands
  commandPalette: {
    id: 'commandPalette',
    name: 'Command Palette',
    description: 'Open the command palette',
    defaultConfig: { key: 'p', ctrl: true, shift: true },
    config: { key: 'p', ctrl: true, shift: true }
  },

  // Build/compile
  compile: {
    id: 'compile',
    name: 'Build Package',
    description: 'Build the package from workspace',
    defaultConfig: { key: 'b', ctrl: true, shift: true },
    config: { key: 'b', ctrl: true, shift: true }
  },

}

// Map of shifted keys to their unshifted equivalents
// When Shift is held, the browser reports the shifted character (e.g., '?' instead of '/')
const SHIFTED_KEY_MAP: Record<string, string> = {
  '?': '/',
  '|': '\\',
  '{': '[',
  '}': ']',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '_': '-',
  '+': '=',
  '~': '`',
  '!': '1',
  '@': '2',
  '#': '3',
  '$': '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
}

export function hotkeyMatches(event: KeyboardEvent, config: HotkeyConfig): boolean {
  // Get the effective key - if shift is pressed, map shifted chars back to base key
  let eventKey = event.key.toLowerCase()
  if (config.shift && SHIFTED_KEY_MAP[event.key]) {
    eventKey = SHIFTED_KEY_MAP[event.key]
  }

  return (
    eventKey === config.key.toLowerCase() &&
    (config.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey) &&
    (config.shift ? event.shiftKey : !event.shiftKey) &&
    (config.alt ? event.altKey : !event.altKey)
  )
}

export function formatHotkey(config: HotkeyConfig): string {
  const parts: string[] = []
  if (config.ctrl) parts.push('Ctrl')
  if (config.shift) parts.push('Shift')
  if (config.alt) parts.push('Alt')
  parts.push(config.key.toUpperCase())
  return parts.join('+')
}
