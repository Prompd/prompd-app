/**
 * Service & Webhook Settings
 *
 * Merged component for service management and webhook configuration
 * Includes user-level service install/uninstall functionality
 */

import { useState, useEffect } from 'react'
import {
  Server,
  CheckCircle,
  XCircle,
  Activity,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  Download,
  Trash2,
  Wifi,
  WifiOff,
  Copy,
  Key,
  Info,
  Loader
} from 'lucide-react'
import { useUIStore } from '../../../stores/uiStore'
import { useConfirmDialog } from '../ConfirmDialog'
import './ServiceAndWebhookSettings.css'

interface ServiceHealth {
  status: string
  uptime: number
  activeDeployments: number
  enabledTriggers: number
  webhooks: {
    enabled: boolean
    active: boolean
    mode: string
  }
  timestamp: string
}

interface ServiceStatus {
  installed: boolean
  running: boolean
  mode: 'electron' | 'system-service'
  autoStart: boolean
}

interface WebhookStatus {
  enabled: boolean
  active: boolean
  mode: 'websocket' | 'polling' | 'disabled'
}

export function ServiceAndWebhookSettings() {
  const [serviceUrl, setServiceUrl] = useState('http://localhost:9876')
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null)
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // Webhook state
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus>({
    enabled: false,
    active: false,
    mode: 'disabled'
  })
  const [hasRegistryToken, setHasRegistryToken] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const addToast = useUIStore(state => state.addToast)
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()

  useEffect(() => {
    checkServiceHealth()
    checkServiceStatus()
    checkRegistryToken()

    const interval = setInterval(() => {
      checkServiceHealth()
      checkServiceStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [serviceUrl])

  const checkServiceHealth = async () => {
    try {
      const response = await fetch(`${serviceUrl}/health`, {
        signal: AbortSignal.timeout(2000)
      })

      if (response.ok) {
        const data = await response.json()
        setServiceHealth(data)
        setWebhookStatus(data.webhooks || { enabled: false, active: false, mode: 'disabled' })
        setIsConnected(true)
        setError(null)
      } else {
        setIsConnected(false)
        setError(`Service responded with status ${response.status}`)
      }
    } catch (err) {
      setIsConnected(false)
      setServiceHealth(null)
      setWebhookStatus({ enabled: false, active: false, mode: 'disabled' })
      setError('Service not responding')
    } finally {
      setLoading(false)
    }
  }

  const checkServiceStatus = async () => {
    if (!window.electronAPI?.service) return

    try {
      const status = await window.electronAPI.service.getStatus()
      setServiceStatus(status)
    } catch (error) {
      console.error('Failed to check service status:', error)
    }
  }

  const checkRegistryToken = async () => {
    try {
      if (window.electronAPI?.registry) {
        const result = await window.electronAPI.registry.getConfig()
        if (result.success && result.config) {
          // Check if there's an API key in the default registry
          const defaultRegistry = result.config.registries?.[result.config.default || 'prompdhub']
          setHasRegistryToken(!!defaultRegistry?.api_key)
          setUserId(defaultRegistry?.username || null)
        }
      }
    } catch (error) {
      console.error('Failed to check registry token:', error)
    }
  }

  const handleInstallService = async () => {
    if (!window.electronAPI?.service) return

    setActionInProgress('Installing service...')
    try {
      addToast('Installing background service. This may take a minute...', 'info')
      const result = await window.electronAPI.service.install()
      if (result.success) {
        addToast('Service installed successfully! Running in background.', 'success')
        await checkServiceStatus()
        await checkServiceHealth()
      } else {
        addToast('Failed to install service: ' + result.error, 'error')
      }
    } catch (error) {
      addToast('Failed to install service: ' + (error as Error).message, 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleUninstallService = async () => {
    if (!window.electronAPI?.service) return

    const confirmed = await showConfirm({
      title: 'Uninstall Background Service',
      message: 'This will stop and remove the background service. Workflows will only run when the app is open.',
      confirmLabel: 'Uninstall',
      confirmVariant: 'danger'
    })

    if (!confirmed) return

    setActionInProgress('Uninstalling service...')
    try {
      const result = await window.electronAPI.service.uninstall()
      if (result.success) {
        addToast('Service uninstalled successfully', 'success')
        await checkServiceStatus()
        await checkServiceHealth()
      } else {
        addToast('Failed to uninstall service: ' + result.error, 'error')
      }
    } catch (error) {
      addToast('Failed to uninstall service: ' + (error as Error).message, 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStartService = async () => {
    if (!window.electronAPI?.service) return

    setActionInProgress('Starting service...')
    try {
      const result = await window.electronAPI.service.start()
      if (result.success) {
        addToast('Service started', 'success')
        await checkServiceStatus()
        await checkServiceHealth()
      } else {
        addToast('Failed to start service: ' + result.error, 'error')
      }
    } catch (error) {
      addToast('Failed to start service: ' + (error as Error).message, 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStopService = async () => {
    if (!window.electronAPI?.service) return

    setActionInProgress('Stopping service...')
    try {
      const result = await window.electronAPI.service.stop()
      if (result.success) {
        addToast('Service stopped', 'success')
        await checkServiceStatus()
        await checkServiceHealth()
      } else {
        addToast('Failed to stop service: ' + result.error, 'error')
      }
    } catch (error) {
      addToast('Failed to stop service: ' + (error as Error).message, 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  }

  const handleCopyWebhookUrl = () => {
    const url = userId
      ? `https://api.prompd.app/webhook-proxy/${userId}/:workflowId`
      : 'https://api.prompd.app/webhook-proxy/:userId/:workflowId'

    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openServiceUrl = () => {
    window.open(`${serviceUrl}/health`, '_blank')
  }

  return (
    <div className="service-webhook-settings">
      {/* Service Management Section */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Background Service</h3>
          <p className="section-description">
            Run workflows 24/7 independently of the desktop app.
          </p>
        </div>

        {/* Service URL */}
        <div className="service-url-config">
          <label htmlFor="service-url">Service URL</label>
          <div className="url-input-group">
            <input
              id="service-url"
              type="text"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="http://localhost:9876"
            />
            <button onClick={openServiceUrl} className="btn-icon" title="Open in browser">
              <ExternalLink size={16} />
            </button>
          </div>
        </div>

        {/* Service Status */}
        <div className="service-status-card">
          <div className="status-header">
            <div className="status-indicator">
              {isConnected ? (
                <CheckCircle size={20} className="status-icon status-active" />
              ) : (
                <XCircle size={20} className="status-icon status-inactive" />
              )}
              <span className="status-text">
                {isConnected ? 'Service Running' : 'Service Offline'}
              </span>
            </div>
            <button onClick={checkServiceHealth} className="btn-icon" title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>

          {isConnected && serviceHealth && (
            <div className="status-details">
              <div className="status-item">
                <span className="label">Uptime:</span>
                <span className="value">{formatUptime(serviceHealth.uptime)}</span>
              </div>
              <div className="status-item">
                <span className="label">Deployments:</span>
                <span className="value">{serviceHealth.activeDeployments}</span>
              </div>
              <div className="status-item">
                <span className="label">Active Triggers:</span>
                <span className="value">{serviceHealth.enabledTriggers}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Service Management Buttons */}
        <div className="service-management">
          {!serviceStatus?.installed ? (
            <div className="install-section">
              <div className="info-box">
                <Info size={16} />
                <p>
                  Install the background service to run workflows 24/7, even when this app is closed.
                  The service will run as a user-level process.
                </p>
              </div>
              <button
                onClick={handleInstallService}
                className="btn-primary"
                disabled={!!actionInProgress}
              >
                {actionInProgress === 'Installing service...' ? (
                  <>
                    <Loader size={16} className="spinning" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Install Background Service
                  </>
                )}
              </button>
              <p className="help-text">Requires: Node.js installed on your system</p>
            </div>
          ) : (
            <div className="service-controls">
              <div className="button-group">
                {serviceStatus.running ? (
                  <button
                    onClick={handleStopService}
                    className="btn-secondary"
                    disabled={!!actionInProgress}
                  >
                    {actionInProgress === 'Stopping service...' ? (
                      <>
                        <Loader size={16} className="spinning" />
                        Stopping...
                      </>
                    ) : (
                      <>
                        <Pause size={16} />
                        Stop Service
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleStartService}
                    className="btn-primary"
                    disabled={!!actionInProgress}
                  >
                    {actionInProgress === 'Starting service...' ? (
                      <>
                        <Loader size={16} className="spinning" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play size={16} />
                        Start Service
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={handleUninstallService}
                  className="btn-danger"
                  disabled={!!actionInProgress}
                >
                  {actionInProgress === 'Uninstalling service...' ? (
                    <>
                      <Loader size={16} className="spinning" />
                      Uninstalling...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Uninstall
                    </>
                  )}
                </button>
              </div>
              <div className="service-info">
                <p>
                  <strong>Mode:</strong> {serviceStatus.mode === 'system-service' ? 'System Service' : 'Electron'}
                </p>
                <p>
                  <strong>Auto-start:</strong> {serviceStatus.autoStart ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Webhook Configuration Section */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Webhook Proxy</h3>
          <p className="section-description">
            Enable webhooks for workflows running on your local machine.
            The cloud proxy forwards webhook requests to your local service.
          </p>
        </div>

        {/* Webhook Status */}
        <div className="webhook-status-card">
          <div className="status-indicator">
            {webhookStatus.active ? (
              <>
                <Wifi size={20} className="status-icon status-active" />
                <span className="status-text">Connected ({webhookStatus.mode})</span>
              </>
            ) : (
              <>
                <WifiOff size={20} className="status-icon status-inactive" />
                <span className="status-text">Disconnected</span>
              </>
            )}
          </div>
        </div>

        {/* Registry Token Warning */}
        {!hasRegistryToken && (
          <div className="warning-box">
            <AlertCircle size={16} />
            <div>
              <strong>Registry Token Required</strong>
              <p>
                Webhooks require authentication. Please run <code>prompd registry login</code> to generate a token.
              </p>
            </div>
          </div>
        )}

        {/* Webhook URL */}
        {hasRegistryToken && (
          <div className="webhook-url-section">
            <label>Webhook URL</label>
            <div className="webhook-url-display">
              <code className="webhook-url">
                {userId
                  ? `https://api.prompd.app/webhook-proxy/${userId}/:workflowId`
                  : 'https://api.prompd.app/webhook-proxy/:userId/:workflowId'}
              </code>
              <button
                onClick={handleCopyWebhookUrl}
                className="btn-icon"
                title="Copy URL"
              >
                {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className="help-text">
              Replace <code>:workflowId</code> with your workflow's ID
            </p>
          </div>
        )}
      </div>

      <ConfirmDialogComponent />
    </div>
  )
}
