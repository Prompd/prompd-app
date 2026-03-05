import { useState, useEffect, useCallback } from 'react'
import { Package, Workflow, Sparkles, FolderOpen } from 'lucide-react'
import { defaultPrompd, defaultWorkflow } from './NewFileDialog'

type ProjectType = 'package' | 'skill' | 'workflow'

const PROJECT_TYPES: Array<{
  key: ProjectType
  label: string
  description: string
  icon: React.ReactNode
  color: string
}> = [
  {
    key: 'package',
    label: 'Package',
    description: 'Standard prompt package',
    icon: <Package size={22} color="#3b82f6" />,
    color: '#3b82f6',
  },
  {
    key: 'skill',
    label: 'Skill',
    description: 'AI agent skill with tools',
    icon: <Sparkles size={22} color="#8b5cf6" />,
    color: '#8b5cf6',
  },
  {
    key: 'workflow',
    label: 'Workflow',
    description: 'Visual workflow project',
    icon: <Workflow size={22} color="#10b981" />,
    color: '#10b981',
  },
]

interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onProjectCreated: (projectPath: string) => void
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function generatePrompdJson(
  projectType: ProjectType,
  name: string,
  description: string
): string {
  const base: Record<string, unknown> = {
    name,
    version: '1.0.0',
    type: projectType,
    description: description || '',
  }

  if (projectType === 'package') {
    base.main = 'prompts/main.prmd'
  } else if (projectType === 'skill') {
    base.main = 'prompts/main.prmd'
    base.tools = []
  } else if (projectType === 'workflow') {
    base.main = 'main.pdflow'
  }

  return JSON.stringify(base, null, 2) + '\n'
}

function generateReadme(name: string, projectType: ProjectType, description: string): string {
  const title = name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  return `# ${title}\n\n${description || `A Prompd ${projectType} project.`}\n`
}

export function NewProjectModal({ isOpen, onClose, onProjectCreated }: NewProjectModalProps) {
  const [projectType, setProjectType] = useState<ProjectType>('package')
  const [projectName, setProjectName] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setProjectType('package')
      setProjectName('')
      setDescription('')
      setError('')
      setCreating(false)
      // Default to home directory
      window.electronAPI?.getHomePath?.().then((home) => {
        if (home) setLocation(home)
      })
    }
  }, [isOpen])

  const slug = slugify(projectName)
  const isValid = slug.length > 0 && location.length > 0

  const handleBrowse = useCallback(async () => {
    const dir = await window.electronAPI?.selectDirectory?.('Select project location')
    if (dir) {
      setLocation(dir)
      // Re-focus the window after native dialog
      window.electronAPI?.focusWindow?.()
    }
  }, [])

  const handleCreate = useCallback(async () => {
    if (!isValid || creating) return
    setCreating(true)
    setError('')

    const electronAPI = window.electronAPI
    if (!electronAPI) {
      setError('Electron API not available')
      setCreating(false)
      return
    }

    const projectDir = `${location}/${slug}`

    try {
      // Create project root
      let result = await electronAPI.createDir(projectDir)
      if (!result.success) {
        setError(result.error || 'Failed to create project directory')
        setCreating(false)
        return
      }

      // Create subdirectories and files based on type
      if (projectType === 'package') {
        await electronAPI.createDir(`${projectDir}/prompts`)
        await electronAPI.writeFile(
          `${projectDir}/prompts/main.prmd`,
          defaultPrompd('main.prmd')
        )
      } else if (projectType === 'skill') {
        await electronAPI.createDir(`${projectDir}/prompts`)
        await electronAPI.createDir(`${projectDir}/contexts`)
        await electronAPI.createDir(`${projectDir}/tools`)
        await electronAPI.writeFile(
          `${projectDir}/prompts/main.prmd`,
          defaultPrompd('main.prmd')
        )
        await electronAPI.writeFile(`${projectDir}/contexts/.gitkeep`, '')
        await electronAPI.writeFile(`${projectDir}/tools/.gitkeep`, '')
      } else if (projectType === 'workflow') {
        await electronAPI.createDir(`${projectDir}/prompts`)
        await electronAPI.writeFile(
          `${projectDir}/main.pdflow`,
          defaultWorkflow('main.pdflow')
        )
        await electronAPI.writeFile(
          `${projectDir}/prompts/step1.prmd`,
          defaultPrompd('step1.prmd')
        )
      }

      // prompd.json + README for all types
      await electronAPI.writeFile(
        `${projectDir}/prompd.json`,
        generatePrompdJson(projectType, slug, description)
      )
      await electronAPI.writeFile(
        `${projectDir}/README.md`,
        generateReadme(slug, projectType, description)
      )

      onProjectCreated(projectDir)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setCreating(false)
    }
  }, [isValid, creating, location, slug, projectType, description, onProjectCreated])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--accent)',
          borderRadius: 12,
          padding: '24px',
          minWidth: '400px',
          maxWidth: '480px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--foreground)' }}>
          New Project
        </h3>

        {/* Project type cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {PROJECT_TYPES.map(pt => (
            <button
              key={pt.key}
              onClick={() => setProjectType(pt.key)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 8px',
                background: projectType === pt.key
                  ? `color-mix(in srgb, ${pt.color} 15%, transparent)`
                  : 'var(--input-bg)',
                border: projectType === pt.key
                  ? `1.5px solid ${pt.color}`
                  : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'center',
                color: 'var(--foreground)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ flexShrink: 0 }}>{pt.icon}</div>
              <div>
                <div style={{ fontWeight: 500, fontSize: '13px' }}>{pt.label}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{pt.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Project name */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
          Project name
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => {
            setProjectName(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
            else if (e.key === 'Escape') onClose()
          }}
          placeholder="my-project"
          autoFocus
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '14px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--foreground)',
            marginBottom: '4px',
            boxSizing: 'border-box',
          }}
        />
        {projectName && slug !== projectName && (
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
            Directory: {slug}
          </div>
        )}
        {!projectName && <div style={{ height: '8px' }} />}

        {/* Location picker */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
          Location
        </label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '13px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleBrowse}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              cursor: 'pointer',
              fontSize: '13px',
              flexShrink: 0,
            }}
          >
            <FolderOpen size={14} />
            Browse
          </button>
        </div>

        {/* Description (optional) */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
          Description (optional)
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief description of the project"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '13px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--foreground)',
            marginBottom: '16px',
            boxSizing: 'border-box',
          }}
        />

        {/* Error message */}
        {error && (
          <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!isValid || creating}
            style={{
              padding: '8px 16px',
              background: isValid && !creating ? 'var(--accent)' : 'var(--input-bg)',
              border: 'none',
              borderRadius: '6px',
              color: isValid && !creating ? 'white' : 'var(--muted)',
              cursor: isValid && !creating ? 'pointer' : 'default',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
