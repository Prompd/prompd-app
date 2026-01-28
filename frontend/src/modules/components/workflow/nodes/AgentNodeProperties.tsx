/**
 * AgentNodeProperties - Property editor for Agent nodes
 */

import { useState } from 'react'
import { Plus, Wrench, Trash2, X } from 'lucide-react'
import type { AgentNodeData, AgentTool } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'
import { LLMProviderConfig } from '../shared/property-components/LLMProviderConfig'

export interface AgentNodePropertiesProps {
  data: AgentNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function AgentNodeProperties({ data, onChange }: AgentNodePropertiesProps) {
  const [expandedToolIndex, setExpandedToolIndex] = useState<number | null>(null)

  const addTool = () => {
    const newTool: AgentTool = {
      name: '',
      description: '',
      toolType: 'function',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    }
    onChange('tools', [...(data.tools || []), newTool])
    setExpandedToolIndex((data.tools || []).length) // Expand the new tool
  }

  const updateTool = (index: number, field: string, value: unknown) => {
    const newTools = [...(data.tools || [])]
    newTools[index] = { ...newTools[index], [field]: value }
    onChange('tools', newTools)
  }

  const removeTool = (index: number) => {
    const newTools = (data.tools || []).filter((_, i) => i !== index)
    onChange('tools', newTools)
    if (expandedToolIndex === index) {
      setExpandedToolIndex(null)
    } else if (expandedToolIndex !== null && expandedToolIndex > index) {
      setExpandedToolIndex(expandedToolIndex - 1)
    }
  }

  // Parameter schema helpers
  const addParameter = (toolIndex: number) => {
    const tool = data.tools?.[toolIndex]
    if (!tool) return

    const params = tool.parameters || { type: 'object', properties: {}, required: [] }
    const existingNames = Object.keys(params.properties || {})
    let newName = 'param'
    let counter = 1
    while (existingNames.includes(newName)) {
      newName = `param${counter++}`
    }

    const newProperties = {
      ...params.properties,
      [newName]: { type: 'string', description: '' },
    }

    updateTool(toolIndex, 'parameters', {
      ...params,
      properties: newProperties,
    })
  }

  const updateParameter = (toolIndex: number, paramName: string, updates: { name?: string; type?: string; description?: string; isRequired?: boolean }) => {
    const tool = data.tools?.[toolIndex]
    if (!tool) return

    const params = tool.parameters || { type: 'object', properties: {}, required: [] }
    const properties = { ...params.properties }
    const required = [...(params.required || [])]

    // Handle name change
    if (updates.name !== undefined && updates.name !== paramName) {
      const paramValue = properties[paramName]
      delete properties[paramName]
      properties[updates.name] = paramValue

      // Update required array
      const reqIndex = required.indexOf(paramName)
      if (reqIndex !== -1) {
        required[reqIndex] = updates.name
      }
    }

    // Get current param name (after potential rename)
    const currentName = updates.name ?? paramName

    // Update type/description
    if (updates.type !== undefined || updates.description !== undefined) {
      properties[currentName] = {
        ...properties[currentName],
        ...(updates.type !== undefined && { type: updates.type }),
        ...(updates.description !== undefined && { description: updates.description }),
      }
    }

    // Handle required toggle
    if (updates.isRequired !== undefined) {
      const reqIndex = required.indexOf(currentName)
      if (updates.isRequired && reqIndex === -1) {
        required.push(currentName)
      } else if (!updates.isRequired && reqIndex !== -1) {
        required.splice(reqIndex, 1)
      }
    }

    updateTool(toolIndex, 'parameters', {
      type: 'object',
      properties,
      required,
    })
  }

  const removeParameter = (toolIndex: number, paramName: string) => {
    const tool = data.tools?.[toolIndex]
    if (!tool) return

    const params = tool.parameters || { type: 'object', properties: {}, required: [] }
    const properties = { ...params.properties }
    delete properties[paramName]

    const required = (params.required || []).filter(r => r !== paramName)

    updateTool(toolIndex, 'parameters', {
      type: 'object',
      properties,
      required,
    })
  }

  return (
    <>
      {/* System Prompt */}
      <div>
        <label style={labelStyle}>System Prompt</label>
        <textarea
          value={data.systemPrompt || ''}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
          placeholder="Define the agent's behavior and capabilities..."
          rows={4}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Instructions for the AI agent. Tool definitions are automatically appended.
        </p>
      </div>

      {/* User Prompt */}
      <div>
        <label style={labelStyle}>User Prompt (Task)</label>
        <textarea
          value={data.userPrompt || ''}
          onChange={(e) => onChange('userPrompt', e.target.value)}
          placeholder="{{ input }}"
          rows={2}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          The task/request to send to the agent. Use {'{{ input }}'} to pass through the previous node's output.
        </p>
      </div>

      {/* LLM Provider Config (Node/Inline toggle with provider selector) */}
      <LLMProviderConfig
        providerNodeId={data.providerNodeId}
        provider={data.provider}
        model={data.model}
        onProviderNodeChange={(nodeId) => onChange('providerNodeId', nodeId)}
        onProviderChange={(providerId) => onChange('provider', providerId)}
        onModelChange={(model) => onChange('model', model)}
      />

      {/* Max Iterations */}
      <div>
        <label style={labelStyle}>Max Iterations</label>
        <input
          type="number"
          value={data.maxIterations || 10}
          onChange={(e) => onChange('maxIterations', parseInt(e.target.value) || 10)}
          min={1}
          max={100}
          style={{ ...inputStyle, width: '100px' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Maximum number of reasoning/tool-use cycles before stopping.
        </p>
      </div>

      {/* Tool Call Format */}
      <div>
        <label style={labelStyle}>Tool Call Format</label>
        <select
          value={data.toolCallFormat || 'auto'}
          onChange={(e) => onChange('toolCallFormat', e.target.value)}
          style={selectStyle}
        >
          <option value="auto">Auto-detect</option>
          <option value="openai">OpenAI (function_call)</option>
          <option value="anthropic">Anthropic (tool_use)</option>
          <option value="xml">XML tags</option>
          <option value="json">Generic JSON</option>
        </select>
      </div>

      {/* Output Mode */}
      <div>
        <label style={labelStyle}>Output Mode</label>
        <select
          value={data.outputMode || 'final-response'}
          onChange={(e) => onChange('outputMode', e.target.value)}
          style={selectStyle}
        >
          <option value="final-response">Final Response Only</option>
          <option value="full-conversation">Full Conversation</option>
          <option value="last-tool-result">Last Tool Result</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.outputMode === 'final-response' && 'Output the LLM\'s final answer after all tool calls complete.'}
          {data.outputMode === 'full-conversation' && 'Output the complete conversation history including all tool calls.'}
          {data.outputMode === 'last-tool-result' && 'Output only the result from the last tool that was called.'}
          {!data.outputMode && 'Output the LLM\'s final answer after all tool calls complete.'}
        </p>
      </div>

      {/* Tools Section */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <label style={{ ...labelStyle, marginBottom: 0, fontSize: '13px', fontWeight: 600 }}>
            Tools ({(data.tools || []).length})
          </label>
          <button
            onClick={addTool}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add Tool
          </button>
        </div>

        {(data.tools || []).length === 0 && (
          <div style={{
            padding: '16px',
            background: 'var(--panel-2)',
            borderRadius: '6px',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '12px',
          }}>
            No tools defined. Add tools to enable the agent to take actions.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(data.tools || []).map((tool, index) => (
            <div
              key={index}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {/* Tool Header */}
              <div
                onClick={() => setExpandedToolIndex(expandedToolIndex === index ? null : index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--panel-2)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench style={{ width: 14, height: 14, color: 'var(--node-orange)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                    {tool.name || `Tool ${index + 1}`}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    color: 'var(--muted)',
                    background: 'var(--bg)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    {tool.toolType}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTool(index)
                  }}
                  style={{
                    color: 'var(--error)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {/* Tool Details (expanded) */}
              {expandedToolIndex === index && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Tool Name</label>
                    <input
                      type="text"
                      value={tool.name}
                      onChange={(e) => updateTool(index, 'name', e.target.value)}
                      placeholder="search_database"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Description</label>
                    <textarea
                      value={tool.description}
                      onChange={(e) => updateTool(index, 'description', e.target.value)}
                      placeholder="Search the database for relevant records..."
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Tool Type</label>
                    <select
                      value={tool.toolType}
                      onChange={(e) => updateTool(index, 'toolType', e.target.value)}
                      style={selectStyle}
                    >
                      <option value="function">Function (callback)</option>
                      <option value="http">HTTP Request</option>
                      <option value="mcp">MCP Server</option>
                      <option value="workflow">Sub-workflow</option>
                      <option value="command">Shell Command</option>
                      <option value="code">Code Execution</option>
                    </select>
                  </div>

                  {/* HTTP Config */}
                  {tool.toolType === 'http' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ width: '80px' }}>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>Method</label>
                          <select
                            value={tool.httpConfig?.method || 'GET'}
                            onChange={(e) => updateTool(index, 'httpConfig', {
                              ...tool.httpConfig,
                              method: e.target.value,
                            })}
                            style={{ ...selectStyle, fontSize: '11px', padding: '6px 8px' }}
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>URL</label>
                          <input
                            type="text"
                            value={tool.httpConfig?.url || ''}
                            onChange={(e) => updateTool(index, 'httpConfig', {
                              ...tool.httpConfig,
                              url: e.target.value,
                            })}
                            placeholder="https://api.example.com/search"
                            style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MCP Config */}
                  {tool.toolType === 'mcp' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                    }}>
                      <label style={{ ...labelStyle, fontSize: '10px' }}>MCP Server</label>
                      <input
                        type="text"
                        value={tool.mcpConfig?.serverName || ''}
                        onChange={(e) => updateTool(index, 'mcpConfig', {
                          ...tool.mcpConfig,
                          serverName: e.target.value,
                        })}
                        placeholder="Server name or URL"
                        style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                      />
                    </div>
                  )}

                  {/* Workflow Config */}
                  {tool.toolType === 'workflow' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                    }}>
                      <label style={{ ...labelStyle, fontSize: '10px' }}>Workflow Path</label>
                      <input
                        type="text"
                        value={tool.workflowConfig?.workflowPath || ''}
                        onChange={(e) => updateTool(index, 'workflowConfig', {
                          ...tool.workflowConfig,
                          workflowPath: e.target.value,
                        })}
                        placeholder="./sub-workflow.pdflow"
                        style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                      />
                    </div>
                  )}

                  {/* Command Config */}
                  {tool.toolType === 'command' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Executable</label>
                        <input
                          type="text"
                          value={tool.commandConfig?.executable || ''}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            executable: e.target.value,
                          })}
                          placeholder="npm, git, python, etc."
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Action</label>
                        <input
                          type="text"
                          value={tool.commandConfig?.action || ''}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            action: e.target.value,
                          })}
                          placeholder="install, status, run, etc."
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Arguments</label>
                        <input
                          type="text"
                          value={tool.commandConfig?.args || ''}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            args: e.target.value,
                          })}
                          placeholder="--save-dev express"
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={tool.commandConfig?.requiresApproval || false}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            requiresApproval: e.target.checked,
                          })}
                          style={{ cursor: 'pointer' }}
                        />
                        <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                          Requires user approval
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Code Config */}
                  {tool.toolType === 'code' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Language</label>
                        <select
                          value={tool.codeConfig?.language || 'javascript'}
                          onChange={(e) => updateTool(index, 'codeConfig', {
                            ...tool.codeConfig,
                            language: e.target.value,
                          })}
                          style={{ ...selectStyle, fontSize: '11px', padding: '6px 8px' }}
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="typescript">TypeScript</option>
                          <option value="python">Python</option>
                          <option value="csharp">C#</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Code Snippet</label>
                        <textarea
                          value={tool.codeConfig?.snippet || ''}
                          onChange={(e) => updateTool(index, 'codeConfig', {
                            ...tool.codeConfig,
                            snippet: e.target.value,
                          })}
                          placeholder="// Your code here..."
                          rows={6}
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px', resize: 'vertical', fontFamily: 'monospace' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Input Variable Name</label>
                        <input
                          type="text"
                          value={tool.codeConfig?.inputVariable || 'input'}
                          onChange={(e) => updateTool(index, 'codeConfig', {
                            ...tool.codeConfig,
                            inputVariable: e.target.value,
                          })}
                          placeholder="input"
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Parameter Schema Editor */}
                  <div style={{ marginTop: '4px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}>
                      <label style={{ ...labelStyle, fontSize: '11px', marginBottom: 0 }}>
                        Parameters ({Object.keys(tool.parameters?.properties || {}).length})
                      </label>
                      <button
                        onClick={() => addParameter(index)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '10px',
                          color: 'var(--accent)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 6px',
                        }}
                      >
                        <Plus style={{ width: 12, height: 12 }} />
                        Add
                      </button>
                    </div>

                    {Object.keys(tool.parameters?.properties || {}).length === 0 ? (
                      <div style={{
                        padding: '10px',
                        background: 'var(--panel-2)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: 'var(--muted)',
                        textAlign: 'center',
                      }}>
                        No parameters defined. The LLM will call this tool without arguments.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {Object.entries(tool.parameters?.properties || {}).map(([paramName, paramDef], paramIndex) => {
                          const isRequired = (tool.parameters?.required || []).includes(paramName)
                          return (
                            <div
                              key={`param-${index}-${paramIndex}`}
                              style={{
                                padding: '8px',
                                background: 'var(--panel-2)',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                <input
                                  type="text"
                                  value={paramName}
                                  onChange={(e) => updateParameter(index, paramName, { name: e.target.value })}
                                  placeholder="param_name"
                                  style={{
                                    ...inputStyle,
                                    flex: 1,
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    fontFamily: 'monospace',
                                  }}
                                />
                                <select
                                  value={paramDef.type || 'string'}
                                  onChange={(e) => updateParameter(index, paramName, { type: e.target.value })}
                                  style={{
                                    ...selectStyle,
                                    width: '80px',
                                    fontSize: '10px',
                                    padding: '4px 6px',
                                  }}
                                >
                                  <option value="string">string</option>
                                  <option value="number">number</option>
                                  <option value="integer">integer</option>
                                  <option value="boolean">boolean</option>
                                  <option value="array">array</option>
                                  <option value="object">object</option>
                                </select>
                                <button
                                  onClick={() => removeParameter(index, paramName)}
                                  style={{
                                    color: 'var(--error)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                  title="Remove parameter"
                                >
                                  <X style={{ width: 12, height: 12 }} />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={paramDef.description || ''}
                                onChange={(e) => updateParameter(index, paramName, { description: e.target.value })}
                                placeholder="Description for the LLM..."
                                style={{
                                  ...inputStyle,
                                  fontSize: '10px',
                                  padding: '4px 8px',
                                  marginBottom: '4px',
                                }}
                              />
                              <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '10px',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}>
                                <input
                                  type="checkbox"
                                  checked={isRequired}
                                  onChange={(e) => updateParameter(index, paramName, { isRequired: e.target.checked })}
                                  style={{ margin: 0, width: '12px', height: '12px' }}
                                />
                                Required
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Agent Loop Explanation */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--node-indigo)' }}>How it works:</strong>
        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li>Send prompt + tools to LLM</li>
          <li>Parse response for tool calls</li>
          <li>Execute tools, feed results back</li>
          <li>Repeat until final answer or max iterations</li>
        </ol>
      </div>
    </>
  )
}
