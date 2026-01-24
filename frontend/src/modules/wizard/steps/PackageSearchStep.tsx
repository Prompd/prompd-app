import { useState, useEffect, useRef, useCallback } from 'react'
import type { WizardState } from '../../types/wizard'
import { registryApi, type RegistryPackage } from '../../services/registryApi'
import { packageCache } from '../../services/packageCache'
import { Search, Package, CheckCircle, AlertCircle, X, ArrowRight, FileText, Folder } from 'lucide-react'
import './package-search.css'

interface Props {
  wizardState: WizardState
  onUpdate: (updater: (state: WizardState) => WizardState) => void
  theme?: 'light' | 'dark'
  onNext: () => void
}

export default function PackageSearchStep({ wizardState, onUpdate, theme = 'dark', onNext }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [packages, setPackages] = useState<RegistryPackage[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Search packages with debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setPackages([])
      setShowDropdown(false)
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await registryApi.searchPackages(searchQuery)
        setPackages(results.packages || [])
        setShowDropdown((results.packages || []).length > 0)
      } catch (err) {
        console.error('[PackageSearchStep] Search failed:', err)
        setPackages([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Helper function to generate a smart abbreviation from package name
  const generatePackageAlias = (packageName: string): string => {
    // Extract the package name part (after the namespace)
    // e.g., @prompd.io/core-patterns -> core-patterns
    const parts = packageName.split('/')
    const pkgName = parts.length > 1 ? parts[parts.length - 1] : packageName

    // Split by common separators
    const words = pkgName.split(/[-_.]/).filter(w => w.length > 0)

    if (words.length === 0) return '@pkg'

    // Common filler words to skip when choosing the main word
    const fillerWords = new Set(['public', 'private', 'common', 'shared', 'util', 'utils', 'helper', 'helpers', 'lib', 'package'])

    // For single word, just use it
    if (words.length === 1) {
      return `@${words[0].toLowerCase()}`
    }

    // For multiple words, find the most meaningful word
    // Skip common filler words and prefer the second word if first is a filler
    let primaryWord = words[0].toLowerCase()

    if (fillerWords.has(primaryWord) && words.length > 1) {
      // Use the second word instead
      primaryWord = words[1].toLowerCase()
    }

    // If we found a good primary word (4+ chars), use it
    if (primaryWord.length >= 4 && !fillerWords.has(primaryWord)) {
      return `@${primaryWord}`
    }

    // For compound names, try to find the most descriptive word
    const descriptiveWord = words.find(w =>
      w.length >= 4 && !fillerWords.has(w.toLowerCase())
    )

    if (descriptiveWord) {
      return `@${descriptiveWord.toLowerCase()}`
    }

    // If still nothing good, create acronym from first 2-3 non-filler words
    const meaningfulWords = words.filter(w => !fillerWords.has(w.toLowerCase()))
    if (meaningfulWords.length > 0) {
      const acronym = meaningfulWords.slice(0, Math.min(3, meaningfulWords.length))
        .map(w => w.charAt(0))
        .join('')
        .toLowerCase()
      return `@${acronym}`
    }

    // Last resort: use first word
    return `@${words[0].toLowerCase()}`
  }

  const selectPackage = useCallback(async (pkg: RegistryPackage) => {
    // pkg.name already includes the full scoped name like @prompd.io/core-patterns
    const fullName = `${pkg.name}@${pkg.version}`
    const isSelected = wizardState.selectedPackages.some(p => p.name === fullName)

    // Generate a smart abbreviation from the package name
    const prefix = generatePackageAlias(pkg.name)

    if (isSelected) {
      onUpdate(prev => ({
        ...prev,
        selectedPackages: prev.selectedPackages.filter(p => p.name !== fullName)
      }))
    } else {
      // Download and cache the package so we can read its files
      try {
        console.log('[PackageSearchStep] Downloading package for file tree:', fullName)
        await packageCache.downloadAndCache(pkg.name, pkg.version)
        console.log('[PackageSearchStep] Package cached successfully:', fullName)
      } catch (error) {
        console.error('[PackageSearchStep] Failed to download package:', error)
      }

      onUpdate(prev => ({
        ...prev,
        selectedPackages: [
          ...prev.selectedPackages,
          {
            name: fullName,
            prefix: prefix,
            validated: false
          }
        ]
      }))
    }
    setSearchQuery('')
    setShowDropdown(false)
  }, [wizardState.selectedPackages, onUpdate])

  const updatePackagePrefix = useCallback((packageName: string, newPrefix: string) => {
    onUpdate(prev => ({
      ...prev,
      selectedPackages: prev.selectedPackages.map(pkg =>
        pkg.name === packageName ? { ...pkg, prefix: newPrefix } : pkg
      )
    }))
  }, [onUpdate])

  const removePackage = useCallback((packageName: string) => {
    onUpdate(prev => ({
      ...prev,
      selectedPackages: prev.selectedPackages.filter(p => p.name !== packageName)
    }))
  }, [onUpdate])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const templateButtonRef = useRef<HTMLButtonElement>(null)
  const templateDropdownRef = useRef<HTMLDivElement>(null)

  const canProceed = wizardState.name.trim() !== '' &&
    wizardState.selectedPackages.every(pkg => pkg.prefix && pkg.prefix.trim() !== '')

  // Get base template options from selected packages by reading the actual package files
  const [baseTemplateOptions, setBaseTemplateOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    const loadPackageFiles = async () => {
      const options: { value: string; label: string }[] = []

      for (const pkg of wizardState.selectedPackages) {
        try {
          // Get the package from cache to read its actual files
          const packageId = pkg.name // e.g., "@prompd/blog-writer@0.1.5"
          const cached = await packageCache.getCachedPackage(packageId)

          if (cached?.fileTree) {
            // Helper function to recursively extract .prmd files from the file tree
            const extractPrmdFiles = (nodes: Array<{ name: string; path: string; kind: 'file' | 'folder'; children?: any[] }>): string[] => {
              const files: string[] = []
              for (const node of nodes) {
                if (node.kind === 'file' && node.path.endsWith('.prmd')) {
                  files.push(node.path)
                } else if (node.kind === 'folder' && node.children) {
                  files.push(...extractPrmdFiles(node.children))
                }
              }
              return files
            }

            const prmdFiles = extractPrmdFiles(cached.fileTree)
            prmdFiles.forEach(filePath => {
              const fileName = filePath.split('/').pop() || filePath
              options.push({
                value: `"${pkg.name}/${filePath}"`,
                label: `📄 ${fileName}  📁 ${filePath}`
              })
            })
          }
        } catch (error) {
          console.error(`[PackageSearchStep] Failed to load files for ${pkg.name}:`, error)
        }
      }

      setBaseTemplateOptions(options)
    }

    if (wizardState.selectedPackages.length > 0) {
      loadPackageFiles()
    } else {
      setBaseTemplateOptions([])
    }
  }, [wizardState.selectedPackages])

  // Close template dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        templateDropdownRef.current &&
        !templateDropdownRef.current.contains(e.target as Node) &&
        templateButtonRef.current &&
        !templateButtonRef.current.contains(e.target as Node)
      ) {
        setShowTemplateDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="package-search" data-theme={theme}>
      {/* Search Section */}
      <div className="package-search-header">
        <div className="package-search-title">
          <Search size={20} />
          <h2>Search Registry</h2>
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
        </div>
        <p className="package-search-subtitle">
          Find and add packages from the Prompd registry
        </p>

        {/* Search Input */}
        <div className="search-container">
          <div className="search-icon">
            <Search size={16} className={loading ? 'animate-spin' : ''} />
          </div>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={(e) => {
              if (packages.length > 0 && searchQuery.length >= 2) {
                setShowDropdown(true)
              }
            }}
            placeholder={loading ? 'Searching registry...' : 'Search packages (min 2 characters)...'}
          />

          {/* Dropdown */}
          {showDropdown && packages.length > 0 && (
            <div ref={dropdownRef} className="search-dropdown">
              {packages.map(pkg => {
                // pkg.name already includes the full scoped name
                const fullName = `${pkg.name}@${pkg.version}`
                const isSelected = wizardState.selectedPackages.some(p => p.name === fullName)
                return (
                  <div
                    key={fullName}
                    className={`search-result ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectPackage(pkg)}
                  >
                    <div className="search-result-icon">
                      <Package size={18} />
                    </div>
                    <div className="search-result-content">
                      <div className="search-result-name">
                        {pkg.name}
                      </div>
                      {pkg.description && (
                        <div className="search-result-description">{pkg.description}</div>
                      )}
                    </div>
                    {isSelected && (
                      <CheckCircle size={18} className="search-result-check" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Base Template Selection - Always visible, above selected packages */}
      {baseTemplateOptions.length > 0 && (
        <div className="base-template">
          <div className="base-template-header">
            <h3 className="base-template-title">Base Template (Optional)</h3>
            <p className="base-template-subtitle">
              Select a base template to inherit from
            </p>
          </div>

          {/* Custom dropdown button */}
          <div className="template-dropdown-container">
            <button
              ref={templateButtonRef}
              type="button"
              className="template-dropdown-button"
              onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
            >
              <span className="template-dropdown-text">
                {wizardState.basePrompt
                  ? baseTemplateOptions.find(opt => opt.value === wizardState.basePrompt)?.label || 'None - Start from scratch'
                  : 'None - Start from scratch'}
              </span>
              <svg
                className={`template-dropdown-arrow ${showTemplateDropdown ? 'open' : ''}`}
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Custom dropdown menu */}
            {showTemplateDropdown && (
              <div ref={templateDropdownRef} className="template-dropdown-menu">
                <div
                  className={`template-dropdown-option ${!wizardState.basePrompt ? 'selected' : ''}`}
                  onClick={() => {
                    onUpdate(prev => ({ ...prev, basePrompt: null }))
                    setShowTemplateDropdown(false)
                  }}
                >
                  <span>None - Start from scratch</span>
                  {!wizardState.basePrompt && <CheckCircle size={16} className="template-dropdown-check" />}
                </div>
                {baseTemplateOptions.map(opt => (
                  <div
                    key={opt.value}
                    className={`template-dropdown-option ${wizardState.basePrompt === opt.value ? 'selected' : ''}`}
                    onClick={() => {
                      console.log('[PackageSearchStep] Selecting base template:', opt.value)
                      onUpdate(prev => {
                        const updated = { ...prev, basePrompt: opt.value }
                        console.log('[PackageSearchStep] Updated wizard state:', updated)
                        return updated
                      })
                      setShowTemplateDropdown(false)
                    }}
                  >
                    <span>{opt.label}</span>
                    {wizardState.basePrompt === opt.value && <CheckCircle size={16} className="template-dropdown-check" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Packages - Moved below base template */}
      {wizardState.selectedPackages.length > 0 && (
        <div className="selected-packages">
          <h3 className="selected-packages-title">Selected Packages ({wizardState.selectedPackages.length})</h3>
          <div className="package-grid">
            {wizardState.selectedPackages.map(pkg => {
              const hasPrefix = pkg.prefix && pkg.prefix.trim() !== ''
              // Extract package name and version from fullName like "@prompd/public-examples@1.0.0"
              // We need to find the last @ which separates version from the scoped package name
              const lastAtIndex = pkg.name.lastIndexOf('@')
              const packageName = lastAtIndex > 0 ? pkg.name.substring(0, lastAtIndex) : pkg.name
              const version = lastAtIndex > 0 ? pkg.name.substring(lastAtIndex + 1) : ''

              return (
                <div key={pkg.name} className="package-card">
                  <div className="package-card-header">
                    <div className={`package-card-icon ${hasPrefix ? 'valid' : 'invalid'}`}>
                      {hasPrefix ? (
                        <CheckCircle size={20} />
                      ) : (
                        <AlertCircle size={20} />
                      )}
                    </div>
                    <div className="package-card-title">
                      <div className="package-card-name">{packageName}</div>
                      <div className="package-card-version">v{version}</div>
                    </div>
                    <button
                      className="package-card-remove"
                      onClick={() => removePackage(pkg.name)}
                      title="Remove package"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="package-card-body">
                    <label className="form-label">
                      Package Alias <span style={{ color: 'var(--accent)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={pkg.prefix || ''}
                      onChange={(e) => updatePackagePrefix(pkg.name, e.target.value)}
                      placeholder="e.g., @core or @pkg"
                    />
                    {!hasPrefix && (
                      <div className="package-card-error">
                        <AlertCircle size={14} />
                        <span>Alias is required</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="package-search-footer">
        <button
          className="btn btn-primary package-search-next"
          onClick={onNext}
          disabled={!canProceed}
          data-hint-target="wizard-next-button"
        >
          Next: Customize Prompt
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
