/**
 * Vitest setup file
 * Provides minimal browser-like globals for store and service tests.
 */

// Stub window.electronAPI so services that check for Electron fall back gracefully
Object.defineProperty(window, 'electronAPI', {
  value: undefined,
  writable: true,
})

// Stub localStorage for stores that use zustand persist middleware
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number): string | null => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})
