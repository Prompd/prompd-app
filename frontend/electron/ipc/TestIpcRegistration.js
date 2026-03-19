/**
 * TestIpcRegistration — IPC handlers for test:* channels
 *
 * Bridges the renderer process to @prompd/test for prompt test discovery,
 * execution, and live progress streaming.
 *
 * IMPORTANT: Passes the main process's @prompd/cli module to TestRunner
 * so they share the same ConfigManager singleton (API keys, provider config).
 *
 * Handlers: test:discover, test:run, test:runAll, test:stop
 * Events: test:progress (main → renderer)
 */

const { BaseIpcRegistration } = require('./IpcRegistration')
const crypto = require('crypto')

/** @type {import('@prompd/test') | null} */
let testModule = null

/** @type {any} */
let cliModule = null

/**
 * Lazy-load @prompd/test (CommonJS package)
 */
function getTestModule() {
  if (!testModule) {
    try {
      testModule = require('@prompd/test')
    } catch (err) {
      console.error('[TestIpc] Failed to load @prompd/test:', err.message)
      throw err
    }
  }
  return testModule
}

/**
 * Lazy-load @prompd/cli — same instance used by main.js
 */
async function getCliModule() {
  if (!cliModule) {
    try {
      cliModule = await import('@prompd/cli')
      // Use the singleton ConfigManager — same instance the PrompdExecutor uses internally
      const cm = cliModule.ConfigManager.getInstance
        ? cliModule.ConfigManager.getInstance()
        : new cliModule.ConfigManager()
      await cm.loadConfig()
      console.log('[TestIpc] @prompd/cli loaded and config initialized via singleton')
    } catch (err) {
      console.error('[TestIpc] Failed to load @prompd/cli:', err.message)
      throw err
    }
  }
  return cliModule
}

class TestIpcRegistration extends BaseIpcRegistration {
  constructor() {
    super('TestIpc')
    /** @type {Map<string, { abort: AbortController }>} */
    this.activeRuns = new Map()
  }

  register(ipcMain) {
    // Discover .test.prmd files in a directory
    ipcMain.handle('test:discover', async (_event, { directory }) => {
      try {
        const { TestDiscovery } = getTestModule()
        const discovery = new TestDiscovery()
        const result = await discovery.discover(directory)

        return {
          success: true,
          suites: result.suites.map(s => ({
            name: s.name,
            description: s.description,
            testFilePath: s.testFilePath,
            targetPath: s.target,
            testCount: s.tests.length,
            testNames: s.tests.map(t => t.name),
          })),
          errors: result.errors,
        }
      } catch (err) {
        return {
          success: false,
          suites: [],
          errors: [{ filePath: directory, message: err.message }],
        }
      }
    })

    // Run tests for a specific target
    ipcMain.handle('test:run', async (event, { target, options = {} }) => {
      return this._runTests(event, target, options)
    })

    // Run all tests in a directory
    ipcMain.handle('test:runAll', async (event, { directory, options = {} }) => {
      return this._runTests(event, directory, options)
    })

    // Stop a running test
    ipcMain.handle('test:stop', async (_event, { runId }) => {
      const run = this.activeRuns.get(runId)
      if (run) {
        run.abort.abort()
        this.activeRuns.delete(runId)
        return { success: true }
      }
      return { success: false, error: 'No active run with that ID' }
    })

    console.log('[TestIpc] Registered test:discover, test:run, test:runAll, test:stop')
  }

  /**
   * Internal: run tests with progress streaming
   */
  async _runTests(event, target, options) {
    const runId = crypto.randomUUID()
    const abort = new AbortController()
    this.activeRuns.set(runId, { abort })

    const sender = event.sender

    try {
      const { TestRunner } = getTestModule()
      // Pass the CLI module so TestRunner uses the same singleton (shared config/API keys)
      const cli = await getCliModule()
      const runner = new TestRunner(cli)

      // Progress callback sends events to renderer
      const onProgress = (progressEvent) => {
        if (abort.signal.aborted) return
        try {
          sender.send('test:progress', { runId, event: progressEvent })
        } catch {
          // Sender may be destroyed if window closed
        }
      }

      const result = await runner.run(target, options, onProgress)

      this.activeRuns.delete(runId)

      return {
        success: true,
        runId,
        result,
      }
    } catch (err) {
      this.activeRuns.delete(runId)
      return {
        success: false,
        runId,
        error: err.message,
      }
    }
  }

  async cleanup() {
    // Abort any running tests on app quit
    for (const [runId, run] of this.activeRuns) {
      run.abort.abort()
      this.activeRuns.delete(runId)
    }
  }
}

module.exports = { TestIpcRegistration }
