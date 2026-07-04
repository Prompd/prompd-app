import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { listTools, callTool } from './McpProxyService.js'

afterEach(() => { jest.restoreAllMocks() })

describe('McpProxyService SSRF re-validation at fetch time', () => {
  it('listTools refuses a blocked host WITHOUT issuing a fetch', async () => {
    const spy = jest.spyOn(globalThis, 'fetch')
    await expect(listTools({ id: 'x', url: 'http://169.254.169.254/latest/meta-data/' }))
      .rejects.toThrow(/not allowed|private|blocked/i)
    expect(spy).not.toHaveBeenCalled()
  })

  it('callTool refuses a loopback host WITHOUT issuing a fetch', async () => {
    const spy = jest.spyOn(globalThis, 'fetch')
    await expect(callTool({ id: 'x', url: 'http://localhost:27017' }, 'ping', {}))
      .rejects.toThrow(/not allowed|private|blocked/i)
    expect(spy).not.toHaveBeenCalled()
  })

  it('a public host is allowed through to fetch (which we stub)', async () => {
    // Fresh Response per call — handshake + notification + tools/list each read a body.
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'search' }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const tools = await listTools({ id: 'x', url: 'https://mcp.acme.io/rpc' })
    expect(tools.map((t) => t.name)).toContain('search')
  })
})
