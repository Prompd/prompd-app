/**
 * TransformerNodeProperties - Property editor for Transformer nodes
 */

import { Editor } from '@monaco-editor/react'
import { Braces, Maximize2 } from 'lucide-react'
import type { TransformerNodeData } from '../../../services/workflowTypes'
import { useUIStore } from '../../../../stores/uiStore'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'
import { getMonacoTheme } from '../../../lib/monacoConfig'
import { hasVariables, VariablePreview } from '../../common/VariableReference'

export interface TransformerNodePropertiesProps {
  data: TransformerNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
  onExpandEditor?: (content: string, language: string, label: string, field: string) => void
}

export function TransformerNodeProperties({ data, onChange, onExpandEditor }: TransformerNodePropertiesProps) {
  const theme = useUIStore(state => state.theme)

  const modeOptions = [
    { value: 'template', label: 'Template', description: 'JSON with {{ variable }} interpolation' },
    { value: 'expression', label: 'Expression', description: 'JavaScript expression (sandboxed)' },
    { value: 'jq', label: 'JQ Query', description: 'JQ-style query (coming soon)', disabled: true },
  ]

  const mode = data.mode || 'template'

  // Get the content for current mode
  const getContent = (): string => {
    switch (mode) {
      case 'template':
        return data.template || data.transform || ''
      case 'expression':
        return data.expression || ''
      case 'jq':
        return data.jqExpression || ''
      default:
        return ''
    }
  }

  const setContent = (value: string) => {
    switch (mode) {
      case 'template':
        onChange('template', value)
        break
      case 'expression':
        onChange('expression', value)
        break
      case 'jq':
        onChange('jqExpression', value)
        break
    }
  }

  const content = getContent()
  const hasVars = mode === 'template' && hasVariables(content)

  // Get Monaco language for mode
  const getMonacoLanguage = (): string => {
    switch (mode) {
      case 'template':
        return 'json'
      case 'expression':
        return 'javascript'
      case 'jq':
        return 'plaintext'
      default:
        return 'json'
    }
  }

  // Placeholder based on mode
  const getPlaceholder = (): string => {
    switch (mode) {
      case 'template':
        return `{
  "name": "{{ previous_output.name }}",
  "items": "{{ previous_output.data.items }}",
  "timestamp": "{{ workflow.timestamp }}"
}`
      case 'expression':
        return `// input contains the previous node's output
input.data.map(item => ({
  ...item,
  processed: true
}))`
      case 'jq':
        return '.data | map({name: .name, value: .value})'
      default:
        return ''
    }
  }

  return (
    <>
      {/* Transform Mode */}
      <div>
        <label style={labelStyle}>Transform Mode</label>
        <select
          value={mode}
          onChange={(e) => onChange('mode', e.target.value)}
          style={selectStyle}
        >
          {modeOptions.map(opt => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}{opt.disabled ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {modeOptions.find(o => o.value === mode)?.description}
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

      {/* Template/Expression Editor */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelStyle}>
            {mode === 'template' ? 'Template' : mode === 'expression' ? 'Expression' : 'Query'}
          </label>
          {onExpandEditor && (
            <button
              onClick={() => onExpandEditor(
                content,
                getMonacoLanguage(),
                mode === 'template' ? 'Template' : mode === 'expression' ? 'Expression' : 'Query',
                mode === 'template' ? 'template' : mode === 'expression' ? 'expression' : 'jqExpression'
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
            height: '180px',
          }}
        >
          <Editor
            value={content}
            onChange={(val) => setContent(val || '')}
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
              fixedOverflowWidgets: true,
            }}
          />
        </div>

        {/* Variable Preview for template mode */}
        {hasVars && (
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
            <VariablePreview text={content} size="sm" />
          </div>
        )}

        <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--muted)' }}>
          {getPlaceholder().split('\n')[0]}
        </div>
      </div>

      {/* Passthrough on Error */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          id="passthroughOnError"
          checked={data.passthroughOnError || false}
          onChange={(e) => onChange('passthroughOnError', e.target.checked)}
          style={{ width: '16px', height: '16px' }}
        />
        <label htmlFor="passthroughOnError" style={{ fontSize: '12px', color: 'var(--text)' }}>
          Pass through unchanged if transform fails
        </label>
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          style={inputStyle}
          placeholder='What this transform does...'
        />
      </div>
    </>
  )
}
