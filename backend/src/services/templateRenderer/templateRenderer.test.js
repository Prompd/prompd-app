/* F1/F9: user .prmd templates are compiled in an isolated child process.
 * These tests hold the child to its privileges (through a test-only probe
 * channel that only exists when NODE_ENV === 'test'), check the timeout and
 * size limits, check that prototype-reaching member lookups render empty, and
 * check that ordinary templates compile exactly as they did in-process.
 * No test here sends a template that runs commands or reads files. */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { PrompdCompiler, MemoryFileSystem } from '@prompd/cli'
import { TemplateRendererPool, RendererError, permissionFlag } from './pool.js'

jest.setTimeout(60_000)

const here = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(here, '..', '..', '..')
const repoDir = path.resolve(backendDir, '..')
const REGISTRY = 'https://registry.invalid'

// Variables libuv re-adds on Windows when a child is spawned with env {}.
const WINDOWS_REQUIRED_ENV = new Set([
  'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE', 'SYSTEMROOT',
  'TEMP', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'WINDIR'
])

const prmd = (body, params = []) => [
  '---',
  'id: fixture',
  'name: Fixture',
  'version: 1.0.0',
  ...(params.length ? ['parameters:', ...params.flatMap((p) => [`  - name: ${p.name}`, `    type: ${p.type}`])] : []),
  '---',
  body,
  ''
].join('\n')

let savedFetch
const servedPackages = new Map()
beforeAll(() => {
  // Nothing in this file may reach a network, in-process baseline included.
  // The one exception is the in-process baseline's registry download of the
  // test package, answered here from memory (servedPackages).
  savedFetch = globalThis.fetch
  globalThis.fetch = jest.fn(async (url) => {
    const body = servedPackages.get(String(url))
    if (body) return new Response(body, { status: 200 })
    throw new Error('network disabled in test')
  })
})
afterAll(() => {
  globalThis.fetch = savedFetch
})

/** The in-process path the API used before this change. */
async function inProcess({ entry, files, packages = [], outputFormat = 'markdown', parameters = {} }) {
  const memFS = new MemoryFileSystem(files)
  for (const p of packages) await memFS.addPackage(p.name, p.version, p.tarball)
  const ctx = await new PrompdCompiler().compileWithContext(entry, { outputFormat, parameters, fileSystem: memFS, registryUrl: REGISTRY })
  const out = ctx.compiledResult
  return {
    compiledResult: typeof out === 'string' || out == null ? out : out.toString('utf-8'),
    errors: ctx.errors.map(String),
    warnings: ctx.warnings.map(String)
  }
}

async function isolated(pool, req) {
  const ctx = await pool.render({ outputFormat: 'markdown', parameters: {}, registryUrl: REGISTRY, ...req })
  return { compiledResult: ctx.compiledResult, errors: ctx.errors, warnings: ctx.warnings }
}

describe('template renderer child: privileges', () => {
  let pool
  const sentinel = 'TEMPLATE_RENDERER_TEST_SENTINEL_SECRET'
  beforeAll(() => {
    process.env[sentinel] = 'must-not-reach-the-child'
    pool = new TemplateRendererPool({ poolSize: 1, testProbes: true })
  })
  afterAll(async () => {
    delete process.env[sentinel]
    await pool.shutdown()
  })

  it('forks with the permission model and without code generation', () => {
    const argv = pool.childExecArgv()
    expect(argv).toContain(permissionFlag())
    expect(argv).toContain('--disallow-code-generation-from-strings')
    expect(argv.some((a) => a.startsWith('--max-old-space-size='))).toBe(true)
    expect(argv.some((a) => /^--allow-(fs-write|child-process|worker|addons|wasi)/.test(a))).toBe(false)
  })

  it('starts with an empty environment and keeps none of it', async () => {
    const r = await pool.probe('env')
    expect(r.startupEnvKeys).not.toContain(sentinel)
    if (process.platform === 'win32') {
      for (const k of r.startupEnvKeys) expect(WINDOWS_REQUIRED_ENV.has(k)).toBe(true)
    } else {
      expect(r.startupEnvKeys).toEqual([])
    }
    expect(r.envKeyCount).toBe(0)
  })

  it('cannot read files outside its allowed directories', async () => {
    const denied = await pool.probe('fs-read', path.join(backendDir, 'package.json'))
    expect(denied).toMatchObject({ allowed: false, code: 'ERR_ACCESS_DENIED' })
    // Positive control: the probe itself works on an allowed path.
    const allowed = await pool.probe('fs-read', path.join(backendDir, 'node_modules', '@prompd', 'cli', 'package.json'))
    expect(allowed.allowed).toBe(true)
  })

  it('cannot write files', async () => {
    const target = path.join(os.tmpdir(), `renderer-probe-${process.pid}-${Date.now()}.txt`)
    try {
      const r = await pool.probe('fs-write', target)
      expect(r).toMatchObject({ allowed: false, code: 'ERR_ACCESS_DENIED' })
      expect(fs.existsSync(target)).toBe(false)
    } finally {
      fs.rmSync(target, { force: true })
    }
  })

  it('cannot spawn a process or start a worker', async () => {
    expect(await pool.probe('spawn')).toMatchObject({ allowed: false, code: 'ERR_ACCESS_DENIED' })
    expect(await pool.probe('worker')).toMatchObject({ allowed: false, code: 'ERR_ACCESS_DENIED' })
  })

  it('cannot generate code from strings', async () => {
    expect(await pool.probe('codegen')).toMatchObject({ allowed: false, name: 'EvalError' })
  })

  it('has fetch disabled', async () => {
    const r = await pool.probe('fetch')
    expect(r.allowed).toBe(false)
    expect(r.message).toMatch(/disabled in the template renderer/)
  })

  it('offers no probe channel outside NODE_ENV=test', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    let prodPool
    try {
      prodPool = new TemplateRendererPool({ poolSize: 1, testProbes: true })
    } finally {
      process.env.NODE_ENV = prev
    }
    try {
      await expect(prodPool.probe('env')).rejects.toThrow('Probes are disabled')
    } finally {
      await prodPool.shutdown()
    }
  })
})

describe('template renderer: limits', () => {
  let pool
  beforeAll(() => {
    pool = new TemplateRendererPool({ poolSize: 1, timeoutMs: 1500, maxOutputBytes: 10_000, maxInputBytes: 64 * 1024 })
  })
  afterAll(async () => { await pool.shutdown() })

  const ok = prmd('Hello {{ name }}', [{ name: 'name', type: 'string' }])

  it('kills a render that runs past the timeout, then keeps serving', async () => {
    const spin = prmd('{% for i in range(0, 100000) %}{% for j in range(0, 100000) %}{% endfor %}{% endfor %}done')
    const started = Date.now()
    const err = await pool.render({ entry: '/main.prmd', files: { '/main.prmd': spin } }).catch((e) => e)
    expect(err).toBeInstanceOf(RendererError)
    expect(err).toMatchObject({ statusCode: 422, code: 'TEMPLATE_RENDER_TIMEOUT', message: 'Template rendering timed out' })
    expect(Date.now() - started).toBeLessThan(15_000)

    const next = await pool.render({ entry: '/main.prmd', files: { '/main.prmd': ok }, parameters: { name: 'Ada' } })
    expect(next.compiledResult).toContain('Hello Ada')
  })

  it('refuses output over the size cap with an error, not a truncated result', async () => {
    const big = prmd('{% for i in range(0, 5000) %}abcdefghij{% endfor %}')
    const err = await pool.render({ entry: '/main.prmd', files: { '/main.prmd': big } }).catch((e) => e)
    expect(err).toMatchObject({ statusCode: 422, code: 'TEMPLATE_OUTPUT_TOO_LARGE' })

    const small = await pool.render({ entry: '/main.prmd', files: { '/main.prmd': ok }, parameters: { name: 'Bo' } })
    expect(small.compiledResult).toContain('Hello Bo')
  })

  it('refuses input over the size cap before it reaches a child', async () => {
    const err = await pool.render({ entry: '/main.prmd', files: { '/main.prmd': ok, '/big.md': 'x'.repeat(70 * 1024) } }).catch((e) => e)
    expect(err).toMatchObject({ statusCode: 413, code: 'TEMPLATE_INPUT_TOO_LARGE' })
  })
})

describe('template renderer: member lookups that reach prototypes', () => {
  let pool
  beforeAll(() => { pool = new TemplateRendererPool({ poolSize: 1 }) })
  afterAll(async () => { await pool.shutdown() })

  const params = [
    { name: 'who', type: 'string' },
    { name: 'items', type: 'array' },
    { name: 'obj', type: 'object' }
  ]
  const lookups = [
    '{{ who.constructor }}',
    "{{ who['constructor'] }}",
    '{{ who.__proto__ }}',
    "{{ obj['__proto__'] }}",
    '{{ items.constructor }}',
    '{{ who.constructor.constructor }}',
    '{{ obj.prototype }}',
    '{{ constructor }}'
  ]
  const body = lookups.map((l, i) => `L${i}[${l}]`).join('\n')
  const values = { who: 'x', items: [1], obj: { a: 1 } }

  it('render every lookup as empty', async () => {
    const r = await isolated(pool, { entry: '/main.prmd', files: { '/main.prmd': prmd(body, params) }, parameters: values })
    for (let i = 0; i < lookups.length; i++) expect(r.compiledResult).toContain(`L${i}[]`)
    expect(r.compiledResult).not.toMatch(/function|native code|\[object/)
  })

  it('(control) the same template exposes them when rendered in-process', async () => {
    const r = await inProcess({ entry: '/main.prmd', files: { '/main.prmd': prmd(body, params) }, parameters: values })
    expect(r.compiledResult).toMatch(/function|\[object/)
  })
})

describe('template renderer: output identical to the in-process compiler', () => {
  let pool
  const fetched = []
  let pkgZip
  beforeAll(() => {
    // A registry package served by the parent over IPC (the child has no network).
    const zip = new AdmZip()
    zip.addFile('prompd.json', Buffer.from(JSON.stringify({ name: '@prompd/public-examples', version: '1.0.6' })))
    zip.addFile('prompts/base-prompt.prmd', fs.readFileSync(path.join(repoDir, 'frontend/examples/src/prompts/base-prompt.prmd')))
    pkgZip = zip.toBuffer()
    servedPackages.set(`${REGISTRY}/packages/@prompd/public-examples/download/1.0.6`, pkgZip)
    pool = new TemplateRendererPool({
      poolSize: 1,
      fetchPackage: async (name, version) => {
        fetched.push(`${name}@${version}`)
        if (name === '@prompd/public-examples' && version === '1.0.6') return pkgZip
        throw new Error('not found')
      }
    })
  })
  afterAll(async () => { await pool.shutdown() })

  const cases = {
    variables: {
      files: { '/main.prmd': prmd('Hi {{ name }}, you are {{ age }}.', [{ name: 'name', type: 'string' }, { name: 'age', type: 'number' }]) },
      parameters: { name: 'Ada', age: 36 }
    },
    loopsAndConditionals: {
      files: { '/main.prmd': prmd('{% for t in tags %}- {{ loop.index }}: {{ t }}\n{% endfor %}{% if tags | length > 2 %}many{% else %}few{% endif %}', [{ name: 'tags', type: 'array' }]) },
      parameters: { tags: ['a', 'b', 'c'] }
    },
    filters: {
      files: { '/main.prmd': prmd('{{ name | upper }} {{ name | lower | capitalize }} {{ tags | join(", ") }} {{ missing | default("dflt") }} {{ text | replace("a", "o") | trim }}', [{ name: 'name', type: 'string' }, { name: 'tags', type: 'array' }, { name: 'text', type: 'string' }]) },
      parameters: { name: 'MiXeD', tags: ['x', 'y'], text: '  banana  ' }
    },
    include: {
      files: {
        '/main.prmd': prmd('Before\n{% include "./partial.md" %}\nAfter {{ who }}', [{ name: 'who', type: 'string' }]),
        '/partial.md': 'Included for {{ who }}'
      },
      parameters: { who: 'Bea' }
    },
    inheritance: {
      files: {
        '/main.prmd': ['---', 'id: child', 'name: Child', 'version: 1.0.0', 'inherits: "./base.prmd"', 'parameters:', '  - name: topic', '    type: string', '---', '## Child on {{ topic }}', ''].join('\n'),
        '/base.prmd': ['---', 'id: base', 'name: Base', 'version: 1.0.0', 'parameters:', '  - name: topic', '    type: string', '---', '# Base about {{ topic }}', ''].join('\n')
      },
      parameters: { topic: 'tests' }
    },
    compileError: {
      files: { '/main.prmd': prmd('{% for x in %}broken') }
    },
    openaiJson: {
      files: { '/main.prmd': prmd('Hello {{ name }}', [{ name: 'name', type: 'string' }]) },
      parameters: { name: 'Json' },
      outputFormat: 'provider-json:openai'
    }
  }

  it.each(Object.keys(cases))('%s', async (name) => {
    const c = cases[name]
    const req = { entry: '/main.prmd', files: c.files, parameters: c.parameters || {}, outputFormat: c.outputFormat || 'markdown' }
    const before = await inProcess(req)
    const after = await isolated(pool, req)
    expect(after).toEqual(before)
    if (name === 'compileError') expect(before.errors.length).toBeGreaterThan(0)
    else expect((before.compiledResult || '').length).toBeGreaterThan(0)
  })

  const examplesDir = path.join(repoDir, 'frontend', 'examples', 'src')
  const exampleFiles = {}
  for (const rel of fs.readdirSync(examplesDir, { recursive: true })) {
    const abs = path.join(examplesDir, rel)
    if (fs.statSync(abs).isFile()) exampleFiles[rel.split(path.sep).join('/')] = fs.readFileSync(abs, 'utf8')
  }
  const fixtureEntries = Object.keys(exampleFiles).filter((p) => p.endsWith('.prmd'))

  it.each(fixtureEntries)('repo fixture %s', async (entry) => {
    // In-process, the compiler downloads the package itself (served from
    // memory above); isolated, the child must ask the parent for it.
    const before = await inProcess({ entry, files: exampleFiles })
    const after = await isolated(pool, { entry, files: exampleFiles })
    expect(after).toEqual(before)
    expect((before.compiledResult || '').length).toBeGreaterThan(0)
  })

  it('fetched the package through the parent', () => {
    expect(fetched).toContain('@prompd/public-examples@1.0.6')
  })

  it.each([
    'backend/prompts/prompd-generator.prmd',
    'backend/src/prompts/prompd-generator.prmd'
  ])('repo fixture %s', async (rel) => {
    const files = { '/main.prmd': fs.readFileSync(path.join(repoDir, rel), 'utf8') }
    const before = await inProcess({ entry: '/main.prmd', files })
    const after = await isolated(pool, { entry: '/main.prmd', files })
    expect(after).toEqual(before)
    expect((before.compiledResult || '').length).toBeGreaterThan(0)
  })
})
