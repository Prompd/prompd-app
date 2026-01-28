/**
 * ParallelNodeProperties - Property editor for Parallel nodes
 */

import { useWorkflowStore } from '../../../../stores/workflowStore'
import type { ParallelNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface ParallelNodePropertiesProps {
  data: ParallelNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ParallelNodeProperties({ data, onChange, nodeId }: ParallelNodePropertiesProps) {
  const mode = data.mode || 'broadcast'
  const forkCount = data.forkCount || 2
  const ejectChildNodes = useWorkflowStore(state => state.ejectChildNodes)

  // Handle mode change with child node ejection
  const handleModeChange = (newMode: string) => {
    // If switching from broadcast to fork, eject child nodes first
    if (mode === 'broadcast' && newMode === 'fork' && nodeId) {
      ejectChildNodes(nodeId)
    }
    onChange('mode', newMode)
  }

  return (
    <>
      {/* Mode Selection */}
      <div>
        <label style={labelStyle}>Parallel Mode</label>
        <select
          value={mode}
          onChange={(e) => handleModeChange(e.target.value)}
          style={selectStyle}
        >
          <option value="broadcast">Broadcast (container)</option>
          <option value="fork">Fork (edge-based)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {mode === 'broadcast' && 'Drag nodes into this container - all run in parallel with same input.'}
          {mode === 'fork' && 'Connect edges from output handles to different branch paths.'}
        </p>
      </div>

      {/* Fork Count - only in fork mode */}
      {mode === 'fork' && (
        <div>
          <label style={labelStyle}>Number of Branches</label>
          <input
            type="number"
            value={forkCount}
            onChange={(e) => onChange('forkCount', Math.max(2, Math.min(10, parseInt(e.target.value, 10) || 2)))}
            min={2}
            max={10}
            style={inputStyle}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Number of parallel output handles (2-10)
          </p>
        </div>
      )}

      {/* Fork Labels - only in fork mode */}
      {mode === 'fork' && (
        <div>
          <label style={labelStyle}>Branch Labels</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Array.from({ length: forkCount }, (_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  minWidth: '16px',
                }}>
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={data.forkLabels?.[i] || ''}
                  onChange={(e) => {
                    const newLabels = [...(data.forkLabels || [])]
                    newLabels[i] = e.target.value
                    onChange('forkLabels', newLabels)
                  }}
                  placeholder={`Branch ${i + 1}`}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '11px',
                  }}
                />
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Custom names for each branch (optional)
          </p>
        </div>
      )}

      {/* Wait Strategy */}
      <div>
        <label style={labelStyle}>Wait Strategy</label>
        <select
          value={data.waitFor || 'all'}
          onChange={(e) => onChange('waitFor', e.target.value)}
          style={selectStyle}
        >
          <option value="all">All (wait for all branches)</option>
          <option value="any">Any (first success)</option>
          <option value="race">Race (first to finish)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.waitFor === 'all' && 'Waits for all parallel branches to complete before continuing.'}
          {data.waitFor === 'any' && 'Continues when the first branch succeeds; ignores failures.'}
          {data.waitFor === 'race' && 'Continues when the first branch completes (success or failure).'}
        </p>
      </div>

      {/* Merge Strategy */}
      <div>
        <label style={labelStyle}>Merge Strategy</label>
        <select
          value={data.mergeStrategy || 'object'}
          onChange={(e) => onChange('mergeStrategy', e.target.value)}
          style={selectStyle}
        >
          <option value="object">Object (keyed by branch)</option>
          <option value="array">Array (list of outputs)</option>
          <option value="first">First (single result)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.mergeStrategy === 'object' && 'Outputs an object with branch IDs as keys.'}
          {data.mergeStrategy === 'array' && 'Outputs an array of all branch results.'}
          {data.mergeStrategy === 'first' && 'Outputs only the first successful result.'}
        </p>
      </div>

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>How to use:</strong>
        <p style={{ margin: '8px 0 0' }}>
          {mode === 'broadcast'
            ? 'Drag nodes into this container to run them in parallel. All child nodes will execute simultaneously and their outputs will be merged according to your selected strategy.'
            : 'Connect edges from each output handle to different nodes. Each connected path runs in parallel, and results are merged when all paths complete.'}
        </p>
      </div>
    </>
  )
}
