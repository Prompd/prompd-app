/* A verified socket may join a project room only if its user owns or
 * collaborates on the project, and may only broadcast into rooms it has
 * joined. Before this, any signed-in socket could join any project's room
 * (and receive collaborators' file contents) or push file:changed into it. */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals'
import { setupSocketHandlers } from './socket.js'
import { User } from '../models/User.js'
import { Project } from '../models/Project.js'

const OWNER = { _id: 'uid_owner', clerkUserId: 'user_owner' }
const COLLAB = { _id: 'uid_collab', clerkUserId: 'user_collab' }
const STRANGER = { _id: 'uid_stranger', clerkUserId: 'user_stranger' }
const users = [OWNER, COLLAB, STRANGER]
const project = { _id: 'proj1', userId: 'uid_owner', isPublic: true, collaborators: [{ userId: 'uid_collab', role: 'viewer' }] }

const saved = {}
beforeAll(() => {
  saved.u = User.findOne
  saved.p = Project.findById
  User.findOne = jest.fn(async (q) => users.find((u) => u.clerkUserId === q.clerkUserId) || null)
  Project.findById = jest.fn(async (id) => (id === 'proj1' ? project : null))
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => {
  User.findOne = saved.u
  Project.findById = saved.p
  jest.restoreAllMocks()
})

async function connectAs(sub) {
  const io = { mws: [], use(fn) { this.mws.push(fn) }, on(ev, fn) { if (ev === 'connection') this.onConnection = fn } }
  setupSocketHandlers(io, { verify: async () => ({ sub }) })
  const broadcasts = []
  const socket = {
    id: `s-${sub}`, handshake: { auth: { token: 't' }, headers: {} }, data: {}, rooms: new Set(),
    handlers: {}, eventMws: [], emitted: [],
    use(fn) { this.eventMws.push(fn) }, on(ev, fn) { this.handlers[ev] = fn }, once() {},
    emit(ev, p) { this.emitted.push([ev, p]) },
    to(room) { return { emit: (ev, p) => broadcasts.push([room, ev, p]) } },
    async join(room) { this.rooms.add(room) }, async leave(room) { this.rooms.delete(room) },
  }
  for (const mw of io.mws) await new Promise((r) => mw(socket, r))
  io.onConnection(socket)
  const deliver = async (ev, data) => {
    for (const mw of socket.eventMws) {
      const err = await new Promise((r) => mw([ev, data], r))
      if (err) return err
    }
    await socket.handlers[ev]?.(data)
    return null
  }
  return { socket, broadcasts, deliver }
}

describe('project:join', () => {
  it('lets the owner join', async () => {
    const { socket, deliver } = await connectAs('user_owner')
    await deliver('project:join', 'proj1')
    expect(socket.rooms.has('project:proj1')).toBe(true)
  })
  it('lets a collaborator join', async () => {
    const { socket, deliver } = await connectAs('user_collab')
    await deliver('project:join', 'proj1')
    expect(socket.rooms.has('project:proj1')).toBe(true)
  })
  it('refuses a signed-in non-member, even on a public project', async () => {
    const { socket, deliver } = await connectAs('user_stranger')
    await deliver('project:join', 'proj1')
    expect(socket.rooms.has('project:proj1')).toBe(false)
    expect(socket.emitted.some(([ev]) => ev === 'project:joined')).toBe(false)
    expect(socket.emitted.some(([ev]) => ev === 'error')).toBe(true)
  })
  it('refuses an unknown project and a non-string id', async () => {
    const { socket, deliver } = await connectAs('user_owner')
    await deliver('project:join', 'nope')
    await deliver('project:join', { $ne: null })
    expect(socket.rooms.size).toBe(0)
  })
})

describe('broadcasts into a project room', () => {
  it('are dropped unless the socket has joined that room', async () => {
    const { broadcasts, deliver } = await connectAs('user_stranger')
    await deliver('file:change', { projectId: 'proj1', fileName: 'a.prmd', changeType: 'edit', content: 'injected' })
    await deliver('cursor:update', { projectId: 'proj1', fileName: 'a.prmd', position: 1 })
    expect(broadcasts).toHaveLength(0)
  })
  it('reach the room once joined', async () => {
    const { broadcasts, deliver } = await connectAs('user_owner')
    await deliver('project:join', 'proj1')
    await deliver('file:change', { projectId: 'proj1', fileName: 'a.prmd', changeType: 'edit', content: 'x' })
    expect(broadcasts.some(([room, ev]) => room === 'project:proj1' && ev === 'file:changed')).toBe(true)
  })
})
