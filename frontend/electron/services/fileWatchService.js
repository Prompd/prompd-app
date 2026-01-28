/**
 * File Watch Service - File system change detection for workflow triggers
 *
 * Uses chokidar for cross-platform file watching with:
 * - Glob pattern support
 * - Event filtering (create, modify, delete)
 * - Debouncing to prevent rapid-fire triggers
 * - Recursive directory watching
 */

const chokidar = require('chokidar')
const path = require('path')
const EventEmitter = require('events')

/**
 * @typedef {Object} FileWatchConfig
 * @property {string} workflowId - Workflow this watcher triggers
 * @property {string[]} paths - Paths or glob patterns to watch
 * @property {('create' | 'modify' | 'delete')[]} [events] - Events to listen for (default: all)
 * @property {number} [debounceMs] - Debounce time in ms (default: 500)
 * @property {boolean} [recursive] - Watch directories recursively (default: true)
 * @property {string[]} [ignored] - Patterns to ignore (default: node_modules, .git)
 * @property {boolean} [persistent] - Keep process running (default: true)
 */

/**
 * @typedef {Object} FileWatcher
 * @property {string} workflowId
 * @property {FileWatchConfig} config
 * @property {import('chokidar').FSWatcher | null} watcher
 * @property {boolean} paused
 * @property {number} triggerCount
 * @property {NodeJS.Timeout | null} debounceTimer
 * @property {Object[]} pendingEvents - Events waiting for debounce
 */

class FileWatchService extends EventEmitter {
  constructor() {
    super()
    /** @type {Map<string, FileWatcher>} */
    this.watchers = new Map()
  }

  /**
   * Add a file watcher for a workflow
   * @param {FileWatchConfig} config
   */
  addWatcher(config) {
    const { workflowId, paths } = config

    // Remove existing watcher if present
    if (this.watchers.has(workflowId)) {
      this.removeWatcher(workflowId)
    }

    // Normalize config
    const normalizedConfig = {
      ...config,
      events: config.events || ['create', 'modify', 'delete'],
      debounceMs: config.debounceMs || 500,
      recursive: config.recursive !== false,
      ignored: config.ignored || ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.prompd/**'],
      persistent: config.persistent !== false,
    }

    /** @type {FileWatcher} */
    const fileWatcher = {
      workflowId,
      config: normalizedConfig,
      watcher: null,
      paused: false,
      triggerCount: 0,
      debounceTimer: null,
      pendingEvents: [],
    }

    // Create chokidar watcher
    const watcherOptions = {
      ignored: normalizedConfig.ignored,
      persistent: normalizedConfig.persistent,
      ignoreInitial: true, // Don't emit events for existing files on start
      followSymlinks: false,
      usePolling: false, // Use native events when available
      depth: normalizedConfig.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    }

    fileWatcher.watcher = chokidar.watch(paths, watcherOptions)

    // Event handlers with debouncing
    const handleEvent = (eventType, filePath) => {
      if (fileWatcher.paused) return

      // Map chokidar events to our event types
      const eventMap = {
        add: 'create',
        change: 'modify',
        unlink: 'delete',
        addDir: 'create',
        unlinkDir: 'delete',
      }

      const normalizedEvent = eventMap[eventType]
      if (!normalizedEvent || !normalizedConfig.events.includes(normalizedEvent)) {
        return
      }

      // Add to pending events
      fileWatcher.pendingEvents.push({
        type: normalizedEvent,
        path: filePath,
        timestamp: Date.now(),
      })

      // Debounce
      if (fileWatcher.debounceTimer) {
        clearTimeout(fileWatcher.debounceTimer)
      }

      fileWatcher.debounceTimer = setTimeout(() => {
        this.flushPendingEvents(workflowId)
      }, normalizedConfig.debounceMs)
    }

    // Attach event listeners
    fileWatcher.watcher
      .on('add', (filePath) => handleEvent('add', filePath))
      .on('change', (filePath) => handleEvent('change', filePath))
      .on('unlink', (filePath) => handleEvent('unlink', filePath))
      .on('addDir', (filePath) => handleEvent('addDir', filePath))
      .on('unlinkDir', (filePath) => handleEvent('unlinkDir', filePath))
      .on('error', (error) => {
        console.error(`[FileWatch] Error for workflow ${workflowId}:`, error.message)
        this.emit('error', { workflowId, error: error.message })
      })
      .on('ready', () => {
        console.log(`[FileWatch] Ready for workflow ${workflowId}, watching ${paths.length} path(s)`)
        this.emit('ready', { workflowId, paths })
      })

    this.watchers.set(workflowId, fileWatcher)

    return {
      workflowId,
      paths: normalizedConfig.paths,
      events: normalizedConfig.events,
    }
  }

  /**
   * Flush pending events and emit trigger
   * @param {string} workflowId
   * @private
   */
  flushPendingEvents(workflowId) {
    const watcher = this.watchers.get(workflowId)
    if (!watcher || watcher.pendingEvents.length === 0) return

    const events = [...watcher.pendingEvents]
    watcher.pendingEvents = []
    watcher.debounceTimer = null
    watcher.triggerCount++

    // Deduplicate events by path (keep the most recent)
    const eventsByPath = new Map()
    for (const event of events) {
      eventsByPath.set(event.path, event)
    }
    const uniqueEvents = Array.from(eventsByPath.values())

    console.log(
      `[FileWatch] Triggering workflow ${workflowId} with ${uniqueEvents.length} file event(s)`
    )

    this.emit('trigger', {
      workflowId,
      type: 'file-watch',
      timestamp: Date.now(),
      files: uniqueEvents,
    })
  }

  /**
   * Remove a file watcher
   * @param {string} workflowId
   */
  removeWatcher(workflowId) {
    const watcher = this.watchers.get(workflowId)
    if (!watcher) return false

    // Clear debounce timer
    if (watcher.debounceTimer) {
      clearTimeout(watcher.debounceTimer)
    }

    // Close watcher
    if (watcher.watcher) {
      watcher.watcher.close()
    }

    this.watchers.delete(workflowId)
    console.log(`[FileWatch] Removed watcher for workflow ${workflowId}`)
    return true
  }

  /**
   * Pause a file watcher
   * @param {string} workflowId
   */
  pauseWatcher(workflowId) {
    const watcher = this.watchers.get(workflowId)
    if (!watcher) return false

    watcher.paused = true
    watcher.pendingEvents = []

    if (watcher.debounceTimer) {
      clearTimeout(watcher.debounceTimer)
      watcher.debounceTimer = null
    }

    console.log(`[FileWatch] Paused watcher for workflow ${workflowId}`)
    this.emit('watcherPaused', { workflowId })
    return true
  }

  /**
   * Resume a paused watcher
   * @param {string} workflowId
   */
  resumeWatcher(workflowId) {
    const watcher = this.watchers.get(workflowId)
    if (!watcher) return false

    watcher.paused = false
    console.log(`[FileWatch] Resumed watcher for workflow ${workflowId}`)
    this.emit('watcherResumed', { workflowId })
    return true
  }

  /**
   * Stop all file watchers
   */
  stopAll() {
    for (const workflowId of this.watchers.keys()) {
      this.removeWatcher(workflowId)
    }
    console.log('[FileWatch] Stopped all watchers')
  }

  /**
   * Restart all file watchers
   */
  async restartAll() {
    const configs = []
    for (const watcher of this.watchers.values()) {
      configs.push(watcher.config)
    }

    this.stopAll()

    for (const config of configs) {
      this.addWatcher(config)
    }

    console.log('[FileWatch] Restarted all watchers')
  }

  /**
   * Get watcher status
   * @param {string} workflowId
   */
  getWatcherStatus(workflowId) {
    const watcher = this.watchers.get(workflowId)
    if (!watcher) return null

    return {
      workflowId: watcher.workflowId,
      paused: watcher.paused,
      triggerCount: watcher.triggerCount,
      config: watcher.config,
      pendingEvents: watcher.pendingEvents.length,
    }
  }

  /**
   * Get count of active (non-paused) watchers
   * @returns {number}
   */
  getActiveCount() {
    let count = 0
    for (const watcher of this.watchers.values()) {
      if (!watcher.paused) {
        count++
      }
    }
    return count
  }

  /**
   * Get all watchers' paths for a workflow
   * @param {string} workflowId
   * @returns {string[] | null}
   */
  getWatchedPaths(workflowId) {
    const watcher = this.watchers.get(workflowId)
    if (!watcher) return null
    return [...watcher.config.paths]
  }

  /**
   * Clean up all watchers
   */
  shutdown() {
    this.stopAll()
    console.log('[FileWatch] Shutdown complete')
  }
}

// Export singleton instance
const fileWatchService = new FileWatchService()

module.exports = {
  fileWatchService,
  FileWatchService,
}
