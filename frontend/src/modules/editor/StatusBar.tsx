import { AlertCircle, CheckCircle } from 'lucide-react'
import { APP_VERSION } from '../../constants/app'

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
  const handleIssuesClick = () => {
    if (issuesCount > 0 && onIssuesClick) {
      onIssuesClick()
    }
  }

  return (
    <div className="statusbar">
      <div className="item">{fileName}{dirty ? ' *' : ''}</div>
      <div className="item">Ln {line}, Col {column}</div>
      <div
        className="item"
        onClick={handleIssuesClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: issuesCount > 0 ? '#f59e0b' : '#10b981',
          cursor: issuesCount > 0 ? 'pointer' : 'default'
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
      </div>
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

