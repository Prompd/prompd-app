/* F1/F9: every compile path in CompilationService goes through the isolated
 * renderer, and a render that fails answers with a clean 4xx instead of a
 * 200 envelope or an internal message. No network, no database: the cache
 * model and fetch are stubbed. */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { CompilationCache } from '../models/CompilationCache.js'
import { CompilationService } from '../services/CompilationService.js'
import { getTemplateRenderer, shutdownTemplateRenderer } from '../services/templateRenderer/pool.js'
import { errorHandler } from '../middleware/errorHandler.js'
import compilationRoutes from './compilation.js'

jest.setTimeout(60_000)

const saved = {}
const ENV_KEYS = ['TEMPLATE_RENDER_TIMEOUT_MS', 'TEMPLATE_RENDER_POOL_SIZE', 'RENDERERTEST_API_KEY']

const doc = (body) => ['---', 'id: t', 'name: T', 'version: 1.0.0', 'parameters:', '  - name: who', '    type: string', '---', body, ''].join('\n')
const hello = doc('Hello {{ who }}')
const spin = doc('{% for i in range(0, 100000) %}{% for j in range(0, 100000) %}{% endfor %}{% endfor %}done')

let renderSpy
beforeAll(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.TEMPLATE_RENDER_TIMEOUT_MS = '1500'
  process.env.TEMPLATE_RENDER_POOL_SIZE = '1'
  await shutdownTemplateRenderer() // pick up the env above
  jest.spyOn(CompilationCache, 'findByContent').mockImplementation(async () => null)
  jest.spyOn(CompilationCache.prototype, 'save').mockImplementation(async () => {})
  saved.fetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => { throw new Error('network disabled in test') })
  renderSpy = jest.spyOn(getTemplateRenderer(), 'render')
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(async () => {
  await shutdownTemplateRenderer()
  globalThis.fetch = saved.fetch
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]
  }
  jest.restoreAllMocks()
})

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/compilation', compilationRoutes)
  a.use(errorHandler)
  return a
}

describe('/api/compilation/preview-public', () => {
  it('compiles in the renderer', async () => {
    renderSpy.mockClear()
    const res = await request(app()).post('/api/compilation/preview-public').send({ content: hello, parameters: { who: 'Ada' } })
    expect(res.status).toBe(200)
    expect(res.body.data.output).toContain('Hello Ada')
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it('answers a runaway template with 422 and a generic message, then keeps serving', async () => {
    const res = await request(app()).post('/api/compilation/preview-public').send({ content: spin })
    expect(res.status).toBe(422)
    expect(res.body).toEqual({ success: false, error: 'Template rendering timed out', code: 'TEMPLATE_RENDER_TIMEOUT' })

    const again = await request(app()).post('/api/compilation/preview-public').send({ content: hello, parameters: { who: 'Bo' } })
    expect(again.status).toBe(200)
    expect(again.body.data.output).toContain('Hello Bo')
  })
})

describe('CompilationService paths', () => {
  const svc = new CompilationService()

  it('compileWithProgress (Socket.IO + SSE) renders in the renderer and surfaces renderer errors', async () => {
    renderSpy.mockClear()
    await svc.compileWithProgress(hello, 'markdown', { who: 'Cy' }, () => {})
    expect(renderSpy).toHaveBeenCalledTimes(1)
    await expect(svc.compileWithProgress(spin, 'markdown', {}, () => {})).rejects.toMatchObject({ statusCode: 422, code: 'TEMPLATE_RENDER_TIMEOUT' })
  })

  it('execute compiles in the renderer; the provider call stays in the parent', async () => {
    // An env key for a provider name execute() does not support: the compile
    // runs, the provider step fails locally, and nothing is sent anywhere.
    process.env.RENDERERTEST_API_KEY = 'unused'
    renderSpy.mockClear()
    const out = await svc.execute(hello, 'renderertest', 'm', { who: 'Di' })
    expect(renderSpy).toHaveBeenCalledTimes(1)
    expect(out.compiledPrompt).toContain('Hello Di')
    expect(out.error).toMatch(/Unsupported provider/)

    await expect(svc.execute(spin, 'renderertest', 'm', {})).rejects.toMatchObject({ statusCode: 422, code: 'TEMPLATE_RENDER_TIMEOUT' })
  })
})
