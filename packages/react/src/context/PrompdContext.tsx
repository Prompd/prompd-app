import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import type {
  IPrompdLLMClient,
  IPrompdResultDisplay,
  IPrompdEditor,
  PrompdProviderProps,
  PrompdChatMessage,
  PrompdMetadata,
  PrompdExecutionResult as PrompdExecutionResultType
} from '../types'
import { DefaultLLMClient } from '../clients/DefaultLLMClient'
import { DefaultResultDisplay } from '../displays/DefaultResultDisplay'

// Workflow state type
export type WorkflowState =
  | 'discovery'      // Searching for packages or generating custom prompds
  | 'configuration'  // Setting parameters for selected prompd
  | 'execution'      // Running the prompd
  | 'result'         // Displaying execution results

// Chat state interface
export interface PrompdChatState {
  input: string
  setInput: (input: string) => void
  messages: PrompdChatMessage[]
  addMessage: (role: 'user' | 'assistant', content: string, metadata?: any) => void
  clearMessages: () => void
  isTyping: boolean
  setIsTyping: (isTyping: boolean) => void
  attachedFiles: File[]
  addFiles: (files: File[]) => void
  removeFile: (index: number) => void
  clearFiles: () => void
}

// Workflow state interface
export interface PrompdWorkflowState {
  workflowState: WorkflowState
  setWorkflowState: (state: WorkflowState) => void
  selectedPrompd: PrompdMetadata | null
  setSelectedPrompd: (prompd: PrompdMetadata | null) => void
  parameters: Record<string, any>
  setParameters: (params: Record<string, any>) => void
  updateParameter: (name: string, value: any) => void
  executionResult: PrompdExecutionResultType | null
  setExecutionResult: (result: PrompdExecutionResultType | null) => void
}

interface PrompdContextValue {
  apiBaseUrl: string
  llmClient: IPrompdLLMClient
  resultDisplay: IPrompdResultDisplay
  editor?: IPrompdEditor
  mode: 'consumer' | 'editor'
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  chat: PrompdChatState
  workflow: PrompdWorkflowState
}

const PrompdContext = createContext<PrompdContextValue | undefined>(undefined)

/**
 * Provider component that wraps the application
 * Sets up default LLM client and result display
 */
export function PrompdProvider({
  children,
  apiBaseUrl = 'http://localhost:4050',
  defaultLLMClient,
  defaultResultDisplay,
  defaultEditor,
  mode = 'consumer',
  theme: initialTheme = 'auto'
}: PrompdProviderProps) {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light')

  // Use useMemo to update when defaultLLMClient changes (e.g., provider/model switch)
  // This ensures chat uses the updated provider/model configuration
  const llmClient = useMemo<IPrompdLLMClient>(
    () => defaultLLMClient || new DefaultLLMClient({ apiBaseUrl }),
    [defaultLLMClient, apiBaseUrl]
  )

  const [resultDisplay] = useState<IPrompdResultDisplay>(
    () => defaultResultDisplay || new DefaultResultDisplay()
  )
  const [editor] = useState<IPrompdEditor | undefined>(
    () => defaultEditor
  )

  // Handle theme initialization and auto-detection
  useEffect(() => {
    if (initialTheme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setThemeState(prefersDark ? 'dark' : 'light')

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent) => {
        setThemeState(e.matches ? 'dark' : 'light')
      }

      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      setThemeState(initialTheme)
    }
  }, [initialTheme])

  // Apply theme to document (only if in consumer mode)
  useEffect(() => {
    // In editor mode, the parent application controls the theme
    // Don't interfere with existing theme systems
    if (mode === 'consumer') {
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
    }
  }, [theme, mode])

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme)
  }

  // Chat state - TODO: Implement fully when needed
  const chat: PrompdChatState = {
    input: '',
    setInput: () => {},
    messages: [],
    addMessage: () => {},
    clearMessages: () => {},
    isTyping: false,
    setIsTyping: () => {},
    attachedFiles: [],
    addFiles: () => {},
    removeFile: () => {},
    clearFiles: () => {}
  }

  // Workflow state - TODO: Implement fully when needed
  const workflow: PrompdWorkflowState = {
    workflowState: 'discovery',
    setWorkflowState: () => {},
    selectedPrompd: null,
    setSelectedPrompd: () => {},
    parameters: {},
    setParameters: () => {},
    updateParameter: () => {},
    executionResult: null,
    setExecutionResult: () => {}
  }

  const value: PrompdContextValue = {
    apiBaseUrl,
    llmClient,
    resultDisplay,
    editor,
    mode,
    theme,
    setTheme,
    chat,
    workflow
  }

  return (
    <PrompdContext.Provider value={value}>
      {children}
    </PrompdContext.Provider>
  )
}

/**
 * Hook to access Prompd context
 * Must be used within PrompdProvider
 */
export function usePrompd(): PrompdContextValue {
  const context = useContext(PrompdContext)

  if (!context) {
    throw new Error('usePrompd must be used within PrompdProvider')
  }

  return context
}

/**
 * Hook to access LLM client
 */
export function usePrompdLLMClient(): IPrompdLLMClient {
  const { llmClient } = usePrompd()
  return llmClient
}

/**
 * Hook to access result display
 */
export function usePrompdResultDisplay(): IPrompdResultDisplay {
  const { resultDisplay } = usePrompd()
  return resultDisplay
}

/**
 * Hook to access and control theme
 */
export function usePrompdTheme() {
  const { theme, setTheme } = usePrompd()

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return { theme, setTheme, toggleTheme }
}

/**
 * Hook to access editor integration
 * Returns undefined if no editor is configured (consumer mode)
 */
export function usePrompdEditor(): IPrompdEditor | undefined {
  const { editor } = usePrompd()
  return editor
}

/**
 * Hook to get the current mode
 */
export function usePrompdMode(): 'consumer' | 'editor' {
  const { mode } = usePrompd()
  return mode
}
