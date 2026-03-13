/**
 * Shared types for Zustand stores
 */

import type { ParsedPrompd } from '../modules/lib/prompdParser'
import type { Section, PackageReference, WizardState as WizardStateType } from '../modules/types/wizard'

/**
 * Tab interface
 */
export interface Tab {
  id: string
  name: string
  text: string
  savedText?: string // Original text from file (for dirty detection)
  handle?: FileSystemFileHandle
  filePath?: string // Full disk path for file restoration after app restart
  dirty?: boolean
  type?: 'file' | 'execution' | 'chat' | 'brainstorm'
  viewMode?: 'wizard' | 'design' | 'code'
  readOnly?: boolean
  executionConfig?: any // ExecutionConfig type
  virtualTemp?: boolean
  packageSource?: {
    packageId: string
    filePath: string
  }
  chatConfig?: {
    mode: string
    conversationId?: string
    contextFile?: string | null // Tab ID for Edit mode context
  }
  showPreview?: boolean // Show compiled markdown preview in split view
  showChat?: boolean // Show AI chat pane in split view
  previewParams?: Record<string, unknown> // Parameter values for preview compilation
  brainstormConfig?: {
    sourceFilePath: string
    sourceTabId?: string
    conversationId?: string
    editorMode?: 'wysiwyg' | 'code'
  }
}

/**
 * Lightweight tab shape persisted to localStorage.
 * Excludes text/savedText/handle to avoid storage bloat from base64 images.
 * Content is re-read from disk on app startup via rehydrateTabContent().
 */
export type PersistedTab = Omit<Tab, 'text' | 'savedText' | 'handle'>

/**
 * Metadata interface
 */
export interface Metadata {
  id: string
  name: string
  version: string
  description?: string
}

/**
 * File System Entry
 */
export interface FileSystemEntry {
  name: string
  kind: 'file' | 'directory'
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
}

/**
 * UI State for sidebar
 */
export type SidebarPanel = 'explorer' | 'packages' | 'ai' | 'git' | 'history' | 'resources' | 'library'

/**
 * Modal types
 */
export type ModalType =
  | 'apiKeySettings'
  | 'localStorage'
  | 'publish'
  | 'publish-resource'
  | 'settings'
  | 'about'
  | 'aiGenerate'
  | 'fileChanges'
  | 'deployment'
  | 'deploy-workflow'
  | 'newProject'
  | null

/**
 * Toast notification
 */
export interface Toast {
  id: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success' | 'update'
  duration?: number // milliseconds, 0 = persistent
  action?: { label: string; onClick: () => void }
}

/**
 * Structured build error with file/line info for clickable links
 */
export interface BuildError {
  file: string
  message: string
  line?: number
  column?: number
  severity?: 'error' | 'warning' | 'info' | 'hint'
}

/**
 * Build output for the build panel
 */
export interface BuildOutput {
  status: 'idle' | 'building' | 'success' | 'error'
  message: string
  details?: string  // Full error details, stack trace, etc.
  errors?: BuildError[]  // Structured errors with file/line info
  outputPath?: string
  fileName?: string
  fileCount?: number
  size?: number
  timestamp?: number
}

/**
 * A single package build record for the Packages tab history
 */
export interface PackageBuildRecord {
  id: string
  status: 'success' | 'error'
  message: string
  fileName?: string
  outputPath?: string
  fileCount?: number
  size?: number
  timestamp: number
  errors?: BuildError[]
}
