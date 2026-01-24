import { useState } from 'react'
import { Code, Eye, Columns } from 'lucide-react'
import CodeEditor from './CodeEditor'
import MarkdownPreview from './MarkdownPreview'

interface SectionEditorProps {
  value: string
  onChange: (value: string) => void
  height?: string
  theme?: 'light' | 'dark'
}

type ViewMode = 'edit' | 'preview' | 'split'

export default function SectionEditor({
  value,
  onChange,
  height = '400px',
  theme = 'light'
}: SectionEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('edit')

  return (
    <div>
      {/* View Mode Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '8px'
      }}>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          background: 'var(--panel-2)',
          borderRadius: '6px'
        }}>
        <button
          onClick={() => setViewMode('edit')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            background: viewMode === 'edit' ? 'var(--accent)' : 'transparent',
            color: viewMode === 'edit' ? 'var(--panel)' : 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: viewMode === 'edit' ? 600 : 400
          }}
        >
          <Code size={14} />
          Edit
        </button>
        <button
          onClick={() => setViewMode('preview')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            background: viewMode === 'preview' ? 'var(--accent)' : 'transparent',
            color: viewMode === 'preview' ? 'var(--panel)' : 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: viewMode === 'preview' ? 600 : 400
          }}
        >
          <Eye size={14} />
          Preview
        </button>
        <button
          onClick={() => setViewMode('split')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            background: viewMode === 'split' ? 'var(--accent)' : 'transparent',
            color: viewMode === 'split' ? 'var(--panel)' : 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: viewMode === 'split' ? 600 : 400
          }}
        >
          <Columns size={14} />
          Split
        </button>
        </div>
      </div>

      {/* Editor Area */}
      {viewMode === 'edit' && (
        <CodeEditor
          value={value}
          onChange={onChange}
          height={height}
          theme={theme}
        />
      )}

      {viewMode === 'preview' && (
        <MarkdownPreview
          content={value}
          height={height}
          theme={theme}
        />
      )}

      {viewMode === 'split' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <CodeEditor
            value={value}
            onChange={onChange}
            height={height}
            theme={theme}
          />
          <MarkdownPreview
            content={value}
            height={height}
            theme={theme}
          />
        </div>
      )}
    </div>
  )
}
