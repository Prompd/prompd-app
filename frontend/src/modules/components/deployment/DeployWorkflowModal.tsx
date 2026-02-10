/**
 * Deploy Workflow Modal
 *
 * Analyzes the current workflow and deploys it:
 * - Finds referenced prompts (.prmd files)
 * - Identifies dependencies
 * - Packages everything
 * - Deploys to ~/.prompd/workflows
 */

import { useState, useEffect } from 'react'
import { X, Package, FileText, Link, AlertCircle, CheckCircle, Loader, Download, FolderOpen, Info } from 'lucide-react'
import type { WorkflowFile } from '@/modules/services/workflowTypes'
import type { DeploymentInfo } from '../../../electron'
import { useEditorStore } from '../../../stores/editorStore'
import { useUIStore } from '../../../stores/uiStore'
import VersionInput from '../VersionInput'
import './DeployWorkflowModal.css'

interface DeployWorkflowModalProps {
  open: boolean
  onClose: () => void
  workflow: WorkflowFile | null
  workflowPath: string | null
}

interface WorkflowAnalysis {
  prompts: Array<{
    nodeId: string
    promptRef: string
    resolved: boolean
    path?: string
    label: string
  }>
  dependencies: Array<{
    name: string
    version: string
    type: 'package' | 'file'
  }>
  triggers: Array<{
    type: string
    config: Record<string, unknown>
  }>
  totalFiles: number
}

export function DeployWorkflowModal({ open, onClose, workflow, workflowPath }: DeployWorkflowModalProps) {
  const [activeTab, setActiveTab] = useState<'deploy' | 'export'>('deploy')
  const [analyzing, setAnalyzing] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null)
  const [deploymentName, setDeploymentName] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [existingDeployment, setExistingDeployment] = useState<DeploymentInfo | null>(null)

  // Export tab states
  const [exporting, setExporting] = useState(false)
  const [exportType, setExportType] = useState<'docker' | 'kubernetes'>('docker')
  const [exportPort, setExportPort] = useState('3000')
  const [exportPath, setExportPath] = useState<string | null>(null)

  // Kubernetes-specific options
  const [k8sNamespace, setK8sNamespace] = useState('default')
  const [k8sReplicas, setK8sReplicas] = useState('1')
  const [k8sIncludeIngress, setK8sIncludeIngress] = useState(false)
  const [k8sIngressDomain, setK8sIngressDomain] = useState('')
  const [k8sIncludeHelm, setK8sIncludeHelm] = useState(true)
  const [k8sImageName, setK8sImageName] = useState('')
  const [k8sImageTag, setK8sImageTag] = useState('latest')

  const addToast = useUIStore(state => state.addToast)

  // Get workspace path for resolving workspace-relative file paths
  const workspacePath = useEditorStore(state => state.explorerDirPath)

  // Analyze workflow and look up existing deployment when modal opens
  useEffect(() => {
    if (open && workflow) {
      analyzeWorkflow()
      lookupExistingDeployment()
    }
    if (!open) {
      setExistingDeployment(null)
    }
  }, [open, workflow])

  const lookupExistingDeployment = async () => {
    if (!workflow) return
    try {
      // Try to find existing deployment by workflow ID first
      const workflowId = workflow.metadata?.id
      if (workflowId && window.electronAPI?.deployment?.list) {
        const result = await window.electronAPI.deployment.list({ workflowId })
        if (result?.success && result.deployments && result.deployments.length > 0) {
          // Find the active (non-deleted) deployment
          const active = result.deployments.find(d => d.status !== 'deleted')
          if (active) {
            setExistingDeployment(active)
            return
          }
        }
      }

      // Fallback: list all and match by name
      if (window.electronAPI?.deployment?.list) {
        const result = await window.electronAPI.deployment.list()
        if (result?.success && result.deployments) {
          const workflowName = workflow.metadata?.name
          if (workflowName) {
            const match = result.deployments.find(d => d.name === workflowName && d.status !== 'deleted')
            if (match) {
              setExistingDeployment(match)
            }
          }
        }
      }
    } catch (err) {
      console.warn('[DeployWorkflowModal] Failed to look up existing deployment:', err)
    }
  }

  const analyzeWorkflow = async () => {
    if (!workflow) return

    setAnalyzing(true)
    setError(null)

    try {
      // Find all prompt nodes
      const promptNodes = workflow.nodes?.filter((n) => n.type === 'prompt') || []

      // Get workflow directory for resolving relative paths
      const workflowDir = workflowPath ? workflowPath.substring(0, workflowPath.lastIndexOf('/') || workflowPath.lastIndexOf('\\')) : ''

      const prompts = promptNodes.map((node) => {
        const nodeData = node.data as { label?: string; promptRef?: string; source?: string; rawPrompt?: string }
        const promptRef = nodeData?.promptRef || nodeData?.source
        const hasExternalRef = !!promptRef
        const label = nodeData?.label || 'Unnamed prompt'

        // Determine display name and resolved path
        let displayName: string
        let resolvedPath: string | undefined

        if (hasExternalRef && promptRef) {
          // External file reference - resolve relative paths
          const rawPath = promptRef

          if (rawPath.startsWith('@')) {
            // Package reference
            displayName = rawPath
            resolvedPath = rawPath
          } else if (rawPath.startsWith('./') || rawPath.startsWith('../')) {
            // Relative file path - resolve it relative to workflow directory
            // Normalize the path to show relative to project root
            const pathParts = rawPath.split(/[/\\]/)
            const dirParts = workflowDir.split(/[/\\]/)

            // Process path parts (.., ., etc)
            const resolvedParts = [...dirParts]
            for (const part of pathParts) {
              if (part === '..') {
                resolvedParts.pop()
              } else if (part === '.') {
                // Skip current directory
              } else if (part) {
                resolvedParts.push(part)
              }
            }

            resolvedPath = resolvedParts.join('/')
            displayName = resolvedPath
          } else {
            // Absolute or workspace-relative path
            displayName = rawPath
            resolvedPath = rawPath
          }
        } else {
          // Inline prompt - show label or preview
          displayName = `${label} (inline)`
        }

        return {
          nodeId: node.id,
          promptRef: displayName,
          resolved: !hasExternalRef || (promptRef?.startsWith('@') ?? false),
          path: resolvedPath,
          label
        }
      })

      // Find trigger node
      const triggerNode = workflow.nodes?.find((n) => n.type === 'trigger')
      const triggerData = triggerNode?.data as { triggerType?: string } | undefined
      const triggers = triggerNode ? [{
        type: triggerData?.triggerType || 'manual',
        config: triggerNode.data || {}
      }] : []

      // Extract dependencies from workflow metadata
      const dependencies: WorkflowAnalysis['dependencies'] = []

      // Count total files (workflow + prompts + dependencies)
      const totalFiles = 1 + prompts.filter((p) => !p.resolved).length

      setAnalysis({
        prompts,
        dependencies,
        triggers,
        totalFiles
      })

      // Set default deployment name from workflow metadata or filename
      let defaultName = 'workflow'
      if (workflow.metadata?.name) {
        defaultName = workflow.metadata.name
      } else if (workflowPath) {
        defaultName = workflowPath.split(/[\\/]/).pop()?.replace('.pdflow', '') || 'workflow'
      }
      setDeploymentName(defaultName)

      // Set version from workflow (top-level field)
      const defaultVersion = workflow.version || '1.0.0'
      setVersion(defaultVersion)

      // Set description from workflow metadata
      setDescription(workflow.metadata?.description || '')

      console.log('[DeployWorkflowModal] Workflow analysis:', {
        hasMetadata: !!workflow.metadata,
        metadataName: workflow.metadata?.name,
        version: defaultVersion,
        workflowPath,
        defaultName,
        prompts: prompts.length,
        triggers: triggers.length
      })
    } catch (err) {
      console.error('Failed to analyze workflow:', err)
      setError('Failed to analyze workflow: ' + (err as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleDeploy = async () => {
    if (!workflow || !workflowPath || !analysis) return

    setDeploying(true)
    setError(null)

    try {
      // Use explorerDirPath as workspace, or fall back to workflow file's directory
      const getDirectoryPath = (filePath: string) => {
        if (!filePath) return ''
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
        if (lastSlash <= 0) {
          // No directory separator found or at root - return current directory
          return '.'
        }
        return filePath.substring(0, lastSlash)
      }

      let effectiveWorkspacePath = workspacePath || getDirectoryPath(workflowPath)

      // Ensure we have a valid path
      if (!effectiveWorkspacePath || effectiveWorkspacePath === '.') {
        throw new Error('Unable to determine workspace path. Please open a workspace folder first.')
      }

      console.log('[Deploy] Using workspace path:', effectiveWorkspacePath)

      // Call deployment API with workspace path for resolving workspace-relative files
      const result = await window.electronAPI?.deployment?.deploy(workflowPath, {
        name: deploymentName,
        version: version,
        workspacePath: effectiveWorkspacePath
      })

      if (result?.success) {
        // Write the deployed version back to the workflow file
        if (workflowPath && window.electronAPI?.readFile) {
          try {
            const fileResult = await window.electronAPI.readFile(workflowPath)
            if (fileResult.success && fileResult.content) {
              const wf = JSON.parse(fileResult.content)
              const versionChanged = wf.version !== version

              if (versionChanged) {
                wf.version = version
                // Clean up legacy metadata.version if present
                if (wf.metadata) {
                  delete wf.metadata.version
                }
                const updatedContent = JSON.stringify(wf, null, 2)

                const autoSaveEnabled = useUIStore.getState().autoSaveEnabled

                // Find the open editor tab for this file
                const { tabs, activeTabId, updateTab } = useEditorStore.getState()
                const normalizedPath = workflowPath.replace(/\\/g, '/')
                const matchingTab = tabs.find(t =>
                  t.filePath && t.filePath.replace(/\\/g, '/') === normalizedPath
                )

                if (autoSaveEnabled && window.electronAPI?.writeFile) {
                  // Auto-save enabled: write to disk and sync tab
                  await window.electronAPI.writeFile(workflowPath, updatedContent)

                  if (matchingTab) {
                    updateTab(matchingTab.id, {
                      text: updatedContent,
                      savedText: updatedContent,
                      dirty: false
                    })
                    if (matchingTab.id === activeTabId) {
                      useEditorStore.getState().setTextWithoutTabUpdate(updatedContent)
                    }
                  }
                } else if (matchingTab) {
                  // Auto-save disabled: update tab content but mark dirty
                  updateTab(matchingTab.id, {
                    text: updatedContent,
                    dirty: true
                  })
                  if (matchingTab.id === activeTabId) {
                    useEditorStore.getState().setTextWithoutTabUpdate(updatedContent)
                  }
                }
              }
            }
          } catch (versionErr) {
            // Non-critical: version writeback failed, deployment still succeeded
            console.warn('[Deploy] Failed to write version back to workflow file:', versionErr)
          }
        }

        addToast('Deployment successful!', 'success')
        // Notify other components that deployments have changed
        window.dispatchEvent(new CustomEvent('deployment-updated'))
        onClose()
      } else {
        setError(result?.error || 'Deployment failed')
      }
    } catch (err) {
      console.error('Failed to deploy:', err)
      setError('Failed to deploy: ' + (err as Error).message)
    } finally {
      setDeploying(false)
    }
  }

  const handleSelectExportPath = async () => {
    try {
      if (!window.electronAPI?.openFolder) {
        addToast('File picker not available in browser mode', 'warning')
        return
      }

      // Use the file picker to select a directory
      const result = await window.electronAPI.openFolder()
      if (result) {
        setExportPath(result)
      }
    } catch (err) {
      console.error('Failed to select export path:', err)
      addToast('Failed to select directory', 'error')
    }
  }

  const handleExport = async () => {
    if (!workflow || !workflowPath) return
    if (!exportPath) {
      addToast('Please select an export directory', 'warning')
      return
    }

    setExporting(true)
    setError(null)

    try {
      // Use explorerDirPath as workspace, or fall back to workflow file's directory
      const getDirectoryPath = (filePath: string) => {
        if (!filePath) return ''
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
        if (lastSlash <= 0) {
          // No directory separator found or at root - return current directory
          return '.'
        }
        return filePath.substring(0, lastSlash)
      }

      let effectiveWorkspacePath = workspacePath || getDirectoryPath(workflowPath)

      // Ensure we have a valid path
      if (!effectiveWorkspacePath || effectiveWorkspacePath === '.') {
        throw new Error('Unable to determine workspace path. Please open a workspace folder first.')
      }

      console.log('[Export] Using workspace path:', effectiveWorkspacePath)

      // Get prompd.json if it exists
      const tabs = useEditorStore.getState().tabs
      let prompdjson = {}
      const projectFiles = tabs.filter(t => t.name?.toLowerCase() === 'prompd.json')
      if (projectFiles.length > 0) {
        try {
          prompdjson = JSON.parse(projectFiles[0].text || '{}')
        } catch (err) {
          console.warn('Failed to parse prompd.json:', err)
        }
      }

      let result

      if (exportType === 'kubernetes') {
        // Export as Kubernetes
        const kubernetesOptions = {
          namespace: k8sNamespace,
          replicas: parseInt(k8sReplicas) || 1,
          includeIngress: k8sIncludeIngress,
          ingressDomain: k8sIngressDomain,
          includeHelm: k8sIncludeHelm,
          imageName: k8sImageName || workflow.metadata?.name?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'prompd-workflow',
          imageTag: k8sImageTag
        }

        result = await window.electronAPI?.workflow?.exportToPath(
          workflow,
          workflowPath,
          exportPath,
          prompdjson,
          {
            exportType: 'kubernetes',
            kubernetesOptions,
            workspacePath: effectiveWorkspacePath
          }
        )
      } else {
        // Export as Docker
        result = await window.electronAPI?.workflow?.exportToPath(
          workflow,
          workflowPath,
          exportPath,
          prompdjson,
          {
            exportType: 'docker',
            workspacePath: effectiveWorkspacePath
          }
        )
      }

      if (result?.success) {
        addToast(`Successfully exported to ${exportPath}`, 'success', 5000)
        onClose()
      } else {
        setError(result?.error || 'Export failed')
      }
    } catch (err) {
      console.error('Failed to export:', err)
      setError('Failed to export: ' + (err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  if (!open) return null

  if (!workflow) {
    return (
      <div className="deploy-modal-overlay" onClick={onClose}>
        <div className="deploy-modal" onClick={(e) => e.stopPropagation()}>
          <div className="deploy-modal-header">
            <h2>Deploy Workflow</h2>
            <button className="modal-close-button" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="deploy-modal-content">
            <div className="deploy-error">
              <AlertCircle size={48} />
              <h3>No Workflow</h3>
              <p>No workflow is currently open for deployment.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="deploy-modal-overlay" onClick={onClose}>
      <div className="deploy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="deploy-modal-header">
          <h2>Deploy Workflow</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Shared workflow info — above tabs, shared between Deploy and Export */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {/* Name + Version row */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Name
              </label>
              <input
                type="text"
                value={deploymentName}
                onChange={(e) => setDeploymentName(e.target.value)}
                placeholder="Enter deployment name"
                className="deploy-input"
              />
            </div>
            <div style={{ flex: '0 0 200px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Version
              </label>
              <VersionInput
                value={version}
                onChange={setVersion}
                placeholder="1.0.0"
                compact={true}
                hideHelperText={true}
                colors={{
                  input: 'var(--panel-2)',
                  border: 'var(--border)',
                  text: 'var(--text)',
                  textSecondary: 'var(--muted)',
                  primary: 'var(--accent)',
                  bgSecondary: 'var(--panel)'
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this workflow"
              className="deploy-input"
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        <div className="deploy-tabs">
          <button
            className={`tab ${activeTab === 'deploy' ? 'active' : ''}`}
            onClick={() => setActiveTab('deploy')}
          >
            <Package size={16} />
            Deploy
          </button>
          <button
            className={`tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <Download size={16} />
            Export
          </button>
        </div>

        <div className="deploy-modal-content">
          {activeTab === 'deploy' ? (
            analyzing ? (
              <div className="deploy-analyzing">
                <Loader size={32} className="spinner" />
                <p>Analyzing workflow...</p>
              </div>
            ) : analysis ? (
            <>
              {/* Existing deployment banner */}
              {existingDeployment && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px',
                }}>
                  <Info size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                  <span>
                    Existing deployment found:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{existingDeployment.name}</span>
                    {existingDeployment.version && (
                      <span style={{ fontFamily: 'monospace', marginLeft: '6px', color: 'var(--accent)' }}>
                        v{existingDeployment.version}
                      </span>
                    )}
                    <span style={{
                      marginLeft: '8px',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: existingDeployment.status === 'enabled'
                        ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                        : existingDeployment.status === 'failed'
                          ? 'color-mix(in srgb, var(--error) 15%, transparent)'
                          : 'var(--panel-2)',
                      color: existingDeployment.status === 'enabled'
                        ? 'var(--success)'
                        : existingDeployment.status === 'failed'
                          ? 'var(--error)'
                          : 'var(--muted)',
                    }}>
                      {existingDeployment.status}
                    </span>
                    {' '} — deploying will update this deployment
                  </span>
                </div>
              )}

              {/* Workflow Info */}
              <section className="deploy-section">
                <h3>Deployment Details</h3>
                <div className="deploy-info-grid">
                  <div className="deploy-info-item">
                    <label>Workflow File</label>
                    <div className="deploy-info-value">
                      {workflowPath
                        ? (workflowPath.includes('/') || workflowPath.includes('\\')
                            ? workflowPath.split(/[\\/]/).pop()
                            : workflowPath)
                        : 'Unsaved workflow'}
                    </div>
                  </div>
                  <div className="deploy-info-item">
                    <label>Deployment Path</label>
                    <div className="deploy-info-value">~/.prompd/workflows/</div>
                  </div>
                </div>
              </section>

              {/* Triggers */}
              <section className="deploy-section">
                <h3>
                  <Package size={16} />
                  Triggers ({analysis.triggers.length})
                </h3>
                {analysis.triggers.length === 0 ? (
                  <p className="deploy-empty">No triggers configured (manual execution only)</p>
                ) : (
                  <div className="deploy-list">
                    {analysis.triggers.map((trigger, idx) => (
                      <div key={idx} className="deploy-list-item">
                        <CheckCircle size={14} className="deploy-icon-success" />
                        <div className="deploy-list-info">
                          <div className="deploy-list-name">{trigger.type}</div>
                          <div className="deploy-list-detail">
                            {trigger.type === 'schedule' && Boolean((trigger.config as Record<string, unknown>).scheduleCron) && (
                              <span>Cron: {String((trigger.config as Record<string, unknown>).scheduleCron)}</span>
                            )}
                            {trigger.type === 'webhook' && Boolean((trigger.config as Record<string, unknown>).webhookPath) && (
                              <span>Path: {String((trigger.config as Record<string, unknown>).webhookPath)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Prompts */}
              <section className="deploy-section">
                <h3>
                  <FileText size={16} />
                  Referenced Prompts ({analysis.prompts.length})
                </h3>
                {analysis.prompts.length === 0 ? (
                  <p className="deploy-empty">No external prompts referenced</p>
                ) : (
                  <div className="deploy-list">
                    {analysis.prompts.map((prompt, idx) => (
                      <div key={idx} className="deploy-list-item">
                        {prompt.resolved ? (
                          <CheckCircle size={14} className="deploy-icon-success" />
                        ) : (
                          <AlertCircle size={14} className="deploy-icon-warning" />
                        )}
                        <div className="deploy-list-info">
                          <div className="deploy-list-name">{prompt.promptRef}</div>
                          {prompt.path && (
                            <div className="deploy-list-detail">File: {prompt.path}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Dependencies */}
              {analysis.dependencies.length > 0 && (
                <section className="deploy-section">
                  <h3>
                    <Link size={16} />
                    Dependencies ({analysis.dependencies.length})
                  </h3>
                  <div className="deploy-list">
                    {analysis.dependencies.map((dep, idx) => (
                      <div key={idx} className="deploy-list-item">
                        <CheckCircle size={14} className="deploy-icon-success" />
                        <div className="deploy-list-info">
                          <div className="deploy-list-name">{dep.name}</div>
                          <div className="deploy-list-detail">
                            {dep.version} • {dep.type}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Error */}
              {error && (
                <div className="deploy-error-message">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="deploy-actions">
                <button className="button" onClick={onClose} disabled={deploying}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  onClick={handleDeploy}
                  disabled={deploying || !deploymentName.trim()}
                >
                  {deploying ? (
                    <>
                      <Loader size={16} className="spinner" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Package size={16} />
                      Deploy Workflow
                    </>
                  )}
                </button>
              </div>
            </>
            ) : (
              <div className="deploy-error">
                <AlertCircle size={48} />
                <h3>Analysis Failed</h3>
                <p>Failed to analyze the workflow. Please try again.</p>
              </div>
            )
          ) : (
            /* Export Tab */
            <div className="deploy-export-tab">
              <section className="deploy-section">
                <h3>Export Configuration</h3>

                {/* Export Type */}
                <div className="deploy-info-item">
                  <label>Export Type</label>
                  <select
                    value={exportType}
                    onChange={(e) => setExportType(e.target.value as 'docker' | 'kubernetes')}
                    className="deploy-input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="docker">Docker Container</option>
                    <option value="kubernetes">Kubernetes</option>
                  </select>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {exportType === 'docker'
                      ? 'Exports a self-contained Docker deployment with server.js, Dockerfile, and dependencies'
                      : 'Exports Kubernetes manifests, Helm charts, and Dockerfile for container orchestration'}
                  </p>
                </div>

                {/* Docker-specific options */}
                {exportType === 'docker' && (
                  <div className="deploy-info-item" style={{ marginTop: '16px' }}>
                    <label>Server Port</label>
                    <input
                      type="text"
                      value={exportPort}
                      onChange={(e) => setExportPort(e.target.value)}
                      placeholder="3000"
                      className="deploy-input"
                    />
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Port for the Express server (default: 3000)
                    </p>
                  </div>
                )}

                {/* Kubernetes-specific options */}
                {exportType === 'kubernetes' && (
                  <>
                    <div className="deploy-info-grid" style={{ marginTop: '16px' }}>
                      <div className="deploy-info-item">
                        <label>Namespace</label>
                        <input
                          type="text"
                          value={k8sNamespace}
                          onChange={(e) => setK8sNamespace(e.target.value)}
                          placeholder="default"
                          className="deploy-input"
                        />
                      </div>
                      <div className="deploy-info-item">
                        <label>Replicas</label>
                        <input
                          type="number"
                          value={k8sReplicas}
                          onChange={(e) => setK8sReplicas(e.target.value)}
                          placeholder="1"
                          min="1"
                          max="100"
                          className="deploy-input"
                        />
                      </div>
                    </div>

                    <div className="deploy-info-grid" style={{ marginTop: '16px' }}>
                      <div className="deploy-info-item">
                        <label>Image Name</label>
                        <input
                          type="text"
                          value={k8sImageName}
                          onChange={(e) => setK8sImageName(e.target.value)}
                          placeholder={workflow?.metadata?.name?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'prompd-workflow'}
                          className="deploy-input"
                        />
                      </div>
                      <div className="deploy-info-item">
                        <label>Image Tag</label>
                        <input
                          type="text"
                          value={k8sImageTag}
                          onChange={(e) => setK8sImageTag(e.target.value)}
                          placeholder="latest"
                          className="deploy-input"
                        />
                      </div>
                    </div>

                    <div className="deploy-info-item" style={{ marginTop: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={k8sIncludeHelm}
                          onChange={(e) => setK8sIncludeHelm(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        Include Helm Chart
                      </label>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Generate Helm chart for templated deployments
                      </p>
                    </div>

                    <div className="deploy-info-item" style={{ marginTop: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={k8sIncludeIngress}
                          onChange={(e) => setK8sIncludeIngress(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        Include Ingress
                      </label>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Enable external HTTP/HTTPS access
                      </p>
                    </div>

                    {k8sIncludeIngress && (
                      <div className="deploy-info-item" style={{ marginTop: '12px', marginLeft: '24px' }}>
                        <label>Ingress Domain</label>
                        <input
                          type="text"
                          value={k8sIngressDomain}
                          onChange={(e) => setK8sIngressDomain(e.target.value)}
                          placeholder="workflow.example.com"
                          className="deploy-input"
                        />
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Domain for external access (requires DNS configuration)
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Export Directory */}
                <div className="deploy-info-item" style={{ marginTop: '16px' }}>
                  <label>Export Directory</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={exportPath || ''}
                      readOnly
                      placeholder="Select a directory..."
                      className="deploy-input"
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={handleSelectExportPath}
                      className="button"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}
                    >
                      <FolderOpen size={16} />
                      Browse
                    </button>
                  </div>
                </div>
              </section>

              {/* Files Preview */}
              <section className="deploy-section" style={{ marginTop: '20px' }}>
                <h3>Generated Files</h3>
                <div style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: 'var(--text-secondary)'
                }}>
                  <div>server.js - Express server with API endpoints</div>
                  <div>Dockerfile - Multi-stage container build</div>
                  {exportType === 'docker' && (
                    <div>docker-compose.yml - Easy deployment config</div>
                  )}
                  <div>package.json - Server dependencies</div>
                  <div>prompd.json - Workflow dependencies</div>
                  <div>.env.example - API key templates</div>
                  {exportType === 'docker' ? (
                    <div>README.md - Deployment instructions</div>
                  ) : (
                    <div>README-k8s.md - Kubernetes deployment guide</div>
                  )}
                  <div>{workflowPath?.split(/[\\/]/).pop() || 'workflow.pdflow'} - Workflow file</div>
                  {analysis?.prompts && analysis.prompts.length > 0 && (
                    <div>prompts/ - Referenced prompt files ({analysis.prompts.length})</div>
                  )}
                  {exportType === 'kubernetes' && (
                    <>
                      <div>k8s/namespace.yaml - Kubernetes namespace</div>
                      <div>k8s/configmap.yaml - Configuration data</div>
                      <div>k8s/secret.yaml - Sensitive data (template)</div>
                      <div>k8s/deployment.yaml - Pod deployment spec</div>
                      <div>k8s/service.yaml - Service exposure</div>
                      <div>k8s/hpa.yaml - Auto-scaling config</div>
                      <div>k8s/kustomization.yaml - Kustomize config</div>
                      {k8sIncludeIngress && (
                        <div>k8s/ingress.yaml - Ingress rules</div>
                      )}
                      {k8sIncludeHelm && (
                        <>
                          <div>helm/Chart.yaml - Helm chart metadata</div>
                          <div>helm/values.yaml - Default values</div>
                          <div>helm/templates/ - Helm templates</div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </section>

              {/* Error */}
              {error && (
                <div className="deploy-error-message">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="deploy-actions" style={{ marginTop: '24px' }}>
                <button className="button" onClick={onClose} disabled={exporting}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  onClick={handleExport}
                  disabled={exporting || !exportPath}
                >
                  {exporting ? (
                    <>
                      <Loader size={16} className="spinner" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Export Workflow
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
