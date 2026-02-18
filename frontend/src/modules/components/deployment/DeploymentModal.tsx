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

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Upload, Play, Pause, Trash2, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Package, X, Zap, Globe, FolderOpen, ChevronDown, ChevronUp, RotateCw, Power, ArrowRight, Activity, ExternalLink, Search, Plus, Square, Loader2 } from 'lucide-react'
import type { DeploymentInfo, TriggerInfo, DeploymentExecution, DeploymentVersionInfo } from '../../../electron'
import { useConfirmDialog } from '../ConfirmDialog'
import { useUIStore } from '../../../stores/uiStore'
import { useEditorStore } from '../../../stores/editorStore'
import { ParameterInputModal, type WorkflowParameter } from './ParameterInputModal'
import { JsonTreeViewer, tryParseJsonValue } from '../common/JsonTreeViewer'
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

  // Version history state
  const [versionHistory, setVersionHistory] = useState<DeploymentVersionInfo[]>([])
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false)

  // Detail panel sub-tab
  const [detailTab, setDetailTab] = useState<'triggers' | 'executions' | 'versions'>('triggers')

  // Expanded executions within detail panel
  const [expandedDetailExecutions, setExpandedDetailExecutions] = useState<Set<string>>(new Set())

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [totalPages, setTotalPages] = useState(1)
  const [totalExecutions, setTotalExecutions] = useState(0)

  // Parameter modal state
  const [parameterModalOpen, setParameterModalOpen] = useState(false)
  const [parameterModalDeployment, setParameterModalDeployment] = useState<{ id: string; name: string } | null>(null)
  const [workflowParameters, setWorkflowParameters] = useState<WorkflowParameter[]>([])

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Bulk selection state for active deployments
  const [selectedDeployments, setSelectedDeployments] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  // Bulk selection state for deleted deployments
  const [selectedDeletedDeployments, setSelectedDeletedDeployments] = useState<Set<string>>(new Set())
  const [deletedBulkMode, setDeletedBulkMode] = useState(false)

  // Selected index for keyboard navigation
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()
  const addToast = useUIStore(state => state.addToast)
  const addTab = useEditorStore(state => state.addTab)

  /** Open JSON content in a new readonly editor tab */
  const openJsonInEditor = (title: string, content: unknown) => {
    const formatted = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    addTab({
      id: `json-${Date.now()}`,
      name: `${title}.json`,
      text: formatted,
      savedText: formatted,
      readOnly: true,
      type: 'file',
      viewMode: 'code'
    })
    onClose()
  }

  // Filtered deployments based on search and status filter
  const filteredDeployments = useMemo(() => {
    let filtered = deployments.filter(d => d.status !== 'deleted')
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter)
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(d => 
        d.name.toLowerCase().includes(query) ||
        d.id.toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [deployments, statusFilter, searchQuery])

  // Keyboard navigation
  useEffect(() => {
    if (!open || activeTab !== 'deployments') return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip hotkeys when typing in inputs or when a sub-modal is open
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (parameterModalOpen) return

      // Escape to close modal
      if (e.key === 'Escape') {
        if (bulkMode) {
          setBulkMode(false)
          setSelectedDeployments(new Set())
        } else {
          onClose()
        }
        return
      }

      if (filteredDeployments.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => {
            const next = prev < filteredDeployments.length - 1 ? prev + 1 : prev
            if (next >= 0) {
              handleViewDetails(filteredDeployments[next])
            }
            return next
          })
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => {
            const next = prev > 0 ? prev - 1 : 0
            handleViewDetails(filteredDeployments[next])
            return next
          })
          break
        case 'Enter':
          if (selectedDeployment && !bulkMode) {
            handleExecuteNow(selectedDeployment.id, selectedDeployment.name)
          }
          break
        case 'e':
          if (selectedDeployment && !bulkMode && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            handleToggleStatus(selectedDeployment)
          }
          break
        case 'Delete':
        case 'Backspace':
          if (selectedDeployment && !bulkMode) {
            e.preventDefault()
            handleDelete(selectedDeployment.id, selectedDeployment.name)
          }
          break
        case ' ': // Space to toggle selection in bulk mode
          if (bulkMode && selectedDeployment) {
            e.preventDefault()
            toggleDeploymentSelection(selectedDeployment.id)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, activeTab, filteredDeployments, selectedDeployment, bulkMode, selectedIndex, parameterModalOpen])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(-1)
    setSelectedDeployment(null)
  }, [searchQuery, statusFilter])

  const toggleDeploymentSelection = (deploymentId: string) => {
    setSelectedDeployments(prev => {
      const next = new Set(prev)
      if (next.has(deploymentId)) {
        next.delete(deploymentId)
      } else {
        next.add(deploymentId)
      }
      return next
    })
  }

  const handleBulkToggle = async () => {
    if (selectedDeployments.size === 0) return
    
    const targetStatus = deployments.find(d => selectedDeployments.has(d.id))?.status === 'enabled' ? 'disabled' : 'enabled'
    
    for (const deploymentId of selectedDeployments) {
      const deployment = deployments.find(d => d.id === deploymentId)
      if (deployment && deployment.status !== targetStatus) {
        await handleToggleStatus(deployment)
      }
    }
    
    setSelectedDeployments(new Set())
    setBulkMode(false)
  }

  const handleBulkDelete = async () => {
    if (selectedDeployments.size === 0) return
    
    const confirmed = await showConfirm({
      title: 'Delete Deployments',
      message: `Are you sure you want to delete ${selectedDeployments.size} deployment(s)?`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    })

    if (!confirmed) return

    for (const deploymentId of selectedDeployments) {
      const deployment = deployments.find(d => d.id === deploymentId)
      if (deployment) {
        await handleDelete(deployment.id, deployment.name)
      }
    }
    
    setSelectedDeployments(new Set())
    setBulkMode(false)
  }

  // Ref to track current selection without triggering effect re-runs
  const selectedDeploymentRef = useRef(selectedDeployment)
  selectedDeploymentRef.current = selectedDeployment

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
        // Refresh deployment status if viewing details (use ref to avoid stale closure)
        const current = selectedDeploymentRef.current
        if (current && data.deploymentId === current.id) {
          loadDeploymentStatus(current.id)
        }
      })
    }

    // Refresh every 10 seconds (reduced from 30 for better responsiveness)
    const interval = setInterval(() => {
      loadDeployments()
      if (activeTab === 'history') {
        loadExecutionHistory()
      }
      // Use ref to get current selection without needing it in deps
      const current = selectedDeploymentRef.current
      if (current) {
        loadDeploymentStatus(current.id)
      }
    }, 10000)

    return () => {
      clearInterval(interval)
      window.removeEventListener('deployment-updated', handleDeploymentUpdate)
      if (cleanupExecutionListener) {
        cleanupExecutionListener()
      }
    }
  }, [activeTab])

  // Auto-load version history when Versions sub-tab is selected
  useEffect(() => {
    const current = selectedDeploymentRef.current
    if (detailTab === 'versions' && current && versionHistory.length === 0) {
      loadVersionHistory(current.id)
    }
  }, [detailTab])

  const loadDeployments = async () => {
    if (!window.electronAPI?.deployment) {
      console.warn('Deployment API not available')
      setLoading(false)
      return
    }

    try {
      const result = await window.electronAPI.deployment.list()
      if (result.success) {
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

  const loadVersionHistory = async (deploymentId: string) => {
    if (!window.electronAPI?.deployment?.getVersionHistory) return

    setVersionHistoryLoading(true)
    try {
      const result = await window.electronAPI.deployment.getVersionHistory(deploymentId)
      if (result.success) {
        setVersionHistory(result.versions || [])
      }
    } catch (error) {
      console.error('Failed to load version history:', error)
    } finally {
      setVersionHistoryLoading(false)
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

  const handlePurgeDeleted = async (specificIds?: string[]) => {
    if (!window.electronAPI?.deployment) return

    const deletedDeployments = deployments.filter(d => d.status === 'deleted')
    const targets = specificIds 
      ? deletedDeployments.filter(d => specificIds.includes(d.id))
      : deletedDeployments
    
    if (targets.length === 0) {
      addToast('No deleted deployments to purge', 'info')
      return
    }

    const confirmed = await showConfirm({
      title: 'Purge Deleted Deployments',
      message: `Are you sure you want to permanently delete ${targets.length} deployment(s)? This will remove all files and cannot be undone.`,
      confirmLabel: 'Purge',
      confirmVariant: 'danger'
    })

    if (!confirmed) return

    // Purge each deployment individually since there's no deleteMany
    let purgedCount = 0
    let failedCount = 0

    for (const deployment of targets) {
      try {
        // Use undeploy with deleteFiles to permanently remove
        const result = await window.electronAPI.deployment.undeploy(deployment.id, { deleteFiles: true })
        if (result.success) {
          purgedCount++
        } else {
          failedCount++
          console.error(`Failed to purge ${deployment.id}:`, result.error)
        }
      } catch (error) {
        failedCount++
        console.error(`Failed to purge ${deployment.id}:`, error)
      }
    }

    if (purgedCount > 0) {
      addToast(`Purged ${purgedCount} deployment(s)${failedCount > 0 ? `, ${failedCount} failed` : ''}`, failedCount > 0 ? 'warning' : 'success')
      window.dispatchEvent(new CustomEvent('deployment-updated'))
      await loadDeployments()
      setSelectedDeletedDeployments(new Set())
      if (selectedDeployment && targets.some(t => t.id === selectedDeployment.id)) {
        setSelectedDeployment(null)
        setTriggers([])
        setDeploymentExecutions([])
      }
    } else {
      addToast('Failed to purge deployments', 'error')
    }
  }

  const toggleDeletedDeploymentSelection = (deploymentId: string) => {
    setSelectedDeletedDeployments(prev => {
      const next = new Set(prev)
      if (next.has(deploymentId)) {
        next.delete(deploymentId)
      } else {
        next.add(deploymentId)
      }
      return next
    })
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
    setDetailTab('triggers')
    setVersionHistory([])
    setExpandedDetailExecutions(new Set())
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
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    
    if (isToday) return `Today, ${timeStr}`
    if (isYesterday) return `Yesterday, ${timeStr}`
    return date.toLocaleString()
  }

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    if (diff < 0) {
      // Future time (for next run)
      const absDiff = -diff
      if (absDiff < 60000) return `in ${Math.round(absDiff / 1000)}s`
      if (absDiff < 3600000) return `in ${Math.round(absDiff / 60000)}m`
      if (absDiff < 86400000) return `in ${Math.round(absDiff / 3600000)}h`
      return `in ${Math.round(absDiff / 86400000)}d`
    }
    if (diff < 60000) return `${Math.round(diff / 1000)}s ago`
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`
    return `${Math.round(diff / 86400000)}d ago`
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
      case 'running':
        return <Loader2 size={16} className="status-icon-running" />
      default:
        return <Clock size={16} />
    }
  }

  const getTriggerTypeIcon = (triggerType: string) => {
    const iconProps = { size: 14, className: `trigger-icon-${triggerType}` }
    switch (triggerType) {
      case 'schedule':
        return <Clock {...iconProps} />
      case 'webhook':
        return <Globe {...iconProps} />
      case 'file-watch':
        return <FolderOpen {...iconProps} />
      case 'event':
        return <Zap {...iconProps} />
      case 'manual':
        return <Play {...iconProps} />
      default:
        return <Zap {...iconProps} />
    }
  }

  // Skeleton loading component
  const DeploymentSkeleton = () => (
    <div className="skeleton-list">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="skeleton-item">
          <div className="skeleton-dot" />
          <div className="skeleton-content">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  )

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

  // Compute changes between consecutive version history entries
  const computeVersionChanges = (
    olderVersion: DeploymentVersionInfo,
    newerVersion: { version: string | null; packageHash: string; triggerSnapshot: string | null }
  ): string[] => {
    const changes: string[] = []

    // Version bump
    const oldVer = olderVersion.version || '0.0.0'
    const newVer = newerVersion.version || '0.0.0'
    if (oldVer !== newVer) {
      changes.push(`Version: v${oldVer} -> v${newVer}`)
    }

    // Package content changed
    if (olderVersion.packageHash !== newerVersion.packageHash) {
      changes.push('Workflow package updated')
    }

    // Trigger changes
    const parseTriggers = (snapshot: string | null): Array<{ type: string; scheduleCron?: string; enabled?: boolean }> => {
      if (!snapshot) return []
      try { return JSON.parse(snapshot) } catch { return [] }
    }

    const oldTriggers = parseTriggers(olderVersion.triggerSnapshot)
    const newTriggers = parseTriggers(newerVersion.triggerSnapshot)

    if (oldTriggers.length !== newTriggers.length) {
      changes.push(`Triggers: ${oldTriggers.length} -> ${newTriggers.length}`)
    } else {
      // Same count but check if types or configs differ
      const oldTypes = oldTriggers.map(t => `${t.type}:${t.scheduleCron || ''}`).sort().join(',')
      const newTypes = newTriggers.map(t => `${t.type}:${t.scheduleCron || ''}`).sort().join(',')
      if (oldTypes !== newTypes) {
        changes.push('Trigger configuration changed')
      }
    }

    if (changes.length === 0) {
      changes.push('Re-deployed (no visible changes)')
    }

    return changes
  }

  // Build the "newer" reference for each version entry:
  // For the most recent previous version (index 0), compare against current deployment
  // For index N, compare against index N-1 (which is the version that replaced it)
  const getChangesForVersion = (index: number): string[] => {
    const olderVersion = versionHistory[index]

    if (index === 0 && selectedDeployment) {
      // Compare most recent previous version against the currently deployed state
      const currentTriggerSnapshot = JSON.stringify(triggers.map(t => ({
        type: t.triggerType,
        scheduleCron: t.scheduleCron || undefined,
        enabled: t.enabled
      })))
      return computeVersionChanges(olderVersion, {
        version: selectedDeployment.version || null,
        packageHash: selectedDeployment.packageHash || '',
        triggerSnapshot: currentTriggerSnapshot
      })
    } else if (index > 0) {
      // Compare against the version that replaced this one
      const newerVersion = versionHistory[index - 1]
      return computeVersionChanges(olderVersion, {
        version: newerVersion.version,
        packageHash: newerVersion.packageHash,
        triggerSnapshot: newerVersion.triggerSnapshot
      })
    }

    return []
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
          <div className="deployment-header-actions">
            {activeTab === 'deployments' && deployments.filter(d => d.status !== 'deleted').length > 0 && (
              <button
                className="button primary"
                onClick={handleDeploy}
                title="Deploy new workflow package"
              >
                <Plus size={16} />
                Deploy
              </button>
            )}
            <button className="modal-close-button" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
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
                <DeploymentSkeleton />
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
                <div className="deployment-split-panel">
                  {/* Left Panel: deployment list */}
                  <div className="deployment-list-panel">
                    {/* Search Bar */}
                    <div className="deployment-search-container">
                      <Search size={16} className="search-icon" />
                      <input
                        type="text"
                        className="deployment-search"
                        placeholder="Search deployments..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button
                          className="search-clear"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    
                    {/* Bulk Actions Bar */}
                    {bulkMode && (
                      <div className="bulk-actions-bar">
                        <span className="bulk-count">{selectedDeployments.size} selected</span>
                        <div className="bulk-actions">
                          <button
                            className="button small secondary"
                            onClick={handleBulkToggle}
                            disabled={selectedDeployments.size === 0}
                          >
                            <Power size={14} />
                            Toggle
                          </button>
                          <button
                            className="button small danger"
                            onClick={handleBulkDelete}
                            disabled={selectedDeployments.size === 0}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                          <button
                            className="button small secondary"
                            onClick={() => {
                              setBulkMode(false)
                              setSelectedDeployments(new Set())
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Bulk Mode Toggle */}
                    <div className="deployment-list-toolbar">
                      <div className="deployment-list-filters">
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
                      <button
                        className={`icon-button small bulk-toggle ${bulkMode ? 'active' : ''}`}
                        onClick={() => {
                          setBulkMode(!bulkMode)
                          setSelectedDeployments(new Set())
                        }}
                        title={bulkMode ? 'Exit bulk mode' : 'Bulk select'}
                      >
                        <Square size={14} />
                      </button>
                    </div>
                    
                    <div className="deployment-list-items">
                      {filteredDeployments.length === 0 ? (
                        <div className="deployment-list-empty">
                          {searchQuery ? (
                            <>
                              <Search size={32} />
                              <p>No deployments match "{searchQuery}"</p>
                              <button className="link" onClick={() => setSearchQuery('')}>Clear search</button>
                            </>
                          ) : statusFilter !== 'all' ? (
                            <>
                              <AlertCircle size={32} />
                              <p>No {statusFilter} deployments</p>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        filteredDeployments.map((deployment, index) => (
                          <div
                            key={deployment.id}
                            className={`deployment-list-item ${selectedDeployment?.id === deployment.id ? 'selected' : ''} status-${deployment.status}`}
                            onClick={() => {
                              if (bulkMode) {
                                toggleDeploymentSelection(deployment.id)
                              } else {
                                handleViewDetails(deployment)
                                setSelectedIndex(index)
                              }
                            }}
                          >
                            {bulkMode && (
                              <div className={`bulk-checkbox ${selectedDeployments.has(deployment.id) ? 'checked' : ''}`}>
                                {selectedDeployments.has(deployment.id) && <CheckCircle size={14} />}
                              </div>
                            )}
                            <span className={`deployment-status-dot status-${deployment.status}`} />
                            <div className="deployment-list-item-info">
                              <span className="deployment-list-item-name">{deployment.name}</span>
                              <span className="deployment-list-item-version">v{deployment.version || '1.0.0'}</span>
                            </div>
                            {deployment.lastExecutionStatus && (
                              <span className={`deployment-exec-dot status-${deployment.lastExecutionStatus}`} title={`Last run: ${deployment.lastExecutionStatus}`} />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Panel: detail view */}
                  <div className="deployment-detail-panel">
                    {selectedDeployment ? (
                      <>
                        <div className="deployment-detail-header">
                          <div className="deployment-detail-title-row">
                            <h3 className="deployment-detail-name">{selectedDeployment.name}</h3>
                            <div className="deployment-detail-actions">
                              <button
                                className="icon-button"
                                onClick={() => handleToggleStatus(selectedDeployment)}
                                title={selectedDeployment.status === 'enabled' ? 'Disable (E)' : 'Enable (E)'}
                                aria-label={selectedDeployment.status === 'enabled' ? 'Disable deployment' : 'Enable deployment'}
                              >
                                <Power size={16} className={selectedDeployment.status === 'enabled' ? 'status-enabled' : 'status-disabled'} />
                              </button>
                              <button
                                className="icon-button"
                                onClick={() => handleExecuteNow(selectedDeployment.id, selectedDeployment.name)}
                                title="Execute now (Enter)"
                                disabled={selectedDeployment.status !== 'enabled'}
                                aria-label="Execute workflow now"
                              >
                                <Play size={16} />
                              </button>
                              <button
                                className="icon-button danger"
                                onClick={() => handleDelete(selectedDeployment.id, selectedDeployment.name)}
                                title="Delete (Del)"
                                aria-label="Delete deployment"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="deployment-detail-meta">
                            <span className={`status-badge status-${selectedDeployment.status}`}>
                              {getStatusIcon(selectedDeployment.status)}
                              {selectedDeployment.status}
                            </span>
                            <span className="deployment-version">v{selectedDeployment.version || '1.0.0'}</span>
                          </div>
                          <div className="deployment-detail-id">ID: {selectedDeployment.id}</div>
                          <div className="deployment-detail-stats">
                            <div className="detail-stat">
                              <span className="detail-stat-label">Deployed</span>
                              <span className="detail-stat-value" title={formatTimestamp(selectedDeployment.deployedAt)}>
                                {formatRelativeTime(selectedDeployment.deployedAt)}
                              </span>
                            </div>
                            {selectedDeployment.lastExecutionAt ? (
                              <div className="detail-stat">
                                <span className="detail-stat-label">Last run</span>
                                <span className={`detail-stat-value ${selectedDeployment.lastExecutionStatus === 'error' ? 'stat-error' : selectedDeployment.lastExecutionStatus === 'success' ? 'stat-success' : ''}`} title={formatTimestamp(selectedDeployment.lastExecutionAt)}>
                                  {formatRelativeTime(selectedDeployment.lastExecutionAt)}
                                  {selectedDeployment.lastExecutionStatus && (
                                    <span className={`detail-stat-dot status-${selectedDeployment.lastExecutionStatus}`} />
                                  )}
                                </span>
                              </div>
                            ) : (
                              <div className="detail-stat">
                                <span className="detail-stat-label">Last run</span>
                                <span className="detail-stat-value muted">Never</span>
                              </div>
                            )}
                            <div className="detail-stat">
                              <span className="detail-stat-label">Executions</span>
                              <span className="detail-stat-value">{deploymentExecutions.length}</span>
                            </div>
                            {(() => {
                              const nextRun = triggers
                                .filter(t => t.enabled && t.nextRunAt)
                                .map(t => t.nextRunAt!)
                                .sort((a, b) => a - b)[0]
                              return nextRun ? (
                                <div className="detail-stat">
                                  <span className="detail-stat-label">Next run</span>
                                  <span className="detail-stat-value" title={formatTimestamp(nextRun)}>
                                    {formatRelativeTime(nextRun)}
                                  </span>
                                </div>
                              ) : null
                            })()}
                          </div>
                        </div>

                        <div className="deployment-detail-tabs">
                          <button
                            className={`detail-tab ${detailTab === 'triggers' ? 'active' : ''}`}
                            onClick={() => setDetailTab('triggers')}
                          >
                            Triggers ({triggers.length})
                          </button>
                          <button
                            className={`detail-tab ${detailTab === 'executions' ? 'active' : ''}`}
                            onClick={() => setDetailTab('executions')}
                          >
                            Executions ({deploymentExecutions.length})
                          </button>
                          <button
                            className={`detail-tab ${detailTab === 'versions' ? 'active' : ''}`}
                            onClick={() => setDetailTab('versions')}
                          >
                            Versions{versionHistory.length > 0 ? ` (${versionHistory.length})` : ''}
                          </button>
                        </div>

                        <div className="deployment-detail-content">
                          {detailTab === 'triggers' ? (
                            triggers.length === 0 ? (
                              <div className="no-triggers">
                                <Zap size={32} />
                                <p>No triggers configured</p>
                                <span className="hint">This workflow can only be executed manually</span>
                              </div>
                            ) : (
                              <div className="triggers-list">
                                {triggers.map((trigger) => (
                                  <div key={trigger.id} className={`trigger-item ${!trigger.enabled ? 'disabled' : ''}`}>
                                    <div className={`trigger-icon trigger-type-${trigger.triggerType}`}>
                                      {getTriggerTypeIcon(trigger.triggerType)}
                                    </div>
                                    <div className="trigger-info">
                                      <div className="trigger-type">{trigger.triggerType}</div>
                                      <div className="trigger-config">
                                        {trigger.scheduleCron && <span className="config-cron">{trigger.scheduleCron}</span>}
                                        {trigger.scheduleTimezone && <span className="config-tz">{trigger.scheduleTimezone}</span>}
                                        {trigger.webhookPath && <span className="config-path">{trigger.webhookPath}</span>}
                                        {trigger.eventName && <span className="config-event">{trigger.eventName}</span>}
                                        {trigger.fileWatchPaths && <span className="config-files">{trigger.fileWatchPaths}</span>}
                                      </div>
                                      <div className="trigger-stats">
                                        {trigger.triggerCount != null && trigger.triggerCount > 0 && (
                                          <span className="trigger-stat fires">
                                            <Activity size={12} />
                                            {trigger.triggerCount.toLocaleString()} fires
                                          </span>
                                        )}
                                        {trigger.lastTriggeredAt && (
                                          <span className={`trigger-stat last-fired ${trigger.lastTriggerStatus === 'error' ? 'stat-error' : ''}`} title={formatTimestamp(trigger.lastTriggeredAt)}>
                                            <Clock size={12} />
                                            {formatRelativeTime(trigger.lastTriggeredAt)}
                                            {trigger.lastTriggerStatus && (
                                              <span className={`status-pill status-${trigger.lastTriggerStatus}`} />
                                            )}
                                          </span>
                                        )}
                                        {trigger.nextRunAt && trigger.enabled && (
                                          <span className="trigger-stat next-run" title={formatTimestamp(trigger.nextRunAt)}>
                                            <ArrowRight size={12} />
                                            {formatRelativeTime(trigger.nextRunAt)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      className="icon-button"
                                      onClick={() => handleToggleTrigger(trigger)}
                                      title={trigger.enabled ? 'Disable trigger' : 'Enable trigger'}
                                      aria-label={trigger.enabled ? 'Disable trigger' : 'Enable trigger'}
                                    >
                                      {trigger.enabled ? <Pause size={14} /> : <Play size={14} />}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : detailTab === 'executions' ? (
                            deploymentExecutions.length === 0 ? (
                              <p className="no-executions">No executions yet</p>
                            ) : (
                              <div className="detail-executions-list">
                                {deploymentExecutions.map((execution) => {
                                  const isDetailExpanded = expandedDetailExecutions.has(execution.id)
                                  const result = execution.result as Record<string, unknown> | undefined
                                  const outputPreview = result?.output
                                    ? (typeof result.output === 'string'
                                      ? result.output.slice(0, 120)
                                      : JSON.stringify(result.output).slice(0, 120))
                                    : null
                                  return (
                                    <div key={execution.id} className={`detail-execution-item status-${execution.status}`}>
                                      <div
                                        className="detail-execution-header"
                                        onClick={() => {
                                          setExpandedDetailExecutions(prev => {
                                            const next = new Set(prev)
                                            if (next.has(execution.id)) next.delete(execution.id)
                                            else next.add(execution.id)
                                            return next
                                          })
                                        }}
                                      >
                                        <span className={`detail-exec-status status-${execution.status}`}>
                                          {execution.status === 'success' ? <CheckCircle size={12} /> : execution.status === 'error' ? <XCircle size={12} /> : <Clock size={12} />}
                                          {execution.status}
                                        </span>
                                        <span className="detail-exec-trigger">{execution.triggerType}</span>
                                        <span className="detail-exec-time" title={formatTimestamp(execution.startedAt)}>
                                          {formatRelativeTime(execution.startedAt)}
                                        </span>
                                        <span className="detail-exec-duration">{formatDuration(execution.startedAt, execution.completedAt)}</span>
                                        {isDetailExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                      </div>
                                      {!isDetailExpanded && outputPreview && (
                                        <div className="detail-exec-preview">{outputPreview}{outputPreview.length >= 120 ? '...' : ''}</div>
                                      )}
                                      {!isDetailExpanded && execution.error && (
                                        <div className="detail-exec-error-preview">{execution.error.slice(0, 120)}{execution.error.length > 120 ? '...' : ''}</div>
                                      )}
                                      {isDetailExpanded && (
                                        <div className="detail-exec-expanded">
                                          <div className="detail-exec-meta-grid">
                                            <div className="detail-exec-meta-item">
                                              <span className="label">Started</span>
                                              <span className="value">{formatTimestamp(execution.startedAt)}</span>
                                            </div>
                                            {execution.completedAt && (
                                              <div className="detail-exec-meta-item">
                                                <span className="label">Completed</span>
                                                <span className="value">{formatTimestamp(execution.completedAt)}</span>
                                              </div>
                                            )}
                                            <div className="detail-exec-meta-item">
                                              <span className="label">Duration</span>
                                              <span className="value">{formatDuration(execution.startedAt, execution.completedAt)}</span>
                                            </div>
                                            <div className="detail-exec-meta-item">
                                              <span className="label">ID</span>
                                              <span className="value mono">{execution.id}</span>
                                            </div>
                                          </div>
                                          {result?.output != null && (
                                            <div className="detail-exec-section">
                                              <h6>
                                                Output
                                                <button
                                                  className="section-open-button"
                                                  onClick={() => openJsonInEditor('Output', result.output)}
                                                  title="Open in editor"
                                                >
                                                  <ExternalLink size={12} />
                                                </button>
                                              </h6>
                                              {(() => { const parsed = tryParseJsonValue(result.output); return parsed !== null ? (
                                                <div className="detail-exec-output">
                                                  <JsonTreeViewer data={parsed} rootPath="output" defaultExpandDepth={2} maxStringPreview={80} />
                                                </div>
                                              ) : (
                                                <pre className="detail-exec-output">
                                                  {typeof result.output === 'string'
                                                    ? result.output
                                                    : JSON.stringify(result.output, null, 2)}
                                                </pre>
                                              ) })()}
                                            </div>
                                          )}
                                          {execution.error && (
                                            <div className="detail-exec-section">
                                              <h6>Error</h6>
                                              <div className="detail-exec-error">{execution.error}</div>
                                            </div>
                                          )}
                                          {execution.parameters && Object.keys(execution.parameters).length > 0 && (
                                            <div className="detail-exec-section">
                                              <h6>Parameters</h6>
                                              <div className="detail-exec-output">
                                                <JsonTreeViewer data={execution.parameters} rootPath="parameters" defaultExpandDepth={2} maxStringPreview={60} />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          ) : detailTab === 'versions' ? (
                            versionHistoryLoading ? (
                              <p className="no-executions">Loading version history...</p>
                            ) : versionHistory.length === 0 ? (
                              <p className="no-executions">No previous versions (first deployment)</p>
                            ) : (
                              <div className="version-history-list">
                                {versionHistory.map((version, index) => {
                                  const triggerCount = version.triggerSnapshot
                                    ? (() => { try { return JSON.parse(version.triggerSnapshot).length } catch { return 0 } })()
                                    : 0
                                  const changes = getChangesForVersion(index)
                                  return (
                                    <div key={version.id} className="version-history-item">
                                      <div className="version-history-header">
                                        <div className="version-history-version">v{version.version || '0.0.0'}</div>
                                        <div className="version-history-meta">
                                          <span>{formatTimestamp(version.deployedAt)}</span>
                                          <span className="version-history-hash" title={version.packageHash}>
                                            {version.packageHash.slice(0, 8)}
                                          </span>
                                          {triggerCount > 0 && (
                                            <span>{triggerCount} trigger{triggerCount > 1 ? 's' : ''}</span>
                                          )}
                                          {version.deployedBy && (
                                            <span>by {version.deployedBy}</span>
                                          )}
                                        </div>
                                      </div>
                                      {changes.length > 0 && (
                                        <div className="version-changes">
                                          <ArrowRight size={10} />
                                          <span className="version-changes-label">
                                            {index === 0 ? 'Changed in current:' : 'Changed in next version:'}
                                          </span>
                                          {changes.map((change, ci) => (
                                            <span key={ci} className="version-change-tag">{change}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="deployment-detail-empty">
                        <Package size={48} />
                        <h4>No Deployment Selected</h4>
                        <p>Select a deployment from the list to view triggers, execution history, and version information.</p>
                        <div className="keyboard-hints">
                          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                          <span><kbd>Enter</kbd> Execute</span>
                          <span><kbd>E</kbd> Toggle</span>
                          <span><kbd>Del</kbd> Delete</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
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
                          <div className="execution-actions-bar">
                            <button
                              className="button small secondary"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRerunExecution(execution)
                              }}
                            >
                              <RotateCw size={14} />
                              Re-run Workflow
                            </button>
                          </div>
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
                              <div className="execution-json">
                                <JsonTreeViewer data={execution.parameters} rootPath="parameters" defaultExpandDepth={2} maxStringPreview={80} />
                              </div>
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
                                      <h5>
                                        Workflow Output
                                        <button
                                          className="section-open-button"
                                          onClick={() => openJsonInEditor('Workflow Output', (execution.result as Record<string, unknown>).output)}
                                          title="Open in editor"
                                        >
                                          <ExternalLink size={12} />
                                        </button>
                                      </h5>
                                      {(() => { const parsed = tryParseJsonValue((execution.result as Record<string, unknown>).output); return parsed !== null ? (
                                        <div className="execution-json execution-result">
                                          <JsonTreeViewer data={parsed} rootPath="output" defaultExpandDepth={3} maxStringPreview={100} />
                                        </div>
                                      ) : (
                                        <pre className="execution-json execution-result">
                                          {typeof (execution.result as Record<string, unknown>).output === 'string'
                                            ? (execution.result as Record<string, unknown>).output as string
                                            : JSON.stringify((execution.result as Record<string, unknown>).output, null, 2)}
                                        </pre>
                                      ) })()}
                                    </div>
                                  )}

                                  {/* Execution Trace */}
                                  {(execution.result as Record<string, unknown>).trace && (
                                    <div className="execution-details-section">
                                      <h5>
                                        Execution Trace
                                        <button
                                          className="section-open-button"
                                          onClick={() => openJsonInEditor('Execution Trace', (execution.result as Record<string, unknown>).trace)}
                                          title="Open in editor"
                                        >
                                          <ExternalLink size={12} />
                                        </button>
                                      </h5>
                                      {(() => { const parsed = tryParseJsonValue((execution.result as Record<string, unknown>).trace); return parsed !== null ? (
                                        <div className="execution-json execution-result">
                                          <JsonTreeViewer data={parsed} rootPath="trace" defaultExpandDepth={2} maxStringPreview={80} />
                                        </div>
                                      ) : (
                                        <pre className="execution-json execution-result">
                                          {JSON.stringify((execution.result as Record<string, unknown>).trace, null, 2)}
                                        </pre>
                                      ) })()}
                                    </div>
                                  )}

                                  {/* Node Outputs */}
                                  {(execution.result as Record<string, unknown>).nodeOutputs && (
                                    <div className="execution-details-section">
                                      <h5>
                                        Node Outputs
                                        <button
                                          className="section-open-button"
                                          onClick={() => openJsonInEditor('Node Outputs', (execution.result as Record<string, unknown>).nodeOutputs)}
                                          title="Open in editor"
                                        >
                                          <ExternalLink size={12} />
                                        </button>
                                      </h5>
                                      {(() => { const parsed = tryParseJsonValue((execution.result as Record<string, unknown>).nodeOutputs); return parsed !== null ? (
                                        <div className="execution-json">
                                          <JsonTreeViewer data={parsed} rootPath="nodeOutputs" defaultExpandDepth={2} maxStringPreview={80} />
                                        </div>
                                      ) : (
                                        <pre className="execution-json">
                                          {JSON.stringify((execution.result as Record<string, unknown>).nodeOutputs, null, 2)}
                                        </pre>
                                      ) })()}
                                    </div>
                                  )}

                                  {/* Metrics */}
                                  {(execution.result as Record<string, unknown>).metrics && (
                                    <div className="execution-details-section">
                                      <h5>
                                        Execution Metrics
                                        <button
                                          className="section-open-button"
                                          onClick={() => openJsonInEditor('Execution Metrics', (execution.result as Record<string, unknown>).metrics)}
                                          title="Open in editor"
                                        >
                                          <ExternalLink size={12} />
                                        </button>
                                      </h5>
                                      {(() => { const parsed = tryParseJsonValue((execution.result as Record<string, unknown>).metrics); return parsed !== null ? (
                                        <div className="execution-json">
                                          <JsonTreeViewer data={parsed} rootPath="metrics" defaultExpandDepth={2} maxStringPreview={60} />
                                        </div>
                                      ) : (
                                        <pre className="execution-json">
                                          {JSON.stringify((execution.result as Record<string, unknown>).metrics, null, 2)}
                                        </pre>
                                      ) })()}
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Fallback: show raw result if not structured */}
                              {(typeof execution.result !== 'object' || execution.result === null) && (
                                <div className="execution-details-section">
                                  <h5>
                                    Result
                                    <button
                                      className="section-open-button"
                                      onClick={() => openJsonInEditor('Result', execution.result)}
                                      title="Open in editor"
                                    >
                                      <ExternalLink size={12} />
                                    </button>
                                  </h5>
                                  {(() => { const parsed = tryParseJsonValue(execution.result); return parsed !== null ? (
                                    <div className="execution-json execution-result">
                                      <JsonTreeViewer data={parsed} rootPath="result" defaultExpandDepth={3} maxStringPreview={100} />
                                    </div>
                                  ) : (
                                    <pre className="execution-json execution-result">
                                      {typeof execution.result === 'string'
                                        ? execution.result
                                        : JSON.stringify(execution.result, null, 2)}
                                    </pre>
                                  ) })()}
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
                        {deletedBulkMode ? (
                          <>
                            <span className="bulk-count">{selectedDeletedDeployments.size} selected</span>
                            <div className="bulk-actions">
                              <button 
                                className="button danger" 
                                onClick={() => handlePurgeDeleted(Array.from(selectedDeletedDeployments))}
                                disabled={selectedDeletedDeployments.size === 0}
                              >
                                <Trash2 size={16} />
                                Purge Selected
                              </button>
                              <button 
                                className="button secondary"
                                onClick={() => {
                                  setDeletedBulkMode(false)
                                  setSelectedDeletedDeployments(new Set())
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <button className="button danger" onClick={() => handlePurgeDeleted()}>
                              <Trash2 size={16} />
                              Purge All ({deletedDeployments.length})
                            </button>
                            <button 
                              className={`icon-button ${deletedBulkMode ? 'active' : ''}`}
                              onClick={() => {
                                setDeletedBulkMode(!deletedBulkMode)
                                setSelectedDeletedDeployments(new Set())
                              }}
                              title="Select multiple to purge"
                            >
                              <Square size={16} />
                            </button>
                          </>
                        )}
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
                          <div 
                            key={deployment.id} 
                            className={`deployment-card status-deleted ${selectedDeletedDeployments.has(deployment.id) ? 'selected' : ''}`}
                            onClick={() => deletedBulkMode && toggleDeletedDeploymentSelection(deployment.id)}
                          >
                            <div className="deployment-card-header">
                              {deletedBulkMode && (
                                <div className={`bulk-checkbox ${selectedDeletedDeployments.has(deployment.id) ? 'checked' : ''}`}>
                                  {selectedDeletedDeployments.has(deployment.id) && <CheckCircle size={14} />}
                                </div>
                              )}
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
