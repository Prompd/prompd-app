import { useState, useEffect } from 'react'
import { Server, CheckCircle, XCircle, Activity, Settings, ExternalLink, Info, AlertCircle, RefreshCw, Play, Pause } from 'lucide-react'
import { useConfirmDialog } from '../ConfirmDialog'
import './ServiceSettings.css'

interface ServiceHealth {
  status: string
  uptime: number
  activeSchedules: number
  webhooks: {
    enabled: boolean
    active: boolean
    mode: string
  }
  timestamp: string
}

interface ServiceConfig {
  port: number
  host: string
  enableWebhooks: boolean
  dbPath: string
}

export function ServiceSettings() {
  const [serviceUrl, setServiceUrl] = useState('http://localhost:9876')
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)

  // Config tracking
  const [originalConfig, setOriginalConfig] = useState<ServiceConfig>({
    port: 9876,
    host: '127.0.0.1',
    enableWebhooks: true,
    dbPath: '~/.prompd/scheduler/schedules.db'
  })
  const [currentConfig, setCurrentConfig] = useState<ServiceConfig>({
    port: 9876,
    host: '127.0.0.1',
    enableWebhooks: true,
    dbPath: '~/.prompd/scheduler/schedules.db'
  })
  const [configChanged, setConfigChanged] = useState(false)
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()

  // Detect config changes
  useEffect(() => {
    const hasChanges =
      currentConfig.port !== originalConfig.port ||
      currentConfig.host !== originalConfig.host ||
      currentConfig.enableWebhooks !== originalConfig.enableWebhooks ||
      currentConfig.dbPath !== originalConfig.dbPath

    setConfigChanged(hasChanges)
  }, [currentConfig, originalConfig])

  useEffect(() => {
    checkServiceHealth()
    const interval = setInterval(checkServiceHealth, isRestarting ? 1000 : 3000) // Poll faster during restart
    return () => clearInterval(interval)
  }, [serviceUrl, isRestarting])

  const checkServiceHealth = async () => {
    try {
      const response = await fetch(`${serviceUrl}/health`, {
        signal: AbortSignal.timeout(2000) // 2s timeout
      })

      if (response.ok) {
        const data = await response.json()
        setServiceHealth(data)
        setIsConnected(true)
        setError(null)
      } else {
        setIsConnected(false)
        setError(`Service responded with status ${response.status}`)
      }
    } catch (err) {
      setIsConnected(false)
      setServiceHealth(null)
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Connection timeout')
        } else {
          setError('Service not responding')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  }

  const openServiceUrl = () => {
    window.open(`${serviceUrl}/health`, '_blank')
  }

  const handleSaveConfig = async () => {
    try {
      // Save config via IPC or API
      if (window.electronAPI?.saveServiceConfig) {
        await window.electronAPI.saveServiceConfig(currentConfig)
      } else {
        // Fallback: save to localStorage for web mode
        localStorage.setItem('prompd-service-config', JSON.stringify(currentConfig))
      }

      setOriginalConfig(currentConfig)
      setConfigChanged(false)

      // Prompt for restart if service is running
      if (isConnected) {
        const shouldRestart = await showConfirm({
          title: 'Restart Service',
          message: 'Service configuration updated. Restart the service to apply changes?',
          confirmLabel: 'Restart',
          confirmVariant: 'primary'
        })
        if (shouldRestart) {
          await handleRestartService()
        }
      }
    } catch (err) {
      console.error('Failed to save config:', err)
      alert('Failed to save configuration')
    }
  }

  const handleStartService = async () => {
    try {
      setError(null)

      if (window.electronAPI?.startService) {
        const result = await window.electronAPI.startService()
        if (!result.success) {
          setError(result.error || 'Failed to start service')
          alert(result.message || 'Failed to start service')
        } else {
          alert(result.message || 'Service started successfully')
        }
      } else {
        setError('Service management not available in web mode')
      }
    } catch (err) {
      console.error('Failed to start service:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError('Failed to start service')
      alert('Failed to start service: ' + errorMessage)
    }
  }

  const handleStopService = async () => {
    try {
      setError(null)

      if (window.electronAPI?.stopService) {
        const result = await window.electronAPI.stopService()
        if (!result.success) {
          setError(result.error || 'Failed to stop service')
          alert(result.message || 'Failed to stop service')
        } else {
          alert(result.message || 'Service stopped successfully')
        }
      } else {
        setError('Service management not available in web mode')
      }
    } catch (err) {
      console.error('Failed to stop service:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError('Failed to stop service')
      alert('Failed to stop service: ' + errorMessage)
    }
  }

  const handleRestartService = async () => {
    try {
      setIsRestarting(true)
      setError(null)

      // Call restart via IPC or API
      if (window.electronAPI?.restartService) {
        const result = await window.electronAPI.restartService()
        if (!result.success) {
          setError(result.error || 'Failed to restart service')
          alert(result.message || 'Failed to restart service')
        } else {
          alert(result.message || 'Service restarted successfully')
        }
      } else {
        // Fallback: API call to service /api/restart endpoint
        await fetch(`${serviceUrl}/api/restart`, { method: 'POST' })
      }

      // Poll for service to come back up
      setTimeout(() => {
        setIsRestarting(false)
      }, 5000) // Give it 5 seconds
    } catch (err) {
      console.error('Failed to restart service:', err)
      setError('Failed to restart service')
      setIsRestarting(false)
    }
  }

  const handleConfigChange = (field: keyof ServiceConfig, value: string | number | boolean) => {
    setCurrentConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <div className="service-settings">
      <div className="settings-section">
        <div className="section-header">
          <h3>Service Configuration</h3>
          <p className="section-description">
            The Prompd service runs workflows 24/7 independently of the desktop app.
          </p>
        </div>

        {/* Service URL Configuration */}
        <div className="service-url-config">
          <label htmlFor="service-url">Service URL</label>
          <div className="url-input-group">
            <input
              id="service-url"
              type="text"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="http://localhost:9876"
              className="service-url-input"
            />
            <button
              onClick={openServiceUrl}
              className="btn-icon"
              title="Open in browser"
            >
              <ExternalLink size={16} />
            </button>
          </div>
          <p className="help-text">
            Default: <code>http://localhost:9876</code>
          </p>
        </div>

        {/* Service Status */}
        <div className="service-status">
          <div className="status-header">
            <Activity size={16} />
            <h4>Service Status</h4>
          </div>

          {loading ? (
            <div className="status-badge loading">
              <div className="spinner" />
              Checking service...
            </div>
          ) : isConnected ? (
            <div className="status-badge connected">
              <CheckCircle size={16} />
              <div className="status-info">
                <span className="status-label">Connected</span>
                <span className="status-detail">Service is running</span>
              </div>
            </div>
          ) : (
            <div className="status-badge disconnected">
              <XCircle size={16} />
              <div className="status-info">
                <span className="status-label">Disconnected</span>
                <span className="status-detail">{error || 'Service not running'}</span>
              </div>
            </div>
          )}

          {/* Service Health Details */}
          {isConnected && serviceHealth && (
            <div className="health-details">
              <div className="health-item">
                <span className="health-label">Uptime</span>
                <span className="health-value">{formatUptime(serviceHealth.uptime)}</span>
              </div>
              <div className="health-item">
                <span className="health-label">Active Schedules</span>
                <span className="health-value">{serviceHealth.activeSchedules}</span>
              </div>
              <div className="health-item">
                <span className="health-label">Webhook Proxy</span>
                <span className={`health-value ${serviceHealth.webhooks.active ? 'active' : 'inactive'}`}>
                  {serviceHealth.webhooks.active
                    ? `Active (${serviceHealth.webhooks.mode})`
                    : serviceHealth.webhooks.enabled
                    ? 'Enabled (disconnected)'
                    : 'Disabled'}
                </span>
              </div>
              <div className="health-item">
                <span className="health-label">Last Check</span>
                <span className="health-value">
                  {new Date(serviceHealth.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}

          {/* Restart Required Banner */}
          {configChanged && isConnected && !isRestarting && (
            <div className="restart-banner">
              <AlertCircle size={16} />
              <div className="banner-content">
                <strong>Configuration Changed</strong>
                <p>Restart the service to apply your changes.</p>
              </div>
              <button onClick={handleRestartService} className="btn-restart">
                <RefreshCw size={14} />
                Restart Now
              </button>
            </div>
          )}

          {/* Restarting Indicator */}
          {isRestarting && (
            <div className="restart-banner restarting">
              <div className="spinner" />
              <div className="banner-content">
                <strong>Restarting Service...</strong>
                <p>Please wait while the service restarts.</p>
              </div>
            </div>
          )}
        </div>

        {/* Configuration Editor */}
        <div className="service-configuration">
          <div className="status-header">
            <Settings size={16} />
            <h4>Service Configuration</h4>
          </div>

          <div className="config-form">
            <div className="form-group">
              <label htmlFor="config-port">Port</label>
              <input
                id="config-port"
                type="number"
                value={currentConfig.port}
                onChange={(e) => handleConfigChange('port', parseInt(e.target.value, 10))}
                className="form-input"
                min="1024"
                max="65535"
              />
              <p className="help-text">Port number for HTTP server (default: 9876)</p>
            </div>

            <div className="form-group">
              <label htmlFor="config-host">Host</label>
              <input
                id="config-host"
                type="text"
                value={currentConfig.host}
                onChange={(e) => handleConfigChange('host', e.target.value)}
                className="form-input"
                placeholder="127.0.0.1"
              />
              <p className="help-text">Bind address (use 127.0.0.1 for localhost only)</p>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={currentConfig.enableWebhooks}
                  onChange={(e) => handleConfigChange('enableWebhooks', e.target.checked)}
                />
                <span>Enable Webhook Proxy</span>
              </label>
              <p className="help-text">Allow webhook forwarding from cloud proxy</p>
            </div>

            <div className="form-group">
              <label htmlFor="config-dbpath">Database Path</label>
              <input
                id="config-dbpath"
                type="text"
                value={currentConfig.dbPath}
                onChange={(e) => handleConfigChange('dbPath', e.target.value)}
                className="form-input"
                placeholder="~/.prompd/scheduler/schedules.db"
              />
              <p className="help-text">SQLite database location for schedules</p>
            </div>

            <div className="form-actions">
              <button
                onClick={handleSaveConfig}
                className="btn-primary"
                disabled={!configChanged}
              >
                Save Configuration
              </button>
              {configChanged && (
                <button
                  onClick={() => setCurrentConfig(originalConfig)}
                  className="btn-secondary"
                >
                  Reset Changes
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Service Controls */}
        <div className="service-controls">
          <div className="status-header">
            <Server size={16} />
            <h4>Service Controls</h4>
          </div>

          <div className="control-buttons">
            <button
              onClick={handleStartService}
              className="btn-control btn-start"
              disabled={isConnected}
            >
              <Play size={16} />
              Start Service
            </button>

            <button
              onClick={handleStopService}
              className="btn-control btn-stop"
              disabled={!isConnected}
            >
              <Pause size={16} />
              Stop Service
            </button>

            <button
              onClick={handleRestartService}
              className="btn-control btn-restart"
              disabled={!isConnected || isRestarting}
            >
              <RefreshCw size={16} className={isRestarting ? 'spinning' : ''} />
              {isRestarting ? 'Restarting...' : 'Restart Service'}
            </button>
          </div>

          {!isConnected && (
            <div className="control-help">
              <Info size={14} />
              <span>Service is not running. Click "Start Service" to launch the scheduler service.</span>
            </div>
          )}
        </div>

        {/* Environment Variables Reference */}
        <details className="config-details">
          <summary>
            <Info size={14} />
            Environment Variable Reference
          </summary>
          <div className="env-vars">
            <p>Configuration can also be set via environment variables:</p>
            <table className="env-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>PROMPD_SERVICE_PORT</code></td>
                  <td><code>9876</code></td>
                  <td>HTTP server port</td>
                </tr>
                <tr>
                  <td><code>PROMPD_SERVICE_HOST</code></td>
                  <td><code>127.0.0.1</code></td>
                  <td>Bind address (localhost only)</td>
                </tr>
                <tr>
                  <td><code>PROMPD_DB_PATH</code></td>
                  <td><code>~/.prompd/scheduler/schedules.db</code></td>
                  <td>SQLite database path</td>
                </tr>
                <tr>
                  <td><code>ENABLE_WEBHOOKS</code></td>
                  <td><code>true</code></td>
                  <td>Enable webhook proxy client</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>

        {/* Security Notes */}
        <div className="security-notes">
          <div className="note-box">
            <AlertCircle size={16} />
            <div className="note-content">
              <strong>Security Notice</strong>
              <p>The service binds to <code>127.0.0.1</code> by default (localhost only).</p>
              <p>Do not expose the service to the internet without proper authentication and TLS.</p>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialogComponent />
    </div>
  )
}
