/**
 * UserInputNodeProperties - Property editor for User Input nodes
 */

import type { UserInputNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface UserInputNodePropertiesProps {
  data: UserInputNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function UserInputNodeProperties({ data, onChange }: UserInputNodePropertiesProps) {
  const addChoice = () => {
    const newChoices = [...(data.choices || []), '']
    onChange('choices', newChoices)
  }

  const updateChoice = (index: number, value: string) => {
    const newChoices = [...(data.choices || [])]
    newChoices[index] = value
    onChange('choices', newChoices)
  }

  const removeChoice = (index: number) => {
    const newChoices = (data.choices || []).filter((_, i) => i !== index)
    onChange('choices', newChoices)
  }

  return (
    <>
      {/* Prompt */}
      <div>
        <label style={labelStyle}>Prompt Message</label>
        <textarea
          value={data.prompt || ''}
          onChange={(e) => onChange('prompt', e.target.value)}
          placeholder="Enter your message here..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Supports {'{{ }}'} template expressions
        </p>
      </div>

      {/* Input Type */}
      <div>
        <label style={labelStyle}>Input Type</label>
        <select
          value={data.inputType || 'text'}
          onChange={(e) => onChange('inputType', e.target.value)}
          style={selectStyle}
        >
          <option value="text">Single Line Text</option>
          <option value="textarea">Multi-line Text</option>
          <option value="choice">Multiple Choice</option>
          <option value="confirm">Yes/No Confirmation</option>
          <option value="number">Number</option>
        </select>
      </div>

      {/* Choices (for choice type) */}
      {data.inputType === 'choice' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Choices</label>
            <button
              onClick={addChoice}
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
            {(data.choices || []).map((choice, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={choice}
                  onChange={(e) => updateChoice(index, e.target.value)}
                  placeholder={`Choice ${index + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => removeChoice(index)}
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
            {(!data.choices || data.choices.length === 0) && (
              <p style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                Add choices for the user to select from
              </p>
            )}
          </div>
        </div>
      )}

      {/* Placeholder */}
      {(data.inputType === 'text' || data.inputType === 'textarea' || data.inputType === 'number') && (
        <div>
          <label style={labelStyle}>Placeholder</label>
          <input
            type="text"
            value={data.placeholder || ''}
            onChange={(e) => onChange('placeholder', e.target.value)}
            placeholder="Placeholder text..."
            style={inputStyle}
          />
        </div>
      )}

      {/* Default Value */}
      {data.inputType !== 'confirm' && (
        <div>
          <label style={labelStyle}>Default Value</label>
          <input
            type={data.inputType === 'number' ? 'number' : 'text'}
            value={data.defaultValue || ''}
            onChange={(e) => onChange('defaultValue', e.target.value)}
            placeholder="Default value (optional)"
            style={inputStyle}
          />
        </div>
      )}

      {/* Required */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={data.required || false}
            onChange={(e) => onChange('required', e.target.checked)}
          />
          Required input
        </label>
      </div>

      {/* Show Context */}
      <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={data.showContext || false}
            onChange={(e) => onChange('showContext', e.target.checked)}
          />
          Show previous output to user
        </label>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Displays the previous node's output as context
        </p>
      </div>

      {/* Context Template (if showing context) */}
      {data.showContext && (
        <div>
          <label style={labelStyle}>Context Template (optional)</label>
          <textarea
            value={data.contextTemplate || ''}
            onChange={(e) => onChange('contextTemplate', e.target.value)}
            placeholder="Custom template for context display..."
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Use {'{{ previous_output }}'} to reference the output
          </p>
        </div>
      )}

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>Use cases:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
          <li>Interactive chat workflows</li>
          <li>Human-in-the-loop approval</li>
          <li>Data collection mid-workflow</li>
          <li>Debugging with manual input</li>
        </ul>
      </div>
    </>
  )
}
