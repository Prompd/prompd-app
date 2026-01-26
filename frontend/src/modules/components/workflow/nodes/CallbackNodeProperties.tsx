/**
 * CallbackNodeProperties - Property editor for Callback nodes
 */

import { useMemo } from 'react'
import { ShieldCheck, Webhook, Bot, RotateCcw, MessageSquare, Activity } from 'lucide-react'
import type { CallbackNodeData, AgentCheckpointEventType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface CallbackNodePropertiesProps {
  data: CallbackNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function CallbackNodeProperties({ data, onChange, nodeId }: CallbackNodePropertiesProps) {
  // Detect source node type for context-aware options
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  const { sourceNodeType, sourceHandle, isConnectedToCheckpointHandle } = useMemo(() => {
    if (!nodeId) return { sourceNodeType: null, sourceHandle: null, isConnectedToCheckpointHandle: false }
    const incomingEdge = edges.find(e => e.target === nodeId)
    if (!incomingEdge) return { sourceNodeType: null, sourceHandle: null, isConnectedToCheckpointHandle: false }
    const sourceNode = nodes.find(n => n.id === incomingEdge.source)
    const nodeType = sourceNode?.type || null
    const handleId = incomingEdge.sourceHandle || null
    // Check if connected to ANY node's onCheckpoint handle
    const isFromCheckpoint = handleId === 'onCheckpoint'
    return { sourceNodeType: nodeType, sourceHandle: handleId, isConnectedToCheckpointHandle: isFromCheckpoint }
  }, [edges, nodes, nodeId])

  const isConnectedToAgent = sourceNodeType === 'agent'
  const isConnectedToLoop = sourceNodeType === 'loop'
  const isConnectedToPrompt = sourceNodeType === 'prompt'
  const isConnectedToGuardrail = sourceNodeType === 'guardrail'
  const isConnectedToChatAgent = sourceNodeType === 'chat-agent'

  // Checkbox style helper
  const checkboxRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '6px 0',
  }

  return (
    <>
      {/* Checkpoint Name */}
      <div>
        <label style={labelStyle}>Checkpoint Name</label>
        <input
          type="text"
          value={data.checkpointName || ''}
          onChange={(e) => onChange('checkpointName', e.target.value)}
          placeholder="e.g., after-validation"
          style={inputStyle}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Identifier for this checkpoint in logs and execution history
        </p>
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="What this checkpoint monitors"
          style={inputStyle}
        />
      </div>

      {/* Behaviors Section */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginTop: '4px',
      }}>
        <label style={{ ...labelStyle, marginBottom: '8px' }}>Behaviors</label>
        <p style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '12px' }}>
          Enable one or more behaviors. Combine them as needed.
        </p>

        {/* Log to Console */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.logToConsole || false}
            onChange={(e) => onChange('logToConsole', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>Log to console</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Write checkpoint data to stdout
            </span>
          </div>
        </label>

        {/* Log to History */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.logToHistory || false}
            onChange={(e) => onChange('logToHistory', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>Log to execution history</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Store for later review
            </span>
          </div>
        </label>

        {/* Pause in Debug */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.pauseInDebug || false}
            onChange={(e) => onChange('pauseInDebug', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, color: 'var(--node-amber)' }}>Pause in debug mode</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Breakpoint for inspection
            </span>
          </div>
        </label>

        {/* Require Approval */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.requireApproval || false}
            onChange={(e) => onChange('requireApproval', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, color: 'var(--node-orange)' }}>Require approval</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Human gate (works in production)
            </span>
          </div>
        </label>

        {/* Send Webhook */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.sendWebhook || false}
            onChange={(e) => onChange('sendWebhook', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, color: 'var(--node-teal)' }}>Send webhook</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              HTTP notification
            </span>
          </div>
        </label>
      </div>

      {/* Message Template */}
      <div>
        <label style={labelStyle}>Message (optional)</label>
        <textarea
          value={data.message || ''}
          onChange={(e) => onChange('message', e.target.value)}
          placeholder="Status: Processing completed for {{ previous_output.id }}"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Template with {'{{ }}'} expressions for dynamic content
        </p>
      </div>

      {/* Data Capture Options */}
      <div>
        <label style={labelStyle}>Data to Capture</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.capturePreviousOutput !== false}
              onChange={(e) => onChange('capturePreviousOutput', e.target.checked)}
            />
            Previous node output
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.captureTimestamp !== false}
              onChange={(e) => onChange('captureTimestamp', e.target.checked)}
            />
            Timestamp & duration
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.captureFullContext || false}
              onChange={(e) => onChange('captureFullContext', e.target.checked)}
            />
            Full execution context (variables, state)
          </label>
        </div>
      </div>

      {/* Approval Options - shown when requireApproval is enabled */}
      {data.requireApproval && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-orange) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-orange) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <ShieldCheck style={{ width: 14, height: 14, color: 'var(--node-orange)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-orange)' }}>
              Approval Settings
            </label>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>Dialog Title</label>
            <input
              type="text"
              value={data.approvalTitle || ''}
              onChange={(e) => onChange('approvalTitle', e.target.value)}
              placeholder="Review Required"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>Instructions</label>
            <textarea
              value={data.approvalInstructions || ''}
              onChange={(e) => onChange('approvalInstructions', e.target.value)}
              placeholder="Please review the data and approve to continue..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontSize: '11px' }}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>Timeout (ms, 0 = wait forever)</label>
            <input
              type="number"
              value={data.approvalTimeoutMs || 0}
              onChange={(e) => onChange('approvalTimeoutMs', parseInt(e.target.value, 10))}
              min={0}
              step={60000}
              style={inputStyle}
            />
          </div>

          {(data.approvalTimeoutMs ?? 0) > 0 && (
            <div>
              <label style={{ ...labelStyle, fontSize: '11px' }}>On Timeout</label>
              <select
                value={data.approvalTimeoutAction || 'fail'}
                onChange={(e) => onChange('approvalTimeoutAction', e.target.value)}
                style={selectStyle}
              >
                <option value="fail">Fail workflow</option>
                <option value="continue">Continue anyway</option>
                <option value="skip">Skip this step</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Webhook Options - shown when sendWebhook is enabled */}
      {data.sendWebhook && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-teal) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-teal) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <Webhook style={{ width: 14, height: 14, color: 'var(--node-teal)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-teal)' }}>
              Webhook Settings
            </label>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>URL</label>
            <input
              type="url"
              value={data.webhookUrl || ''}
              onChange={(e) => onChange('webhookUrl', e.target.value)}
              placeholder="https://api.example.com/webhook"
              style={inputStyle}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={data.webhookWaitForAck || false}
              onChange={(e) => onChange('webhookWaitForAck', e.target.checked)}
            />
            Wait for acknowledgment before continuing
          </label>

          {data.webhookWaitForAck && (
            <div>
              <label style={{ ...labelStyle, fontSize: '11px' }}>Ack Timeout (ms, 0 = no timeout)</label>
              <input
                type="number"
                value={data.webhookAckTimeoutMs || 0}
                onChange={(e) => onChange('webhookAckTimeoutMs', parseInt(e.target.value, 10))}
                min={0}
                step={1000}
                style={inputStyle}
              />
            </div>
          )}
        </div>
      )}

      {/* Pre-Node Aware: Agent options */}
      {isConnectedToAgent && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-indigo) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-indigo) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <Bot style={{ width: 14, height: 14, color: 'var(--node-indigo)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-indigo)' }}>
              Agent Data Capture
            </label>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '10px' }}>
            Connected to Agent node. Capture agent-specific execution data.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureIterations ?? false}
                onChange={(e) => onChange('agentCaptureIterations', e.target.checked)}
              />
              Iteration history (LLM calls)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureConversation ?? false}
                onChange={(e) => onChange('agentCaptureConversation', e.target.checked)}
              />
              Conversation history
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureToolCalls ?? false}
                onChange={(e) => onChange('agentCaptureToolCalls', e.target.checked)}
              />
              Tool call details & results
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureThinking ?? false}
                onChange={(e) => onChange('agentCaptureThinking', e.target.checked)}
              />
              Thinking/reasoning (if available)
            </label>
          </div>
        </div>
      )}

      {/* Pre-Node Aware: Loop options */}
      {isConnectedToLoop && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-green) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-green) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <RotateCcw style={{ width: 14, height: 14, color: 'var(--node-green)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-green)' }}>
              Loop Data Capture
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.loopCaptureIteration ?? true}
                onChange={(e) => onChange('loopCaptureIteration', e.target.checked)}
              />
              Current iteration index
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.loopCaptureVariable ?? true}
                onChange={(e) => onChange('loopCaptureVariable', e.target.checked)}
              />
              Loop variable value
            </label>
          </div>
        </div>
      )}

      {/* Pre-Node Aware: Prompt options */}
      {isConnectedToPrompt && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-blue) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-blue) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <MessageSquare style={{ width: 14, height: 14, color: 'var(--node-blue)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-blue)' }}>
              Prompt Data Capture
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.promptCaptureCompiled ?? false}
                onChange={(e) => onChange('promptCaptureCompiled', e.target.checked)}
              />
              Compiled prompt (sent to LLM)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.promptCaptureTokens ?? false}
                onChange={(e) => onChange('promptCaptureTokens', e.target.checked)}
              />
              Token usage stats
            </label>
          </div>
        </div>
      )}

      {/* Event Subscription - shown when connected to ANY node's onCheckpoint handle */}
      {isConnectedToCheckpointHandle && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-amber) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-amber) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <Activity style={{ width: 14, height: 14, color: 'var(--node-amber)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-amber)' }}>
              Event Subscription
            </label>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '10px' }}>
            Connected to {sourceNodeType}'s checkpoint output. Select which events trigger this checkpoint.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Agent Node Events */}
            {sourceNodeType === 'agent' && [
              { value: 'toolCall', label: 'Tool Calls', desc: 'When agent requests tool execution' },
              { value: 'iteration', label: 'Iterations', desc: 'After each LLM response' },
              { value: 'thinking', label: 'Thinking', desc: 'Agent reasoning/chain-of-thought' },
              { value: 'error', label: 'Errors', desc: 'When errors occur' },
              { value: 'complete', label: 'Complete', desc: 'When agent finishes' },
            ].map(eventType => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={eventType.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['toolCall', 'iteration', 'thinking', 'error', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}

            {/* ChatAgent Node Events */}
            {sourceNodeType === 'chat-agent' && [
              { value: 'iteration', label: 'User Input', desc: 'onUserInput checkpoint' },
              { value: 'iteration', label: 'Before Guardrail', desc: 'beforeGuardrail checkpoint' },
              { value: 'iteration', label: 'After Guardrail', desc: 'afterGuardrail checkpoint' },
              { value: 'iteration', label: 'Iteration Start', desc: 'onIterationStart checkpoint' },
              { value: 'iteration', label: 'Iteration End', desc: 'onIterationEnd checkpoint' },
              { value: 'toolCall', label: 'Tool Call', desc: 'onToolCall checkpoint' },
              { value: 'toolCall', label: 'Tool Result', desc: 'onToolResult checkpoint' },
              { value: 'complete', label: 'Complete', desc: 'onAgentComplete checkpoint' },
            ].map((eventType, index) => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={`${eventType.value}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['iteration', 'toolCall', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}

            {/* Guardrail Node Events */}
            {sourceNodeType === 'guardrail' && [
              { value: 'iteration', label: 'Before Validation', desc: 'Before LLM validation' },
              { value: 'error', label: 'Errors', desc: 'When validation fails' },
              { value: 'complete', label: 'Complete', desc: 'Validation result (pass/reject)' },
            ].map(eventType => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={eventType.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['iteration', 'error', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}

            {/* Prompt Node Events */}
            {sourceNodeType === 'prompt' && [
              { value: 'iteration', label: 'Before Execution', desc: 'Before prompt is sent to LLM' },
              { value: 'error', label: 'Errors', desc: 'When execution fails' },
              { value: 'complete', label: 'Complete', desc: 'LLM response received' },
            ].map(eventType => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={eventType.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['iteration', 'error', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '10px', fontStyle: 'italic' }}>
            {(!data.listenTo || data.listenTo.length === 0)
              ? 'Subscribed to all events'
              : `Subscribed to: ${data.listenTo.join(', ')}`}
          </p>
        </div>
      )}
    </>
  )
}

// Helper function to get code placeholder based on language
function getCodePlaceholder(language: string): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return `// Input is available as 'input' variable
// Return the result to pass to next node

const result = input.toUpperCase();
return result;`
    case 'python':
      return `# Input is available as 'input' variable
# Print the result to pass to next node

result = input.upper()
print(result)`
    case 'csharp':
      return `// Input is available as 'input' variable
// Return the result to pass to next node

var result = input.ToUpper();
return result;`
    default:
      return '// Enter your code here'
  }
}

