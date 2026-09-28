/* F4: the Socket.IO surface must not run LLM calls, compiles or project
 * traffic for an unauthenticated connection, and must take identity from the
 * verified handshake token, never from an event payload. */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals'
import { setupSocketHandlers } from './socket.js'
import { agentService } from '../services/AgentService.js'
import { CompilationService } from '../services/CompilationService.js'

/* A fake io + socket pair that runs the real middlewares and handlers. */
function makeIo() {
  const io = {
    mws: [],
    onConnection: null,
    use(fn) { this.mws.push(fn) },
    on(ev, fn) { if (ev === 'connection') this.onConnection = fn },
  }
  return io
}

async function connect(io, handshake) {
  const socket = {
    id: 'sock1',
    handshake,
    data: {},
    rooms: new Set(),
    handlers: {},
    eventMws: [],
    emitted: [],
    use(fn) { this.eventMws.push(fn) },
    on(ev, fn) { this.handlers[ev] = fn },
    once() {},
    emit(ev, payload) { this.emitted.push([ev, payload]) },
    to() { return { emit() {} } },
    join: async () => {},
    leave: async () => {},
  }
  for (const mw of io.mws) {
    const err = await new Promise((resolve) => mw(socket, resolve))
    if (err) return { refused: err }
  }
  io.onConnection(socket)
  return { socket }
}

/* Deliver a client event through socket.use middlewares, then the handler. */
async function deliver(socket, event, data) {
  for (const mw of socket.eventMws) {
    const err = await new Promise((resolve) => mw([event, data], resolve))
    if (err) {
      if (socket.handlers.error) socket.handlers.error(err)
      return { blocked: err }
    }
  }
  await socket.handlers[event]?.(data)
  return { blocked: null }
}

const verify = async (token) => {
  if (token === 'good-token') return { sub: 'user_verified' }
  const e = new Error('invalid signature'); e.name = 'JsonWebTokenError'; throw e
}

let chatSpy
let execSpy
beforeAll(() => {
  chatSpy = jest.spyOn(agentService, 'chat').mockImplementation(async () => ({ success: true, message: 'ok' }))
  execSpy = jest.spyOn(CompilationService.prototype, 'execute').mockImplementation(async () => ({ success: true, response: 'ok' }))
  jest.spyOn(CompilationService.prototype, 'compileWithProgress').mockImplementation(async () => ({ ok: true }))
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => jest.restoreAllMocks())

describe('socket handshake', () => {
  it('refuses a connection whose token fails verification', async () => {
    const io = makeIo(); setupSocketHandlers(io, { verify })
    const out = await connect(io, { auth: { token: 'forged' }, headers: {} })
    expect(out.refused).toBeInstanceOf(Error)
  })

  it('sets the identity from the verified token', async () => {
    const io = makeIo(); setupSocketHandlers(io, { verify })
    const { socket } = await connect(io, { auth: { token: 'good-token' }, headers: {} })
    expect(socket.data.userId).toBe('user_verified')
  })

  it('accepts a Bearer header as the token source', async () => {
    const io = makeIo(); setupSocketHandlers(io, { verify })
    const { socket } = await connect(io, { auth: {}, headers: { authorization: 'Bearer good-token' } })
    expect(socket.data.userId).toBe('user_verified')
  })
})

describe('anonymous socket (webhook-proxy client)', () => {
  const blockedEvents = ['execute', 'agent:chat', 'compilation:start', 'validation:start', 'project:join', 'file:change', 'cursor:update', 'package:install', 'agent:stop']

  it.each(blockedEvents)('refuses %s before its handler runs', async (event) => {
    chatSpy.mockClear(); execSpy.mockClear()
    const io = makeIo(); setupSocketHandlers(io, { verify })
    const { socket } = await connect(io, { auth: {}, headers: {} })
    const out = await deliver(socket, event, { userId: 'user_victim', sessionId: 's', prompt: 'x', content: 'x' })
    expect(out.blocked).toBeInstanceOf(Error)
    expect(chatSpy).not.toHaveBeenCalled()
    expect(execSpy).not.toHaveBeenCalled()
  })

  it('still lets the webhook-proxy client register and ping', async () => {
    const io = makeIo(); setupSocketHandlers(io, { verify })
    const { socket } = await connect(io, { auth: {}, headers: {} })
    expect((await deliver(socket, 'ping')).blocked).toBeNull()
    expect(socket.emitted.some(([ev]) => ev === 'pong')).toBe(true)
    // Missing registry token: the handler itself answers; the gate let it through.
    expect((await deliver(socket, 'webhook-proxy:register', {})).blocked).toBeNull()
    expect(socket.emitted.some(([ev]) => ev === 'webhook-proxy:error')).toBe(true)
  })
})

describe('authenticated socket', () => {
  it('agent:chat uses the verified identity, not the payload userId', async () => {
    chatSpy.mockClear()
    const io = makeIo(); setupSocketHandlers(io, { verify })
    const { socket } = await connect(io, { auth: { token: 'good-token' }, headers: {} })
    await deliver(socket, 'agent:chat', { userId: 'user_victim', sessionId: 's1', provider: 'openai', model: 'gpt-4o-mini', messages: [] })
    expect(chatSpy).toHaveBeenCalledTimes(1)
    expect(chatSpy.mock.calls[0][0]).toBe('user_verified')
  })
})
