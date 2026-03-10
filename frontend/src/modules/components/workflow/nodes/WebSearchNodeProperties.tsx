/**
 * WebSearchNodeProperties - Property editor for Web Search nodes
 *
 * When a web-search connection is selected (via the common ConnectionSelector),
 * provider and API key come from the connection. Otherwise shows inline config.
 */

import type { WebSearchNodeData } from '../../../services/workflowTypes'
import { useConnection } from '../shared/hooks/useNodeConnections'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface WebSearchNodePropertiesProps {
  data: WebSearchNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

const PROVIDER_INFO: Record<string, { label: string; needsApiKey: boolean; description: string }> = {
  langsearch: { label: 'LangSearch', needsApiKey: true, description: 'Free web search API with AI summaries' },
  brave: { label: 'Brave Search', needsApiKey: true, description: 'Brave Search API (requires API key)' },
  tavily: { label: 'Tavily', needsApiKey: true, description: 'AI-optimized search API (requires API key)' },
}

export function WebSearchNodeProperties({ data, onChange }: WebSearchNodePropertiesProps) {
  const connection = useConnection(data.connectionId)
  const hasConnection = !!connection

  const provider = data.provider || 'langsearch'
  const providerInfo = PROVIDER_INFO[provider]

  return (
    <>
      {/* Inline provider config - only when no connection is selected */}
      {!hasConnection && (
        <>
          {/* Search Provider */}
          <div>
            <label style={labelStyle}>Search Provider</label>
            <select
              value={provider}
              onChange={(e) => onChange('provider', e.target.value)}
              style={selectStyle}
            >
              <option value="langsearch">LangSearch (Free)</option>
              <option value="brave">Brave Search</option>
              <option value="tavily">Tavily</option>
            </select>
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {providerInfo?.description}
            </div>
          </div>

          {/* API Key */}
          {providerInfo?.needsApiKey && (
            <div>
              <label style={labelStyle}>API Key</label>
              <input
                type="password"
                value={data.apiKey || ''}
                onChange={(e) => onChange('apiKey', e.target.value)}
                style={inputStyle}
                placeholder={provider === 'brave' ? 'Brave API key' : provider === 'langsearch' ? 'LangSearch API key' : 'Tavily API key'}
              />
            </div>
          )}
        </>
      )}

      {/* Search Query - always visible */}
      <div>
        <label style={labelStyle}>Search Query</label>
        <textarea
          value={data.query || ''}
          onChange={(e) => onChange('query', e.target.value)}
          style={{ ...inputStyle, minHeight: '60px', fontSize: '12px' }}
          placeholder='e.g. latest news about {{ topic }}'
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Supports {'{{ }}'} expressions for dynamic values
        </div>
      </div>

      {/* Max Results - always visible */}
      <div>
        <label style={labelStyle}>Max Results</label>
        <input
          type="number"
          min={1}
          max={20}
          value={data.resultCount ?? 5}
          onChange={(e) => onChange('resultCount', Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
          style={inputStyle}
          placeholder='5'
        />
      </div>
    </>
  )
}
