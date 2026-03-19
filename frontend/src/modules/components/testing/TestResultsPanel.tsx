/**
 * TestResultsPanel - Test execution results with collapsible file groups
 * and expandable test cards. Displayed in the bottom panel "Tests" tab.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Trash2, Download, Square, ChevronRight, ChevronDown, CheckCircle2, XCircle, AlertCircle, MinusCircle } from 'lucide-react'
import { useTestStore, type TestLogEntry, type TestRunSummary } from '@/stores/testStore'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

interface TestGroup {
  id: number
  entry: TestLogEntry
  details: TestLogEntry[]
}

interface SuiteGroup {
  id: number
  heading: TestLogEntry
  tests: TestGroup[]
}

/** Group flat log entries into suites → test cards → details */
function groupLogEntries(log: TestLogEntry[]): Array<SuiteGroup | TestLogEntry> {
  const result: Array<SuiteGroup | TestLogEntry> = []
  let i = 0

  while (i < log.length) {
    const entry = log[i]

    if (entry.type === 'heading') {
      // Start a new suite — collect all test entries until next heading
      const suite: SuiteGroup = { id: entry.id, heading: entry, tests: [] }
      i++

      while (i < log.length && log[i].type !== 'heading') {
        const testEntry = log[i]

        if (testEntry.type === 'pass' || testEntry.type === 'fail' || testEntry.type === 'error' || testEntry.type === 'skip') {
          const details: TestLogEntry[] = []
          let j = i + 1
          while (j < log.length && log[j].type === 'detail') {
            details.push(log[j])
            j++
          }
          suite.tests.push({ id: testEntry.id, entry: testEntry, details })
          i = j
        } else {
          i++
        }
      }

      result.push(suite)
    } else {
      result.push(entry)
      i++
    }
  }

  return result
}

function statusIcon(type: TestLogEntry['type']) {
  switch (type) {
    case 'pass': return <CheckCircle2 size={14} className="test-icon-pass" />
    case 'fail': return <XCircle size={14} className="test-icon-fail" />
    case 'error': return <AlertCircle size={14} className="test-icon-error" />
    case 'skip': return <MinusCircle size={14} className="test-icon-skip" />
    default: return null
  }
}

function TestCard({ group }: { group: TestGroup }) {
  const hasDetails = group.details.length > 0
  const [expanded, setExpanded] = useState(group.entry.type !== 'pass')

  return (
    <div className={`test-card test-card-${group.entry.type}`}>
      <div
        className="test-card-header"
        onClick={() => hasDetails && setExpanded(!expanded)}
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
      >
        {hasDetails ? (
          expanded
            ? <ChevronDown size={12} className="test-card-chevron" />
            : <ChevronRight size={12} className="test-card-chevron" />
        ) : (
          <span className="test-card-chevron-spacer" />
        )}
        {statusIcon(group.entry.type)}
        <span className="test-card-name">{group.entry.message}</span>
        {group.entry.duration !== undefined && (
          <span className="test-card-duration">{formatDuration(group.entry.duration)}</span>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="test-card-details">
          {group.details.map((detail) => (
            <div key={detail.id} className="test-card-detail-row">
              <span className="test-card-detail-message">{detail.message}</span>
              {detail.duration !== undefined && detail.duration > 0 && (
                <span className="test-card-duration">{formatDuration(detail.duration)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SuiteSection({ suite }: { suite: SuiteGroup }) {
  const [expanded, setExpanded] = useState(true)

  const counts = useMemo(() => {
    let passed = 0, failed = 0, errors = 0, skipped = 0
    for (const t of suite.tests) {
      switch (t.entry.type) {
        case 'pass': passed++; break
        case 'fail': failed++; break
        case 'error': errors++; break
        case 'skip': skipped++; break
      }
    }
    return { passed, failed, errors, skipped, total: suite.tests.length }
  }, [suite.tests])

  const allPassed = counts.failed === 0 && counts.errors === 0

  return (
    <div className="test-suite">
      <div
        className="test-suite-header"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown size={14} className="test-suite-chevron" />
          : <ChevronRight size={14} className="test-suite-chevron" />
        }
        <span className="test-suite-name">{suite.heading.message}</span>
        {!expanded && counts.total > 0 && (
          <span className="test-suite-counts">
            <span className={allPassed ? 'test-suite-count-pass' : 'test-suite-count-mixed'}>
              {counts.passed > 0 && <span className="test-count-pass">{counts.passed} passed</span>}
              {counts.failed > 0 && <span className="test-count-fail">{counts.passed > 0 ? ', ' : ''}{counts.failed} failed</span>}
              {counts.errors > 0 && <span className="test-count-error">{(counts.passed > 0 || counts.failed > 0) ? ', ' : ''}{counts.errors} errors</span>}
              {counts.skipped > 0 && <span className="test-count-skip">{(counts.passed > 0 || counts.failed > 0 || counts.errors > 0) ? ', ' : ''}{counts.skipped} skipped</span>}
            </span>
          </span>
        )}
      </div>
      {expanded && (
        <div className="test-suite-body">
          {suite.tests.map((group) => (
            <TestCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryLine({ summary }: { summary: TestRunSummary }) {
  const allPassed = summary.failed === 0 && summary.errors === 0
  return (
    <div className={`test-summary-line ${allPassed ? 'test-summary-pass' : 'test-summary-fail'}`}>
      <div>
        Tests: {summary.passed} passed, {summary.failed} failed
        {summary.errors > 0 && `, ${summary.errors} errors`}
        {summary.skipped > 0 && `, ${summary.skipped} skipped`}
        {' '} | {summary.total} total | Time: {formatDuration(summary.duration)}
      </div>
      {(summary.totalTokens || summary.models) && (
        <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>
          {summary.models && summary.models.length > 0 && (
            <span>Models: {summary.models.join(', ')}</span>
          )}
          {summary.totalTokens && (
            <span>{summary.models ? ' | ' : ''}Tokens: {summary.totalTokens.toLocaleString()}</span>
          )}
        </div>
      )}
    </div>
  )
}

function exportTestResults(log: TestLogEntry[], summary: TestRunSummary | null) {
  const data = JSON.stringify({ log, summary }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `test-results-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function TestResultsPanel() {
  const log = useTestStore(state => state.log)
  const summary = useTestStore(state => state.summary)
  const isRunning = useTestStore(state => state.isRunning)
  const clearLog = useTestStore(state => state.clearLog)
  const stopTests = useTestStore(state => state.stopTests)

  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  const grouped = useMemo(() => groupLogEntries(log), [log])

  useEffect(() => {
    if (shouldAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [log.length])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50
  }, [])

  return (
    <div className="test-results-panel">
      <div className="test-results-toolbar">
        {isRunning && (
          <button
            className="test-toolbar-btn"
            title="Stop Tests"
            onClick={stopTests}
          >
            <Square size={14} />
          </button>
        )}
        <button
          className="test-toolbar-btn"
          title="Clear"
          onClick={clearLog}
        >
          <Trash2 size={14} />
        </button>
        <button
          className="test-toolbar-btn"
          title="Export Results"
          onClick={() => exportTestResults(log, summary)}
        >
          <Download size={14} />
        </button>
      </div>

      <div
        className="test-results-log"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {log.length === 0 && !isRunning && (
          <div className="test-results-empty">
            No test results yet. Run tests from the Test Explorer or editor toolbar.
          </div>
        )}

        {grouped.map((item) => {
          if ('heading' in item) {
            return <SuiteSection key={item.id} suite={item as SuiteGroup} />
          }
          const entry = item as TestLogEntry
          return (
            <div key={entry.id} className={`test-log-entry test-status-${entry.type}`}>
              <span className="test-log-message">{entry.message}</span>
            </div>
          )
        })}

        {isRunning && (
          <div className="test-log-entry test-status-info">
            <span className="test-log-running-indicator" />
            <span className="test-log-message">Running...</span>
          </div>
        )}

        {summary && <SummaryLine summary={summary} />}
      </div>
    </div>
  )
}
