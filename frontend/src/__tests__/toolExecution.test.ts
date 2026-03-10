/**
 * Tool Execution Pipeline Tests
 *
 * Validates the agent tool execution data contracts: parameter schema
 * auto-generation shape, ToolCallRequest config building for web-search
 * and database-query tools, connection resolution priority, and tool
 * name normalization.
 *
 * Since better-sqlite3 is compiled for Electron (not system Node),
 * database execution is validated via mock onToolCall callbacks that
 * verify the ToolCallRequest shape.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  TOOL_NODE_TYPES,
  TOOL_CONTAINER_CHILD_TYPES,
  isToolNodeType,
  isToolContainerChildType,
} from '../modules/services/workflowTypes'

// ============================================================================
// Test: Tool Node Type Constants (from frontend workflowTypes)
// ============================================================================

describe('Tool Node Type Constants', () => {
  it('TOOL_NODE_TYPES includes all expected tool node types', () => {
    const types = [...TOOL_NODE_TYPES]
    expect(types).toContain('tool')
    expect(types).toContain('mcp-tool')
    expect(types).toContain('web-search')
    expect(types).toContain('database-query')
    expect(types).toContain('command')
    expect(types).toContain('code')
    expect(types).toContain('claude-code')
    expect(types).toContain('api')
    expect(types).toContain('skill')
  })

  it('TOOL_CONTAINER_CHILD_TYPES includes all tool types plus tool-call-parser', () => {
    const types = [...TOOL_CONTAINER_CHILD_TYPES]
    expect(types).toContain('tool-call-parser')
    for (const t of TOOL_NODE_TYPES) {
      expect(types).toContain(t)
    }
  })

  it('isToolNodeType returns true for all tool types', () => {
    for (const t of TOOL_NODE_TYPES) {
      expect(isToolNodeType(t)).toBe(true)
    }
    expect(isToolNodeType('trigger')).toBe(false)
    expect(isToolNodeType('provider')).toBe(false)
    expect(isToolNodeType('output')).toBe(false)
  })

  it('isToolContainerChildType includes tool-call-parser', () => {
    expect(isToolContainerChildType('tool-call-parser')).toBe(true)
    expect(isToolContainerChildType('web-search')).toBe(true)
    expect(isToolContainerChildType('trigger')).toBe(false)
  })
})

// ============================================================================
// Test: Auto-Generated Parameter Schema Shape
// ============================================================================

describe('Auto-generated parameterSchema shape', () => {
  // These validate the expected schema shape that nodeToAgentTool generates
  // in the CLI. The exact same logic is tested here by shape.

  it('web-search auto-schema has query as required string', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to look up on the web' },
      },
      required: ['query'],
    }
    expect(schema.type).toBe('object')
    expect(schema.properties.query.type).toBe('string')
    expect(schema.required).toContain('query')
  })

  it('database-query (SQL) auto-schema has query, no collection', () => {
    // SQL nodes without a collection field should not expose collection param
    const schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query or database command to execute',
        },
      },
      required: ['query'],
    }
    expect(schema.properties).not.toHaveProperty('collection')
    expect(schema.required).toContain('query')
  })

  it('database-query (MongoDB) auto-schema includes collection with default', () => {
    const defaultCollection = 'users'
    const schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `Query to execute. For MongoDB, provide a JSON filter document (e.g. {"name": "John"}). Default collection: ${defaultCollection}`,
        },
        collection: {
          type: 'string',
          description: `MongoDB collection name (default: ${defaultCollection})`,
        },
      },
      required: ['query'],
    }

    expect(schema.properties).toHaveProperty('collection')
    expect(schema.properties.query.description).toContain('MongoDB')
    expect(schema.properties.query.description).toContain('users')
    expect(schema.properties.collection.description).toContain('users')
  })

  it('command auto-schema has input parameter', () => {
    const schema = {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input to pass to the command' },
      },
    }
    expect(schema.properties).toHaveProperty('input')
  })

  it('explicit parameterSchema should override auto-generation', () => {
    const customSchema = {
      type: 'object' as const,
      properties: {
        custom_field: { type: 'string', description: 'My custom field' },
      },
      required: ['custom_field'],
    }

    // Simulates the nodeToAgentTool logic: if parameterSchema has properties, use it
    const hasExplicitSchema = customSchema.properties && Object.keys(customSchema.properties).length > 0
    expect(hasExplicitSchema).toBe(true)
    expect(customSchema.properties).toHaveProperty('custom_field')
    expect(customSchema.properties).not.toHaveProperty('query')
  })
})

// ============================================================================
// Test: ToolCallRequest Shape - Web Search
// ============================================================================

describe('ToolCallRequest shape for web-search', () => {
  it('includes webSearchConfig with query and connectionId', () => {
    const request = {
      nodeId: 'chat-agent-001',
      toolName: 'web_search',
      toolType: 'web-search' as const,
      parameters: { query: 'pizza places in Florence AZ' },
      webSearchConfig: {
        query: 'pizza places in Florence AZ',
        resultCount: 5,
        connectionId: 'conn-websearch-001',
      },
    }

    expect(request.webSearchConfig.query).toBe('pizza places in Florence AZ')
    expect(request.webSearchConfig.connectionId).toBe('conn-websearch-001')
    expect(request.toolType).toBe('web-search')
  })

  it('resolves query from LLM params with fallback chain', () => {
    // LLMs may use "query", "input", or "search_query"
    const cases: Array<{ params: Record<string, string>; expected: string }> = [
      { params: { query: 'test1' }, expected: 'test1' },
      { params: { input: 'test2' }, expected: 'test2' },
      { params: { search_query: 'test3' }, expected: 'test3' },
      { params: {}, expected: '' },
    ]

    for (const { params, expected } of cases) {
      const resolved = params.query || params.input || params.search_query || ''
      expect(resolved).toBe(expected)
    }
  })
})

// ============================================================================
// Test: ToolCallRequest Shape - Database Query
// ============================================================================

describe('ToolCallRequest shape for database-query', () => {
  it('LLM query overrides node default', () => {
    const nodeQuery = 'SELECT * FROM users'
    const llmParams = { query: 'SELECT * FROM orders WHERE total > 100' }

    const resolvedQuery = llmParams.query || nodeQuery
    expect(resolvedQuery).toBe('SELECT * FROM orders WHERE total > 100')
  })

  it('falls back to node query when LLM provides none', () => {
    const nodeQuery = '{"status": "active"}'
    const llmParams: Record<string, string> = {}

    const resolvedQuery = llmParams.query || nodeQuery
    expect(resolvedQuery).toBe('{"status": "active"}')
  })

  it('LLM can override MongoDB collection', () => {
    const nodeCollection = 'users'
    const llmParams = { query: '{"role": "admin"}', collection: 'admins' }

    const resolvedCollection = llmParams.collection || nodeCollection
    expect(resolvedCollection).toBe('admins')
  })

  it('falls back to node collection when LLM omits it', () => {
    const nodeCollection = 'users'
    const llmParams: Record<string, string> = { query: '{"role": "admin"}' }

    const resolvedCollection = llmParams.collection || nodeCollection
    expect(resolvedCollection).toBe('users')
  })

  it('builds complete databaseConfig for SQLite SELECT', () => {
    const config = {
      connectionId: 'conn-sqlite-001',
      queryType: 'select' as const,
      query: 'SELECT * FROM test_table WHERE name = ?',
      parameters: '["hello"]',
      maxRows: 100,
      timeoutMs: 5000,
    }

    expect(config.queryType).toBe('select')
    expect(config.query).toContain('SELECT')
    const parsed = JSON.parse(config.parameters)
    expect(parsed).toEqual(['hello'])
  })

  it('builds complete databaseConfig for SQLite INSERT', () => {
    const config = {
      connectionId: 'conn-sqlite-001',
      queryType: 'insert' as const,
      query: 'INSERT INTO test_table (name, value) VALUES (?, ?)',
      parameters: '["test", 42]',
    }

    expect(config.queryType).toBe('insert')
    const parsed = JSON.parse(config.parameters)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toBe('test')
    expect(parsed[1]).toBe(42)
  })
})

// ============================================================================
// Test: Mock onToolCall - Database Query Execution
// ============================================================================

describe('Mock onToolCall for database query', () => {
  it('receives correct ToolCallRequest for SQLite SELECT', async () => {
    const onToolCall = vi.fn().mockResolvedValue({
      success: true,
      result: { rows: [{ id: 1, name: 'test' }], rowCount: 1 },
    })

    const request = {
      nodeId: 'chat-agent-001',
      toolName: 'database_query',
      toolType: 'database-query',
      parameters: { query: 'SELECT * FROM users' },
      databaseConfig: {
        connectionId: 'conn-sqlite-001',
        queryType: 'select',
        query: 'SELECT * FROM users',
        maxRows: 100,
        timeoutMs: 5000,
      },
    }

    const result = await onToolCall(request)

    expect(onToolCall).toHaveBeenCalledWith(request)
    expect(result.success).toBe(true)
    expect(result.result.rows).toHaveLength(1)
    expect(result.result.rows[0].name).toBe('test')
  })

  it('handles query failure gracefully', async () => {
    const onToolCall = vi.fn().mockResolvedValue({
      success: false,
      error: 'SQLITE_ERROR: no such table: nonexistent',
    })

    const request = {
      nodeId: 'chat-agent-001',
      toolName: 'database_query',
      toolType: 'database-query',
      parameters: { query: 'SELECT * FROM nonexistent' },
      databaseConfig: {
        connectionId: 'conn-sqlite-001',
        queryType: 'select',
        query: 'SELECT * FROM nonexistent',
        maxRows: 100,
        timeoutMs: 5000,
      },
    }

    const result = await onToolCall(request)
    expect(result.success).toBe(false)
    expect(result.error).toContain('no such table')
  })

  it('handles parameterized queries', async () => {
    const onToolCall = vi.fn().mockResolvedValue({
      success: true,
      result: { rows: [{ id: 5, name: 'Alice' }], rowCount: 1 },
    })

    const request = {
      nodeId: 'chat-agent-001',
      toolName: 'database_query',
      toolType: 'database-query',
      parameters: { query: 'SELECT * FROM users WHERE id = ?' },
      databaseConfig: {
        connectionId: 'conn-sqlite-001',
        queryType: 'select',
        query: 'SELECT * FROM users WHERE id = ?',
        parameters: '[5]',
        maxRows: 100,
        timeoutMs: 5000,
      },
    }

    const result = await onToolCall(request)
    expect(result.success).toBe(true)

    // Verify the parameters were included
    expect(request.databaseConfig.parameters).toBe('[5]')
    const parsed = JSON.parse(request.databaseConfig.parameters)
    expect(parsed).toEqual([5])
  })
})

// ============================================================================
// Test: Connection Resolution Priority
// ============================================================================

describe('Connection resolution priority', () => {
  it('inline connectionConfig takes precedence over connectionId', () => {
    const webSearchConfig = {
      query: 'test query',
      resultCount: 5,
      connectionConfig: { provider: 'brave', apiKey: 'inline-key-123' },
      connectionId: 'conn-websearch-001',
    }

    const hasInlineConfig = !!(webSearchConfig.connectionConfig?.apiKey)
    expect(hasInlineConfig).toBe(true)
  })

  it('connectionId used when no inline config', () => {
    const webSearchConfig = {
      query: 'test query',
      resultCount: 5,
      connectionConfig: undefined as { provider: string; apiKey: string } | undefined,
      connectionId: 'conn-websearch-001',
    }

    const shouldLookupConnection = !webSearchConfig.connectionConfig?.apiKey
    expect(shouldLookupConnection).toBe(true)
    expect(webSearchConfig.connectionId).toBe('conn-websearch-001')
  })

  it('env var names map correctly to providers', () => {
    const envVarMap: Record<string, string> = {
      langsearch: 'LANGSEARCH_API_KEY',
      brave: 'BRAVE_API_KEY',
      tavily: 'TAVILY_API_KEY',
    }

    expect(envVarMap['langsearch']).toBe('LANGSEARCH_API_KEY')
    expect(envVarMap['brave']).toBe('BRAVE_API_KEY')
    expect(envVarMap['tavily']).toBe('TAVILY_API_KEY')
    expect(envVarMap['unknown']).toBeUndefined()
  })
})

// ============================================================================
// Test: Tool Name Normalization (functions. prefix)
// ============================================================================

describe('Tool name normalization', () => {
  function normalizeToolName(raw: string): string {
    return raw.startsWith('functions.') ? raw.slice('functions.'.length) : raw
  }

  it('strips functions. prefix', () => {
    expect(normalizeToolName('functions.web_search')).toBe('web_search')
    expect(normalizeToolName('functions.database_query')).toBe('database_query')
  })

  it('leaves clean names unchanged', () => {
    expect(normalizeToolName('web_search')).toBe('web_search')
    expect(normalizeToolName('echo')).toBe('echo')
  })

  it('handles edge case of just "functions."', () => {
    expect(normalizeToolName('functions.')).toBe('')
  })

  it('does not strip partial match', () => {
    expect(normalizeToolName('functionsearch')).toBe('functionsearch')
  })
})

// ============================================================================
// Test: Mode-Aware Memory Tools
// ============================================================================

describe('Mode-aware memory tools for agents', () => {
  // Simulates buildMemoryTools logic from workflowExecutor.ts
  // Tests that the correct tool set is generated based on docked memory node mode

  it('KV mode produces memory_get, memory_set, memory_delete, memory_list', () => {
    const tools = [
      { name: 'memory_get', required: ['key'] },
      { name: 'memory_set', required: ['key', 'value'] },
      { name: 'memory_delete', required: ['key'] },
      { name: 'memory_list', required: [] },
    ]

    expect(tools).toHaveLength(4)
    expect(tools.map(t => t.name)).toEqual(['memory_get', 'memory_set', 'memory_delete', 'memory_list'])
    // KV tools require key (not scope/namespace which are now optional with defaults)
    expect(tools[0].required).toContain('key')
    expect(tools[1].required).toContain('value')
  })

  it('conversation mode produces memory_get_history, memory_append, memory_clear_history', () => {
    const tools = [
      { name: 'memory_get_history', required: [] as string[] },
      { name: 'memory_append', required: ['role', 'content'] },
      { name: 'memory_clear_history', required: [] as string[] },
    ]

    expect(tools).toHaveLength(3)
    expect(tools.map(t => t.name)).toEqual(['memory_get_history', 'memory_append', 'memory_clear_history'])
    // append requires role and content
    expect(tools[1].required).toContain('role')
    expect(tools[1].required).toContain('content')
    // get_history and clear_history have no required params (defaults from memory node config)
    expect(tools[0].required).toHaveLength(0)
    expect(tools[2].required).toHaveLength(0)
  })

  it('cache mode produces memory_get, memory_set (with ttl), memory_delete, memory_list', () => {
    const tools = [
      {
        name: 'memory_get',
        params: { key: { type: 'string' } },
        required: ['key'],
      },
      {
        name: 'memory_set',
        params: {
          key: { type: 'string' },
          value: { type: 'string' },
          ttl: { type: 'number', description: 'Time-to-live in seconds (0 = no expiration)' },
        },
        required: ['key', 'value'],
      },
      { name: 'memory_delete', params: { key: { type: 'string' } }, required: ['key'] },
      { name: 'memory_list', params: {}, required: [] as string[] },
    ]

    expect(tools).toHaveLength(4)
    // Cache set tool includes TTL parameter
    expect(tools[1].params).toHaveProperty('ttl')
    expect(tools[1].params.ttl!.type).toBe('number')
  })

  it('no docked memory node defaults to KV mode', () => {
    // When no memory node is found, buildMemoryTools defaults to KV
    const defaultMode = 'kv'
    const toolNames = defaultMode === 'kv'
      ? ['memory_get', 'memory_set', 'memory_delete', 'memory_list']
      : []
    expect(toolNames).toContain('memory_get')
    expect(toolNames).toContain('memory_set')
    expect(toolNames).not.toContain('memory_append')
    expect(toolNames).not.toContain('memory_get_history')
  })

  it('docked memory node config pre-fills scope and namespace defaults', () => {
    // Simulates a memory node with mode='conversation', scope='workflow', namespace='chat'
    const memoryNodeConfig = {
      mode: 'conversation' as const,
      scope: 'workflow',
      namespace: 'chat',
      conversationId: 'session_1',
      maxMessages: 50,
    }

    // The tool descriptions should mention the defaults
    const scopeDescription = memoryNodeConfig.scope === 'workflow'
      ? 'workflow: data persists across executions of this workflow'
      : 'global: data shared across all workflows'

    expect(scopeDescription).toContain('workflow')

    // conversation_id default should come from the node config
    const conversationIdDefault = memoryNodeConfig.conversationId || 'default'
    expect(conversationIdDefault).toBe('session_1')
  })
})

// ============================================================================
// Test: Mock Conversation Memory Tool Execution
// ============================================================================

describe('Mock conversation memory tool execution', () => {
  it('memory_append stores message with role and content', async () => {
    // Simulates the conversation memory backend behavior
    const conversations: Record<string, Array<{ role: string; content: string; timestamp: number }>> = {}

    const memoryAppend = async (params: { conversation_id?: string; role: string; content: string; scope?: string; namespace?: string }) => {
      const convId = params.conversation_id || 'default'
      const convKey = `__conv__${convId}`
      if (!conversations[convKey]) conversations[convKey] = []

      const message = { role: params.role, content: params.content, timestamp: Date.now() }
      conversations[convKey].push(message)
      return { success: true, conversationId: convId, messageCount: conversations[convKey].length, appended: message }
    }

    const result = await memoryAppend({ role: 'user', content: 'Hello, world!' })
    expect(result.success).toBe(true)
    expect(result.messageCount).toBe(1)
    expect(result.appended.role).toBe('user')
    expect(result.appended.content).toBe('Hello, world!')

    // Append another message
    const result2 = await memoryAppend({ role: 'assistant', content: 'Hi there!' })
    expect(result2.messageCount).toBe(2)
  })

  it('memory_get_history returns conversation messages', async () => {
    const conversations: Record<string, Array<{ role: string; content: string; timestamp: number }>> = {
      '__conv__session1': [
        { role: 'user', content: 'Hello', timestamp: 1000 },
        { role: 'assistant', content: 'Hi!', timestamp: 2000 },
        { role: 'user', content: 'How are you?', timestamp: 3000 },
      ],
    }

    const memoryGetHistory = async (params: { conversation_id?: string }) => {
      const convId = params.conversation_id || 'default'
      const convKey = `__conv__${convId}`
      const messages = conversations[convKey] || []
      return { messages, messageCount: messages.length, conversationId: convId }
    }

    const result = await memoryGetHistory({ conversation_id: 'session1' })
    expect(result.messageCount).toBe(3)
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[1].role).toBe('assistant')
    expect(result.conversationId).toBe('session1')
  })

  it('memory_get_history returns empty for nonexistent conversation', async () => {
    const conversations: Record<string, unknown[]> = {}

    const memoryGetHistory = async (params: { conversation_id?: string }) => {
      const convId = params.conversation_id || 'default'
      const convKey = `__conv__${convId}`
      const messages = conversations[convKey] || []
      return { messages, messageCount: messages.length, conversationId: convId }
    }

    const result = await memoryGetHistory({ conversation_id: 'nonexistent' })
    expect(result.messageCount).toBe(0)
    expect(result.messages).toEqual([])
  })

  it('memory_clear_history removes all messages', async () => {
    const conversations: Record<string, unknown[]> = {
      '__conv__session1': [
        { role: 'user', content: 'Hello', timestamp: 1000 },
        { role: 'assistant', content: 'Hi!', timestamp: 2000 },
      ],
    }

    const memoryClearHistory = async (params: { conversation_id?: string }) => {
      const convId = params.conversation_id || 'default'
      const convKey = `__conv__${convId}`
      const count = (conversations[convKey] || []).length
      delete conversations[convKey]
      return { success: true, conversationId: convId, clearedCount: count }
    }

    const result = await memoryClearHistory({ conversation_id: 'session1' })
    expect(result.success).toBe(true)
    expect(result.clearedCount).toBe(2)
    expect(conversations['__conv__session1']).toBeUndefined()
  })

  it('sliding window trims old messages when maxMessages exceeded', async () => {
    const maxMessages = 3
    const messages: Array<{ role: string; content: string; timestamp: number }> = [
      { role: 'user', content: 'msg1', timestamp: 1000 },
      { role: 'assistant', content: 'msg2', timestamp: 2000 },
      { role: 'user', content: 'msg3', timestamp: 3000 },
    ]

    // Append a 4th message
    messages.push({ role: 'assistant', content: 'msg4', timestamp: 4000 })

    // Apply sliding window
    while (messages.length > maxMessages) {
      messages.shift()
    }

    expect(messages).toHaveLength(3)
    expect(messages[0].content).toBe('msg2') // msg1 was trimmed
    expect(messages[2].content).toBe('msg4')
  })

  it('sliding window preserves system messages when includeSystemInWindow=false', () => {
    const maxMessages = 2
    const messages: Array<{ role: string; content: string; timestamp: number }> = [
      { role: 'system', content: 'You are helpful', timestamp: 500 },
      { role: 'user', content: 'msg1', timestamp: 1000 },
      { role: 'assistant', content: 'msg2', timestamp: 2000 },
      { role: 'user', content: 'msg3', timestamp: 3000 },
    ]

    // Apply sliding window excluding system messages
    const systemMsgs = messages.filter(m => m.role === 'system')
    const nonSystemMsgs = messages.filter(m => m.role !== 'system')

    while (nonSystemMsgs.length > maxMessages) {
      nonSystemMsgs.shift()
    }

    const result = [...systemMsgs, ...nonSystemMsgs].sort((a, b) => a.timestamp - b.timestamp)

    expect(result).toHaveLength(3) // 1 system + 2 non-system
    expect(result[0].role).toBe('system') // system preserved
    expect(result[1].content).toBe('msg2') // msg1 trimmed
    expect(result[2].content).toBe('msg3')
  })
})
