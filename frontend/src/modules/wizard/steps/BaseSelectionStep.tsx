import { useState, useEffect, useCallback } from 'react'
import { FileText, Package, AlertCircle } from 'lucide-react'
import { WizardState } from '../../types/wizard'
import { registryApi } from '../../services/registryApi'

interface Props {
  wizardState: WizardState
  onUpdate: (state: WizardState | ((prev: WizardState) => WizardState)) => void
  onNext: () => void
  onBack: () => void
}

interface PackageFile {
  packageName: string
  packageVersion: string
  path: string
  name: string
  description?: string
}

export default function BaseSelectionStep({ wizardState, onUpdate, onNext, onBack }: Props) {
  const [packageFiles, setPackageFiles] = useState<Map<string, PackageFile[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(wizardState.basePrompt)

  // Load .prmd files from all selected packages
  useEffect(() => {
    loadPackageFiles()
  }, [wizardState.selectedPackages])

  const loadPackageFiles = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const filesMap = new Map<string, PackageFile[]>()

      // Fetch package info for each selected package
      for (const pkgRef of wizardState.selectedPackages) {
        // Parse package name and version from "@namespace/name@version"
        const match = pkgRef.name.match(/^(@?[^@]+)@(.+)$/)
        if (!match) continue

        const [, packageName, version] = match

        try {
          const pkgInfo = await registryApi.getPackageInfo(packageName)
          if (!pkgInfo) continue

          const files: PackageFile[] = []

          // Use actual files from package
          if (pkgInfo.files && pkgInfo.files.length > 0) {
            pkgInfo.files.forEach(fileName => {
              // Only include .prmd files
              if (fileName.endsWith('.prmd')) {
                files.push({
                  packageName,
                  packageVersion: version,
                  path: fileName,
                  name: fileName,
                  description: pkgInfo.description
                })
              }
            })
          }

          // Fallback: If no .prmd files found in files array, create default
          if (files.length === 0) {
            files.push({
              packageName,
              packageVersion: version,
              path: 'index.prmd',
              name: 'index.prmd',
              description: pkgInfo.description
            })
          }

          filesMap.set(pkgRef.name, files)
        } catch (err) {
          console.error(`Failed to load files for ${packageName}:`, err)
        }
      }

      setPackageFiles(filesMap)
    } catch (err: any) {
      console.error('Failed to load package files:', err)
      setError(err.message || 'Failed to load package files')
    } finally {
      setLoading(false)
    }
  }, [wizardState.selectedPackages])

  const selectFile = (value: string) => {
    setSelectedFile(value)

    onUpdate(prev => ({
      ...prev,
      basePrompt: value,
      basePromptContent: null // Will be loaded in next step
    }))
  }

  const canProceed = selectedFile !== null && selectedFile !== ''

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', color: 'var(--text)' }}>
        Select Base Template
      </h2>
      <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)' }}>
        Choose a .prmd file from your selected packages to use as the base template. You'll customize it in the next step.
      </p>

      {/* Selected base template */}
      {selectedFile && (
        <div style={{
          marginBottom: '24px',
          padding: '12px 16px',
          background: 'var(--success-bg)',
          border: '2px solid var(--success)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <FileText size={20} style={{ color: 'var(--success)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              Selected Base Template
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '2px' }}>
              {selectedFile}
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--border)',
            borderTop: '3px solid var(--accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          Loading package files...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{
          padding: '16px',
          background: 'var(--error)',
          color: 'white',
          borderRadius: '8px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <AlertCircle size={20} />
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Template file dropdown */}
      {!loading && !error && packageFiles.size > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text)',
            marginBottom: '8px'
          }}>
            Choose Base Template File
          </label>
          <select
            value={selectedFile || ''}
            onChange={(e) => selectFile(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--panel-2)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
          >
            <option value="">-- Select a template file --</option>
            {Array.from(packageFiles.entries()).map(([pkgRef, files]) => (
              <optgroup key={pkgRef} label={pkgRef}>
                {files.map(file => {
                  const value = `"${file.packageName}@${file.packageVersion}/${file.path}"`
                  return (
                    <option key={file.path} value={value}>
                      {file.name}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginTop: '6px'
          }}>
            Files are grouped by package. Select one to use as your base template.
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && packageFiles.size === 0 && (
        <div style={{
          padding: '48px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          background: 'var(--panel-2)',
          borderRadius: '8px',
          border: '1px dashed var(--border)',
          marginBottom: '24px'
        }}>
          <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>No .prmd files found in selected packages</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>
            Go back and select different packages
          </p>
        </div>
      )}

      {/* Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        marginTop: '24px',
        paddingTop: '24px',
        borderTop: '1px solid var(--border)'
      }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 24px',
            fontSize: '14px',
            fontWeight: 500,
            background: 'transparent',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          ← Back to Packages
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          style={{
            padding: '10px 24px',
            fontSize: '14px',
            fontWeight: 500,
            background: canProceed ? 'var(--accent)' : 'var(--panel-2)',
            color: canProceed ? 'white' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '6px',
            cursor: canProceed ? 'pointer' : 'not-allowed',
            opacity: canProceed ? 1 : 0.5
          }}
        >
          Next: Customize Sections →
        </button>
      </div>
    </div>
  )
}
