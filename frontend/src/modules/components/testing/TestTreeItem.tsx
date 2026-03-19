/**
 * TestTreeItem - Recursive tree node for test explorer.
 * Renders .prmd files with their test status and expandable test cases.
 */

import { ChevronRight, ChevronDown, Play, CheckCircle2, XCircle, AlertCircle, MinusCircle, Circle } from 'lucide-react'
import type { TestSuiteInfo, TestCaseResult } from '@/stores/testStore'

// --- Status rendering ---

function StatusIcon({ status, size = 14 }: { status?: string; size?: number }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 size={size} color="#10b981" />
    case 'fail':
      return <XCircle size={size} color="#ef4444" />
    case 'error':
      return <AlertCircle size={size} color="#f59e0b" />
    case 'skip':
      return <MinusCircle size={size} color="var(--muted)" />
    default:
      return <Circle size={size} color="var(--muted)" style={{ opacity: 0.3 }} />
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

// --- Props ---

interface TestFileItemProps {
  suite: TestSuiteInfo
  expanded: boolean
  onToggle: () => void
  onRun: (targetPath: string) => void
}

interface TestCaseItemProps {
  result?: TestCaseResult
  name: string
  depth: number
}

// --- File-level item ---

export function TestFileItem({ suite, expanded, onToggle, onRun }: TestFileItemProps) {
  const fileName = suite.targetPath.replace(/\\/g, '/').split('/').pop() || suite.name
  const hasResults = !!suite.lastResults
  const hasTests = suite.testCount > 0

  return (
    <div className="te-file-group">
      <div
        className="te-file-item"
        onClick={onToggle}
      >
        <span className="te-chevron">
          {hasTests ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span style={{ width: 14 }} />
          )}
        </span>

        <StatusIcon status={suite.lastStatus} size={14} />

        <span className="te-file-name">{fileName}</span>

        {hasResults && (
          <span className="te-file-count">
            {suite.lastResults?.filter(r => r.status === 'pass').length}/{suite.testCount}
          </span>
        )}

        {!hasResults && hasTests && (
          <span className="te-file-count te-file-count-pending">
            {suite.testCount} tests
          </span>
        )}

        <button
          className="te-run-btn"
          title="Run tests"
          onClick={(e) => {
            e.stopPropagation()
            onRun(suite.targetPath)
          }}
        >
          <Play size={12} />
        </button>
      </div>

      {expanded && hasTests && (
        <div className="te-cases">
          {suite.lastResults ? (
            suite.lastResults.map((result, i) => (
              <TestCaseItem
                key={result.testName + i}
                result={result}
                name={result.testName}
                depth={1}
              />
            ))
          ) : (
            suite.testNames.map((name, i) => (
              <TestCaseItem
                key={name + i}
                name={name}
                depth={1}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// --- Test case item ---

function TestCaseItem({ result, name, depth }: TestCaseItemProps) {
  return (
    <div
      className="te-case-item"
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      <StatusIcon status={result?.status} size={12} />
      <span className="te-case-name">{name}</span>
      {result?.duration !== undefined && (
        <span className="te-case-duration">{formatDuration(result.duration)}</span>
      )}
      {result?.error && (
        <span className="te-case-error" title={result.error}>
          {result.error.length > 40 ? result.error.substring(0, 40) + '...' : result.error}
        </span>
      )}
    </div>
  )
}
