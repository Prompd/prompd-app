/**
 * Deployment Modal - Configuration modal for workflow deployments
 *
 * Features:
 * - List all deployments with status badges
 * - Deploy .pdpkg packages or workflow directories
 * - View triggers extracted from workflows (read-only)
 * - Enable/disable individual triggers
 * - Manual execution
 * - Delete workflows
 * - Execution history view
 */

import { useState, useEffect } from 'react'
import { Upload, Play, Pause, Trash2, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Package, X, Zap, Globe, FolderOpen, Eye, ChevronDown, ChevronUp, RotateCw, Power } from 'lucide-react'
import type { DeploymentInfo, TriggerInfo, DeploymentExecution } from '../../../electron'
import { useConfirmDialog } from '../ConfirmDialog'
import { useUIStore } from '../../../stores/uiStore'
import { ParameterInputModal, type WorkflowParameter } from './ParameterInputModal'
import './DeploymentModal.css'

interface DeploymentModalProps {
  open: boolean
  onClose: () => void
}

export function DeploymentModal({ open, onClose }: DeploymentModalProps) {
  const [deployments, setDeployments] = useState<DeploymentInfo[]>([])
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentInfo | null>(null)
  const [triggers, setTriggers] = useState<TriggerInfo[]>([])
  const [deploymentExecutions, setDeploymentExecutions] = useState<DeploymentExecution[]>([])
  const [executions, setExecutions] = useState<DeploymentExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'deployments' | 'history' | 'deleted'>('deployments')
  const [expandedExecutions, setExpandedExecutions] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'failed'>('all')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [totalPages, setTotalPages] = useState(1)
  const [totalExecutions, setTotalExecutions] = useState(0)

  // Parameter modal state
  const [parameterModalOpen, setParameterModalOpen] = useState(false)
  const [parameterModalDeployment, setParameterModalDeployment] = useState<{ id: string; name: string } | null>(null)
  const [workflowParameters, setWorkflowParameters] = useState<WorkflowParameter[]>([])

  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()
  const addToast = useUIStore(state => state.addToast)

  // Load deployments on mount
  useEffect(() => {
    loadDeployments()
    loadExecutionHistory()

    // Listen for deployment updates from other components
    const handleDeploymentUpdate = () => {
      loadDeployments()
      if (activeTab === 'history') {
        loadExecutionHistory()
      }
    }

    window.addEventListener('deployment-updated', handleDeploymentUpdate)

    // Listen for execution completion events
    let cleanupExecutionListener: (() => void) | undefined
    if (window.electronAPI?.onTriggerExecutionComplete) {
      cleanupExecutionListener = window.electronAPI.onTriggerExecutionComplete((data) => {
        console.log('[DeploymentModal] Execution completed:', data)
        // Refresh execution list
        if (activeTab === 'history') {
          loadExecutionHistory()
        }
        // Refresh deployment status if viewing details
        if (selectedDeployment && data.deploymentId === selectedDeployment.id) {
          loadDeploymentStatus(selectedDeployment.id)
        }
      })
    }

    // Refresh every 10 seconds (reduced from 30 for better responsiveness)
    const interval = setInterval(() => {
      loadDeployments()
      if (activeTab === 'history') {
        loadExecutionHistory()
      }
      if (selectedDeployment) {
        loadDeploymentStatus(selectedDeployment.id)
      }
    }, 10000)

    return () => {
      clearInterval(interval)
      window.removeEventListener('deployment-updated', handleDeploymentUpdate)
      if (cleanupExecutionListener) {
        cleanupExecutionListener()
      }
    }
  }, [activeTab, selectedDeployment])

  const loadDeployments = async () => {
    if (!window.electronAPI?.deployment) {
      console.warn('Deployment API not available')
      setLoading(false)
      return
    }

    try {
      const result = await window.electronAPI.deployment.list()
      if (result.success) {
        // Include all deployments (enabled, disabled, deleted)
        setDeployments(result.deployments || [])
      }
    } catch (error) {
      console.error('Failed to load deployments:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDeploymentStatus = async (deploymentId: string) => {
    if (!window.electronAPI?.deployment) return

    try {
      const result = await window.electronAPI.deployment.getStatus(deploymentId)
      if (result.success) {
        setTriggers(result.triggers || [])
        setDeploymentExecutions(result.recentExecutions || [])
      }
    } catch (error) {
      console.error('Failed to load deployment status:', error)
    }
  }

  const loadExecutionHistory = async (page = currentPage, newPageSize = pageSize) => {
    if (!window.electronAPI?.deployment) return

    try {
      const offset = (page - 1) * newPageSize
      const result = await window.electronAPI.deployment.getAllExecutions({
        limit: newPageSize,
        offset
      })
      if (result.success) {
        setExecutions(result.executions || [])
        setTotalExecutions(result.total || 0)
        setTotalPages(result.totalPages || 1)
        setCurrentPage(result.page || 1)
      }
    } catch (error) {
      console.error('Failed to load execution history:', error)
    }
  }

  const handleDeploy = async () => {
    if (!window.electronAPI?.openFile) return

    try {
      const packagePath = await window.electronAPI.openFile()
      if (!packagePath) return

      if (!window.electronAPI?.deployment) {
        addToast('Deployment API not available', 'error')
        return
      }

      const result = await window.electronAPI.deployment.deploy(packagePath)
      if (result.success) {
        addToast('Deployment successful!', 'success')
        window.dispatchEvent(new CustomEvent('deployment-updated'))
        await loadDeployments()
      } else {
        addToast('Deployment failed: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Failed to deploy:', error)
      addToast('Failed to deploy: ' + (error as Error).message, 'error')
    }
  }

  const handleDelete = async (deploymentId: string, deploymentName: string) => {
    if (!window.electronAPI?.deployment) return

    const confirmed = await showConfirm({
      title: 'Delete Workflow',
      message: `Are you sure you want to delete "${deploymentName}"? This will stop all triggers and mark the deployment as deleted.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    })

    if (!confirmed) return

    try {
      const result = await window.electronAPI.deployment.undeploy(deploymentId, { deleteFiles: false })
      if (result.success) {
        addToast('Deployment deleted successfully', 'success')
        window.dispatchEvent(new CustomEvent('deployment-updated'))
        await loadDeployments()
        if (selectedDeployment?.id === deploymentId) {
          setSelectedDeployment(null)
          setTriggers([])
          setDeploymentExecutions([])
        }
      } else {
        addToast('Failed to delete: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Failed to delete:', error)
      addToast('Failed to delete: ' + (error as Error).message, 'error')
    }
  }

  const handleToggleStatus = async (deployment: DeploymentInfo) => {
    if (!window.electronAPI?.deployment?.toggleStatus) return

    const newStatus = deployment.status === 'enabled' ? 'disabled' : 'enabled'
    const actionWord = newStatus === 'enabled' ? 'Enable' : 'Disable'

    try {
      const result = await window.electronAPI.deployment.toggleStatus(deployment.id)
      if (result.success) {
        addToast(`Deployment ${actionWord.toLowerCase()}d successfully`, 'success')
        window.dispatchEvent(new CustomEvent('deployment-updated'))
        await loadDeployments()
        if (selectedDeployment?.id === deployment.id) {
          await loadDeploymentStatus(deployment.id)
        }
      } else {
        addToast(`Failed to ${actionWord.toLowerCase()}: ${result.error}`, 'error')
      }
    } catch (error) {
      console.error(`Failed to ${actionWord.toLowerCase()}:`, error)
      addToast(`Failed to ${actionWord.toLowerCase()}: ${(error as Error).message}`, 'error')
    }
  }

  const handlePurgeDeleted = async () => {
    if (!window.electronAPI?.deployment?.purgeDeleted) return

    const deletedCount = deployments.filter(d => d.status === 'deleted').length
    if (deletedCount === 0) {
      addToast('No deleted deployments to purge', 'info')
      return
    }

    const confirmed = await showConfirm({
      title: 'Purge Deleted Deployments',
      message: `Are you sure you want to permanently delete ${deletedCount} deployment(s)? This will remove all files and cannot be undone.`,
      confirmLabel: 'Purge',
      confirmVariant: 'danger'
    })

    if (!confirmed) return

    try {
      const result = await window.electronAPI.deployment.purgeDeleted()
      if (result.success) {
        addToast(`Purged ${result.purgedCount} deployment(s)`, 'success')
        window.dispatchEvent(new CustomEvent('deployment-updated'))
        await loadDeployments()
        if (selectedDeployment && selectedDeployment.status === 'deleted') {
          setSelectedDeployment(null)
          setTriggers([])
          setDeploymentExecutions([])
        }
      } else {
        addToast('Failed to purge: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Failed to purge:', error)
      addToast('Failed to purge: ' + (error as Error).message, 'error')
    }
  }

  const handleToggleTrigger = async (trigger: TriggerInfo) => {
    if (!window.electronAPI?.deployment) return

    try {
      const result = await window.electronAPI.deployment.toggleTrigger(trigger.id, !trigger.enabled)
      if (result.success) {
        await loadDeploymentStatus(trigger.deploymentId)
        addToast(`Trigger ${!trigger.enabled ? 'enabled' : 'disabled'}`, 'success')
      }
    } catch (error) {
      console.error('Failed to toggle trigger:', error)
      addToast('Failed to toggle trigger: ' + (error as Error).message, 'error')
    }
  }

  const handleExecuteNow = async (deploymentId: string, deploymentName: string) => {
    if (!window.electronAPI?.deployment) return

    try {
      // Fetch workflow parameters
      const parametersResult = await window.electronAPI.deployment.getParameters(deploymentId)
      if (!parametersResult.success) {
        addToast('Failed to get workflow parameters: ' + parametersResult.error, 'error')
        return
      }

      const parameters = parametersResult.parameters || []

      // If workflow has parameters, show parameter modal
      if (parameters.length > 0) {
        setParameterModalDeployment({ id: deploymentId, name: deploymentName })
        setWorkflowParameters(parameters as WorkflowParameter[])
        setParameterModalOpen(true)
      } else {
        // No parameters - execute immediately with confirmation
        const confirmed = await showConfirm({
          title: 'Execute Workflow',
          message: `Execute "${deploymentName}" now?`,
          confirmLabel: 'Execute',
          confirmVariant: 'primary'
        })

        if (!confirmed) return

        await executeWorkflow(deploymentId, {})
      }
    } catch (error) {
      console.error('Failed to prepare execution:', error)
      addToast('Failed to prepare execution: ' + (error as Error).message, 'error')
    }
  }

  const executeWorkflow = async (deploymentId: string, parameters: Record<string, unknown>) => {
    if (!window.electronAPI?.deployment) return

    try {
      const result = await window.electronAPI.deployment.execute(deploymentId, parameters)
      if (result.success) {
        addToast('Workflow execution started', 'success')
        await loadDeploymentStatus(deploymentId)
        if (activeTab === 'history') {
          await loadExecutionHistory()
        }
      } else {
        addToast('Failed to execute: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Failed to execute deployment:', error)
      addToast('Failed to execute: ' + (error as Error).message, 'error')
    }
  }

  const handleParameterSubmit = async (parameters: Record<string, unknown>) => {
    if (!parameterModalDeployment) return
    await executeWorkflow(parameterModalDeployment.id, parameters)
  }

  const handleViewDetails = (deployment: DeploymentInfo) => {
    setSelectedDeployment(deployment)
    loadDeploymentStatus(deployment.id)
  }

  const handleClearHistory = async () => {
    const confirmed = await showConfirm({
      title: 'Clear Execution History',
      message: 'Are you sure you want to delete all execution history? This action cannot be undone.',
      confirmLabel: 'Clear History',
      confirmVariant: 'danger'
    })

    if (!confirmed) return

    if (!window.electronAPI?.deployment) return

    try {
      const result = await window.electronAPI.deployment.clearAllHistory()
      if (result.success) {
        addToast(`Cleared ${result.deletedCount || 0} execution records`, 'success')
        await loadExecutionHistory()
      } else {
        addToast('Failed to clear history: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Failed to clear history:', error)
      addToast('Failed to clear history: ' + (error as Error).message, 'error')
    }
  }

  const formatDuration = (startedAt: number, completedAt?: number) => {
    if (!completedAt) return 'Running...'
    const duration = completedAt - startedAt
    if (duration < 1000) return `${duration}ms`
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`
    return `${(duration / 60000).toFixed(1)}m`
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'enabled':
        return <CheckCircle size={16} className="status-icon-enabled" />
      case 'disabled':
        return <Pause size={16} className="status-icon-disabled" />
      case 'failed':
        return <XCircle size={16} className="status-icon-failed" />
      case 'deleted':
        return <AlertCircle size={16} className="status-icon-deleted" />
      default:
        return <Clock size={16} />
    }
  }

  const getTriggerTypeIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'schedule':
        return <Clock size={14} />
      case 'webhook':
        return <Globe size={14} />
      case 'file-watch':
        return <FolderOpen size={14} />
      case 'event':
        return <Zap size={14} />
      case 'manual':
        return <Play size={14} />
      default:
        return <Zap size={14} />
    }
  }

  const toggleExecutionExpansion = (executionId: string) => {
    setExpandedExecutions(prev => {
      const next = new Set(prev)
      if (next.has(executionId)) {
        next.delete(executionId)
      } else {
        next.add(executionId)
      }
      return next
    })
  }

  const collapseAllExecutions = () => {
    setExpandedExecutions(new Set())
  }

  const expandAllExecutions = () => {
    setExpandedExecutions(new Set(executions.map(e => e.id)))
  }

  const getDeploymentForExecution = (execution: DeploymentExecution): DeploymentInfo | undefined => {
    return deployments.find(d => d.id === execution.deploymentId)
  }

  const handleRerunExecution = async (execution: DeploymentExecution) => {
    if (!window.electronAPI?.deployment) return

    const deployment = getDeploymentForExecution(execution)
    if (!deployment) {
      addToast('Deployment not found', 'error')
      return
    }

    const confirmed = await showConfirm({
      title: 'Re-run Workflow',
      message: `Re-run "${deployment.name}" with the same parameters?`,
      confirmLabel: 'Re-run',
      confirmVariant: 'primary'
    })

    if (!confirmed) return

    try {
      const result = await window.electronAPI.deployment.execute(deployment.id, execution.parameters || {})
      if (result.success) {
        addToast('Workflow execution started', 'success')
        await loadExecutionHistory()
      } else {
        addToast('Failed to execute: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Failed to re-run execution:', error)
      addToast('Failed to re-run: ' + (error as Error).message, 'error')
    }
  }

  if (!open) return null

  if (!window.electronAPI?.deployment) {
    return (
      <div className="deployment-modal-overlay" onClick={onClose}>
        <div className="deployment-modal" onClick={(e) => e.stopPropagation()}>
          <div className="deployment-modal-header">
            <h2>Workflow Deployments</h2>
            <button className="modal-close-button" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="deployment-empty">
            <AlertCircle size={48} />
            <h3>Deployment API Not Available</h3>
            <p>The deployment service is not running. Make sure you're using the Electron app.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="deployment-modal-overlay" onClick={onClose}>
      <div className="deployment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="deployment-modal-header">
          <h2>Workflow Deployments</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="deployment-tabs">
          <button
            className={`tab ${activeTab === 'deployments' ? 'active' : ''}`}
            onClick={() => setActiveTab('deployments')}
          >
            <Package size={16} />
            Deployments ({deployments.filter(d => d.status !== 'deleted').length})
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <RefreshCw size={16} />
            History ({totalExecutions || executions.length})
          </button>
          <button
            className={`tab ${activeTab === 'deleted' ? 'active' : ''}`}
            onClick={() => setActiveTab('deleted')}
          >
            <Trash2 size={16} />
            Deleted ({deployments.filter(d => d.status === 'deleted').length})
          </button>
        </div>

        <div className="deployment-content">
          {activeTab === 'deployments' ? (
            <>
              {loading ? (
                <div className="deployment-loading">Loading deployments...</div>
              ) : deployments.filter(d => d.status !== 'deleted').length === 0 ? (
                <div className="deployment-empty">
                  <Package size={48} />
                  <h3>No Deployments Yet</h3>
                  <p>Deploy your first workflow package to enable automated execution.</p>
                  <button className="button primary" onClick={handleDeploy}>
                    <Upload size={16} />
                    Deploy Package
                  </button>
                </div>
              ) : (
                <>
                  <div className="deployment-filters">
                    {(['all', 'enabled', 'disabled', 'failed'] as const).map((filter) => {
                      const count = filter === 'all'
                        ? deployments.filter(d => d.status !== 'deleted').length
                        : deployments.filter(d => d.status === filter).length
                      return (
                        <button
                          key={filter}
                          className={`filter-tab ${statusFilter === filter ? 'active' : ''}`}
                          onClick={() => setStatusFilter(filter)}
                        >
                          {filter.charAt(0).toUpperCase() + filter.slice(1)} ({count})
                        </button>
                      )
                    })}
                  </div>
                  <div className="deployments-list">
                  {deployments.filter(d => d.status !== 'deleted' && (statusFilter === 'all' || d.status === statusFilter)).map((deployment) => {
                    const isExpanded = selectedDeployment?.id === deployment.id

                    return (
                      <div key={deployment.id} className={`deployment-card status-${deployment.status}`}>
                        <div
                          className="deployment-card-header"
                          onClick={() => {
                            if (isExpanded) {
                              setSelectedDeployment(null)
                            } else {
                              handleViewDetails(deployment)
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="deployment-info">
                            <div className="deployment-title">
                              <h4>{deployment.name}</h4>
                              <span className={`status-badge status-${deployment.status}`}>
                                {getStatusIcon(deployment.status)}
                                {deployment.status}
                              </span>
                            </div>
                            <div className="deployment-meta">
                              <span className="deployment-version">v{deployment.version || '1.0.0'}</span>
                              <span className="deployment-id" title={deployment.id}>ID: {deployment.id.slice(0, 8)}...</span>
                            </div>
                          </div>
                          <div className="deployment-actions">
                            {deployment.status !== 'deleted' && (
                              <>
                                <button
                                  className="icon-button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleToggleStatus(deployment)
                                  }}
                                  title={deployment.status === 'enabled' ? 'Disable' : 'Enable'}
                                >
                                  <Power size={16} className={deployment.status === 'enabled' ? 'status-enabled' : 'status-disabled'} />
                                </button>
                                <button
                                  className="icon-button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleExecuteNow(deployment.id, deployment.name)
                                  }}
                                  title="Execute now"
                                  disabled={deployment.status !== 'enabled'}
                                >
                                  <Play size={16} />
                                </button>
                              </>
                            )}
                            <button
                              className="icon-button danger"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(deployment.id, deployment.name)
                              }}
                              title={deployment.status === 'deleted' ? 'Already deleted' : 'Delete'}
                              disabled={deployment.status === 'deleted'}
                            >
                              <Trash2 size={16} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isExpanded) {
                                  setSelectedDeployment(null)
                                } else {
                                  handleViewDetails(deployment)
                                }
                              }}
                              title={isExpanded ? 'Collapse' : 'View details'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>

                      {isExpanded && (
                        <div className="deployment-details">
                          <div className="deployment-details-header">
                            <h5>Triggers ({triggers.length})</h5>
                          </div>
                          {triggers.length === 0 ? (
                            <p className="no-triggers">No triggers configured</p>
                          ) : (
                            <div className="triggers-list">
                              {triggers.map((trigger) => (
                                <div key={trigger.id} className={`trigger-item ${!trigger.enabled ? 'disabled' : ''}`}>
                                  <div className="trigger-icon">
                                    {getTriggerTypeIcon(trigger.triggerType)}
                                  </div>
                                  <div className="trigger-info">
                                    <div className="trigger-type">{trigger.triggerType}</div>
                                    <div className="trigger-config">
                                      {trigger.scheduleCron && <span>Cron: {trigger.scheduleCron}</span>}
                                      {trigger.webhookPath && <span>Path: {trigger.webhookPath}</span>}
                                      {trigger.eventName && <span>Event: {trigger.eventName}</span>}
                                      {trigger.fileWatchPaths && <span>Files: {trigger.fileWatchPaths}</span>}
                                    </div>
                                  </div>
                                  <button
                                    className="icon-button"
                                    onClick={() => handleToggleTrigger(trigger)}
                                    title={trigger.enabled ? 'Disable' : 'Enable'}
                                  >
                                    {trigger.enabled ? <Pause size={14} /> : <Play size={14} />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <h5>Recent Executions</h5>
                          {deploymentExecutions.length === 0 ? (
                            <p className="no-executions">No executions yet</p>
                          ) : (
                            <div className="executions-list-mini">
                              {deploymentExecutions.slice(0, 5).map((execution) => (
                                <div key={execution.id} className={`execution-item-mini status-${execution.status}`}>
                                  <span className="execution-status">{execution.status}</span>
                                  <span className="execution-type">{execution.triggerType}</span>
                                  <span className="execution-time">{formatTimestamp(execution.startedAt)}</span>
                                  <span className="execution-duration">{formatDuration(execution.startedAt, execution.completedAt)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                  })}
                </div>
                </>
              )}
            </>
          ) : activeTab === 'history' ? (
            <>
              {/* Pagination Controls */}
              <div className="history-controls">
                <div className="history-stats">
                  <span>
                    Showing {executions.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalExecutions)} of {totalExecutions} executions
                  </span>
                  {executions.length > 0 && (
                    <div className="expand-collapse-buttons">
                      {expandedExecutions.size > 0 && (
                        <button
                          className="button secondary small"
                          onClick={collapseAllExecutions}
                          title="Collapse all execution cards"
                        >
                          <ChevronUp size={14} />
                          Collapse All
                        </button>
                      )}
                      {expandedExecutions.size < executions.length && (
                        <button
                          className="button secondary small"
                          onClick={expandAllExecutions}
                          title="Expand all execution cards"
                        >
                          <ChevronDown size={14} />
                          Expand All
                        </button>
                      )}
                      <button
                        className="button secondary small"
                        onClick={handleClearHistory}
                        title="Clear all execution history"
                        style={{ marginLeft: '8px', borderColor: 'var(--error)', color: 'var(--error)' }}
                      >
                        <Trash2 size={14} />
                        Clear History
                      </button>
                    </div>
                  )}
                </div>
                <div className="history-pagination">
                  <div className="page-size-selector">
                    <label>Per page:</label>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        const newSize = Number(e.target.value)
                        setPageSize(newSize)
                        setCurrentPage(1)
                        loadExecutionHistory(1, newSize)
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="pagination-buttons">
                    <button
                      className="icon-button"
                      onClick={() => {
                        const newPage = currentPage - 1
                        setCurrentPage(newPage)
                        loadExecutionHistory(newPage)
                      }}
                      disabled={currentPage === 1}
                      title="Previous page"
                    >
                      <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} />
                    </button>
                    <span className="page-indicator">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      className="icon-button"
                      onClick={() => {
                        const newPage = currentPage + 1
                        setCurrentPage(newPage)
                        loadExecutionHistory(newPage)
                      }}
                      disabled={currentPage >= totalPages}
                      title="Next page"
                    >
                      <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="executions-list">
                {executions.length === 0 ? (
                  <div className="deployment-empty">
                    <RefreshCw size={48} />
                    <h3>No Execution History</h3>
                    <p>Workflow executions will appear here.</p>
                  </div>
                ) : (
                executions.map((execution) => {
                  const deployment = getDeploymentForExecution(execution)
                  const isExpanded = expandedExecutions.has(execution.id)

                  return (
                    <div key={execution.id} className={`execution-card status-${execution.status}`}>
                      <div
                        className="execution-card-header"
                        onClick={() => toggleExecutionExpansion(execution.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="execution-header-top">
                          <span className={`execution-status-badge status-${execution.status}`}>
                            {execution.status === 'success' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            {execution.status}
                          </span>
                          <span className="execution-trigger-badge">
                            {getTriggerTypeIcon(execution.triggerType)}
                            {execution.triggerType}
                          </span>
                        </div>
                        <div className="execution-header-info">
                          <div className="execution-header-title">
                            <h4>{deployment?.name || 'Unknown Workflow'}</h4>
                            {deployment?.version && (
                              <span className="execution-version">v{deployment.version}</span>
                            )}
                          </div>
                          <div className="execution-header-meta">
                            <Clock size={12} />
                            <span className="execution-time-text">{formatTimestamp(execution.startedAt)}</span>
                            <span>•</span>
                            <span className="execution-duration-text">{formatDuration(execution.startedAt, execution.completedAt)}</span>
                          </div>
                        </div>
                        <div className="execution-header-actions">
                          <button
                            className="icon-button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRerunExecution(execution)
                            }}
                            title="Re-run with same parameters"
                          >
                            <RotateCw size={16} />
                          </button>
                          <button
                            className="icon-button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExecutionExpansion(execution.id)
                            }}
                            title={isExpanded ? 'Collapse' : 'View details'}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="execution-details-expanded">
                          <div className="execution-details-section">
                            <h5>Execution Details</h5>
                            <div className="execution-details-grid">
                              <div className="execution-detail-item">
                                <span className="label">Execution ID:</span>
                                <span className="value mono">{execution.id}</span>
                              </div>
                              <div className="execution-detail-item">
                                <span className="label">Deployment ID:</span>
                                <span className="value mono">{execution.deploymentId}</span>
                              </div>
                              <div className="execution-detail-item">
                                <span className="label">Workflow ID:</span>
                                <span className="value mono">{execution.workflowId}</span>
                              </div>
                              {execution.triggerId && (
                                <div className="execution-detail-item">
                                  <span className="label">Trigger ID:</span>
                                  <span className="value mono">{execution.triggerId}</span>
                                </div>
                              )}
                              <div className="execution-detail-item">
                                <span className="label">Started At:</span>
                                <span className="value">{formatTimestamp(execution.startedAt)}</span>
                              </div>
                              {execution.completedAt && (
                                <div className="execution-detail-item">
                                  <span className="label">Completed At:</span>
                                  <span className="value">{formatTimestamp(execution.completedAt)}</span>
                                </div>
                              )}
                              <div className="execution-detail-item">
                                <span className="label">Duration:</span>
                                <span className="value">{formatDuration(execution.startedAt, execution.completedAt)}</span>
                              </div>
                            </div>
                          </div>

                          {execution.parameters && Object.keys(execution.parameters).length > 0 && (
                            <div className="execution-details-section">
                              <h5>Parameters</h5>
                              <pre className="execution-json">
                                {JSON.stringify(execution.parameters, null, 2)}
                              </pre>
                            </div>
                          )}

                          {execution.result != null && (
                            <>
                              {/* Parse structured result if available */}
                              {typeof execution.result === 'object' && execution.result !== null && (
                                <>
                                  {/* Final Output */}
                                  {(execution.result as Record<string, unknown>).output && (
                                    <div className="execution-details-section">
                                      <h5>Workflow Output</h5>
                                      <pre className="execution-json execution-result">
                                        {typeof (execution.result as Record<string, unknown>).output === 'string'
                                          ? (execution.result as Record<string, unknown>).output as string
                                          : JSON.stringify((execution.result as Record<string, unknown>).output, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Execution Trace */}
                                  {(execution.result as Record<string, unknown>).trace && (
                                    <div className="execution-details-section">
                                      <h5>Execution Trace</h5>
                                      <pre className="execution-json execution-result">
                                        {JSON.stringify((execution.result as Record<string, unknown>).trace, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Node Outputs */}
                                  {(execution.result as Record<string, unknown>).nodeOutputs && (
                                    <div className="execution-details-section">
                                      <h5>Node Outputs</h5>
                                      <pre className="execution-json">
                                        {JSON.stringify((execution.result as Record<string, unknown>).nodeOutputs, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Metrics */}
                                  {(execution.result as Record<string, unknown>).metrics && (
                                    <div className="execution-details-section">
                                      <h5>Execution Metrics</h5>
                                      <pre className="execution-json">
                                        {JSON.stringify((execution.result as Record<string, unknown>).metrics, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Fallback: show raw result if not structured */}
                              {(typeof execution.result !== 'object' || execution.result === null) && (
                                <div className="execution-details-section">
                                  <h5>Result</h5>
                                  <pre className="execution-json execution-result">
                                    {typeof execution.result === 'string'
                                      ? execution.result
                                      : JSON.stringify(execution.result, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </>
                          )}

                          {execution.error && (
                            <div className="execution-details-section">
                              <h5>Error Details</h5>
                              <div className="execution-error-detail">
                                {execution.error}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
          ) : activeTab === 'deleted' ? (
            <>
              {(() => {
                const deletedDeployments = deployments.filter(d => d.status === 'deleted')
                return (
                  <>
                    {deletedDeployments.length > 0 && (
                      <div className="deployment-actions-bar">
                        <button className="button danger" onClick={handlePurgeDeleted}>
                          <Trash2 size={16} />
                          Purge All ({deletedDeployments.length})
                        </button>
                      </div>
                    )}

                    {deletedDeployments.length === 0 ? (
                      <div className="deployment-empty">
                        <Trash2 size={48} />
                        <h3>Recycle Bin Empty</h3>
                        <p>Deleted deployments will appear here for recovery or permanent removal.</p>
                      </div>
                    ) : (
                      <div className="deployments-list">
                        {deletedDeployments.map((deployment) => (
                          <div key={deployment.id} className="deployment-card status-deleted">
                            <div className="deployment-card-header">
                              <div className="deployment-info">
                                <div className="deployment-title">
                                  <h4>{deployment.name}</h4>
                                  <span className="status-badge status-deleted">
                                    {getStatusIcon('deleted')}
                                    deleted
                                  </span>
                                </div>
                                <div className="deployment-meta">
                                  <span className="deployment-version">v{deployment.version || '1.0.0'}</span>
                                  <span className="deployment-id" title={deployment.id}>ID: {deployment.id.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          ) : null}
        </div>
      </div>
      <ParameterInputModal
        open={parameterModalOpen}
        onClose={() => setParameterModalOpen(false)}
        onSubmit={handleParameterSubmit}
        parameters={workflowParameters}
        workflowName={parameterModalDeployment?.name || ''}
      />
      <ConfirmDialogComponent />
    </div>
  )
}
