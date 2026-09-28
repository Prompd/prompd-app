'use strict'
/* Template renderer child process.
 *
 * User-supplied .prmd templates are compiled by @prompd/cli's Nunjucks engine.
 * Nunjucks is not a sandbox, so the compile step runs HERE, in a forked child
 * the API process starts with (see pool.js):
 *   - an empty environment (no API keys, DB URIs, Clerk secrets),
 *   - Node's permission model: fs reads limited to this file and node_modules,
 *     no fs writes, no child processes, no workers, no addons,
 *   - --disallow-code-generation-from-strings (eval / new Function throw),
 *   - a small heap cap, and a per-render wall-clock timeout enforced by the
 *     parent with SIGKILL.
 * The only channel is the IPC channel: the parent sends a file map and
 * parameters, the child answers with a plain snapshot of the compilation
 * context. Registry packages are fetched BY THE PARENT on the child's request.
 *
 * Everything below is defense in depth on top of that containment.
 *
 * argv: [cliEntryPath, ...flags]   flags: --test-probes (test builds only)
 */

// 1. Record which environment variables arrived (names only, for the test
//    probe), then drop them. The parent spawns with env {}, but on Windows
//    libuv re-adds a fixed list of system variables; nothing here needs any.
const startupEnvKeys = Object.keys(process.env)
for (const key of startupEnvKeys) delete process.env[key]

const path = require('path')
const vm = require('vm')

const cliEntry = process.argv[2]
const TEST_PROBES = process.argv.includes('--test-probes')

const BLOCKED_MEMBERS = new Set([
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
])

const MAX_DIAGNOSTICS = 200
const MAX_MESSAGE_CHARS = 4000

function send(message) {
  if (typeof process.send === 'function' && process.connected) process.send(message)
}

// 2. Harden the shared Nunjucks runtime BEFORE @prompd/cli loads it. Compiled
//    templates call runtime.memberLookup / runtime.contextOrFrameLookup
//    through this module object at render time, so replacing the properties
//    covers every template @prompd/cli renders.
const nunjucksDir = path.dirname(require.resolve('nunjucks', { paths: [path.dirname(cliEntry)] }))
const nunjucksRuntime = require(path.join(nunjucksDir, 'src', 'runtime.js'))
const nunjucksCompiler = require(path.join(nunjucksDir, 'src', 'compiler.js'))
const { Template } = require(path.join(nunjucksDir, 'src', 'environment.js'))

const originalMemberLookup = nunjucksRuntime.memberLookup
nunjucksRuntime.memberLookup = function guardedMemberLookup(obj, val) {
  // Coerce the key exactly once, so an object key cannot answer one string to
  // the check and another to the lookup.
  const key = typeof val === 'symbol' ? val : String(val)
  if (typeof key === 'string' && BLOCKED_MEMBERS.has(key)) return undefined
  return originalMemberLookup(obj, key)
}

const originalContextOrFrameLookup = nunjucksRuntime.contextOrFrameLookup
nunjucksRuntime.contextOrFrameLookup = function guardedContextOrFrameLookup(context, frame, name) {
  if (typeof name === 'string' && BLOCKED_MEMBERS.has(name)) return undefined
  return originalContextOrFrameLookup(context, frame, name)
}

// Nunjucks turns a template into JS source and evaluates it with
// `new Function(source)`, which --disallow-code-generation-from-strings
// forbids. Compile that generated source through vm.compileFunction instead
// (an embedder compile, not string code generation), so templates still work
// while eval / Function stay unavailable to anything a template can reach.
Template.prototype._compile = function _compile() {
  let props
  if (this.tmplProps) {
    props = this.tmplProps
  } else {
    const source = nunjucksCompiler.compile(
      this.tmplStr,
      this.env.asyncFilters,
      this.env.extensionsList,
      this.path,
      this.env.opts
    )
    props = vm.compileFunction(source, [], { filename: 'prmd-template.js' })()
  }
  this.blocks = this._getBlocks(props)
  this.rootRenderFunc = props.root
  this.compiled = true
}

// 3. Load the compiler.
// bluebird (via mammoth/unzipper) builds functions from strings at load time
// unless `navigator` exists, and --disallow-code-generation-from-strings makes
// that throw. Node 21+ defines a global navigator; Node 20 does not. Provide
// one so bluebird takes its no-eval path on every version.
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: false, enumerable: false })
}
const cli = require(cliEntry)
const { PrompdCompiler, MemoryFileSystem } = cli

// 4. Registry packages come from the parent. package-resolver constructs
//    `new registry_1.RegistryClient(...)` at call time, so replacing the
//    module export routes every download through IPC; the real client (which
//    also reads ~/.prompd config and creates a cache dir) never runs here.
let nextRequestId = 1
const pendingPackageRequests = new Map()
let activeRenderId = null

class IpcRegistryClient {
  async downloadPackageBuffer(packageName, version) {
    if (activeRenderId === null) throw new Error('No render in progress')
    const reqId = nextRequestId++
    return new Promise((resolve, reject) => {
      pendingPackageRequests.set(reqId, { resolve, reject })
      send({ type: 'fetch-package', id: activeRenderId, reqId, name: String(packageName), version: String(version) })
    })
  }

  async downloadPackage(packageName, version) {
    return this.downloadPackageBuffer(packageName, version)
  }
}
const registryModule = require(path.join(path.dirname(cliEntry), 'registry.js'))
registryModule.RegistryClient = IpcRegistryClient

// 5. No network from the child. Package downloads go through the parent.
//    (Node 20's permission model has no network permission, so this is a
//    library-level stop, not a boundary.)
const networkDisabled = () => { throw new Error('Network access is disabled in the template renderer') }
globalThis.fetch = async () => networkDisabled()
for (const modName of ['http', 'https']) {
  const mod = require(modName)
  mod.request = networkDisabled
  mod.get = networkDisabled
}
for (const modName of ['net', 'tls']) {
  const mod = require(modName)
  mod.connect = networkDisabled
  mod.createConnection = networkDisabled
}

const compiler = new PrompdCompiler()

function clip(text) {
  const s = typeof text === 'string' ? text : String(text)
  return s.length > MAX_MESSAGE_CHARS ? s.slice(0, MAX_MESSAGE_CHARS) + '...' : s
}

function jsonSafe(value, fallback) {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function snapshot(context) {
  let compiled = context.compiledResult
  if (compiled !== undefined && compiled !== null && typeof compiled !== 'string') {
    compiled = Buffer.isBuffer(compiled) ? compiled.toString('utf-8') : String(compiled)
  }
  const errors = (Array.isArray(context.errors) ? context.errors : [])
    .slice(0, MAX_DIAGNOSTICS)
    .map((e) => clip(typeof e === 'string' ? e : String(e)))
  const warnings = (Array.isArray(context.warnings) ? context.warnings : [])
    .slice(0, MAX_DIAGNOSTICS)
    .map((w) => clip(typeof w === 'string' ? w : String(w)))
  const diagnostics = (Array.isArray(context.diagnostics) ? context.diagnostics : [])
    .slice(0, MAX_DIAGNOSTICS)
    .map((d) => {
      const out = { message: clip(d && d.message !== undefined ? d.message : ''), severity: d && typeof d.severity === 'string' ? d.severity : 'error' }
      for (const k of ['line', 'column', 'endLine', 'endColumn']) {
        if (d && typeof d[k] === 'number') out[k] = d[k]
      }
      if (d && typeof d.code === 'string') out.code = clip(d.code)
      if (d && typeof d.source === 'string') out.source = clip(d.source)
      return out
    })
  const metadata = context.metadata && typeof context.metadata === 'object'
    ? { id: context.metadata.id === undefined ? undefined : String(context.metadata.id), name: context.metadata.name === undefined ? undefined : String(context.metadata.name) }
    : null
  return {
    compiledResult: compiled === null ? undefined : compiled,
    errors,
    warnings,
    diagnostics,
    dependencies: jsonSafe(context.dependencies, {}),
    stages: jsonSafe(context.stages, []),
    metadata
  }
}

async function render(msg) {
  const { id, entry, files, packages, options, maxOutputBytes } = msg
  activeRenderId = id
  try {
    const memFS = new MemoryFileSystem(files && typeof files === 'object' ? files : {})
    for (const pkg of Array.isArray(packages) ? packages : []) {
      try {
        await memFS.addPackage(pkg.name, pkg.version, Buffer.from(pkg.tarball))
      } catch (err) {
        send({ type: 'result', id, ok: false, kind: 'package', message: clip(err && err.message ? err.message : 'Package load failed') })
        return
      }
    }
    const context = await compiler.compileWithContext(entry, {
      outputFormat: options.outputFormat,
      parameters: options.parameters || {},
      fileSystem: memFS,
      verbose: options.verbose === true,
      registryUrl: options.registryUrl
    })
    const snap = snapshot(context)
    if (typeof snap.compiledResult === 'string' && Buffer.byteLength(snap.compiledResult, 'utf8') > maxOutputBytes) {
      send({ type: 'result', id, ok: false, kind: 'output_too_large' })
      return
    }
    send({ type: 'result', id, ok: true, context: snap })
  } catch (err) {
    send({ type: 'result', id, ok: false, kind: 'error', message: clip(err && err.message ? err.message : 'Compilation failed') })
  } finally {
    activeRenderId = null
    for (const [, pending] of pendingPackageRequests) pending.reject(new Error('Render finished'))
    pendingPackageRequests.clear()
  }
}

async function runProbe(msg) {
  const out = { type: 'probe-result', id: msg.id }
  try {
    switch (msg.probe) {
      case 'env':
        out.startupEnvKeys = startupEnvKeys
        out.envKeyCount = Object.keys(process.env).length
        break
      case 'fs-read':
        require('fs').readFileSync(String(msg.arg))
        out.allowed = true
        break
      case 'fs-write':
        require('fs').writeFileSync(String(msg.arg), 'probe')
        out.allowed = true
        break
      case 'spawn':
        require('child_process').spawnSync(process.execPath, ['--version'])
        out.allowed = true
        break
      case 'worker': {
        const { Worker } = require('worker_threads')
        const w = new Worker('0', { eval: true })
        w.terminate()
        out.allowed = true
        break
      }
      case 'codegen':
        out.value = new Function('return 1')() // eslint-disable-line no-new-func
        out.allowed = true
        break
      case 'fetch':
        // Loopback discard port: with the stub in place no socket is opened.
        await globalThis.fetch('http://127.0.0.1:9/')
        out.allowed = true
        break
      default:
        out.error = 'unknown probe'
    }
  } catch (err) {
    out.allowed = false
    out.code = err && err.code ? String(err.code) : undefined
    out.name = err && err.name ? String(err.name) : undefined
    out.message = err && err.message ? clip(err.message) : undefined
  }
  send(out)
}

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'render') {
    render(msg)
  } else if (msg.type === 'package') {
    const pending = pendingPackageRequests.get(msg.reqId)
    if (!pending) return
    pendingPackageRequests.delete(msg.reqId)
    if (msg.ok) pending.resolve({ tarball: Buffer.from(msg.tarball) })
    else pending.reject(new Error(typeof msg.message === 'string' ? msg.message : 'Package download failed'))
  } else if (msg.type === 'probe' && TEST_PROBES) {
    runProbe(msg)
  }
})

// The parent is the only reason to exist.
process.on('disconnect', () => process.exit(0))

send({ type: 'ready' })
