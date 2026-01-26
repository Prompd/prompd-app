/**
 * Hook for searching and selecting prompt sources (local files or registry packages)
 * Handles both local .prmd file search and registry package search
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '../../../../../stores/editorStore'
import { registryApi } from '../../../../services/registryApi'
import { searchLocalFiles } from '../services/fileSearchService'

export interface PackageResult {
  name: string
  version: string
  description?: string
}

export interface UseSourceSearchOptions {
  /** Called when search query changes */
  onSearchChange?: (query: string) => void
  /** Called when a local file is selected */
  onLocalFileSelect?: (filePath: string) => void
  /** Called when a registry package is selected */
  onPackageSelect?: (packageName: string, version: string, file?: string) => void
  /** Initial search query */
  initialQuery?: string
}

export interface UseSourceSearchResult {
  /** Current search query */
  searchQuery: string
  /** Registry search results */
  searchResults: PackageResult[]
  /** Local file search results */
  localFileResults: string[]
  /** Whether a search is in progress */
  isSearching: boolean
  /** Whether to show the dropdown */
  showDropdown: boolean
  /** Currently highlighted dropdown index */
  highlightedIndex: number
  /** Dropdown position (for portal rendering) */
  dropdownPosition: { top: number; left: number; width: number } | null
  /** Input ref for measuring position */
  inputRef: React.RefObject<HTMLInputElement>
  /** Whether searching locally (query starts with ".") */
  isLocalSearch: boolean
  /** Selected package (for two-step package file selection) */
  selectedPackage: { name: string; version: string } | null
  /** Files in the selected package */
  packageFiles: string[]
  /** Whether package files are loading */
  loadingPackageFiles: boolean
  /** Can search local files (workspace available) */
  canSearchLocal: boolean
  /** Update search query and trigger search */
  handleSearchChange: (query: string) => void
  /** Select a local file */
  handleSelectLocalFile: (filePath: string) => void
  /** Select a registry package (step 1) */
  handleSelectPackage: (pkg: PackageResult) => void
  /** Select a file from the package (step 2) */
  handleSelectPackageFile: (fileName: string) => void
  /** Set highlighted index */
  setHighlightedIndex: (index: number) => void
  /** Set dropdown visibility */
  setShowDropdown: (show: boolean) => void
  /** Clear search state */
  clearSearch: () => void
}

/**
 * Hook for source search (local files + registry packages)
 * Provides all state and handlers needed for the source search UI
 */
export function useSourceSearch(options: UseSourceSearchOptions = {}): UseSourceSearchResult {
  const {
    onSearchChange,
    onLocalFileSelect,
    onPackageSelect,
    initialQuery = ''
  } = options

  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [searchResults, setSearchResults] = useState<PackageResult[]>([])
  const [localFileResults, setLocalFileResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // For package file selection (step 2)
  const [selectedPackage, setSelectedPackage] = useState<{ name: string; version: string } | null>(null)
  const [packageFiles, setPackageFiles] = useState<string[]>([])
  const [loadingPackageFiles, setLoadingPackageFiles] = useState(false)

  // Workspace access
  const workspaceHandle = useEditorStore(state => state.explorerDirHandle)
  const workspacePath = useEditorStore(state => state.explorerDirPath)

  // Determine if searching locally (starts with ".")
  const isLocalSearch = searchQuery.trim().startsWith('.')

  // Check if we can search local files
  const canSearchLocal = !!(workspaceHandle || (workspacePath && (window as Window & { electronAPI?: { readDir: (path: string) => Promise<unknown> } }).electronAPI?.readDir))

  // Update dropdown position when shown
  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      })
    }
  }, [showDropdown])

  // Debounced search handler
  const handleSearchChange = useCallback(async (query: string) => {
    setSearchQuery(query)
    onSearchChange?.(query)

    if (query.trim().length === 0) {
      setSearchResults([])
      setLocalFileResults([])
      setShowDropdown(false)
      return
    }

    const isLocal = query.trim().startsWith('.')

    // For package search require 2+ chars, for local search just need "."
    if (!isLocal && query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      console.log('[useSourceSearch] Search:', {
        query,
        isLocal,
        canSearchLocal,
        workspaceHandle: !!workspaceHandle,
        workspacePath,
        electronAPI: !!(window as Window & { electronAPI?: { readDir: (path: string) => Promise<unknown> } }).electronAPI?.readDir
      })

      if (isLocal) {
        if (canSearchLocal) {
          // Search local .prmd files
          const files = await searchLocalFiles(workspaceHandle, workspacePath, query)
          console.log('[useSourceSearch] Found files:', files)
          setLocalFileResults(files)
          setSearchResults([])
          setShowDropdown(true) // Always show dropdown for local search to show feedback
        } else {
          // No workspace available - show message
          console.log('[useSourceSearch] No workspace available')
          setLocalFileResults([])
          setSearchResults([])
          setShowDropdown(true) // Show dropdown with "no workspace" message
        }
      } else {
        // Search registry packages
        const result = await registryApi.searchPackages(query, 10)
        const packages = result.packages.map((pkg: { name: string; version: string; description?: string }) => ({
          name: pkg.name,
          version: pkg.version,
          description: pkg.description
        }))
        setSearchResults(packages)
        setLocalFileResults([])
        setShowDropdown(true)
      }
      setHighlightedIndex(0)
    } catch (err) {
      console.error('[useSourceSearch] Search failed:', err)
      setSearchResults([])
      setLocalFileResults([])
    } finally {
      setIsSearching(false)
    }
  }, [canSearchLocal, workspaceHandle, workspacePath, onSearchChange])

  const handleSelectLocalFile = useCallback((filePath: string) => {
    onLocalFileSelect?.(filePath)
    setSearchQuery('')
    setShowDropdown(false)
    setLocalFileResults([])
  }, [onLocalFileSelect])

  const handleSelectPackage = useCallback(async (pkg: PackageResult) => {
    setSelectedPackage(pkg)
    setSearchQuery('')
    setShowDropdown(false)
    setSearchResults([])

    // Load package files
    setLoadingPackageFiles(true)
    try {
      const files = await registryApi.getPackageFiles(pkg.name, pkg.version)
      // Filter to only .prmd files
      const prmdFiles = files.filter((f: string) => f.endsWith('.prmd'))
      setPackageFiles(prmdFiles)

      // If only one .prmd file, auto-select it
      if (prmdFiles.length === 1) {
        onPackageSelect?.(pkg.name, pkg.version, prmdFiles[0])
        setSelectedPackage(null)
        setPackageFiles([])
      }
    } catch (err) {
      console.error('[useSourceSearch] Failed to load package files:', err)
      // Fallback: set package without specific file
      onPackageSelect?.(pkg.name, pkg.version)
      setSelectedPackage(null)
    } finally {
      setLoadingPackageFiles(false)
    }
  }, [onPackageSelect])

  const handleSelectPackageFile = useCallback((fileName: string) => {
    if (selectedPackage) {
      onPackageSelect?.(selectedPackage.name, selectedPackage.version, fileName)
      setSelectedPackage(null)
      setPackageFiles([])
    }
  }, [selectedPackage, onPackageSelect])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setLocalFileResults([])
    setShowDropdown(false)
    setHighlightedIndex(0)
    setSelectedPackage(null)
    setPackageFiles([])
  }, [])

  return {
    searchQuery,
    searchResults,
    localFileResults,
    isSearching,
    showDropdown,
    highlightedIndex,
    dropdownPosition,
    inputRef,
    isLocalSearch,
    selectedPackage,
    packageFiles,
    loadingPackageFiles,
    canSearchLocal,
    handleSearchChange,
    handleSelectLocalFile,
    handleSelectPackage,
    handleSelectPackageFile,
    setHighlightedIndex,
    setShowDropdown,
    clearSearch,
  }
}
