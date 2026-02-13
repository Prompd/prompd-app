/**
 * GA4 Analytics Service (Measurement Protocol)
 *
 * Sends anonymous usage events to Google Analytics 4 via the Measurement Protocol.
 * All tracking is opt-in and can be toggled by the user at any time.
 *
 * Privacy guarantees:
 *   - No PII is ever sent (no emails, names, file paths, prompt content)
 *   - client_id is a random UUID (not tied to any account)
 *   - Only event names + high-level counts are transmitted
 *   - Fully disabled by default until user opts in
 *
 * Setup:
 *   Set GA4_MEASUREMENT_ID and GA4_API_SECRET in environment or pass to init().
 *   Create a "Web" data stream in GA4 Admin, then generate a Measurement Protocol
 *   API secret under Admin > Data Streams > [stream] > Measurement Protocol API secrets.
 */

const https = require('https')
const { randomUUID } = require('crypto')
const path = require('path')
const fs = require('fs')
const os = require('os')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect'
const CLIENT_ID_FILE = path.join(os.homedir(), '.prompd', 'analytics-client-id')

// Batch config: buffer events and flush periodically to reduce network calls
const FLUSH_INTERVAL_MS = 30_000 // 30 seconds
const MAX_BATCH_SIZE = 25 // GA4 MP max per request

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let measurementId = ''
let apiSecret = ''
let clientId = ''
let sessionId = ''
let enabled = false
let initialized = false
let appVersion = ''
let electronVersion = ''
let platform = ''

/** @type {Array<{name: string, params: Record<string, unknown>}>} */
let eventBuffer = []

/** @type {NodeJS.Timeout | null} */
let flushTimer = null

// ---------------------------------------------------------------------------
// Client ID persistence
// ---------------------------------------------------------------------------

/**
 * Get or create a stable anonymous client ID.
 * Persisted to ~/.prompd/analytics-client-id so it survives app restarts
 * (required by GA4 for session/user counting).
 */
function getOrCreateClientId() {
  try {
    if (fs.existsSync(CLIENT_ID_FILE)) {
      const stored = fs.readFileSync(CLIENT_ID_FILE, 'utf-8').trim()
      if (stored) return stored
    }
  } catch {
    // ignore read errors
  }

  const newId = randomUUID()
  try {
    const dir = path.dirname(CLIENT_ID_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(CLIENT_ID_FILE, newId, 'utf-8')
  } catch {
    // non-fatal: still use the generated ID for this session
  }
  return newId
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the analytics service.
 * @param {object} opts
 * @param {string} opts.measurementId - GA4 Measurement ID (G-XXXXXX)
 * @param {string} opts.apiSecret     - Measurement Protocol API secret
 * @param {string} opts.appVersion    - App version (e.g. "0.0.1-beta")
 * @param {boolean} [opts.enabled]    - Whether tracking is enabled (default: false)
 */
function init(opts) {
  measurementId = opts.measurementId || process.env.GA4_MEASUREMENT_ID || ''
  apiSecret = opts.apiSecret || process.env.GA4_API_SECRET || ''
  appVersion = opts.appVersion || ''
  electronVersion = process.versions.electron || ''
  platform = `${os.type()} ${os.arch()}`
  enabled = opts.enabled === true

  clientId = getOrCreateClientId()
  sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  initialized = true

  // Start periodic flush
  if (flushTimer) clearInterval(flushTimer)
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)

  if (enabled && measurementId && apiSecret) {
    console.log('[Analytics] Initialized (enabled)')
  } else if (!measurementId || !apiSecret) {
    console.log('[Analytics] Initialized (no credentials - events will be buffered but not sent)')
  } else {
    console.log('[Analytics] Initialized (disabled by user preference)')
  }
}

/**
 * Enable or disable tracking at runtime.
 * When disabled, buffered events are discarded.
 */
function setEnabled(value) {
  enabled = value === true
  if (!enabled) {
    eventBuffer = []
  }
}

/**
 * Check if analytics is currently enabled.
 */
function isEnabled() {
  return enabled
}

/**
 * Track an event.
 * Events are buffered and flushed periodically.
 *
 * @param {string} eventName - GA4 event name (e.g. "workflow_execute")
 * @param {Record<string, unknown>} [params] - Event parameters
 */
function trackEvent(eventName, params = {}) {
  if (!initialized || !enabled) return

  // Attach common params
  const event = {
    name: eventName,
    params: {
      app_version: appVersion,
      platform,
      electron_version: electronVersion,
      session_id: sessionId,
      engagement_time_msec: '100',
      ...params,
    },
  }

  eventBuffer.push(event)

  // Auto-flush if buffer is full
  if (eventBuffer.length >= MAX_BATCH_SIZE) {
    flush()
  }
}

/**
 * Flush buffered events to GA4.
 * Called periodically and on app quit.
 */
function flush() {
  if (!enabled || !measurementId || !apiSecret || eventBuffer.length === 0) {
    return
  }

  // Take current batch
  const batch = eventBuffer.splice(0, MAX_BATCH_SIZE)

  const payload = JSON.stringify({
    client_id: clientId,
    events: batch,
  })

  const url = new URL(GA4_ENDPOINT)
  url.searchParams.set('measurement_id', measurementId)
  url.searchParams.set('api_secret', apiSecret)

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  }

  const req = https.request(url.toString(), options, (res) => {
    // GA4 MP returns 204 on success, but we don't block on it
    if (res.statusCode !== 204 && res.statusCode !== 200) {
      console.warn(`[Analytics] GA4 returned ${res.statusCode}`)
    }
    // Consume response data to free resources
    res.resume()
  })

  req.on('error', (err) => {
    // Non-fatal: analytics should never break the app
    console.warn('[Analytics] Failed to send events:', err.message)
  })

  req.write(payload)
  req.end()
}

/**
 * Shutdown: flush remaining events and stop the timer.
 * Call this on app quit.
 */
function shutdown() {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  flush()
}

// ---------------------------------------------------------------------------
// Convenience event helpers
// ---------------------------------------------------------------------------

function trackAppOpen() {
  trackEvent('app_open', { event_category: 'app' })
}

function trackAppClose() {
  trackEvent('app_close', { event_category: 'app' })
}

function trackPromptCompile(provider) {
  trackEvent('prompt_compile', {
    event_category: 'execution',
    provider: provider || 'unknown',
  })
}

function trackPromptExecute(provider, model) {
  trackEvent('prompt_execute', {
    event_category: 'execution',
    provider: provider || 'unknown',
    model: model || 'unknown',
  })
}

function trackWorkflowExecute(nodeCount) {
  trackEvent('workflow_execute', {
    event_category: 'execution',
    node_count: nodeCount || 0,
  })
}

function trackDeploymentCreate() {
  trackEvent('deployment_create', { event_category: 'deployment' })
}

function trackPackageInstall(packageName) {
  // Only send the package namespace, not full path
  const ns = packageName?.split('/').slice(0, 2).join('/') || 'unknown'
  trackEvent('package_install', {
    event_category: 'package',
    package_namespace: ns,
  })
}

function trackFileOpen(fileType) {
  trackEvent('file_open', {
    event_category: 'editor',
    file_type: fileType || 'unknown',
  })
}

function trackFeatureUse(featureName) {
  trackEvent('feature_use', {
    event_category: 'feature',
    feature_name: featureName,
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  init,
  setEnabled,
  isEnabled,
  trackEvent,
  flush,
  shutdown,
  trackAppOpen,
  trackAppClose,
  trackPromptCompile,
  trackPromptExecute,
  trackWorkflowExecute,
  trackDeploymentCreate,
  trackPackageInstall,
  trackFileOpen,
  trackFeatureUse,
}
