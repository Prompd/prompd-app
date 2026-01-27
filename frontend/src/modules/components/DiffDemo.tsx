/**
 * Monaco Diff Demo Page
 *
 * Demonstrates all diff capabilities with working examples.
 * Access via: Add ?demo=diff to URL
 */

import { useState } from 'react'
import { X, Code, FileCode, GitCompare, GitBranch, Eye } from 'lucide-react'
import {
  FindReplacePreviewExample,
  AiEditPreviewExample,
  SideBySideDiffExample,
  ChangeTrackingExample,
  CustomDiffExample
} from '../lib/monacoDiff.examples'

export function DiffDemo({ onClose }: { onClose: () => void }) {
  const [activeExample, setActiveExample] = useState<number>(1)

  const examples = [
    { id: 1, name: 'Find/Replace Preview', icon: Code, component: FindReplacePreviewExample },
    { id: 2, name: 'AI Edit Preview', icon: Eye, component: AiEditPreviewExample },
    { id: 3, name: 'Side-by-Side Diff', icon: GitCompare, component: SideBySideDiffExample },
    { id: 4, name: 'Change Tracking', icon: GitBranch, component: ChangeTrackingExample },
    { id: 5, name: 'Custom Diff', icon: FileCode, component: CustomDiffExample },
  ]

  const ActiveComponent = examples.find(ex => ex.id === activeExample)?.component

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--panel)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Monaco Diff Demo</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Interactive examples of Monaco editor diff capabilities
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            cursor: 'pointer',
            padding: 8,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'var(--panel-2)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <X size={18} />
          Close
        </button>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: 220,
          borderRight: '1px solid var(--border)',
          background: 'var(--panel)',
          padding: 12,
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Examples
          </div>
          {examples.map((example) => {
            const Icon = example.icon
            return (
              <button
                key={example.id}
                onClick={() => setActiveExample(example.id)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  marginBottom: 4,
                  background: activeExample === example.id ? 'var(--panel-2)' : 'transparent',
                  border: activeExample === example.id ? '1px solid var(--border)' : '1px solid transparent',
                  borderRadius: 6,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  textAlign: 'left',
                  transition: 'all 0.15s'
                }}
                onMouseOver={(e) => {
                  if (activeExample !== example.id) {
                    e.currentTarget.style.background = 'var(--panel-2)'
                  }
                }}
                onMouseOut={(e) => {
                  if (activeExample !== example.id) {
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                <Icon size={14} style={{ flexShrink: 0 }} />
                <span>{example.name}</span>
              </button>
            )
          })}
        </div>

        {/* Main content */}
        <div style={{
          flex: 1,
          padding: 20,
          overflowY: 'auto',
          background: 'var(--bg)'
        }}>
          <div style={{
            maxWidth: 1000,
            margin: '0 auto'
          }}>
            {ActiveComponent && <ActiveComponent />}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--panel)',
        fontSize: 11,
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span>Monaco Editor Diff Utilities</span>
        <span>Files: monacoDiff.ts, monacoDiff.examples.tsx</span>
      </div>
    </div>
  )
}
