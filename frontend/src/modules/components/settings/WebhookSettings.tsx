import { useState, useEffect } from 'react'
import { Copy, CheckCircle, AlertCircle, Key, Info, Wifi, WifiOff, Activity } from 'lucide-react'
import './WebhookSettings.css'

interface WebhookStatus {
  enabled: boolean
  active: boolean
  mode: 'websocket' | 'polling' | 'disabled'
}

export function WebhookSettings() {
  const [webhookEnabled, setWebhookEnabled] = useState(true)
  const [webhookMode, setWebhookMode] = useState<'websocket' | 'polling'>('websocket')
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus>({
    enabled: false,
    active: false,
    mode: 'disabled'
  })
  const [hasRegistryToken, setHasRegistryToken] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [consecutiveErrors, setConsecutiveErrors] = useState(0)

  useEffect(() => {
    checkRegistryToken()
    checkWebhookStatus()

    // Reduce polling frequency if service is consistently unavailable
    const pollingInterval = consecutiveErrors > 3 ? 30000 : 5000 // 30s if errors, otherwise 5s
    const interval = setInterval(checkWebhookStatus, pollingInterval)
    return () => clearInterval(interval)
  }, [consecutiveErrors])

  const checkRegistryToken = async () => {
    try {
      // Check if registry token exists in config
      const response = await fetch('/api/config/registry-token')
      if (response.ok) {
        const data = await response.json()
        setHasRegistryToken(!!data.token)
        setUserId(data.userId || null)
      }
    } catch (error) {
      console.error('Failed to check registry token:', error)
    }
  }

  const checkWebhookStatus = async () => {
    try {
      // Check service health
      const response = await fetch('http://localhost:9876/health', {
        signal: AbortSignal.timeout(2000) // 2s timeout
      })
      if (response.ok) {
        const data = await response.json()
        setWebhookStatus(data.webhooks || { enabled: false, active: false, mode: 'disabled' })
        setConsecutiveErrors(0) // Reset on success
      } else {
        // Service responded but with error
        setWebhookStatus({ enabled: false, active: false, mode: 'disabled' })
        setConsecutiveErrors(prev => prev + 1)
      }
    } catch (error) {
      // Service not running - don't show error, just show disabled
      setWebhookStatus({ enabled: false, active: false, mode: 'disabled' })
      setConsecutiveErrors(prev => prev + 1)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleWebhookProxy = async () => {
    // This would update the service configuration
    // For now, just toggle the state
    setWebhookEnabled(!webhookEnabled)
  }

  const webhookUrl = userId
    ? `https://api.prompd.app/webhook-proxy/${userId}/:workflowId`
    : 'https://api.prompd.app/webhook-proxy/:userId/:workflowId'

  return (
    <div className="webhook-settings">
      <div className="settings-section">
        <div className="section-header">
          <h3>Webhook Proxy</h3>
          <p className="section-description">
            Enable webhooks for workflows running on your local machine.
            The cloud proxy forwards webhook requests to your local service.
          </p>
        </div>

        {/* Important Notice */}
        <div className="webhook-notice">
          <AlertCircle size={18} />
          <div className="notice-content">
            <strong>Internet Connection Required</strong>
            <p>
              Webhooks require the cloud proxy service at <code>api.prompd.app</code> to forward external webhook requests
              to your local machine. An active internet connection is mandatory for webhook functionality.
              The local service connects to the cloud proxy via WebSocket or polling to receive forwarded webhooks.
            </p>
            <p>
              Unlike direct local webhook reception (which requires port forwarding), the proxy eliminates the need
              to expose your local machine to the internet while still enabling external services (GitHub, Stripe, etc.)
              to trigger your workflows.
            </p>
          </div>
        </div>

        {/* Registry Token Status */}
        <div className="registry-token-status">
          <div className="status-header">
            <Key size={16} />
            <h4>Authentication</h4>
          </div>

          <p className="help-text">
            Webhook proxy uses your existing registry token for authentication.
          </p>

          {hasRegistryToken ? (
            <div className="token-status success">
              <CheckCircle size={16} />
              <div className="token-info">
                <span>Registry token found in <code>~/.prompd/config.yaml</code></span>
                {userId && <span className="user-id">User ID: {userId}</span>}
              </div>
            </div>
          ) : (
            <div className="token-status warning">
              <AlertCircle size={16} />
              <div className="token-info">
                <span>No registry token found</span>
                <span className="help-text">
                  Run <code>prompd registry login</code> to authenticate
                </span>
              </div>
            </div>
          )}

          <details className="config-help">
            <summary>
              <Info size={14} />
              Where is my registry token?
            </summary>
            <div className="config-details">
              <p>Your registry token is stored at:</p>
              <code className="file-path">~/.prompd/config.yaml</code>
              <pre className="config-example">{`registry:
  registries:
    prompdhub:
      api_key: "prompd_abc123..."  ← Used for webhook auth
      username: "yourname"`}</pre>
              <p>The service automatically reads this token - no configuration needed!</p>
            </div>
          </details>
        </div>

        {/* Connection Status */}
        <div className="connection-status-section">
          <div className="status-header">
            <Activity size={16} />
            <h4>Connection Status</h4>
          </div>

          {loading ? (
            <div className="status-badge loading">
              <div className="spinner" />
              Checking connection...
            </div>
          ) : (
            <>
              <div className={`status-badge ${webhookStatus.active ? 'connected' : webhookStatus.enabled ? 'disconnected' : 'disabled'}`}>
                {webhookStatus.active ? (
                  <>
                    <Wifi size={16} />
                    <div className="status-info">
                      <span className="status-label">Connected</span>
                      <span className="status-mode">
                        Mode: {webhookStatus.mode === 'websocket' ? 'WebSocket (real-time)' : 'Polling (15s interval)'}
                      </span>
                    </div>
                  </>
                ) : webhookStatus.enabled ? (
                  <>
                    <WifiOff size={16} />
                    <div className="status-info">
                      <span className="status-label">Disconnected</span>
                      <span className="status-mode">Service not running or connection failed</span>
                    </div>
                  </>
                ) : (
                  <>
                    <WifiOff size={16} />
                    <div className="status-info">
                      <span className="status-label">Disabled</span>
                      <span className="status-mode">Webhooks are disabled (ENABLE_WEBHOOKS=false)</span>
                    </div>
                  </>
                )}
              </div>

              {!webhookStatus.enabled && (
                <div className="status-help">
                  <Info size={14} />
                  <span>
                    {hasRegistryToken
                      ? 'Start the service with ENABLE_WEBHOOKS=true (default) to enable webhook proxy'
                      : 'Authenticate with prompd registry login first, then start the service to enable webhooks'}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Webhook URL */}
        {hasRegistryToken && (
          <div className="webhook-url-section">
            <div className="status-header">
              <h4>Your Webhook URL</h4>
            </div>

            <div className="url-display">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="webhook-url-input"
              />
              <button
                onClick={() => handleCopy(webhookUrl)}
                className="btn-copy"
                title="Copy URL"
              >
                {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="url-help">
              <Info size={14} />
              <div className="help-content">
                <p>Replace <code>:workflowId</code> with your workflow's ID.</p>
                <p className="example">
                  Example: <code>https://api.prompd.app/webhook-proxy/{userId || 'user-123'}/my-workflow-id</code>
                </p>
                <p>Use this URL when configuring webhooks in external services (GitHub, Stripe, etc.)</p>
              </div>
            </div>
          </div>
        )}

        {/* Mode Configuration */}
        <div className="mode-configuration">
          <div className="status-header">
            <h4>Connection Mode</h4>
          </div>

          <div className="mode-options">
            <label className="mode-option">
              <input
                type="radio"
                name="webhook-mode"
                value="websocket"
                checked={webhookMode === 'websocket'}
                onChange={() => setWebhookMode('websocket')}
                disabled={!hasRegistryToken}
              />
              <div className="mode-info">
                <span className="mode-label">WebSocket (Recommended)</span>
                <span className="mode-description">Real-time delivery with instant webhook reception</span>
              </div>
            </label>

            <label className="mode-option">
              <input
                type="radio"
                name="webhook-mode"
                value="polling"
                checked={webhookMode === 'polling'}
                onChange={() => setWebhookMode('polling')}
                disabled={!hasRegistryToken}
              />
              <div className="mode-info">
                <span className="mode-label">Polling</span>
                <span className="mode-description">15-second interval polling (fallback when WebSocket unavailable)</span>
              </div>
            </label>
          </div>

          <p className="mode-note">
            The service automatically falls back to polling if WebSocket connection fails.
          </p>
        </div>

        {/* How It Works */}
        <details className="how-it-works">
          <summary>
            <Info size={14} />
            How webhook proxy works
          </summary>
          <div className="workflow-diagram">
            <div className="workflow-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <strong>External System</strong>
                <span>GitHub, Stripe, etc. sends webhook to cloud proxy</span>
              </div>
            </div>
            <div className="workflow-arrow">↓</div>
            <div className="workflow-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <strong>Cloud Proxy</strong>
                <span>api.prompd.app receives and queues webhook (5-minute TTL)</span>
              </div>
            </div>
            <div className="workflow-arrow">↓</div>
            <div className="workflow-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <strong>Delivery</strong>
                <span>WebSocket (real-time) or Polling (15s interval)</span>
              </div>
            </div>
            <div className="workflow-arrow">↓</div>
            <div className="workflow-step">
              <div className="step-number">4</div>
              <div className="step-content">
                <strong>Local Service</strong>
                <span>Receives webhook and executes workflow with webhook data</span>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}
