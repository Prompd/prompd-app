/**
 * OutputNodeProperties - Property editor for Output nodes
 */

import type { OutputNodeData } from '../../../services/workflowTypes'

export interface OutputNodePropertiesProps {
  data: OutputNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function OutputNodeProperties({ data, onChange }: OutputNodePropertiesProps) {
  return (
    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
      <p style={{ marginBottom: '8px' }}>
        The Output node marks the end of the workflow and collects the final result.
      </p>
      <p>
        Connect the last node in your workflow to this output to capture its result.
      </p>
    </div>
  )
}
