import { useState, useEffect, useCallback } from 'react'
import { FileText, FileJson } from 'lucide-react'

type FileTypeKey = 'prmd' | 'pdflow' | 'prompdjson' | 'custom'

const FILE_TYPES: Array<{ key: FileTypeKey; label: string; ext: string; description: string; icon: React.ReactNode }> = [
  { key: 'prmd', label: 'Prompt', ext: '.prmd', description: 'Prompd prompt file',
    icon: <img src="./icons/prmd-color.svg" alt="prmd" style={{ width: 20, height: 20 }} /> },
  { key: 'pdflow', label: 'Workflow', ext: '.pdflow', description: 'Visual workflow',
    icon: <img src="./icons/prompdflow-color.svg" alt="pdflow" style={{ width: 20, height: 20 }} /> },
  { key: 'prompdjson', label: 'Project Config', ext: 'prompd.json', description: 'Project configuration',
    icon: <FileJson size={20} color="#CBCB41" /> },
  { key: 'custom', label: 'Other', ext: '', description: 'Any file type',
    icon: <FileText size={20} color="#8B949E" /> },
]

interface NewFileDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (fileName: string, content: string) => void
}

function formatFileName(fileName: string): { id: string; name: string } {
  const dotIdx = fileName.lastIndexOf('.')
  const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName
  const id = baseName.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
  const name = baseName
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
  return { id: id || 'untitled', name: name || 'Untitled' }
}

export function defaultPrompd(fileName?: string) {
  const { id, name } = formatFileName(fileName || 'untitled.prmd')
  return `---
id: ${id}
name: ${name}
description: ""
version: 1.0.0
---

# User

`
}

export function defaultWorkflow(fileName?: string) {
  const { id, name } = formatFileName(fileName || 'new-workflow.pdflow')
  return JSON.stringify({
    version: '1.0.0',
    metadata: {
      id,
      name,
      description: ''
    },
    parameters: [],
    nodes: [],
    edges: []
  }, null, 2) + '\n'
}

export function defaultPrompdJson() {
  return JSON.stringify({
    name: 'untitled',
    version: '1.0.0',
    description: ''
  }, null, 2) + '\n'
}

export function getDefaultContent(fileName: string): string {
  if (fileName.endsWith('.prmd')) return defaultPrompd(fileName)
  if (fileName.endsWith('.pdflow')) return defaultWorkflow(fileName)
  if (fileName === 'prompd.json') return defaultPrompdJson()
  return ''
}

export function NewFileDialog({ isOpen, onClose, onSubmit }: NewFileDialogProps) {
  const [fileType, setFileType] = useState<FileTypeKey>('prmd')
  const [inputValue, setInputValue] = useState('untitled.prmd')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFileType('prmd')
      setInputValue('untitled.prmd')
      setShowAdvanced(false)
    }
  }, [isOpen])

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim()) return
    const content = getDefaultContent(inputValue.trim())
    onSubmit(inputValue.trim(), content)
  }, [inputValue, onSubmit])

  const handleCancel = useCallback(() => {
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={handleCancel}
    >
      <div
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--accent)',
          borderRadius: 12,
          padding: '20px',
          minWidth: '320px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px 0' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--foreground)' }}>
            New file:
          </h3>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '2px 4px',
            }}
          >
            {showAdvanced ? 'Show file types' : 'Advanced'}
          </button>
        </div>

        {/* File type selector cards */}
        {!showAdvanced && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {FILE_TYPES.map(ft => (
              <button
                key={ft.key}
                onClick={() => {
                  setFileType(ft.key)
                  if (ft.key === 'custom') return
                  if (ft.key === 'prompdjson') {
                    setInputValue('prompd.json')
                    return
                  }
                  const dotIdx = inputValue.lastIndexOf('.')
                  const baseName = dotIdx > 0 ? inputValue.substring(0, dotIdx) : inputValue
                  setInputValue(baseName + ft.ext)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  background: fileType === ft.key
                    ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                    : 'var(--input-bg)',
                  border: fileType === ft.key
                    ? '1.5px solid var(--accent)'
                    : '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                  color: 'var(--foreground)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{ flexShrink: 0 }}>{ft.icon}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{ft.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{ft.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            const val = e.target.value
            if (val.endsWith('.prmd')) setFileType('prmd')
            else if (val.endsWith('.pdflow')) setFileType('pdflow')
            else if (val === 'prompd.json') setFileType('prompdjson')
            else setFileType('custom')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            else if (e.key === 'Escape') handleCancel()
          }}
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '14px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--foreground)',
            marginBottom: '16px',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
