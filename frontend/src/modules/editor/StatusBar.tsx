import { AlertCircle, CheckCircle, FlaskConical } from 'lucide-react'
import { APP_VERSION } from '../../constants/app'
import { useTestStore } from '../../stores/testStore'
import { useUIStore } from '../../stores/uiStore'

type Props = {
  fileName?: string
  dirty?: boolean
  line: number
  column: number
  issuesCount: number
  theme: 'light' | 'dark'
  language?: string
  onIssuesClick?: () => void
}

export default function StatusBar({ fileName, dirty, line, column, issuesCount, language, onIssuesClick }: Props) {
  const testSummary = useTestStore(state => state.summary)
  const isTestRunning = useTestStore(state => state.isRunning)
  const setActiveBottomTab = useUIStore(state => state.setActiveBottomTab)
  const setShowBottomPanel = useUIStore(state => state.setShowBottomPanel)
  const handleIssuesClick = () => {
    if (issuesCount > 0 && onIssuesClick) {
      onIssuesClick()
    }
  }

  return (
    <div className="statusbar">
      <div className="item">{fileName}{dirty ? ' *' : ''}</div>
      <div className="item">Ln {line}, Col {column}</div>
      <button
        className="item"
        onClick={handleIssuesClick}
        title={issuesCount > 0 ? 'Click to view issues in the output panel' : 'No issues found'}
        aria-label={issuesCount > 0 ? `${issuesCount} ${issuesCount === 1 ? 'issue' : 'issues'} found - click to view` : 'No issues'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: issuesCount > 0 ? '#f59e0b' : '#10b981',
          cursor: issuesCount > 0 ? 'pointer' : 'default',
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit'
        }}
      >
        {issuesCount > 0 ? (
          <>
            <AlertCircle size={12} />
            <span>{issuesCount} {issuesCount === 1 ? 'issue' : 'issues'}</span>
          </>
        ) : (
          <>
            <CheckCircle size={12} />
            <span>No issues</span>
          </>
        )}
      </button>
      {(testSummary || isTestRunning) && (
        <button
          className="item"
          onClick={() => {
            setShowBottomPanel(true)
            setActiveBottomTab('tests')
          }}
          title="Click to view test results"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: isTestRunning
              ? 'var(--muted)'
              : testSummary && testSummary.failed === 0 && testSummary.errors === 0
                ? '#10b981'
                : '#ef4444',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            font: 'inherit'
          }}
        >
          <FlaskConical size={12} />
          {isTestRunning
            ? 'Running...'
            : testSummary
              ? `${testSummary.passed}/${testSummary.total} passed`
              : ''}
        </button>
      )}
      {language && <div className="item">{language.charAt(0).toUpperCase() + language.slice(1)}</div>}
      <div style={{ flex: 1 }} />
      <div
        className="item"
        style={{
          color: 'var(--muted)',
          fontWeight: 400
        }}
      >
        v{APP_VERSION}
      </div>
      <div
        className="item"
        style={{
          color: 'var(--accent)',
          fontWeight: 500,
          letterSpacing: '0.5px'
        }}
      >
        BETA
      </div>
      {import.meta.env.DEV && (
        <div
          className="item"
          style={{
            color: '#000',
            background: '#f59e0b',
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '1px',
            padding: '1px 6px',
            borderRadius: '3px',
            lineHeight: '16px',
          }}
        >
          DEV
        </div>
      )}
    </div>
  )
}

