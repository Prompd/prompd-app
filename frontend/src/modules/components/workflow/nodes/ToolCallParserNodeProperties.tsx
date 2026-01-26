/**
 * ToolCallParserNodeProperties - Property editor for Tool Call Parser nodes
 */

import type { ToolCallParserNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface ToolCallParserNodePropertiesProps {
  data: ToolCallParserNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ToolCallParserNodeProperties({ data, onChange }: ToolCallParserNodePropertiesProps) {
  const addAllowedTool = () => {
    const newTools = [...(data.allowedTools || []), '']
    onChange('allowedTools', newTools)
  }

  const updateAllowedTool = (index: number, value: string) => {
    const newTools = [...(data.allowedTools || [])]
    newTools[index] = value
    onChange('allowedTools', newTools)
  }

  const removeAllowedTool = (index: number) => {
    const newTools = (data.allowedTools || []).filter((_, i) => i !== index)
    onChange('allowedTools', newTools)
  }

  return (
    <>
      {/* Outputs explanation */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginBottom: '8px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
          Two Outputs:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--success)',
              flexShrink: 0,
            }} />
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--success)' }}>Found</strong> - Tool call detected, outputs parsed tool info
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--muted)',
              flexShrink: 0,
              marginLeft: '1px',
            }} />
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--muted)' }}>Not Found</strong> - No tool call, outputs original text
            </div>
          </div>
        </div>
      </div>

      {/* Format Selection */}
      <div>
        <label style={labelStyle}>Parse Format</label>
        <select
          value={data.format || 'auto'}
          onChange={(e) => onChange('format', e.target.value)}
          style={selectStyle}
        >
          <option value="auto">Auto-detect</option>
          <option value="openai">OpenAI (tool_calls array)</option>
          <option value="anthropic">Anthropic (tool_use blocks)</option>
          <option value="xml">XML tags</option>
          <option value="json">Generic JSON</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.format === 'auto' && 'Automatically detect the tool call format from the LLM response.'}
          {data.format === 'openai' && 'Parse OpenAI function calling format (tool_calls array).'}
          {data.format === 'anthropic' && 'Parse Anthropic tool_use content blocks.'}
          {data.format === 'xml' && 'Parse XML-style <tool_call> tags.'}
          {data.format === 'json' && 'Parse generic JSON with configurable field names.'}
        </p>
      </div>

      {/* JSON format options */}
      {data.format === 'json' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name Field</label>
            <input
              type="text"
              value={data.jsonToolNameField || 'tool'}
              onChange={(e) => onChange('jsonToolNameField', e.target.value)}
              placeholder="tool"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Parameters Field</label>
            <input
              type="text"
              value={data.jsonParametersField || 'parameters'}
              onChange={(e) => onChange('jsonParametersField', e.target.value)}
              placeholder="parameters"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* XML format options */}
      {data.format === 'xml' && (
        <div>
          <label style={labelStyle}>XML Tag Name</label>
          <input
            type="text"
            value={data.xmlTagName || 'tool_call'}
            onChange={(e) => onChange('xmlTagName', e.target.value)}
            placeholder="tool_call"
            style={inputStyle}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Will look for {'<tag_name><name>...</name><params>...</params></tag_name>'}
          </p>
        </div>
      )}

      {/* Allowed Tools */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Allowed Tools (optional)</label>
          <button
            onClick={addAllowedTool}
            style={{
              fontSize: '12px',
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {(data.allowedTools || []).map((tool, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={tool}
                onChange={(e) => updateAllowedTool(index, e.target.value)}
                placeholder={`Tool name ${index + 1}`}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => removeAllowedTool(index)}
                style={{
                  color: 'var(--error)',
                  fontSize: '11px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                Remove
              </button>
            </div>
          ))}
          {(!data.allowedTools || data.allowedTools.length === 0) && (
            <p style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
              Leave empty to allow any tool name. If specified, unrecognized tools go to "Not Found" output.
            </p>
          )}
        </div>
      </div>

      {/* Found output data structure */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--success)' }}>Found Output:</strong>
        <pre style={{
          margin: '6px 0 0 0',
          padding: '8px',
          background: 'var(--bg)',
          borderRadius: '4px',
          fontSize: '10px',
          overflow: 'auto',
        }}>
{`{
  hasToolCall: true,
  toolName: "search",
  toolParameters: { query: "..." },
  format: "openai"
}`}
        </pre>
      </div>
    </>
  )
}
