/**
 * Test Store
 * Manages test discovery, execution, and results state.
 * Not persisted — test results are transient (like workflow execution state).
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useUIStore } from './uiStore'

// --- Types ---

export interface TestSuiteInfo {
  name: string
  description?: string
  testFilePath: string
  targetPath: string
  testCount: number
  testNames: string[]
  lastStatus?: 'pass' | 'fail' | 'error' | 'pending'
  lastResults?: TestCaseResult[]
  lastRunTime?: number
}

export interface TestCaseResult {
  testName: string
  status: 'pass' | 'fail' | 'error' | 'skip'
  duration: number
  assertions: AssertionResultInfo[]
  output?: string
  error?: string
}

export interface AssertionResultInfo {
  evaluator: 'nlp' | 'script' | 'prmd'
  check?: string
  status: 'pass' | 'fail' | 'error' | 'skip'
  reason?: string
  duration: number
}

export interface TestLogEntry {
  id: number
  timestamp: number
  type: 'info' | 'pass' | 'fail' | 'error' | 'skip' | 'heading' | 'detail' | 'summary'
  message: string
  detail?: string
  duration?: number
}

export interface TestRunSummary {
  total: number
  passed: number
  failed: number
  errors: number
  skipped: number
  duration: number
  totalTokens?: number
  providers?: string[]
  models?: string[]
}

// --- Store interface ---

interface TestStoreState {
  // Discovery
  discoveredSuites: TestSuiteInfo[]
  isDiscovering: boolean

  // Execution
  isRunning: boolean
  currentRunId: string | null
  activeTarget: string | null

  // Test provider/model (independent from editor's provider/model)
  testProvider: string
  testModel: string

  // Results
  log: TestLogEntry[]
  summary: TestRunSummary | null

  // Tree state
  expandedFiles: string[]

  // Actions
  setTestProvider: (provider: string) => void
  setTestModel: (model: string) => void
  discover: (directory: string) => Promise<void>
  runTests: (target: string, options?: Record<string, unknown>) => Promise<void>
  runAll: (directory: string, options?: Record<string, unknown>) => Promise<void>
  stopTests: () => void
  handleProgressEvent: (data: { runId: string; event: ProgressEventData }) => void
  toggleExpanded: (filePath: string) => void
  clearLog: () => void
}

interface ProgressEventData {
  type: 'suite_start' | 'test_start' | 'test_complete' | 'suite_complete' | 'assertion_complete'
  suite: string
  testName?: string
  testCount?: number
  result?: {
    suite: string
    testName: string
    status: 'pass' | 'fail' | 'error' | 'skip'
    duration: number
    assertions: AssertionResultInfo[]
    output?: string
    error?: string
  }
  results?: unknown[]
  assertion?: AssertionResultInfo
}

let logIdCounter = 0

function nextLogId(): number {
  return ++logIdCounter
}

export const useTestStore = create<TestStoreState>()(
  immer((set, get) => ({
    // Initial state
    discoveredSuites: [],
    isDiscovering: false,
    isRunning: false,
    currentRunId: null,
    activeTarget: null,
    testProvider: '',
    testModel: '',
    log: [],
    summary: null,
    expandedFiles: [],

    setTestProvider: (provider) => set((s) => { s.testProvider = provider }),
    setTestModel: (model) => set((s) => { s.testModel = model }),

    discover: async (directory) => {
      if (!window.electronAPI?.test) return

      set((state) => {
        state.isDiscovering = true
      })

      try {
        const result = await window.electronAPI.test.discover(directory)

        set((state) => {
          state.isDiscovering = false
          if (result.success) {
            // Merge with existing status data
            const existing = new Map(state.discoveredSuites.map(s => [s.testFilePath, s]))
            state.discoveredSuites = result.suites.map(s => {
              const prev = existing.get(s.testFilePath)
              return {
                ...s,
                lastStatus: prev?.lastStatus,
                lastResults: prev?.lastResults,
                lastRunTime: prev?.lastRunTime,
              }
            })
          }
        })
      } catch {
        set((state) => {
          state.isDiscovering = false
        })
      }
    },

    runTests: async (target, options = {}) => {
      if (!window.electronAPI?.test) return
      const state = get()
      if (state.isRunning) return

      // Inject test provider/model into options (overridable by .prmd frontmatter)
      const runOptions = { ...options }
      if (state.testProvider) runOptions.provider = state.testProvider
      if (state.testModel) runOptions.model = state.testModel

      set((s) => {
        s.isRunning = true
        s.activeTarget = target
        s.log = []
        s.summary = null
      })

      // Open bottom panel to tests tab
      useUIStore.getState().setActiveBottomTab('tests')
      useUIStore.getState().setBottomPanelMinimized(false)

      try {
        const result = await window.electronAPI.test.run(target, runOptions)

        set((s) => {
          s.isRunning = false
          s.currentRunId = null

          if (result.success && result.result) {
            s.summary = result.result.summary

            // Update suite status from results
            for (const suiteResult of result.result.suites) {
              const suite = s.discoveredSuites.find(
                ds => ds.name === suiteResult.suite
              )
              if (suite) {
                const hasFail = suiteResult.results.some(r => r.status === 'fail')
                const hasError = suiteResult.results.some(r => r.status === 'error')
                suite.lastStatus = hasError ? 'error' : hasFail ? 'fail' : 'pass'
                suite.lastResults = suiteResult.results.map(r => ({
                  testName: r.testName,
                  status: r.status,
                  duration: r.duration,
                  assertions: r.assertions,
                  output: r.output,
                  error: r.error,
                }))
                suite.lastRunTime = Date.now()
              }
            }
          }
        })
      } catch {
        set((s) => {
          s.isRunning = false
          s.currentRunId = null
        })
      }
    },

    runAll: async (directory, options = {}) => {
      if (!window.electronAPI?.test) return
      const state = get()
      if (state.isRunning) return

      const runOptions = { ...options }
      if (state.testProvider) runOptions.provider = state.testProvider
      if (state.testModel) runOptions.model = state.testModel

      set((s) => {
        s.isRunning = true
        s.activeTarget = directory
        s.log = []
        s.summary = null
      })

      useUIStore.getState().setActiveBottomTab('tests')
      useUIStore.getState().setBottomPanelMinimized(false)

      try {
        const result = await window.electronAPI.test.runAll(directory, runOptions)

        set((s) => {
          s.isRunning = false
          s.currentRunId = null

          if (result.success && result.result) {
            s.summary = result.result.summary

            for (const suiteResult of result.result.suites) {
              const suite = s.discoveredSuites.find(
                ds => ds.name === suiteResult.suite
              )
              if (suite) {
                const hasFail = suiteResult.results.some(r => r.status === 'fail')
                const hasError = suiteResult.results.some(r => r.status === 'error')
                suite.lastStatus = hasError ? 'error' : hasFail ? 'fail' : 'pass'
                suite.lastResults = suiteResult.results.map(r => ({
                  testName: r.testName,
                  status: r.status,
                  duration: r.duration,
                  assertions: r.assertions,
                  output: r.output,
                  error: r.error,
                }))
                suite.lastRunTime = Date.now()
              }
            }
          }
        })
      } catch {
        set((s) => {
          s.isRunning = false
          s.currentRunId = null
        })
      }
    },

    stopTests: () => {
      const state = get()
      if (state.currentRunId && window.electronAPI?.test) {
        window.electronAPI.test.stop(state.currentRunId)
      }
      set((s) => {
        s.isRunning = false
        s.currentRunId = null
      })
    },

    handleProgressEvent: (data) => {
      const { event } = data

      set((s) => {
        if (!s.currentRunId) {
          s.currentRunId = data.runId
        }

        const now = Date.now()

        switch (event.type) {
          case 'suite_start':
            s.log.push({
              id: nextLogId(),
              timestamp: now,
              type: 'heading',
              message: `Running ${event.suite} (${event.testCount} tests)...`,
            })
            break

          case 'test_start':
            // No log entry for start — wait for completion
            break

          case 'test_complete': {
            const r = event.result
            if (!r) break
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exec = (r as any).execution as { provider?: string; model?: string; usage?: { totalTokens?: number } } | undefined
            const metaParts: string[] = []
            if (exec?.provider && exec.provider !== 'none') metaParts.push(`${exec.provider}/${exec.model || '?'}`)
            if (exec?.usage?.totalTokens) metaParts.push(`${exec.usage.totalTokens} tokens`)
            const metaSuffix = metaParts.length > 0 ? `  [${metaParts.join(', ')}]` : ''

            s.log.push({
              id: nextLogId(),
              timestamp: now,
              type: r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : r.status === 'skip' ? 'skip' : 'error',
              message: `${r.testName}${metaSuffix}`,
              duration: r.duration,
              detail: r.error,
            })

            // Add error message if present
            if (r.error) {
              s.log.push({
                id: nextLogId(),
                timestamp: now,
                type: 'detail',
                message: `  ${r.error}`,
              })
            }

            // Add assertion details for failures/errors
            if (r.status !== 'pass') {
              for (const a of r.assertions) {
                if (a.status !== 'pass') {
                  s.log.push({
                    id: nextLogId(),
                    timestamp: now,
                    type: 'detail',
                    message: `  ${a.evaluator}${a.check ? `(${a.check})` : ''}: ${a.reason || a.status}`,
                    duration: a.duration,
                  })
                }
              }
            }
            break
          }

          case 'suite_complete':
            // Summary is handled when the full run completes
            break

          case 'assertion_complete':
            // Logged inline with test_complete for cleaner output
            break
        }
      })
    },

    toggleExpanded: (filePath) => {
      set((s) => {
        const idx = s.expandedFiles.indexOf(filePath)
        if (idx >= 0) {
          s.expandedFiles.splice(idx, 1)
        } else {
          s.expandedFiles.push(filePath)
        }
      })
    },

    clearLog: () => {
      set((s) => {
        s.log = []
        s.summary = null
      })
    },
  }))
)
