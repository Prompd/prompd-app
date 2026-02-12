/**
 * ToolNodeProperties - Property editor for Tool nodes
 */

import { Editor } from '@monaco-editor/react'
import { Code, Server, Globe, Wrench, Braces, Maximize2 } from 'lucide-react'
import type { ToolNodeData } from '../../../services/workflowTypes'
import { useUIStore } from '../../../../stores/uiStore'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'
import { getMonacoTheme } from '../../../lib/monacoConfig'
import { hasVariables, VariablePreview } from '../../common/VariableReference'

export interface ToolNodePropertiesProps {
  data: ToolNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
  onExpandEditor?: (content: string, language: string, label: string, field: string) => void
}

// Helper function for code placeholders
function getCodePlaceholder(language: string): string {
  switch (language) {
    case 'typescript':
      return `// input contains the previous node's output\nreturn { result: input.data }`
    case 'javascript':
      return `// input contains the previous node's output\nreturn { result: input.data }`
    case 'python':
      return `# input contains the previous node's output\nreturn {"result": input["data"]}`
    case 'csharp':
      return `// input contains the previous node's output\nreturn new { result = input.data };`
    default:
      return `// input contains the previous node's output\nreturn { result: input.data }`
  }
}

export function ToolNodeProperties({ data, onChange, onExpandEditor }: ToolNodePropertiesProps) {
  const theme = useUIStore(state => state.theme)
  const toolType = data.toolType || 'function'

  // Check if code contains {{ }} variables
  const codeHasVariables = toolType === 'code' && hasVariables(data.codeSnippet || '')

  // Get Monaco language for code editor
  const getMonacoLanguage = (): string => {
    switch (data.codeLanguage || 'typescript') {
      case 'typescript': return 'typescript'
      case 'javascript': return 'javascript'
      case 'python': return 'python'
      case 'csharp': return 'csharp'
      default: return 'typescript'
    }
  }

  // Get icon for tool type
  const getToolTypeIcon = () => {
    switch (toolType) {
      case 'function':
        return <Code style={{ width: 14, height: 14 }} />
      case 'mcp':
        return <Server style={{ width: 14, height: 14 }} />
      case 'http':
        return <Globe style={{ width: 14, height: 14 }} />
      default:
        return <Wrench style={{ width: 14, height: 14 }} />
    }
  }

  return (
    <>
      {/* Tool Type */}
      <div>
        <label style={labelStyle}>Tool Type</label>
        <select
          value={toolType}
          onChange={(e) => onChange('toolType', e.target.value)}
          style={selectStyle}
        >
          <option value="function">Function (registered callback)</option>
          <option value="mcp">MCP Server Tool</option>
          <option value="http">HTTP Request</option>
          <option value="command">Shell Command</option>
          <option value="code">Code Snippet</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {toolType === 'function' && 'Call a function/callback registered with the workflow executor.'}
          {toolType === 'mcp' && 'Call a tool exposed by an MCP (Model Context Protocol) server.'}
          {toolType === 'http' && 'Make an HTTP request to an external API.'}
          {toolType === 'command' && 'Execute a whitelisted shell command (npm, git, python, etc.).'}
          {toolType === 'code' && 'Execute a code snippet in TypeScript, Python, or C#.'}
        </p>
      </div>

      {/* Tool Name (for function and mcp) */}
      {(toolType === 'function' || toolType === 'mcp') && (
        <div>
          <label style={labelStyle}>
            {toolType === 'function' ? 'Function Name' : 'Tool Name'}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {getToolTypeIcon()}
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder={toolType === 'function' ? 'e.g., searchDatabase' : 'e.g., web_search'}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            {toolType === 'function'
              ? 'Must match a function name registered in the executor options.'
              : 'The tool name as exposed by the MCP server.'}
          </p>
        </div>
      )}

      {/* MCP Server (for mcp type) */}
      {toolType === 'mcp' && (
        <>
          <div>
            <label style={labelStyle}>MCP Server</label>
            <input
              type="text"
              value={data.mcpServerName || ''}
              onChange={(e) => onChange('mcpServerName', e.target.value)}
              placeholder="Server name (from config) or leave blank for URL"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>MCP Server URL (if not using named server)</label>
            <input
              type="text"
              value={data.mcpServerUrl || ''}
              onChange={(e) => onChange('mcpServerUrl', e.target.value)}
              placeholder="e.g., http://localhost:3333"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* HTTP Configuration (for http type) */}
      {toolType === 'http' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name</label>
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder="e.g., api_call, weather"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The name the LLM will use to call this tool
            </p>
          </div>
          <div>
            <label style={labelStyle}>HTTP Method</label>
            <select
              value={data.httpMethod || 'GET'}
              onChange={(e) => onChange('httpMethod', e.target.value)}
              style={selectStyle}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>URL</label>
            <input
              type="text"
              value={data.httpUrl || ''}
              onChange={(e) => onChange('httpUrl', e.target.value)}
              placeholder="https://api.example.com/endpoint"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Supports {'{{ }}'} template expressions
            </p>
          </div>
          <div>
            <label style={labelStyle}>Request Body (for POST/PUT/PATCH)</label>
            <textarea
              value={data.httpBody || ''}
              onChange={(e) => onChange('httpBody', e.target.value)}
              placeholder='{"key": "{{ previous_output }}"}'
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
            />
          </div>
        </>
      )}

      {/* Command Configuration (for command type) */}
      {toolType === 'command' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name</label>
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder="e.g., echo, git_status"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The name the LLM will use to call this tool
            </p>
          </div>
          <div>
            <label style={labelStyle}>Executable</label>
            <select
              value={data.commandExecutable || ''}
              onChange={(e) => onChange('commandExecutable', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select a command...</option>
              <optgroup label="Package Managers">
                <option value="npm">npm - Node.js package manager</option>
                <option value="yarn">yarn - Yarn package manager</option>
                <option value="pnpm">pnpm - PNPM package manager</option>
                <option value="pip">pip - Python package manager</option>
              </optgroup>
              <optgroup label="Runtimes">
                <option value="node">node - Node.js runtime</option>
                <option value="npx">npx - Execute npm packages</option>
                <option value="python">python - Python interpreter</option>
                <option value="python3">python3 - Python 3 interpreter</option>
              </optgroup>
              <optgroup label="Build Tools">
                <option value="tsc">tsc - TypeScript compiler</option>
                <option value="dotnet">dotnet - .NET CLI</option>
                <option value="prompd">prompd - Prompd CLI</option>
              </optgroup>
              <optgroup label="Version Control">
                <option value="git">git - Version control</option>
              </optgroup>
              <optgroup label="Utilities">
                <option value="eslint">eslint - JavaScript linter</option>
                <option value="prettier">prettier - Code formatter</option>
                <option value="echo">echo - Print text</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Action/Subcommand (optional)</label>
            <input
              type="text"
              value={data.commandAction || ''}
              onChange={(e) => onChange('commandAction', e.target.value)}
              placeholder="e.g., run, install, build"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Common actions: run, install, build, test, start
            </p>
          </div>
          <div>
            <label style={labelStyle}>Arguments</label>
            <input
              type="text"
              value={data.commandArgs || ''}
              onChange={(e) => onChange('commandArgs', e.target.value)}
              placeholder="e.g., {{ script_name }} --flag"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Supports {'{{ }}'} template expressions
            </p>
          </div>
          <div>
            <label style={labelStyle}>Working Directory (optional)</label>
            <input
              type="text"
              value={data.commandCwd || ''}
              onChange={(e) => onChange('commandCwd', e.target.value)}
              placeholder="Relative to workspace (leave blank for workspace root)"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              id="commandRequiresApproval"
              checked={data.commandRequiresApproval || false}
              onChange={(e) => onChange('commandRequiresApproval', e.target.checked)}
            />
            <label htmlFor="commandRequiresApproval" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Require approval before execution
            </label>
          </div>
        </>
      )}

      {/* Code Configuration (for code type) - Using CodeNode-style properties */}
      {toolType === 'code' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name</label>
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder="e.g., typescript, calculate"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The name the LLM will use to call this tool
            </p>
          </div>
          {/* Language */}
          <div>
            <label style={labelStyle}>Language</label>
            <select
              value={data.codeLanguage || 'typescript'}
              onChange={(e) => onChange('codeLanguage', e.target.value)}
              style={selectStyle}
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="csharp">C#</option>
            </select>
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {(data.codeLanguage === 'typescript' || data.codeLanguage === 'javascript' || !data.codeLanguage)
                && 'Inline execution via Node.js VM (isolated) or main process'}
              {data.codeLanguage === 'python' && 'Subprocess via python -c (process-isolated, has OS access)'}
              {data.codeLanguage === 'csharp' && 'Subprocess via dotnet run (process-isolated, has OS access)'}
            </div>
          </div>

          {/* Input Variable Name */}
          <div>
            <label style={labelStyle}>Input Variable Name</label>
            <input
              type="text"
              value={data.codeInputVariable || 'input'}
              onChange={(e) => onChange('codeInputVariable', e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder='input'
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Name of the variable that receives the previous node's output
            </div>
          </div>

          {/* Execution Context (TS/JS only) */}
          {(data.codeLanguage === 'typescript' || data.codeLanguage === 'javascript' || !data.codeLanguage) && (
            <div>
              <label style={labelStyle}>Execution Context</label>
              <select
                value={data.codeExecutionContext || 'isolated'}
                onChange={(e) => onChange('codeExecutionContext', e.target.value)}
                style={selectStyle}
              >
                <option value="isolated">Isolated (VM)</option>
                <option value="main">Main Process</option>
              </select>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                {data.codeExecutionContext === 'main'
                  ? 'Full Node.js access including require and file system (use with caution)'
                  : 'Sandboxed — no require, process, or file system access'}
              </div>
            </div>
          )}

          {/* Isolation note for Python/C# */}
          {(data.codeLanguage === 'python' || data.codeLanguage === 'csharp') && (
            <div style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Runs as a subprocess — isolated from the workflow engine but has full OS access (file system, network, environment variables).
            </div>
          )}

          {/* Code Editor */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={labelStyle}>Code</label>
              {onExpandEditor && (
                <button
                  onClick={() => onExpandEditor(
                    data.codeSnippet || '',
                    getMonacoLanguage(),
                    'Code Snippet',
                    'codeSnippet'
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
                height: '200px',
              }}
            >
              <Editor
                value={data.codeSnippet || ''}
                onChange={(val) => onChange('codeSnippet', val || '')}
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
                }}
              />
            </div>

            {/* Variable Preview - shows pills for {{ }} syntax in code */}
            {codeHasVariables && (
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
                <VariablePreview text={data.codeSnippet || ''} size="sm" />
              </div>
            )}

            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {getCodePlaceholder(data.codeLanguage || 'typescript').split('\n')[0]}
            </div>
          </div>
        </>
      )}

      {/* Description */}
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Brief description of what this tool does"
          style={inputStyle}
        />
      </div>

      {/* Timeout */}
      <div>
        <label style={labelStyle}>Timeout (ms)</label>
        <input
          type="number"
          value={data.timeout || 30000}
          onChange={(e) => onChange('timeout', parseInt(e.target.value, 10))}
          min={0}
          step={1000}
          style={inputStyle}
        />
      </div>

      {/* Output Transform */}
      <div>
        <label style={labelStyle}>Output Transform (optional)</label>
        <textarea
          value={data.outputTransform || ''}
          onChange={(e) => onChange('outputTransform', e.target.value)}
          placeholder='{{ result }} for full output, {{ result.fieldName }} to extract fields'
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Transform tool output before passing to next node. Use `result` to access tool output. Leave blank to pass through unchanged.
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
        <strong style={{ color: 'var(--text)' }}>Tool Node:</strong>
        <p style={{ margin: '8px 0 0' }}>
          Execute external tools, APIs, or MCP server capabilities and use the result in your workflow.
        </p>
      </div>
    </>
  )
}
