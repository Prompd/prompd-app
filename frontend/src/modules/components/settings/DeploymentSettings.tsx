/**
 * Deployment Settings - Summary and quick access to deployments
 *
 * Shows deployment statistics and provides link to full DeploymentModal
 */

import { useState, useEffect } from 'react'
import { Package, Play, Clock, TrendingUp, ExternalLink, Activity, CheckCircle, XCircle } from 'lucide-react'
import type { DeploymentInfo } from '../../../electron'
import './DeploymentSettings.css'

interface DeploymentSettingsProps {
  colors: {
    bgPrimary: string
    bgSecondary: string
    border: string
    text: string
    textSecondary: string
    primary: string
  }
  onOpenDeployments: () => void
}

interface DeploymentStats {
  total: number
  active: number
  paused: number
  failed: number
  totalTriggers: number
  enabledTriggers: number
  recentExecutions: number
  successRate: number
}

export function DeploymentSettings({ colors, onOpenDeployments }: DeploymentSettingsProps) {
  const [stats, setStats] = useState<DeploymentStats>({
    total: 0,
    active: 0,
    paused: 0,
    failed: 0,
    totalTriggers: 0,
    enabledTriggers: 0,
    recentExecutions: 0,
    successRate: 0
  })
  const [recentDeployments, setRecentDeployments] = useState<DeploymentInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [])

  const loadStats = async () => {
    if (!window.electronAPI?.deployment) {
      setLoading(false)
      return
    }

    try {
      // Get all deployments
      const result = await window.electronAPI.deployment.list({})
      if (result.success) {
        const deployments = result.deployments || []

        // Calculate stats
        const active = deployments.filter(d => d.status === 'enabled').length
        const paused = deployments.filter(d => d.status === 'disabled').length
        const failed = deployments.filter(d => d.status === 'failed').length

        // Get trigger count
        let totalTriggers = 0
        let enabledTriggers = 0
        for (const deployment of deployments) {
          const statusResult = await window.electronAPI.deployment.getStatus(deployment.id)
          if (statusResult.success) {
            totalTriggers += statusResult.triggers?.length || 0
            enabledTriggers += statusResult.triggers?.filter(t => t.enabled).length || 0
          }
        }

        // Get recent executions
        const execResult = await window.electronAPI.deployment.getAllExecutions({
          limit: 100,
          offset: 0
        })
        const executions = execResult.success ? execResult.executions || [] : []
        const successCount = executions.filter(e => e.status === 'success').length
        const successRate = executions.length > 0 ? (successCount / executions.length) * 100 : 0

        setStats({
          total: deployments.length,
          active,
          paused,
          failed,
          totalTriggers,
          enabledTriggers,
          recentExecutions: executions.length,
          successRate
        })

        // Keep 5 most recent deployments
        setRecentDeployments(deployments.slice(0, 5))
      }
    } catch (error) {
      console.error('Failed to load deployment stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="deployment-settings" style={{ background: colors.bgSecondary }}>
      <div className="settings-section">
        <div className="section-header">
          <h3 style={{ color: colors.text }}>Deployments</h3>
          <p className="section-description" style={{ color: colors.textSecondary }}>
            Manage deployed workflow packages and view execution statistics.
          </p>
        </div>

        {/* Statistics Grid */}
        <div className="stats-grid">
          <div className="stat-card" style={{ background: colors.bgPrimary, borderColor: colors.border }}>
            <div className="stat-icon" style={{ color: colors.primary }}>
              <Package size={20} />
            </div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: colors.text }}>{stats.total}</div>
              <div className="stat-label" style={{ color: colors.textSecondary }}>Total Deployments</div>
            </div>
          </div>

          <div className="stat-card" style={{ background: colors.bgPrimary, borderColor: colors.border }}>
            <div className="stat-icon" style={{ color: '#10b981' }}>
              <CheckCircle size={20} />
            </div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: colors.text }}>{stats.active}</div>
              <div className="stat-label" style={{ color: colors.textSecondary }}>Active</div>
            </div>
          </div>

          <div className="stat-card" style={{ background: colors.bgPrimary, borderColor: colors.border }}>
            <div className="stat-icon" style={{ color: colors.primary }}>
              <Activity size={20} />
            </div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: colors.text }}>
                {stats.enabledTriggers}/{stats.totalTriggers}
              </div>
              <div className="stat-label" style={{ color: colors.textSecondary }}>Active Triggers</div>
            </div>
          </div>

          <div className="stat-card" style={{ background: colors.bgPrimary, borderColor: colors.border }}>
            <div className="stat-icon" style={{ color: '#8b5cf6' }}>
              <TrendingUp size={20} />
            </div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: colors.text }}>
                {stats.successRate.toFixed(1)}%
              </div>
              <div className="stat-label" style={{ color: colors.textSecondary }}>Success Rate</div>
            </div>
          </div>
        </div>

        {/* Recent Deployments */}
        <div className="recent-deployments" style={{ marginTop: '24px' }}>
          <h4 style={{ color: colors.text, marginBottom: '12px' }}>Recent Deployments</h4>

          {loading ? (
            <div style={{ color: colors.textSecondary, padding: '20px', textAlign: 'center' }}>
              Loading...
            </div>
          ) : recentDeployments.length === 0 ? (
            <div
              className="empty-state"
              style={{
                background: colors.bgPrimary,
                borderColor: colors.border,
                padding: '32px',
                textAlign: 'center',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`
              }}
            >
              <Package size={48} style={{ color: colors.textSecondary, opacity: 0.5, marginBottom: '16px' }} />
              <p style={{ color: colors.textSecondary }}>No deployments yet</p>
              <button
                onClick={onOpenDeployments}
                className="btn-primary"
                style={{
                  marginTop: '16px',
                  background: colors.primary,
                  color: 'white'
                }}
              >
                Deploy Your First Workflow
              </button>
            </div>
          ) : (
            <div className="deployments-list">
              {recentDeployments.map(deployment => (
                <div
                  key={deployment.id}
                  className="deployment-item"
                  style={{
                    background: colors.bgPrimary,
                    borderColor: colors.border
                  }}
                >
                  <div className="deployment-info">
                    <div className="deployment-name" style={{ color: colors.text }}>
                      {deployment.name}
                    </div>
                    <div className="deployment-meta" style={{ color: colors.textSecondary }}>
                      v{deployment.version} • {deployment.status}
                    </div>
                  </div>
                  <div
                    className={`status-badge status-${deployment.status}`}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    {deployment.status === 'enabled' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {deployment.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Full Panel Button */}
        <button
          onClick={onOpenDeployments}
          className="btn-secondary"
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: colors.bgPrimary,
            color: colors.text,
            borderColor: colors.border
          }}
        >
          <ExternalLink size={16} />
          Open Deployment Manager
        </button>
      </div>
    </div>
  )
}
