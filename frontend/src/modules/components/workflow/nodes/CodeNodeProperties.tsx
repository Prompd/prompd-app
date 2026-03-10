/**
 * CodeNodeProperties - Property editor for Code nodes
 */

import { Editor } from '@monaco-editor/react'
import { Braces, Maximize2 } from 'lucide-react'
import type { CodeNodeData } from '../../../services/workflowTypes'
import { useUIStore } from '../../../../stores/uiStore'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

import { getMonacoTheme } from '../../../lib/monacoConfig'
import { hasVariables, VariablePreview } from '../../common/VariableReference'

export interface CodeNodePropertiesProps {
  data: CodeNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
  onExpandEditor?: (content: string, language: string, label: string, field: string) => void
}

export function CodeNodeProperties({ data, onChange, onExpandEditor }: CodeNodePropertiesProps) {
  const theme = useUIStore(state => state.theme)

  // Check if code contains {{ }} variables (for template-style code)
  const codeHasVariables = hasVariables(data.code || '')

  const language = data.language || 'typescript'
  const isJsLang = language === 'typescript' || language === 'javascript'

  const languageOptions = [
    { value: 'typescript', label: 'TypeScript', description: 'Inline execution via Node.js VM (isolated) or main process' },
    { value: 'javascript', label: 'JavaScript', description: 'Inline execution via Node.js VM (isolated) or main process' },
    { value: 'python', label: 'Python', description: 'Subprocess via python -c (process-isolated, has OS access)' },
    { value: 'csharp', label: 'C#', description: 'Subprocess via dotnet run (process-isolated, has OS access)' },
  ]

  const executionContextOptions = [
    { value: 'isolated', label: 'Isolated (VM)', description: 'Sandboxed — no require, process, or file system access' },
    { value: 'main', label: 'Main Process', description: 'Full Node.js access including require and file system (use with caution)' },
  ]

  // Get placeholder code based on language
  const getCodePlaceholder = (): string => {
    switch (data.language || 'typescript') {
      case 'typescript':
      case 'javascript':
        return `// Transform the input data
const result = input.map(item => ({
  ...item,
  processed: true
}));
return result;`
      case 'python':
        return `# Transform the input data
result = [
    {**item, 'processed': True}
    for item in input
]
return result`
      case 'csharp':
        return `// Transform the input data
var result = input.Select(item => new {
    item,
    processed = true
});
return result;`
      default:
        return '// Enter your code here'
    }
  }

  // Get Monaco language for editor
  const getMonacoLanguage = (): string => {
    switch (data.language || 'typescript') {
      case 'typescript':
        return 'typescript'
      case 'javascript':
        return 'javascript'
      case 'python':
        return 'python'
      case 'csharp':
        return 'csharp'
      default:
        return 'typescript'
    }
  }

  return (
    <>
      {/* Language */}
      <div>
        <label style={labelStyle}>Language</label>
        <select
          value={data.language || 'typescript'}
          onChange={(e) => onChange('language', e.target.value)}
          style={selectStyle}
        >
          {languageOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {languageOptions.find(o => o.value === (data.language || 'typescript'))?.description}
        </div>
      </div>

      {/* Input Variable Name */}
      <div>
        <label style={labelStyle}>Input Variable Name</label>
        <input
          type="text"
          value={data.inputVariable || 'input'}
          onChange={(e) => onChange('inputVariable', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          placeholder='input'
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Name of the variable that receives the previous node's output
        </div>
      </div>

      {/* Execution Context (TS/JS only) */}
      {isJsLang && (
        <div>
          <label style={labelStyle}>Execution Context</label>
          <select
            value={data.executionContext || 'isolated'}
            onChange={(e) => onChange('executionContext', e.target.value)}
            style={selectStyle}
          >
            {executionContextOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            {executionContextOptions.find(o => o.value === (data.executionContext || 'isolated'))?.description}
          </div>
        </div>
      )}

      {/* Isolation note for Python/C# */}
      {!isJsLang && (
        <div style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Runs as a subprocess — isolated from the workflow engine but has full OS access (file system, network, environment variables).
        </div>
      )}

      {/* Code Editor */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelStyle}>Code</label>
          {onExpandEditor && (
            <button
              onClick={() => onExpandEditor(
                data.code || '',
                getMonacoLanguage(),
                'Code',
                'code'
              )}
              title="Open in expanded editor"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <Maximize2 size={11} />
              Expand
            </button>
          )}
        </div>
        <div
          style={{
            border: '1px solid var(--input-border)',
            borderRadius: '6px',
            overflow: 'hidden',
            height: '200px',
          }}
        >
          <Editor
            value={data.code || ''}
            onChange={(val) => onChange('code', val || '')}
            language={getMonacoLanguage()}
            theme={getMonacoTheme(theme === 'dark')}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              fontSize: 12,
              padding: { top: 8 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Variable Preview - shows pills for {{ }} syntax in code */}
        {codeHasVariables && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 10px',
              background: 'var(--panel-2)',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', marginBottom: '4px' }}>
              <Braces style={{ width: 10, height: 10 }} />
              Variables used:
            </div>
            <VariablePreview text={data.code || ''} size="sm" />
          </div>
        )}

        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {getCodePlaceholder().split('\n')[0]}
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label style={labelStyle}>Timeout (ms)</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={data.timeoutMs ?? 30000}
          onChange={(e) => onChange('timeoutMs', parseInt(e.target.value) || 30000)}
          style={inputStyle}
          placeholder='30000'
        />
      </div>
    </>
  )
}
