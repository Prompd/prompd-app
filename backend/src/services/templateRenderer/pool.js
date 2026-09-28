/* Isolated template renderer: a small pool of forked, least-privilege child
 * processes that run @prompd/cli's compile step (see child.cjs).
 *
 * Why a process and not an in-process guard: Nunjucks is not a sandbox, and
 * @prompd/cli's filters read properties directly, so no guard inside the API
 * process can be complete. A template that escapes the engine lands in a
 * process with no environment, no secrets, read access to code only, no
 * writes, no subprocesses, no eval, a small heap and a wall-clock limit.
 *
 * Pool choice: TEMPLATE_RENDER_POOL_SIZE warm children (default 2, max 4).
 * Each serves one render at a time; the rest queue (bounded). Forking costs a
 * few hundred ms (loading @prompd/cli), so children are kept warm and reused;
 * a child that times out is SIGKILLed and one that dies is replaced. Two
 * children keep one slow or hostile render from blocking every other user,
 * at ~100 MB RSS each.
 *
 * Only IPC crosses the boundary: in, a file map + parameters (+ package
 * tarballs); out, a plain snapshot of the compilation context or an error
 * kind. Failures become RendererError with an HTTP status and a generic
 * message, never an internal detail. */
import { fork } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const CHILD_PATH = fileURLToPath(new URL('./child.cjs', import.meta.url))

const MB = 1024 * 1024

export const DEFAULT_LIMITS = Object.freeze({
  poolSize: 2,
  timeoutMs: 10_000,
  startTimeoutMs: 20_000,
  maxOldSpaceMb: 128,
  maxInputBytes: 16 * MB,
  maxOutputBytes: 4 * MB,
  maxQueue: 64,
  maxPackageFetches: 16,
  maxPackageBytes: 20 * MB
})

const PACKAGE_NAME = /^@[\w.-]+\/[\w.-]+$/
const PACKAGE_VERSION = /^[\w.-]+$/

/** An error the routes can surface as-is: statusCode + code + a generic message. */
export class RendererError extends Error {
  constructor(message, statusCode, code) {
    super(message)
    this.name = 'RendererError'
    this.statusCode = statusCode
    this.code = code
    this.isRendererError = true
  }
}

const errors = {
  inputTooLarge: () => new RendererError('Template input exceeds the size limit', 413, 'TEMPLATE_INPUT_TOO_LARGE'),
  timeout: () => new RendererError('Template rendering timed out', 422, 'TEMPLATE_RENDER_TIMEOUT'),
  outputTooLarge: () => new RendererError('Compiled output exceeds the size limit', 422, 'TEMPLATE_OUTPUT_TOO_LARGE'),
  failed: () => new RendererError('Template rendering failed', 422, 'TEMPLATE_RENDER_FAILED'),
  busy: () => new RendererError('Template renderer is busy, try again shortly', 503, 'TEMPLATE_RENDERER_BUSY'),
  unavailable: () => new RendererError('Template renderer is unavailable', 503, 'TEMPLATE_RENDERER_UNAVAILABLE'),
  shutdown: () => new RendererError('Template renderer is shutting down', 503, 'TEMPLATE_RENDERER_UNAVAILABLE')
}

/** A package failed to load inside the child (bad archive, size, name). The
 * message comes from @prompd/cli's validation of the archive. */
export class PackageLoadError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PackageLoadError'
    this.code = 'PACKAGE_LOAD_FAILED'
  }
}

/** Wraps a child's snapshot so callers can use the CompilationContext API
 * they used in-process (hasErrors / getErrors / getWarnings). */
export class RenderedContext {
  constructor(snap) {
    this.compiledResult = snap.compiledResult
    this.errors = Array.isArray(snap.errors) ? snap.errors : []
    this.warnings = Array.isArray(snap.warnings) ? snap.warnings : []
    this.diagnostics = Array.isArray(snap.diagnostics) ? snap.diagnostics : []
    this.dependencies = snap.dependencies === undefined ? {} : snap.dependencies
    this.stages = snap.stages
    this.metadata = snap.metadata || undefined
  }

  hasErrors() {
    return this.errors.length > 0 || this.diagnostics.some((d) => d.severity === 'error')
  }

  getErrors() {
    return this.diagnostics.filter((d) => d.severity === 'error')
  }

  getWarnings() {
    return this.diagnostics.filter((d) => d.severity === 'warning')
  }
}

/** The flag that turns on Node's permission model: `--permission` where it
 * is stable (22.13+/23.5+), `--experimental-permission` on Node 20. */
export function permissionFlag(version = process.versions.node) {
  const [major, minor] = String(version).split('.').map((n) => Number.parseInt(n, 10))
  if (major > 23 || (major === 23 && minor >= 5) || (major === 22 && minor >= 13)) return '--permission'
  if (major >= 20) return '--experimental-permission'
  return null
}

function resolveCliEntry() {
  return require.resolve('@prompd/cli')
}

/** node_modules directory that holds @prompd/cli and its dependencies. */
function nodeModulesDir(cliEntry) {
  let dir = path.dirname(cliEntry)
  while (path.basename(dir) !== 'node_modules') {
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('Cannot locate node_modules for @prompd/cli')
    dir = parent
  }
  return dir
}

function inputSize(files, parameters, packages) {
  let total = 0
  for (const [p, content] of Object.entries(files)) {
    total += Buffer.byteLength(p, 'utf8')
    total += typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0
  }
  try {
    total += Buffer.byteLength(JSON.stringify(parameters ?? {}), 'utf8')
  } catch {
    return Infinity // circular / unserializable parameters
  }
  for (const pkg of packages) total += pkg.tarball?.length || 0
  return total
}

async function defaultFetchPackage(name, version, registryUrl) {
  const { RegistryClient } = await import('@prompd/cli')
  const client = new RegistryClient(registryUrl ? { registryUrl } : undefined)
  const { tarball } = await client.downloadPackageBuffer(name, version)
  return tarball
}

export class TemplateRendererPool {
  /**
   * @param {object} [options]
   * @param {number} [options.poolSize]
   * @param {number} [options.timeoutMs]        wall clock per render, then SIGKILL
   * @param {number} [options.maxOldSpaceMb]    child heap cap
   * @param {number} [options.maxInputBytes]
   * @param {number} [options.maxOutputBytes]
   * @param {number} [options.maxQueue]
   * @param {(name: string, version: string, registryUrl?: string) => Promise<Buffer>} [options.fetchPackage]
   * @param {boolean} [options.testProbes]      honoured only when NODE_ENV === 'test'
   */
  constructor(options = {}) {
    this.limits = { ...DEFAULT_LIMITS }
    for (const key of Object.keys(DEFAULT_LIMITS)) {
      const v = options[key]
      if (Number.isFinite(v) && v > 0) this.limits[key] = Math.floor(v)
    }
    this.limits.poolSize = Math.min(Math.max(this.limits.poolSize, 1), 4)
    this.fetchPackage = typeof options.fetchPackage === 'function' ? options.fetchPackage : defaultFetchPackage
    this.testProbes = options.testProbes === true && process.env.NODE_ENV === 'test'
    this.workers = new Set()
    this.queue = []
    this.nextJobId = 1
    this.closed = false
    this.startFailures = 0
    this.cliEntry = null
  }

  /** Arguments the child is forked with. Exposed for tests and review. */
  childExecArgv() {
    const cliEntry = this.cliEntry || (this.cliEntry = resolveCliEntry())
    const argv = [
      `--max-old-space-size=${this.limits.maxOldSpaceMb}`,
      '--disallow-code-generation-from-strings'
    ]
    const flag = permissionFlag()
    // Fail closed: without the permission model the child could read and
    // write the filesystem and spawn processes. Node 20+ has it.
    if (!flag) throw new Error(`Node ${process.version} has no permission model; refusing to render templates`)
    // No --allow-fs-write, --allow-child-process, --allow-worker, --allow-addons
    // or --allow-wasi: under the permission model each is denied unless granted.
    argv.push(flag, `--allow-fs-read=${CHILD_PATH}`, `--allow-fs-read=${nodeModulesDir(cliEntry)}`)
    return argv
  }

  /** Start children up to the pool size. Safe to call repeatedly. */
  warm() {
    if (this.closed) return
    while (this.workers.size < this.limits.poolSize) {
      if (!this.spawnWorker()) break
    }
  }

  spawnWorker() {
    if (this.startFailures >= 3) return false
    let child
    try {
      const execArgv = this.childExecArgv()
      const args = [this.cliEntry]
      if (this.testProbes) args.push('--test-probes')
      child = fork(CHILD_PATH, args, {
        env: {},
        execArgv,
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'pipe', 'ipc']
      })
    } catch (err) {
      // Deterministic (bad flags, missing module): stop trying for a while.
      this.startFailures = 3
      this.scheduleRecovery()
      console.error('[TemplateRenderer] fork failed:', err.message)
      return false
    }
    const worker = { child, ready: false, job: null, stderrTail: '' }
    this.workers.add(worker)

    child.stderr?.on('data', (chunk) => {
      worker.stderrTail = (worker.stderrTail + chunk.toString('utf8')).slice(-2000)
    })

    worker.startTimer = setTimeout(() => {
      if (!worker.ready) {
        console.error('[TemplateRenderer] child did not become ready in time')
        this.killWorker(worker)
      }
    }, this.limits.startTimeoutMs)
    worker.startTimer.unref?.()

    child.on('message', (msg) => this.onMessage(worker, msg))
    child.on('error', (err) => {
      console.error('[TemplateRenderer] child error:', err.message)
    })
    child.on('exit', (code, signal) => this.onExit(worker, code, signal))
    return true
  }

  onMessage(worker, msg) {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'ready') {
      worker.ready = true
      this.startFailures = 0
      clearTimeout(worker.startTimer)
      this.dispatch()
      return
    }
    const job = worker.job
    if (msg.type === 'probe-result') {
      if (job && job.kind === 'probe' && msg.id === job.id) this.finish(worker, job, null, msg)
      return
    }
    if (!job || msg.id !== job.id) return
    if (msg.type === 'fetch-package') {
      this.handlePackageRequest(worker, job, msg)
    } else if (msg.type === 'result') {
      if (msg.ok) {
        const snap = msg.context
        if (!snap || typeof snap !== 'object') return this.finish(worker, job, errors.failed())
        if (snap.compiledResult !== undefined && typeof snap.compiledResult !== 'string') {
          return this.finish(worker, job, errors.failed())
        }
        // Re-check here: the parent does not trust the child's own check.
        if (typeof snap.compiledResult === 'string' &&
            Buffer.byteLength(snap.compiledResult, 'utf8') > this.limits.maxOutputBytes) {
          return this.finish(worker, job, errors.outputTooLarge())
        }
        this.finish(worker, job, null, new RenderedContext(snap))
      } else if (msg.kind === 'output_too_large') {
        this.finish(worker, job, errors.outputTooLarge())
      } else if (msg.kind === 'package') {
        this.finish(worker, job, new PackageLoadError(typeof msg.message === 'string' ? msg.message : 'Package load failed'))
      } else {
        // A compile that threw: the message describes the user's own template.
        const err = new Error(typeof msg.message === 'string' ? msg.message : 'Compilation failed')
        err.name = 'CompilationError'
        this.finish(worker, job, err)
      }
    }
  }

  async handlePackageRequest(worker, job, msg) {
    const reply = (body) => {
      if (worker.job === job && worker.child.connected) {
        worker.child.send({ type: 'package', reqId: msg.reqId, ...body })
      }
    }
    job.packageFetches = (job.packageFetches || 0) + 1
    if (job.packageFetches > this.limits.maxPackageFetches) {
      return reply({ ok: false, message: 'Too many package references' })
    }
    const name = typeof msg.name === 'string' ? msg.name : ''
    const version = typeof msg.version === 'string' ? msg.version : ''
    if (!PACKAGE_NAME.test(name) || !PACKAGE_VERSION.test(version) || name.includes('..') || version.includes('..')) {
      return reply({ ok: false, message: 'Invalid package reference' })
    }
    try {
      const tarball = await this.fetchPackage(name, version, job.registryUrl)
      if (!Buffer.isBuffer(tarball) && !(tarball instanceof Uint8Array)) throw new Error('Invalid package archive')
      if (tarball.length > this.limits.maxPackageBytes) throw new Error('Package exceeds the size limit')
      reply({ ok: true, tarball })
    } catch (err) {
      reply({ ok: false, message: `Package download failed: ${name}@${version}` })
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[TemplateRenderer] package download failed:', name, version, err?.message)
      }
    }
  }

  onExit(worker, code, signal) {
    clearTimeout(worker.startTimer)
    this.workers.delete(worker)
    if (!worker.ready) {
      this.startFailures++
      if (worker.stderrTail) console.error('[TemplateRenderer] child failed to start:', worker.stderrTail)
    }
    const job = worker.job
    if (job) {
      worker.job = null
      clearTimeout(job.timer)
      job.reject(job.timedOut ? errors.timeout() : errors.failed())
      if (!job.timedOut && process.env.NODE_ENV !== 'test') {
        console.error('[TemplateRenderer] child exited during a render:', code, signal)
      }
    }
    if (this.closed) return
    if (this.startFailures >= 3) {
      // Children cannot start: fail waiting jobs instead of spinning.
      for (const queued of this.queue.splice(0)) queued.reject(errors.unavailable())
      this.scheduleRecovery()
      return
    }
    if (this.queue.length > 0) this.warm()
  }

  scheduleRecovery() {
    if (this.recoveryTimer) return
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null
      this.startFailures = 0
    }, 30_000)
    this.recoveryTimer.unref?.()
  }

  killWorker(worker) {
    try {
      worker.child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }

  finish(worker, job, err, value) {
    if (worker.job !== job) return
    worker.job = null
    clearTimeout(job.timer)
    if (err) job.reject(err)
    else job.resolve(value)
    this.dispatch()
  }

  dispatch() {
    if (this.closed) return
    for (const worker of this.workers) {
      if (this.queue.length === 0) return
      if (!worker.ready || worker.job || !worker.child.connected) continue
      const job = this.queue.shift()
      worker.job = job
      job.timer = setTimeout(() => {
        job.timedOut = true
        this.killWorker(worker) // onExit rejects the job and a new child replaces this one
      }, this.limits.timeoutMs)
      job.timer.unref?.()
      try {
        worker.child.send(job.message)
      } catch {
        this.killWorker(worker)
      }
    }
    if (this.queue.length > 0) this.warm()
  }

  enqueue(kind, message, extra = {}) {
    if (this.closed) return Promise.reject(errors.shutdown())
    if (this.startFailures >= 3) return Promise.reject(errors.unavailable())
    if (this.queue.length >= this.limits.maxQueue) return Promise.reject(errors.busy())
    return new Promise((resolve, reject) => {
      const id = this.nextJobId++
      this.queue.push({ id, kind, message: { ...message, id }, resolve, reject, ...extra })
      this.warm()
      if (this.workers.size === 0) {
        for (const queued of this.queue.splice(0)) queued.reject(errors.unavailable())
        return
      }
      this.dispatch()
    })
  }

  /**
   * Compile `entry` from `files` in a child. Resolves to a RenderedContext;
   * rejects with RendererError (timeout, size, crash, busy), PackageLoadError,
   * or an Error named CompilationError carrying the compiler's message.
   *
   * @param {object} req
   * @param {string} req.entry                 path of the main .prmd in `files`
   * @param {Record<string, string>} req.files
   * @param {{name: string, version: string, tarball: Buffer}[]} [req.packages]
   * @param {string} [req.outputFormat]
   * @param {object} [req.parameters]
   * @param {boolean} [req.verbose]
   * @param {string} [req.registryUrl]
   */
  render(req) {
    const files = {}
    if (req.files && typeof req.files === 'object') {
      for (const [p, content] of Object.entries(req.files)) {
        if (typeof content === 'string') files[p] = content
      }
    }
    const packages = Array.isArray(req.packages) ? req.packages : []
    if (inputSize(files, req.parameters, packages) > this.limits.maxInputBytes) {
      return Promise.reject(errors.inputTooLarge())
    }
    return this.enqueue('render', {
      type: 'render',
      entry: String(req.entry),
      files,
      packages: packages.map((p) => ({ name: String(p.name), version: String(p.version), tarball: p.tarball })),
      options: {
        outputFormat: req.outputFormat,
        parameters: req.parameters ?? {},
        verbose: req.verbose === true,
        registryUrl: req.registryUrl
      },
      maxOutputBytes: this.limits.maxOutputBytes
    }, { registryUrl: req.registryUrl })
  }

  /** Test-only: ask a child to report on its own privileges. */
  probe(probe, arg) {
    if (!this.testProbes) return Promise.reject(new Error('Probes are disabled'))
    return this.enqueue('probe', { type: 'probe', probe, arg })
  }

  /** Kill every child and fail queued work. */
  async shutdown() {
    this.closed = true
    clearTimeout(this.recoveryTimer)
    for (const queued of this.queue.splice(0)) queued.reject(errors.shutdown())
    const exits = []
    for (const worker of this.workers) {
      exits.push(new Promise((resolve) => {
        if (worker.child.exitCode !== null || worker.child.signalCode !== null) return resolve()
        worker.child.once('exit', () => resolve())
      }))
      this.killWorker(worker)
    }
    await Promise.all(exits)
  }
}

function envInt(name) {
  const v = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : undefined
}

let sharedPool = null

/** The process-wide pool, created on first use from TEMPLATE_RENDER_* env. */
export function getTemplateRenderer() {
  if (!sharedPool) {
    sharedPool = new TemplateRendererPool({
      poolSize: envInt('TEMPLATE_RENDER_POOL_SIZE'),
      timeoutMs: envInt('TEMPLATE_RENDER_TIMEOUT_MS'),
      maxOldSpaceMb: envInt('TEMPLATE_RENDER_MAX_OLD_SPACE_MB'),
      maxInputBytes: envInt('TEMPLATE_RENDER_MAX_INPUT_BYTES'),
      maxOutputBytes: envInt('TEMPLATE_RENDER_MAX_OUTPUT_BYTES')
    })
  }
  return sharedPool
}

export async function shutdownTemplateRenderer() {
  if (sharedPool) {
    const pool = sharedPool
    sharedPool = null
    await pool.shutdown()
  }
}
