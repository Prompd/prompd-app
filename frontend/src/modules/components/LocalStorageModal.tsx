import React, { useState, useEffect } from 'react'
import { X, Download, Trash2, Clock, FileText, Upload, AlertCircle, Save, CheckCircle } from 'lucide-react'
import { localProjectStorage, LocalProject } from '../services/localProjectStorage'
import { useConfirmDialog } from './ConfirmDialog'

interface LocalStorageModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenProject: (files: { path: string; content: string }[], name: string, projectId: string) => void
  onUploadToCloud?: (project: LocalProject) => Promise<{ projectId: string; filesUploaded: number }>
  theme: 'light' | 'dark'
}

export function LocalStorageModal({ isOpen, onClose, onOpenProject, onUploadToCloud, theme }: LocalStorageModalProps) {
  const [projects, setProjects] = useState<LocalProject[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [storageSize, setStorageSize] = useState('')
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Use custom confirm dialog instead of native confirm()
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog(theme)

  // Theme-aware colors
  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    bgTertiary: theme === 'dark' ? '#334155' : '#e2e8f0',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    successBg: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    successBorder: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
    error: '#ef4444',
    errorBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    errorBorder: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)'
  }

  useEffect(() => {
    if (isOpen) {
      loadProjects()
    }
  }, [isOpen])

  const loadProjects = () => {
    const allProjects = localProjectStorage.getAll()
    setProjects(allProjects)
    setStorageSize(localProjectStorage.getStorageSize().formatted)
  }

  const handleOpen = (project: LocalProject) => {
    localProjectStorage.updateLastAccessed(project.id)
    onOpenProject(project.files, project.name, project.id)
    onClose()
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const project = projects.find(p => p.id === id)
    const confirmed = await showConfirm({
      title: 'Delete Project',
      message: `Are you sure you want to delete "${project?.name || 'this project'}" from local storage? This action cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      confirmVariant: 'danger'
    })
    if (confirmed) {
      localProjectStorage.delete(id)
      loadProjects()
      if (selectedId === id) {
        setSelectedId(null)
      }
    }
  }

  const handleDownloadZip = async (project: LocalProject, e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      const JSZip = (window as any).JSZip

      if (JSZip) {
        const zip = new JSZip()

        // Add all files to ZIP
        project.files.forEach(file => {
          zip.file(file.path, file.content)
        })

        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${project.name}.zip`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        // Fallback: download first file only
        if (project.files.length > 0) {
          const firstFile = project.files[0]
          const blob = new Blob([firstFile.content], { type: 'text/plain' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = firstFile.path
          a.click()
          URL.revokeObjectURL(url)
          setSuccessMessage(`Downloaded ${firstFile.path} only. Install JSZip for full project download.`)
          setTimeout(() => setSuccessMessage(null), 5000)
        }
      }
    } catch (error) {
      console.error('Failed to download:', error)
      setError('Failed to download project')
    }
  }

  const handleUploadToCloud = async (project: LocalProject, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onUploadToCloud) return

    setUploadingId(project.id)
    setError(null)
    setSuccessMessage(null)

    try {
      await onUploadToCloud(project)
      setSuccessMessage(`"${project.name}" uploaded to cloud successfully!`)
      loadProjects() // Refresh to show updated status
      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (error) {
      console.error('Failed to upload:', error)
      setError(error instanceof Error ? error.message : 'Failed to upload project')
    } finally {
      setUploadingId(null)
    }
  }

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.6)' : '0 20px 60px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.2s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.border}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FileText size={24} style={{ color: colors.primary }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: colors.text }}>Local Projects</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: colors.textSecondary }}>
                {projects.length} projects • {storageSize} used • 10MB max per project
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              color: colors.textSecondary,
              fontSize: '20px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Success Display */}
        {successMessage && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '12px 16px',
              background: colors.successBg,
              border: `1px solid ${colors.successBorder}`,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <CheckCircle size={20} style={{ color: colors.success, flexShrink: 0 }} />
            <span style={{ fontSize: '14px', color: colors.success }}>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: colors.success,
                opacity: 0.7
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '12px 16px',
              background: colors.errorBg,
              border: `1px solid ${colors.errorBorder}`,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <AlertCircle size={20} style={{ color: colors.error, flexShrink: 0 }} />
            <span style={{ fontSize: '14px', color: colors.error }}>{error}</span>
          </div>
        )}

        {/* Projects List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          {projects.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '300px',
                color: colors.textSecondary,
                gap: '12px'
              }}
            >
              <FileText size={48} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: '16px', fontWeight: 500 }}>No saved projects</p>
              <p style={{ fontSize: '14px', opacity: 0.7 }}>Open a project folder and save it to see it here</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {projects.map((project) => (
                <div
                  key={project.id}
                  style={{
                    padding: '12px 16px',
                    background: selectedId === project.id ? colors.bgTertiary : colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => setSelectedId(project.id)}
                  onDoubleClick={() => handleOpen(project)}
                  onMouseEnter={(e) => {
                    if (selectedId !== project.id) {
                      e.currentTarget.style.background = colors.hover
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedId !== project.id) {
                      e.currentTarget.style.background = colors.bgSecondary
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <FileText size={16} style={{ color: colors.primary, flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: colors.text
                          }}
                        >
                          {project.name}
                        </span>
                        {project.uploadedToCloud && (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 6px',
                              background: colors.successBg,
                              border: `1px solid ${colors.successBorder}`,
                              borderRadius: '4px',
                              fontSize: '11px',
                              color: colors.success,
                              flexShrink: 0
                            }}
                          >
                            <CheckCircle size={12} />
                            Synced
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          fontSize: '12px',
                          color: colors.textSecondary
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          {formatDate(project.lastAccessed)}
                        </span>
                        <span>{project.files.length} files</span>
                        <span>{formatSize(project.size)}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                      {onUploadToCloud && (
                        <button
                          onClick={(e) => handleUploadToCloud(project, e)}
                          disabled={uploadingId === project.id}
                          style={{
                            padding: '6px 10px',
                            fontSize: '12px',
                            border: `1px solid ${colors.border}`,
                            borderRadius: '6px',
                            background: colors.bg,
                            color: project.uploadedToCloud ? colors.text : colors.primary,
                            cursor: uploadingId === project.id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: uploadingId === project.id ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                          }}
                          title={project.uploadedToCloud ? 'Save changes to cloud' : 'Upload to cloud storage'}
                          onMouseOver={(e) => {
                            if (uploadingId !== project.id) {
                              e.currentTarget.style.background = colors.hover
                            }
                          }}
                          onMouseOut={(e) => {
                            if (uploadingId !== project.id) {
                              e.currentTarget.style.background = colors.bg
                            }
                          }}
                        >
                          {project.uploadedToCloud ? (
                            <>
                              <Save size={14} />
                              {uploadingId === project.id ? 'Saving...' : 'Save'}
                            </>
                          ) : (
                            <>
                              <Upload size={14} />
                              {uploadingId === project.id ? 'Uploading...' : 'Upload'}
                            </>
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDownloadZip(project, e)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          background: colors.bg,
                          color: colors.text,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.2s ease'
                        }}
                        title="Download as ZIP"
                        onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
                        onMouseOut={(e) => (e.currentTarget.style.background = colors.bg)}
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(project.id, e)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          border: `1px solid ${colors.errorBorder}`,
                          borderRadius: '6px',
                          background: colors.bg,
                          color: colors.error,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.2s ease'
                        }}
                        title="Delete"
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = colors.errorBg
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = colors.bg
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            padding: '16px 24px',
            borderTop: `1px solid ${colors.border}`
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: colors.text,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = colors.bgSecondary)}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedId) {
                const project = projects.find(p => p.id === selectedId)
                if (project) {
                  handleOpen(project)
                }
              }
            }}
            disabled={!selectedId}
            style={{
              padding: '10px 24px',
              background: selectedId ? colors.primary : colors.bgTertiary,
              border: 'none',
              borderRadius: '8px',
              cursor: selectedId ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 500,
              color: 'white',
              opacity: selectedId ? 1 : 0.5,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              if (selectedId) {
                e.currentTarget.style.background = colors.primaryHover
              }
            }}
            onMouseOut={(e) => {
              if (selectedId) {
                e.currentTarget.style.background = colors.primary
              }
            }}
          >
            Open
          </button>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialogComponent />
    </div>
  )
}
