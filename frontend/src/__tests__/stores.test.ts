/**
 * Smoke tests for Zustand stores
 * Verifies that each store initializes with expected default state
 * and that basic actions execute without throwing.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { useWorkflowStore } from '../stores/workflowStore'

describe('editorStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useEditorStore.setState({
      text: '',
      tabs: [],
      activeTabId: null,
      metadata: { id: '', name: '', version: '1.0.0', description: '' },
      editableParams: {},
      cursor: { line: 1, column: 1 },
      jumpTo: null,
      params: {},
      currentProjectId: null,
    })
  })

  it('initializes with empty text and no active tab', () => {
    const state = useEditorStore.getState()
    expect(state.text).toBe('')
    expect(state.tabs).toEqual([])
    expect(state.activeTabId).toBeNull()
  })

  it('setText updates text in the store', () => {
    const { setText } = useEditorStore.getState()
    setText('---\nid: test-prompt\n---\n# Hello')
    expect(useEditorStore.getState().text).toBe('---\nid: test-prompt\n---\n# Hello')
  })

  it('initializes metadata with default version 1.0.0', () => {
    const { metadata } = useEditorStore.getState()
    expect(metadata.version).toBe('1.0.0')
    expect(metadata.id).toBe('')
    expect(metadata.name).toBe('')
  })
})

describe('uiStore', () => {
  it('initializes with design mode and dark theme', () => {
    const state = useUIStore.getState()
    expect(state.mode).toBe('design')
    expect(state.theme).toBe('dark')
  })

  it('initializes with sidebar visible on explorer panel', () => {
    const state = useUIStore.getState()
    expect(state.showSidebar).toBe(true)
    expect(state.activeSide).toBe('explorer')
  })

  it('toggleTheme switches between light and dark', () => {
    const { toggleTheme } = useUIStore.getState()
    const originalTheme = useUIStore.getState().theme
    toggleTheme()
    const newTheme = useUIStore.getState().theme
    expect(newTheme).not.toBe(originalTheme)
    expect(['light', 'dark']).toContain(newTheme)
  })
})

describe('workflowStore', () => {
  it('initializes with empty nodes and edges', () => {
    const state = useWorkflowStore.getState()
    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
    expect(state.workflowFile).toBeNull()
  })

  it('initializes with execution state as null and not executing', () => {
    const state = useWorkflowStore.getState()
    expect(state.executionState).toBeNull()
    expect(state.isExecuting).toBe(false)
  })
})
