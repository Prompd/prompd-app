import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Edit3, Eye, EyeOff, Check, X, FileText, Sparkles, Save, Package, Link, Settings, FolderOpen, Search, Type, Hash, ToggleLeft, Brackets, Braces, AlertCircle, CheckCircle, AlertTriangle, Trash2, Tag, Code, Map as MapIcon } from 'lucide-react'
import { parsePrompd } from '../lib/prompdParser'
import XmlDesignView, { type XmlDesignViewHandle } from '../components/XmlDesignView'
import { ContentMinimap, type MinimapSection } from '../components/ContentMinimap'
import { useConfirmDialog } from '../components/ConfirmDialog'
import VersionInput from '../components/VersionInput'
import { TagInput } from '../components/TagInput'
import { ParamValue } from '../types'
import { WizardState, PackageReference } from '../types/wizard'
import InheritsManager from '../components/InheritsManager'
import { PrompdContextArea } from '@prompd/react'
import { registryApi, type RegistryPackage } from '../services/registryApi'
import JSZip from 'jszip'
import ContentSections from '../components/ContentSections'

// Type definitions for PrompdContextArea (from @prompd/react)
interface PrompdFileSection {
  name: string
  label: string
  files: string[]
  allowMultiple: boolean
  accept?: string
  description?: string
}

type PrompdFileSections = Map<string, string[]>

interface Props {
  value: string
  onChange: (text: string) => void
  wizardState?: WizardState | null
  currentFilePath?: string
  onOpenFile?: (opts: {
    name: string
    handle?: any
    text: string
    readOnly?: boolean
    electronPath?: string
    packageSource?: {
      packageId: string
      filePath: string
    }
  }) => void
  workspaceHandle?: FileSystemDirectoryHandle | null
  theme?: 'light' | 'dark'
  onOpenPackageFile?: (content: string, filename: string, packageId: string, filePath: string) => void
  onSelectFileFromBrowser?: (sectionName: string) => Promise<string | null>
  readOnly?: boolean
}

interface Section {
  id: string
  title: string
  level: number
  content: string
  overridden: boolean
  isLocal?: boolean  // true if section is defined in the local markdown body (not inherited)
}

interface ParameterSchema {
  type: string
  required?: boolean
  description?: string
  default?: any
  enum?: string[]
  min?: number
  max?: number
  pattern?: string
}

// Valid parameter types from FORMAT.md
const VALID_PARAM_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'file'] as const

// Helper functions for parameter type styling
const getTypeIcon = (type: string) => {
  switch (type) {
    case 'string': return Type
    case 'number': return Hash
    case 'boolean': return ToggleLeft
    case 'array': return Brackets
    case 'object': return Braces
    default: return Type
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case 'string': return { bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)', text: '#6b7280' }
    case 'number': return { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' }
    case 'boolean': return { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' }
    case 'array': return { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' }
    case 'object': return { bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.3)', text: '#f97316' }
    default: return { bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)', text: '#6b7280' }
  }
}

export default function DesignView({ value, onChange, wizardState, currentFilePath, onOpenFile, workspaceHandle, theme, onOpenPackageFile, onSelectFileFromBrowser, readOnly = false }: Props) {
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showParametersModal, setShowParametersModal] = useState(false)
  const [uploadedParamsJson, setUploadedParamsJson] = useState<string | null>(null)
  const [uploadedParams, setUploadedParams] = useState<Record<string, any> | null>(null)
  const [editableParams, setEditableParams] = useState<Record<string, ParameterSchema>>({})
  const [paramsWereModified, setParamsWereModified] = useState(false) // Track if user explicitly modified params
  const [isAddingParameter, setIsAddingParameter] = useState(false)
  const [newParamName, setNewParamName] = useState('')
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set())
  const [metadataCollapsed, setMetadataCollapsed] = useState(true)
  const [contentFullscreen, setContentFullscreen] = useState(false)

  // Specialty sections visibility state
  const [visibleSpecialtySections, setVisibleSpecialtySections] = useState<Set<string>>(() => {
    // Default sections: context, task, output
    // Also include any sections that already have files
    const defaultSections = new Set(['context', 'task', 'output'])
    const parsed = parsePrompd(value)

    // Add sections that have files
    if (parsed.frontmatter.system) defaultSections.add('system')
    if (parsed.frontmatter.user) defaultSections.add('user')
    if (parsed.frontmatter.response) defaultSections.add('response')

    return defaultSections
  })
  const [showAddSectionMenu, setShowAddSectionMenu] = useState(false)

  // Inherits field state
  const [inheritsEditMode, setInheritsEditMode] = useState(false)
  const [inheritsSearchQuery, setInheritsSearchQuery] = useState('')
  const [inheritsPackages, setInheritsPackages] = useState<RegistryPackage[]>([])
  const [inheritsLoading, setInheritsLoading] = useState(false)
  const [inheritsShowDropdown, setInheritsShowDropdown] = useState(false)
  const [inheritsHighlightedIndex, setInheritsHighlightedIndex] = useState(0)
  const [inheritsPackageFiles, setInheritsPackageFiles] = useState<string[]>([])
  const [inheritsFetchingFiles, setInheritsFetchingFiles] = useState(false)
  const [inheritsShowFileDropdown, setInheritsShowFileDropdown] = useState(false)
  const [inheritsSelectedPackage, setInheritsSelectedPackage] = useState<{ name: string; version: string } | null>(null)
  const [inheritsPrefix, setInheritsPrefix] = useState('')
  const inheritsDropdownRef = useRef<HTMLDivElement>(null)
  const inheritsInputRef = useRef<HTMLInputElement>(null)

  // Inherited template sections (markdown headers from base template)
  const [inheritedSections, setInheritedSections] = useState<Section[]>([])

  // Inherited template parameters (from base template for warning about missing params)
  const [inheritedParams, setInheritedParams] = useState<Record<string, any>>({})

  // Hidden section content backup - stores content of hidden sections so we can restore them
  const [hiddenSectionBackup, setHiddenSectionBackup] = useState<Record<string, string>>({})

  // Error message state for displaying alerts in a modal instead of native alert()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Minimap state and refs
  const [showMinimap, setShowMinimap] = useState(true)
  const designViewContainerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const xmlDesignViewRef = useRef<XmlDesignViewHandle>(null)

  // Confirm dialog hook for delete confirmations
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog(theme)

  // Parse the current .prmd content (memoized to prevent infinite loops)
  const parsed = useMemo(() => parsePrompd(value), [value])

  // Check if this file has inheritance (needed to decide between hide vs delete)
  const hasInheritance = !!parsed.frontmatter.inherits

  // Detect content-type from frontmatter (default is markdown)
  const contentType = useMemo(() => {
    const rawType = parsed.frontmatter?.['content-type'] || parsed.frontmatter?.contentType
    return rawType === 'xml' ? 'xml' : 'md'
  }, [parsed.frontmatter])

  const isXmlContent = contentType === 'xml'

  // Handler for XML body changes - reconstructs the full document with new XML body
  const handleXmlBodyChange = useCallback((newXmlBody: string) => {
    // Reconstruct the full document: frontmatter + body
    // We need to preserve the original frontmatter exactly and only replace the body
    const frontmatterMatch = value.match(/^---\n([\s\S]*?)\n---\n?/)
    if (frontmatterMatch) {
      const frontmatterSection = frontmatterMatch[0]
      const newDocument = `${frontmatterSection}\n${newXmlBody}`.trim()
      onChange(newDocument)
    } else {
      // No frontmatter, just use the XML directly
      onChange(newXmlBody)
    }
  }, [value, onChange])

  // Extract context files from frontmatter (support both 'context' and 'contexts')
  const contextFiles: string[] = Array.isArray(parsed.frontmatter.context)
    ? parsed.frontmatter.context
    : Array.isArray(parsed.frontmatter.contexts)
    ? parsed.frontmatter.contexts
    : parsed.frontmatter.context
    ? [parsed.frontmatter.context]
    : parsed.frontmatter.contexts
    ? [parsed.frontmatter.contexts]
    : []

  // Derive metadata directly from parsed frontmatter (no separate state needed)
  // Use nullish coalescing (??) for name/id to allow empty strings during editing
  // Only apply defaults when values are undefined/null (not when empty string)
  const metadata = useMemo(() => ({
    id: parsed.frontmatter.id ?? 'my-prompt',
    name: parsed.frontmatter.name ?? 'My Prompt',
    version: parsed.frontmatter.version || '1.0.0',
    description: parsed.frontmatter.description ?? '',
    tags: Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : []
  }), [parsed.frontmatter.id, parsed.frontmatter.name, parsed.frontmatter.version, parsed.frontmatter.description, parsed.frontmatter.tags])

  // Section overrides from the parsed content
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, string | null>>({})
  const prevParsedOverridesRef = useRef<Record<string, string | null>>({})

  // Auto-merge inherited parameters into editable params when they load
  // Child-defined params take precedence; inherited params fill in the gaps with their defaults
  const prevInheritedParamsRef = useRef<string>('')
  const pendingInheritedMergeRef = useRef(false)
  useEffect(() => {
    if (Object.keys(inheritedParams).length === 0) return

    // Only run when inheritedParams actually change (not on every render)
    const inheritedKey = JSON.stringify(inheritedParams)
    if (prevInheritedParamsRef.current === inheritedKey) return
    prevInheritedParamsRef.current = inheritedKey

    const currentParamNames = Object.keys(editableParams)
    const paramsToAdd: Record<string, ParameterSchema> = {}

    for (const [name, schema] of Object.entries(inheritedParams)) {
      if (!currentParamNames.includes(name)) {
        paramsToAdd[name] = { ...schema }
      }
    }

    if (Object.keys(paramsToAdd).length > 0) {
      setEditableParams(prev => ({ ...prev, ...paramsToAdd }))
      setParamsWereModified(true)
      pendingInheritedMergeRef.current = true
    }
  }, [inheritedParams, editableParams])

  // Compute required inherited parameters that still need user input
  // (required + no default = user must provide a value)
  const requiredInheritedParams = useMemo(() => {
    if (Object.keys(inheritedParams).length === 0) return []

    const result: Array<{ name: string; schema: ParameterSchema }> = []
    for (const [name, schema] of Object.entries(inheritedParams)) {
      if (schema.required && schema.default === undefined) {
        // Check if the child has already provided a value (overridden with a default)
        const childSchema = editableParams[name]
        if (!childSchema || childSchema.default === undefined) {
          result.push({ name, schema })
        }
      }
    }
    return result
  }, [inheritedParams, editableParams])

  // Compute available sections for SectionAdder (exclude already overridden ones)
  const availableSections = useMemo(() => {
    const allSections = [
      ...(wizardState?.sections?.map(s => s.title) || []),
      ...inheritedSections.map(s => s.title)
    ]

    // Remove duplicates
    const uniqueSections = allSections.filter((title, index, arr) => arr.indexOf(title) === index)

    // Filter out sections that are already overridden or hidden
    return uniqueSections.filter(title => {
      const sectionId = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      return sectionOverrides[sectionId] === undefined
    })
  }, [wizardState?.sections, inheritedSections, sectionOverrides])

  // Extract sections from markdown body (simple h1/h2 parser)
  const extractSections = (markdown: string): Section[] => {
    const lines = markdown.split('\n')
    const sections: Section[] = []
    let currentSection: Section | null = null

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)/)
      const h2Match = line.match(/^##\s+(.+)/)

      if (h1Match || h2Match) {
        if (currentSection) {
          sections.push(currentSection)
        }
        const title = h1Match ? h1Match[1] : h2Match![1]
        const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        currentSection = {
          id,
          title,
          level: h1Match ? 1 : 2,
          content: '',
          overridden: false,
          isLocal: true  // Sections from markdown body are local
        }
      } else if (currentSection && line.trim()) {
        currentSection.content += (currentSection.content ? '\n' : '') + line
      }
    }

    if (currentSection) {
      sections.push(currentSection)
    }

    return sections
  }

  const sections = extractSections(parsed.body)

  // Combine markdown sections with overridden inherited sections
  const allDisplaySections = useMemo(() => {
    const sectionMap = new Map<string, Section>()

    // Add all markdown sections
    sections.forEach(section => {
      sectionMap.set(section.id, section)
    })

    // Add overridden sections that aren't in the markdown yet
    Object.keys(sectionOverrides).forEach(sectionId => {
      if (!sectionMap.has(sectionId)) {
        // Find the section in inherited sections
        const inheritedSection = inheritedSections.find(s => s.id === sectionId)
        if (inheritedSection) {
          sectionMap.set(sectionId, {
            ...inheritedSection,
            overridden: true
          })
        } else {
          // Create a placeholder section if we can't find it
          const title = sectionId.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ')
          sectionMap.set(sectionId, {
            id: sectionId,
            title: title,
            level: 1,
            content: '',
            overridden: true
          })
        }
      }
    })

    return Array.from(sectionMap.values())
  }, [sections, sectionOverrides, inheritedSections])

  // Track if we're currently updating parameters to avoid resetting editable state

  // Sync editable params from parsed schema when value changes
  // BUT only if user hasn't explicitly modified them
  useEffect(() => {
    // If user has explicitly modified params, don't overwrite their changes
    if (paramsWereModified) return

    // Only update if the params actually changed (deep comparison via JSON)
    const currentParams = JSON.stringify(editableParams)
    const newParams = JSON.stringify(parsed.paramsSchema)

    if (currentParams !== newParams) {
      setEditableParams(parsed.paramsSchema)
    }
  }, [parsed.paramsSchema, paramsWereModified])

  // Reset paramsWereModified when the file content changes substantially (e.g., tab switch)
  // We detect this by tracking the metadata.id which changes per file
  const prevMetadataIdRef = useRef(metadata.id)
  useEffect(() => {
    if (prevMetadataIdRef.current !== metadata.id) {
      prevMetadataIdRef.current = metadata.id
      setParamsWereModified(false)
      setEditableParams(parsed.paramsSchema)
    }
  }, [metadata.id, parsed.paramsSchema])

  // Initialize section overrides from parsed frontmatter
  // Only sync when the parsed YAML actually changes (prevents circular updates)
  useEffect(() => {
    const currentParsedOverrides = (parsed.frontmatter.override && typeof parsed.frontmatter.override === 'object')
      ? parsed.frontmatter.override
      : {}

    // Only update if the parsed YAML actually changed
    if (JSON.stringify(prevParsedOverridesRef.current) !== JSON.stringify(currentParsedOverrides)) {
      setSectionOverrides(currentParsedOverrides)
      prevParsedOverridesRef.current = currentParsedOverrides
    }
  }, [parsed.frontmatter.override])

  // Auto-regenerate YAML when sectionOverrides changes (from user actions)
  useEffect(() => {
    // Only regenerate if overrides differ from what was parsed
    // This prevents regenerating when we just loaded from YAML
    if (JSON.stringify(sectionOverrides) !== JSON.stringify(prevParsedOverridesRef.current)) {
      regeneratePrompd()
    }
  }, [sectionOverrides])

  const startEditing = (section: Section) => {
    if (readOnly) return // Prevent editing in read-only mode
    setEditingSection(section.id)
    // For local sections (defined in markdown body), always use section.content
    // For inherited sections, check if there's an override, otherwise use inherited content
    if (section.isLocal) {
      setEditContent(section.content)
    } else {
      setEditContent(sectionOverrides[section.id] ?? section.content)
    }
  }

  const saveSection = (sectionId: string) => {
    // Find the section to determine if it's local (from markdown body) or inherited
    const section = allDisplaySections.find(s => s.id === sectionId)

    if (section?.isLocal) {
      // This is a local section defined in the markdown body - edit it directly
      // Don't add to override: field
      const lines = value.split('\n')
      const firstDashIndex = lines.findIndex(l => l.trim() === '---')
      const secondDashIndex = lines.findIndex((l, i) => i > firstDashIndex && l.trim() === '---')

      if (secondDashIndex > 0) {
        const frontmatter = lines.slice(0, secondDashIndex + 1).join('\n')
        const bodyLines = lines.slice(secondDashIndex + 1)

        // Find the section header in the body and replace its content
        const headerPattern = new RegExp(`^(#{1,2})\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
        let sectionStartIndex = -1
        let sectionEndIndex = bodyLines.length // Default to end of file

        for (let i = 0; i < bodyLines.length; i++) {
          if (headerPattern.test(bodyLines[i])) {
            sectionStartIndex = i
          } else if (sectionStartIndex >= 0 && /^#{1,2}\s+/.test(bodyLines[i])) {
            // Found next section header
            sectionEndIndex = i
            break
          }
        }

        if (sectionStartIndex >= 0) {
          // Rebuild the body with updated section content
          const beforeSection = bodyLines.slice(0, sectionStartIndex)
          const sectionHeader = bodyLines[sectionStartIndex]
          const afterSection = bodyLines.slice(sectionEndIndex)

          const newBody = [
            ...beforeSection,
            sectionHeader,
            editContent,
            ...afterSection
          ].join('\n')

          onChange(`${frontmatter}\n${newBody}`)
        }
      }
    } else {
      // This is an inherited section - add to override: field
      setSectionOverrides(prev => ({
        ...prev,
        [sectionId]: editContent
      }))
    }

    setEditingSection(null)
  }

  const cancelEditing = () => {
    setEditingSection(null)
    setEditContent('')
  }

  // Direct body replacement for document mode - replaces everything after the frontmatter
  const handleBodyChange = useCallback((newBody: string) => {
    const lines = value.split('\n')
    const firstDashIndex = lines.findIndex(l => l.trim() === '---')
    const secondDashIndex = lines.findIndex((l, i) => i > firstDashIndex && l.trim() === '---')
    if (secondDashIndex > 0) {
      const frontmatter = lines.slice(0, secondDashIndex + 1).join('\n')
      onChange(`${frontmatter}\n${newBody}`)
    }
  }, [value, onChange])

  const toggleSectionVisibility = (sectionId: string) => {
    setSectionOverrides(prev => {
      const newOverrides = { ...prev }
      const currentValue = newOverrides[sectionId]

      // If currently hidden (value is null), restore it
      if (currentValue === null) {
        // Check if we have a backup of the content
        const backup = hiddenSectionBackup[sectionId]
        if (backup !== undefined) {
          // Restore from backup
          newOverrides[sectionId] = backup
          // Clear the backup
          setHiddenSectionBackup(prevBackup => {
            const newBackup = { ...prevBackup }
            delete newBackup[sectionId]
            return newBackup
          })
        } else {
          // No backup, just remove the null marker
          delete newOverrides[sectionId]
        }
      } else {
        // Hide the section
        // If there's override content, back it up first
        if (currentValue !== undefined) {
          setHiddenSectionBackup(prevBackup => ({
            ...prevBackup,
            [sectionId]: currentValue
          }))
        }
        // Mark as hidden
        newOverrides[sectionId] = null
      }
      return newOverrides
    })
  }

  const resetSection = (sectionId: string) => {
    setSectionOverrides(prev => {
      const newOverrides = { ...prev }
      delete newOverrides[sectionId]
      return newOverrides
    })
  }

  // Delete a section from the markdown body (only for local sections without inheritance)
  const deleteSection = async (sectionId: string, sectionTitle: string) => {
    const confirmed = await showConfirm({
      title: 'Delete Section',
      message: `Are you sure you want to delete the "${sectionTitle}" section? This action cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    })

    if (!confirmed) return

    // Find and remove the section from the markdown body
    const lines = parsed.body.split('\n')
    const newLines: string[] = []
    let skipUntilNextSection = false
    let currentSectionId = ''

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)/)
      const h2Match = line.match(/^##\s+(.+)/)

      if (h1Match || h2Match) {
        const title = h1Match ? h1Match[1] : h2Match![1]
        currentSectionId = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

        if (currentSectionId === sectionId) {
          // Start skipping lines for this section
          skipUntilNextSection = true
          continue
        } else {
          // Found a new section, stop skipping
          skipUntilNextSection = false
        }
      }

      if (!skipUntilNextSection) {
        newLines.push(line)
      }
    }

    // Rebuild the file with updated body
    const frontmatterLines = value.split('\n')
    const firstDashIndex = frontmatterLines.findIndex(l => l.trim() === '---')
    const secondDashIndex = frontmatterLines.findIndex((l, i) => i > firstDashIndex && l.trim() === '---')

    if (secondDashIndex > 0) {
      const frontmatter = frontmatterLines.slice(0, secondDashIndex + 1).join('\n')
      const newBody = newLines.join('\n').trim()
      onChange(`${frontmatter}\n\n${newBody}`)
    }

    // Also remove any override for this section if it exists
    setSectionOverrides(prev => {
      const newOverrides = { ...prev }
      delete newOverrides[sectionId]
      return newOverrides
    })
  }

  const reorderSections = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return

    const lines = value.split('\n')
    const firstDashIndex = lines.findIndex(l => l.trim() === '---')
    const secondDashIndex = lines.findIndex((l, i) => i > firstDashIndex && l.trim() === '---')

    if (secondDashIndex <= 0) return

    const frontmatter = lines.slice(0, secondDashIndex + 1).join('\n')
    const bodyLines = lines.slice(secondDashIndex + 1)

    // Find section boundaries in the body (each section = heading line through to next heading or EOF)
    const sectionBounds: Array<{ start: number; end: number }> = []
    for (let i = 0; i < bodyLines.length; i++) {
      if (/^#{1,2}\s+/.test(bodyLines[i])) {
        if (sectionBounds.length > 0) {
          sectionBounds[sectionBounds.length - 1].end = i
        }
        sectionBounds.push({ start: i, end: bodyLines.length })
      }
    }

    if (fromIndex >= sectionBounds.length || toIndex >= sectionBounds.length) return

    // Extract each section's lines (including any leading blank lines before content)
    const sectionChunks = sectionBounds.map(b => bodyLines.slice(b.start, b.end))

    // Also capture any lines before the first section (e.g. leading blank lines)
    const preamble = sectionBounds.length > 0 ? bodyLines.slice(0, sectionBounds[0].start) : bodyLines

    // Reorder
    const moved = sectionChunks.splice(fromIndex, 1)[0]
    sectionChunks.splice(toIndex, 0, moved)

    const newBody = [...preamble, ...sectionChunks.flat()].join('\n')
    onChange(`${frontmatter}\n${newBody}`)
  }

  const renameSection = (sectionId: string, oldTitle: string, newTitle: string) => {
    if (!newTitle.trim() || newTitle === oldTitle) return

    // Find and rename the heading in the markdown body
    const lines = value.split('\n')
    const firstDashIndex = lines.findIndex(l => l.trim() === '---')
    const secondDashIndex = lines.findIndex((l, i) => i > firstDashIndex && l.trim() === '---')

    if (secondDashIndex > 0) {
      const frontmatter = lines.slice(0, secondDashIndex + 1).join('\n')
      const bodyLines = lines.slice(secondDashIndex + 1)

      const headerPattern = new RegExp(`^(#{1,2})\\s+${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)

      const newBodyLines = bodyLines.map(line => {
        const match = line.match(headerPattern)
        if (match) {
          return `${match[1]} ${newTitle.trim()}`
        }
        return line
      })

      onChange(`${frontmatter}\n${newBodyLines.join('\n')}`)
    }
  }

  const addSection = (title: string, type: string, position?: number) => {
    const sectionId = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    // Check if this matches an inherited section (from wizard or from inherited template)
    const isInheritedSection =
      wizardState?.sections?.some(s => s.id === sectionId || s.title === title) ||
      inheritedSections.some(s => s.id === sectionId || s.title === title)

    if (isInheritedSection) {
      // This is an override - add to frontmatter override: section
      setSectionOverrides(prev => ({
        ...prev,
        [sectionId]: '' // Empty string means override with empty content (user will edit)
      }))

      // Auto-start editing the override
      setEditingSection(sectionId)
      setEditContent('')
    } else {
      // This is a new custom section - add to body at the correct position
      const newSectionMarkdown = `\n# ${title}\n\nAdd content here...\n`

      const lines = value.split('\n')
      const firstDashIndex = lines.findIndex(l => l.trim() === '---')
      const secondDashIndex = lines.findIndex((l, i) => i > firstDashIndex && l.trim() === '---')

      if (secondDashIndex > 0) {
        const frontmatter = lines.slice(0, secondDashIndex + 1).join('\n')
        const bodyLines = lines.slice(secondDashIndex + 1)

        // Find the line index of each section heading in the body
        const sectionLineIndices: number[] = []
        for (let i = 0; i < bodyLines.length; i++) {
          if (/^#{1,2}\s+/.test(bodyLines[i])) {
            sectionLineIndices.push(i)
          }
        }

        let insertAtLine: number
        if (position === undefined || position === null || sectionLineIndices.length === 0) {
          // No position or no sections - append at end
          insertAtLine = bodyLines.length
        } else if (position === 0) {
          // Insert before the first section (or at start of body if no sections)
          insertAtLine = sectionLineIndices.length > 0 ? sectionLineIndices[0] : 0
        } else if (position >= sectionLineIndices.length) {
          // Insert after the last section - append at end
          insertAtLine = bodyLines.length
        } else {
          // Insert before the section at `position` index
          insertAtLine = sectionLineIndices[position]
        }

        const before = bodyLines.slice(0, insertAtLine)
        const after = bodyLines.slice(insertAtLine)
        const newBody = [...before, newSectionMarkdown, ...after].join('\n')

        onChange(`${frontmatter}\n${newBody}`)
      }
    }
  }

  // Shared frontmatter generation function - single source of truth
  const generateFrontmatter = useCallback((metadataToUse: typeof metadata, inheritsValue: string) => {
    // Use editableParams if user modified params (even if empty), otherwise preserve original parameters
    const paramsToUse = paramsWereModified ? editableParams : parsed.paramsSchema

    // Include parameters section if:
    // 1. User explicitly modified params (paramsWereModified) and there are any params, OR
    // 2. Params have schema details (not just inferred params with minimal schema)
    const hasParametersWithSchema = Object.values(paramsToUse).some(
      schema => schema.description || schema.required || schema.enum ||
                schema.default !== undefined || schema.min !== undefined ||
                schema.max !== undefined || schema.pattern
    )
    const shouldIncludeParameters = (paramsWereModified && Object.keys(paramsToUse).length > 0) || hasParametersWithSchema

    const parametersYaml = shouldIncludeParameters
      ? `parameters:\n${Object.entries(paramsToUse).map(([name, schema]) => {
          let paramStr = `  - name: ${name}\n    type: ${schema.type}`
          if (schema.required) paramStr += `\n    required: true`
          if (schema.description) paramStr += `\n    description: "${schema.description.replace(/"/g, '\\"')}"`
          if (schema.enum && Array.isArray(schema.enum)) {
            paramStr += `\n    enum: ${JSON.stringify(schema.enum)}`
          }
          if (schema.default !== undefined) {
            if (typeof schema.default === 'string') {
              paramStr += `\n    default: "${schema.default.replace(/"/g, '\\"')}"`
            } else {
              paramStr += `\n    default: ${JSON.stringify(schema.default)}`
            }
          }
          if (schema.min !== undefined) paramStr += `\n    min: ${schema.min}`
          if (schema.max !== undefined) paramStr += `\n    max: ${schema.max}`
          if (schema.pattern) paramStr += `\n    pattern: "${schema.pattern.replace(/"/g, '\\"')}"`
          return paramStr
        }).join('\n')}\n`
      : ''

    // Quote name if it contains spaces, hyphens, or is empty (empty string needs quotes in YAML)
    const quotedName = metadataToUse.name === '' || metadataToUse.name.includes(' ') || metadataToUse.name.includes('-')
      ? `"${metadataToUse.name.replace(/"/g, '\\"')}"`
      : metadataToUse.name

    const descriptionYaml = metadataToUse.description
      ? `description: "${metadataToUse.description.replace(/"/g, '\\"')}"\n`
      : ''

    const tagsYaml = metadataToUse.tags && metadataToUse.tags.length > 0
      ? `tags: [${metadataToUse.tags.join(', ')}]\n`
      : ''

    // Preserve specialty sections from original frontmatter (system, user, context, etc.)
    const specialtySections = ['system', 'user', 'task', 'output', 'assistant', 'context', 'contexts', 'response']
    const specialtyYaml = specialtySections
      .filter(key => parsed.frontmatter[key])
      .map(key => {
        const val = parsed.frontmatter[key]
        if (Array.isArray(val)) {
          // Always preserve arrays as arrays (even single-element arrays)
          return `${key}:\n${val.map(v => `  - "${v}"`).join('\n')}\n`
        } else if (typeof val === 'string') {
          return `${key}: "${val}"\n`
        }
        return ''
      })
      .join('')

    // Helper to quote YAML values that need quotes (start with @ or contain special chars)
    const quoteIfNeeded = (val: string) => {
      if (val.startsWith('@')) {
        return `"${val.replace(/"/g, '\\"')}"`
      }
      if (val.includes(' ') || val.includes(':') || val.includes('#')) {
        return `"${val.replace(/"/g, '\\"')}"`
      }
      return val
    }

    const frontmatter = `---
id: ${metadataToUse.id}
name: ${quotedName}
version: ${metadataToUse.version}
${descriptionYaml}${tagsYaml}${parametersYaml}${parsed.frontmatter.using ? `using:\n${parsed.frontmatter.using.map((u: any) =>
  `  - name: "${u.name}"${u.prefix ? `\n    prefix: "${u.prefix}"` : ''}`
).join('\n')}\n` : ''}${inheritsValue ? `inherits: ${quoteIfNeeded(inheritsValue)}\n` : ''}${specialtyYaml}${Object.keys(sectionOverrides).length > 0
  ? `override:\n${Object.entries(sectionOverrides)
      .filter(([, content]) => content !== undefined)
      .map(([id, content]) => content === null
        ? `  ${id}: null  # Hidden section`
        : `  ${id}: |\n${content.split('\n').map(line => `    ${line}`).join('\n')}`
      ).join('\n')}\n`
  : ''}---

${parsed.body.replace(/^\n+/, '')}`.trim()

    onChange(frontmatter)
  }, [editableParams, paramsWereModified, parsed.paramsSchema, parsed.frontmatter, parsed.body, sectionOverrides, onChange])

  // Convenience wrapper that uses current metadata and inherits values
  const regeneratePrompd = useCallback(() => {
    generateFrontmatter(metadata, parsed.frontmatter.inherits || '')
  }, [metadata, parsed.frontmatter.inherits, generateFrontmatter])

  // Persist auto-merged inherited params after state update
  useEffect(() => {
    if (pendingInheritedMergeRef.current && paramsWereModified) {
      pendingInheritedMergeRef.current = false
      // Defer to next tick so editableParams state is settled
      const timer = setTimeout(() => {
        generateFrontmatter(metadata, parsed.frontmatter.inherits || '')
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [editableParams, paramsWereModified, metadata, parsed.frontmatter.inherits, generateFrontmatter])

  const handleMetadataChange = useCallback((field: string, value: string | string[]) => {
    // Build updated metadata and regenerate frontmatter
    // We pass the updated metadata directly to avoid React state timing issues
    const updatedMetadata = { ...metadata, [field]: value }

    // Handle inherits field - use passed value if that's what changed, otherwise preserve existing
    const inheritsValue = field === 'inherits' ? (value as string) : (parsed.frontmatter.inherits || '')

    // Call the shared generation function with the updated values
    generateFrontmatter(updatedMetadata, inheritsValue)
  }, [metadata, parsed.frontmatter.inherits, generateFrontmatter])

  // Note: Save is handled globally via Ctrl+S in App.tsx, not here

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string
        const parsed = JSON.parse(json) // Validate and parse JSON
        setUploadedParamsJson(json)
        setUploadedParams(parsed)
      } catch (err) {
        setErrorMessage('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const addParameter = () => {
    if (!newParamName || !newParamName.trim()) return

    if (editableParams[newParamName]) {
      return // Silently ignore duplicates
    }

    setParamsWereModified(true) // Mark that user explicitly modified params
    setEditableParams(prev => ({
      ...prev,
      [newParamName]: {
        type: 'string',
        required: false,
        description: ''
      }
    }))

    // Auto-expand the newly added parameter
    setExpandedParams(prev => new Set(prev).add(newParamName))

    // Reset form
    setNewParamName('')
    setIsAddingParameter(false)
  }

  const toggleParameter = (name: string) => {
    setExpandedParams(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const cancelAddParameter = () => {
    setNewParamName('')
    setIsAddingParameter(false)
  }

  const updateParameter = (name: string, updates: Partial<ParameterSchema>) => {
    setParamsWereModified(true) // Mark that user explicitly modified params
    setEditableParams(prev => ({
      ...prev,
      [name]: { ...prev[name], ...updates }
    }))
  }

  const deleteParameter = (name: string) => {
    setParamsWereModified(true) // Mark that user explicitly modified params
    setEditableParams(prev => {
      const newParams = { ...prev }
      delete newParams[name]
      return newParams
    })
  }

  // Add all missing inherited parameters at once (manual fallback — auto-merge handles most cases)
  const addMissingParameters = () => {
    const missing = Object.entries(inheritedParams).filter(([name]) => !editableParams[name])
    if (missing.length === 0) return

    setParamsWereModified(true)
    setEditableParams(prev => {
      const newParams = { ...prev }
      for (const [name, schema] of missing) {
        newParams[name] = { ...schema }
      }
      return newParams
    })

    // Expand newly added parameters
    setExpandedParams(prev => {
      const next = new Set(prev)
      for (const [name] of missing) {
        next.add(name)
      }
      return next
    })
  }

  // Persist parameter changes to YAML by triggering a metadata change
  const persistParameterChanges = () => {
    // Trigger handleMetadataChange with current metadata to regenerate YAML with updated parameters
    handleMetadataChange('_persist', metadata.id)
  }

  // Specialty sections configuration for PrompdContextArea
  const specialtySections: PrompdFileSection[] = [
    {
      name: 'system',
      label: 'System',
      files: Array.isArray(parsed.frontmatter.system) ? parsed.frontmatter.system : (parsed.frontmatter.system ? [parsed.frontmatter.system] : []),
      allowMultiple: false,
      description: 'System prompt file'
    },
    {
      name: 'user',
      label: 'User',
      files: Array.isArray(parsed.frontmatter.user) ? parsed.frontmatter.user : (parsed.frontmatter.user ? [parsed.frontmatter.user] : []),
      allowMultiple: false,
      description: 'User prompt file'
    },
    {
      name: 'context',
      label: 'Context',
      files: contextFiles,
      allowMultiple: true,
      description: 'Context files (multiple allowed)'
    },
    {
      name: 'task',
      label: 'Task',
      files: Array.isArray(parsed.frontmatter.task) ? parsed.frontmatter.task : (parsed.frontmatter.task ? [parsed.frontmatter.task] : []),
      allowMultiple: false,
      description: 'Task definition file'
    },
    {
      name: 'output',
      label: 'Output',
      files: Array.isArray(parsed.frontmatter.output) ? parsed.frontmatter.output : (parsed.frontmatter.output ? [parsed.frontmatter.output] : []),
      allowMultiple: false,
      description: 'Output format file'
    },
    {
      name: 'response',
      label: 'Response',
      files: Array.isArray(parsed.frontmatter.response) ? parsed.frontmatter.response : (parsed.frontmatter.response ? [parsed.frontmatter.response] : []),
      allowMultiple: false,
      description: 'Response template file'
    }
  ]

  // Convert specialty sections to Map format
  const specialtyFileSections: PrompdFileSections = new Map(
    specialtySections.map(s => [s.name, s.files])
  )

  // Handler for specialty section changes
  const handleSpecialtyChange = useCallback((sections: PrompdFileSections) => {
    // Update YAML frontmatter with new specialty section files
    const lines = value.split('\n')
    let inFrontmatter = false
    let frontmatterEnd = -1

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true
        } else {
          frontmatterEnd = i
          break
        }
      }
    }

    if (frontmatterEnd === -1) {
      console.warn('No valid YAML frontmatter found')
      return
    }

    // Remove existing specialty section lines (including array items)
    const filteredLines = lines.filter((line, i) => {
      if (i === 0 || i === frontmatterEnd || i > frontmatterEnd) return true
      const trimmed = line.trim()
      // Skip the specialty section headers and their array items
      if (
        trimmed.startsWith('system:') ||
        trimmed.startsWith('user:') ||
        trimmed.startsWith('task:') ||
        trimmed.startsWith('output:') ||
        trimmed.startsWith('response:') ||
        trimmed.startsWith('context:') ||
        trimmed.startsWith('contexts:')
      ) {
        return false
      }
      // Also skip array items (lines starting with - that are indented)
      if (trimmed.startsWith('- "') && line.startsWith('  ')) {
        return false
      }
      return true
    })

    // Add updated specialty sections
    const newSpecialtySections: string[] = []
    sections.forEach((files, sectionName) => {
      if (files.length > 0) {
        // Always preserve arrays as arrays (even single-element arrays)
        newSpecialtySections.push(`${sectionName}:`)
        files.forEach(file => {
          newSpecialtySections.push(`  - "${file}"`)
        })
      }
    })

    // Insert new specialty sections before the closing ---
    const newFrontmatterEnd = filteredLines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (newFrontmatterEnd > 0 && newSpecialtySections.length > 0) {
      filteredLines.splice(newFrontmatterEnd, 0, ...newSpecialtySections)
    }

    const newValue = filteredLines.join('\n')

    onChange(newValue)
  }, [value, onChange])

  // Inherits field handlers
  const parseInheritsValue = (inherits: string): { packageName: string; version: string; filePath: string; prefix?: string; isAlias?: boolean; isLocal?: boolean; localPath?: string } | null => {
    // Match local file paths: "./file.prmd" or "../path/file.prmd"
    const matchLocal = inherits.match(/^"?(\.\.?\/[^"]+)"?$/)
    if (matchLocal) {
      return {
        packageName: '',
        version: '',
        filePath: '',
        isLocal: true,
        localPath: matchLocal[1]
      }
    }

    // Match: "@namespace/package@version/path/file.prmd" (full format)
    const matchFull = inherits.match(/^"?(@[^/]+\/[^@]+)@([^/]+)\/(.+)"?$/)
    if (matchFull) {
      return {
        packageName: matchFull[1],
        version: matchFull[2],
        filePath: matchFull[3]
      }
    }

    // Match: "@prefix/path/file.prmd" (alias format - needs resolution from using)
    const matchAlias = inherits.match(/^"?(@[^/]+)\/(.+)"?$/)
    if (matchAlias) {
      const prefix = matchAlias[1]
      const filePath = matchAlias[2]

      // Try to resolve prefix from using declarations
      const usingDeclarations = parsed.frontmatter.using || []
      const usingEntry = usingDeclarations.find((u: any) => u.prefix === prefix)

      if (usingEntry && usingEntry.name) {
        // Parse the using name to extract package and version
        const usingMatch = usingEntry.name.match(/^(@[^/]+\/[^@]+)@(.+)$/)
        if (usingMatch) {
          return {
            packageName: usingMatch[1],
            version: usingMatch[2],
            filePath: filePath,
            prefix: prefix,
            isAlias: true
          }
        }
      }

      // If we can't resolve the alias, return null (invalid reference)
      console.warn(`[DesignView] Unable to resolve alias ${prefix} from using declarations`)
      return null
    }

    return null
  }

  const parsedInherits = parsed.frontmatter.inherits ? parseInheritsValue(parsed.frontmatter.inherits) : null

  const searchInheritsPackages = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setInheritsPackages([])
      setInheritsShowDropdown(false)
      return
    }

    setInheritsLoading(true)
    setInheritsShowDropdown(true)

    try {
      const result = await registryApi.searchPackages(query, 10)
      setInheritsPackages(result.packages)
      setInheritsHighlightedIndex(0)
    } catch (err: any) {
      console.error('Package search failed:', err)
      setInheritsPackages([])
    } finally {
      setInheritsLoading(false)
    }
  }, [])

  const fetchInheritsPackageFiles = async (packageName: string, version?: string) => {
    setInheritsFetchingFiles(true)
    try {
      const blob = await registryApi.downloadPackage(packageName, version)
      if (!blob) throw new Error('Failed to download package')

      const zip = await JSZip.loadAsync(blob)
      const prmdFiles = Object.keys(zip.files)
        .filter(path => !zip.files[path].dir && path.endsWith('.prmd'))

      setInheritsPackageFiles(prmdFiles)
    } catch (err) {
      console.warn('Failed to fetch package files:', err)
      setInheritsPackageFiles([])
    } finally {
      setInheritsFetchingFiles(false)
    }
  }

  const selectInheritsPackage = (pkg: RegistryPackage) => {
    setInheritsSelectedPackage({ name: pkg.name, version: pkg.version })
    fetchInheritsPackageFiles(pkg.name, pkg.version)
    setInheritsSearchQuery('')
    setInheritsShowDropdown(false)
    setInheritsPackages([])
  }

  const commitInheritsSelection = (filePath: string) => {
    if (!inheritsSelectedPackage) return

    let prefix = inheritsPrefix.trim()

    // If prefix is provided, use alias format and ensure using declaration exists
    if (prefix) {
      // Ensure prefix starts with @
      if (!prefix.startsWith('@')) {
        prefix = `@${prefix}`
      }

      const inheritsValue = `${prefix}/${filePath}`

      // Check if using declaration already exists for this prefix
      const existingUsing = parsed.frontmatter.using || []
      const hasPrefix = existingUsing.some((u: any) => u.prefix === prefix)

      if (!hasPrefix) {
        // Add using declaration to frontmatter
        const newUsing = [
          ...existingUsing,
          {
            name: `${inheritsSelectedPackage.name}@${inheritsSelectedPackage.version}`,
            prefix: prefix
          }
        ]

        // Rebuild frontmatter with new using declaration
        const lines = value.split('\n')
        const firstDashIndex = lines.findIndex(l => l.trim() === '---')
        const secondDashIndex = lines.findIndex((l, i) => i > firstDashIndex && l.trim() === '---')

        if (firstDashIndex >= 0 && secondDashIndex > firstDashIndex) {
          const beforeFrontmatter = lines.slice(0, firstDashIndex + 1)
          const afterFrontmatter = lines.slice(secondDashIndex)

          // Rebuild frontmatter with using declarations
          const usingYaml = `using:\n${newUsing.map((u: any) =>
            `  - name: "${u.name}"\n    prefix: "${u.prefix}"`
          ).join('\n')}\n`

          // Insert using after other metadata, before inherits if it exists
          const frontmatterLines = lines.slice(firstDashIndex + 1, secondDashIndex)
          const inheritsLineIndex = frontmatterLines.findIndex(l => l.trim().startsWith('inherits:'))

          let newFrontmatter: string[]
          if (inheritsLineIndex >= 0) {
            // Insert before inherits
            newFrontmatter = [
              ...frontmatterLines.slice(0, inheritsLineIndex),
              ...usingYaml.split('\n').filter(l => l), // Remove empty lines
              ...frontmatterLines.slice(inheritsLineIndex)
            ]
          } else {
            // Append at end of frontmatter
            newFrontmatter = [
              ...frontmatterLines,
              ...usingYaml.split('\n').filter(l => l)
            ]
          }

          const newValue = [
            ...beforeFrontmatter,
            ...newFrontmatter,
            ...afterFrontmatter
          ].join('\n')

          onChange(newValue)
        }
      }

      handleMetadataChange('inherits', inheritsValue)
    } else {
      // No prefix - use full format
      const inheritsValue = `${inheritsSelectedPackage.name}@${inheritsSelectedPackage.version}/${filePath}`
      handleMetadataChange('inherits', inheritsValue)
    }

    setInheritsEditMode(false)
    setInheritsShowFileDropdown(false)
    setInheritsSelectedPackage(null)
    setInheritsPrefix('')
    setInheritsPackageFiles([])
  }

  const clearInherits = () => {
    handleMetadataChange('inherits', '')
    setInheritsEditMode(false)
    setInheritsSelectedPackage(null)
    setInheritsPrefix('')
    setInheritsPackageFiles([])
  }

  // Helper functions for InheritsManager component
  const convertYamlToUsingDeclarations = (usingArray: any[] | undefined) => {
    if (!usingArray || !Array.isArray(usingArray)) return []

    return usingArray.map((u: any) => {
      // Parse name: "@namespace/package@version"
      const match = u.name?.match(/^(@[^/]+\/[^@]+)@(.+)$/)
      if (match) {
        return {
          prefix: u.prefix || '',
          package: match[1],
          version: match[2]
        }
      }
      return null
    }).filter((d): d is { prefix: string; package: string; version: string } => d !== null)
  }

  // Memoize using declarations to prevent infinite loops
  const memoizedUsingDeclarations = useMemo(
    () => convertYamlToUsingDeclarations(parsed.frontmatter.using),
    [parsed.frontmatter.using]
  )

  const handleInheritsManagerChange = useCallback((inheritsValue: string) => {
    handleMetadataChange('inherits', inheritsValue)
  }, [handleMetadataChange])

  const handleUsingDeclarationsChange = useCallback((declarations: Array<{ prefix: string; package: string; version: string }>, newInheritsValue?: string) => {
    // Convert back to YAML format
    const usingYaml = declarations.map(d => ({
      name: `${d.package}@${d.version}`,
      prefix: d.prefix
    }))

    // Update YAML
    const currentText = value
    const parsed = parsePrompd(currentText)

    // Helper to quote YAML values that need quotes
    const quoteIfNeeded = (val: string) => {
      if (val.startsWith('@')) {
        return `"${val.replace(/"/g, '\\"')}"`
      }
      if (val.includes(' ') || val.includes(':') || val.includes('#')) {
        return `"${val.replace(/"/g, '\\"')}"`
      }
      return val
    }

    // Rebuild YAML frontmatter with updated using declarations
    // Handle parameters as array (per prompd spec)
    let parametersYaml = ''
    if (Array.isArray(parsed.frontmatter.parameters) && parsed.frontmatter.parameters.length > 0) {
      parametersYaml = 'parameters:\n' + parsed.frontmatter.parameters.map((p: any) => {
        const lines = [`  - name: ${p.name}`]
        if (p.type) lines.push(`    type: ${p.type}`)
        if (p.description) lines.push(`    description: "${p.description}"`)
        if (p.required !== undefined) lines.push(`    required: ${p.required}`)
        if (p.default !== undefined) lines.push(`    default: ${JSON.stringify(p.default)}`)
        if (p.enum) lines.push(`    enum: ${JSON.stringify(p.enum)}`)
        return lines.join('\n')
      }).join('\n') + '\n'
    }

    // Use new inherits value if provided, otherwise keep existing
    const inheritsToUse = newInheritsValue !== undefined ? newInheritsValue : (parsed.frontmatter.inherits || '')

    const newFrontmatter = `---
id: ${metadata.id}
name: ${metadata.name}
version: ${metadata.version}
${metadata.description ? `description: ${metadata.description}\n` : ''}${parametersYaml}${usingYaml.length > 0 ? `using:\n${usingYaml.map(u => `  - name: "${u.name}"${u.prefix ? `\n    prefix: "${u.prefix}"` : ''}`).join('\n')}\n` : ''}${inheritsToUse ? `inherits: ${quoteIfNeeded(inheritsToUse)}\n` : ''}${Object.keys(sectionOverrides).length > 0
      ? `override:\n${Object.entries(sectionOverrides)
          .filter(([, content]) => content !== undefined)
          .map(([key, content]) => `  ${key}: ${content === null ? 'null' : `|\n${content.split('\n').map(line => `    ${line}`).join('\n')}`}`)
          .join('\n')}\n`
      : ''}---

${parsed.body.replace(/^\n+/, '')}`

    onChange(newFrontmatter)
  }, [value, metadata, sectionOverrides, onChange])

  const searchPackagesForManager = useCallback(async (query: string) => {
    try {
      const result = await registryApi.searchPackages(query, 10)
      return result.packages.map((pkg: any) => ({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description
      }))
    } catch (err) {
      console.error('Package search failed:', err)
      return []
    }
  }, [])

  const fetchInheritsPackageFilesForManager = useCallback(async (packageName: string, version: string): Promise<string[]> => {
    try {
      const blob = await registryApi.downloadPackage(packageName, version)
      if (!blob) throw new Error('Failed to download package')

      const zip = await JSZip.loadAsync(blob)
      const files: string[] = []

      zip.forEach((relativePath, file) => {
        if (!file.dir && relativePath.endsWith('.prmd')) {
          files.push(relativePath)
        }
      })

      return files.sort()
    } catch (err) {
      console.error('Failed to fetch package files:', err)
      return []
    }
  }, [])

  const searchLocalFilesForManager = useCallback(async (query: string): Promise<string[]> => {
    if (!workspaceHandle) {
      return []
    }

    try {
      const workspaceRelativePaths: string[] = []
      const searchTerm = query.toLowerCase().replace(/^\.+\//, '') // Remove leading "./" or "../"

      // Check if this is an Electron pseudo-handle
      const isElectronHandle = (workspaceHandle as any)._electronPath && (window as any).electronAPI?.readDir

      if (isElectronHandle) {
        // Electron mode: use IPC to search directories
        const electronPath = (workspaceHandle as any)._electronPath

        const searchDirectoryElectron = async (dirPath: string, currentPath: string = '') => {
          const result = await (window as any).electronAPI.readDir(dirPath)
          if (!result.success) {
            console.warn('Failed to read directory:', dirPath, result.error)
            return
          }

          for (const item of result.files) {
            const relativePath = currentPath ? `${currentPath}/${item.name}` : item.name

            if (!item.isDirectory && item.name.endsWith('.prmd')) {
              // Check if file path matches search term
              if (searchTerm === '' || relativePath.toLowerCase().includes(searchTerm)) {
                workspaceRelativePaths.push(relativePath)
              }
            } else if (item.isDirectory) {
              // Skip node_modules, .git, etc.
              if (!['node_modules', '.git', 'dist', 'build', '.prompd'].includes(item.name)) {
                // Recursively search subdirectories (limit depth to avoid performance issues)
                if (currentPath.split('/').length < 10) {
                  await searchDirectoryElectron(item.path, relativePath)
                }
              }
            }
          }
        }

        await searchDirectoryElectron(electronPath)
      } else {
        // File System Access API mode
        const searchDirectory = async (dirHandle: FileSystemDirectoryHandle, currentPath: string = '') => {
          for await (const [name, handle] of (dirHandle as any).entries()) {
            const path = currentPath ? `${currentPath}/${name}` : name

            if (handle.kind === 'file' && name.endsWith('.prmd')) {
              // Check if file path matches search term
              if (searchTerm === '' || path.toLowerCase().includes(searchTerm)) {
                workspaceRelativePaths.push(path)
              }
            } else if (handle.kind === 'directory') {
              // Skip node_modules, .git, etc.
              if (!['node_modules', '.git', 'dist', 'build', '.prompd'].includes(name)) {
                // Recursively search subdirectories (limit depth to avoid performance issues)
                if (currentPath.split('/').length < 10) {
                  await searchDirectory(handle, path)
                }
              }
            }
          }
        }

        await searchDirectory(workspaceHandle)
      }

      // Convert workspace-relative paths to current-file-relative paths
      // e.g., if current file is "prompts/myfile.prmd" and target is "prompts/other.prmd"
      // then result should be "./other.prmd" not "./prompts/other.prmd"
      const currentFileNormalized = currentFilePath
        ? currentFilePath.replace(/\\/g, '/').replace(/^\.?\//, '')
        : ''
      const currentFileDir = currentFileNormalized
        ? currentFileNormalized.split('/').slice(0, -1)
        : []

      // Exclude the current file from results (can't inherit from itself)
      const filteredPaths = workspaceRelativePaths.filter(targetPath => {
        const normalizedTarget = targetPath.replace(/\\/g, '/')
        return normalizedTarget !== currentFileNormalized
      })

      const results = filteredPaths.map(targetPath => {
        const targetParts = targetPath.replace(/\\/g, '/').split('/')

        // Find common prefix length
        let commonPrefixLen = 0
        while (
          commonPrefixLen < currentFileDir.length &&
          commonPrefixLen < targetParts.length - 1 && // -1 to exclude filename
          currentFileDir[commonPrefixLen] === targetParts[commonPrefixLen]
        ) {
          commonPrefixLen++
        }

        // Build relative path
        const upLevels = currentFileDir.length - commonPrefixLen
        const downPath = targetParts.slice(commonPrefixLen)

        if (upLevels === 0 && downPath.length === 1) {
          // Same directory - just use ./filename
          return `./${downPath[0]}`
        } else if (upLevels === 0) {
          // Subdirectory of current dir
          return `./${downPath.join('/')}`
        } else {
          // Need to go up one or more levels
          const upParts = Array(upLevels).fill('..')
          return `${upParts.join('/')}/${downPath.join('/')}`
        }
      })

      return results.sort()
    } catch (err) {
      console.error('Failed to search local files:', err)
      return []
    }
  }, [workspaceHandle, currentFilePath])

  // Handler for opening context/specialty section files
  const openContextFile = useCallback(async (filePath: string) => {
    console.log('openContextFile called', { filePath, hasOnOpenFile: !!onOpenFile })

    if (!onOpenFile) {
      console.log('onOpenFile callback not provided')
      return
    }

    if (!workspaceHandle) {
      console.log('No workspace handle - cannot open context file')
      return
    }

    try {
      const electronAPI = (window as any).electronAPI
      const isElectronHandle = (workspaceHandle as any)._electronPath && electronAPI?.readFile

      if (isElectronHandle) {
        // Electron mode: Use electronAPI to read files
        const workspacePath = (workspaceHandle as any)._electronPath
        const cleanPath = filePath.replace(/^\.\//, '')
        const fullPath = `${workspacePath}/${cleanPath}`

        console.log('[DesignView] Reading context file via Electron:', fullPath)
        const result = await electronAPI.readFile(fullPath)
        if (!result.success) {
          throw new Error(result.error || 'Failed to read file')
        }

        console.log('Opening context file in editor...')
        onOpenFile({
          name: filePath,
          text: result.content || '',
          electronPath: fullPath
        })
      } else {
        // Browser File System Access API mode
        // Navigate to the file relative to workspace
        const pathParts = filePath.replace(/^\.\//, '').split('/')
        let currentHandle: FileSystemDirectoryHandle = workspaceHandle

        // Navigate through directories
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathParts[i])
        }

        // Get the file
        const fileName = pathParts[pathParts.length - 1]
        const fileHandle = await currentHandle.getFileHandle(fileName)
        const file = await fileHandle.getFile()
        const text = await file.text()

        console.log('Opening context file in editor...')
        onOpenFile({
          name: filePath,
          handle: fileHandle,
          text
        })
      }
    } catch (err) {
      console.error('Failed to open context file:', err)
    }
  }, [onOpenFile, workspaceHandle])

  const openInheritedFile = async () => {
    console.log('openInheritedFile called', {
      parsedInherits,
      hasOnOpenFile: !!onOpenFile,
      inheritsValue: parsed.frontmatter.inherits
    })

    if (!onOpenFile) {
      console.log('onOpenFile callback not provided')
      return
    }

    if (!parsedInherits) {
      console.log('Could not parse inherits value:', parsed.frontmatter.inherits)
      setErrorMessage('Cannot open inherited file: Unable to resolve the inherits reference. If using an alias (e.g., @pe/...), ensure there is a matching "using" declaration in the frontmatter.')
      return
    }

    try {
      // Handle local file references
      if (parsedInherits.isLocal && parsedInherits.localPath) {
        if (!workspaceHandle) {
          setErrorMessage('Cannot open local file: No workspace folder is open. Please open a folder first.')
          return
        }

        console.log('Opening local file:', parsedInherits.localPath)

        const electronAPI = (window as any).electronAPI
        const isElectronHandle = (workspaceHandle as any)._electronPath && electronAPI?.readFile

        if (isElectronHandle) {
          // Electron mode: Use electronAPI to read files
          const workspacePath = (workspaceHandle as any)._electronPath

          // Get the directory of the current file (for relative path resolution)
          let basePath = workspacePath
          if (currentFilePath) {
            const cleanCurrentPath = currentFilePath.replace(/^\.?\//, '').replace(/\\/g, '/')
            const dirParts = cleanCurrentPath.split('/').slice(0, -1)
            if (dirParts.length > 0) {
              basePath = `${workspacePath}/${dirParts.join('/')}`
            }
          }

          // Resolve the relative path (relative to current file's directory)
          const localPath = parsedInherits.localPath
          let fullPath: string

          console.log('[DesignView] openInheritedFile Electron debug:', { workspacePath, currentFilePath, basePath, localPath })

          if (localPath.startsWith('./')) {
            // "./" means relative to current file's directory (sibling files)
            fullPath = `${basePath}/${localPath.slice(2)}`
          } else if (localPath.startsWith('../')) {
            // "../" means go up from the current file's directory
            const parts = basePath.split(/[/\\]/).filter((p: string) => p)
            const relativeParts = localPath.split('/')
            for (const part of relativeParts) {
              if (part === '..') {
                parts.pop()
              } else if (part !== '.' && part !== '') {
                parts.push(part)
              }
            }
            fullPath = parts.join('/')
          } else {
            // No prefix - treat as relative to current file's directory
            fullPath = `${basePath}/${localPath}`
          }

          console.log('[DesignView] Reading inherited file via Electron:', fullPath)
          const result = await electronAPI.readFile(fullPath)
          if (!result.success) {
            throw new Error(result.error || 'Failed to read file')
          }

          // Compute the normalized path relative to workspace root for tab matching
          // This ensures clicking the link switches to existing tab instead of opening duplicate
          // workspacePath is already declared above in the isElectronHandle block
          let normalizedName = parsedInherits.localPath
          if (fullPath.startsWith(workspacePath)) {
            normalizedName = fullPath.slice(workspacePath.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
          }

          console.log('Opening local file in editor...', { normalizedName, fullPath })
          onOpenFile({
            name: normalizedName,
            text: result.content || '',
            electronPath: fullPath
          })
          console.log('Local file opened successfully')
          return
        }

        // Browser File System Access API mode
        // Parse the relative path
        const pathParts = parsedInherits.localPath.split('/').filter(p => p && p !== '.')

        // Get the current file's directory
        let currentDir = workspaceHandle
        if (currentFilePath) {
          const dirParts = currentFilePath.split('/').slice(0, -1)
          for (const part of dirParts) {
            if (part) {
              currentDir = await currentDir.getDirectoryHandle(part)
            }
          }
        }

        // Navigate to the target file
        let targetDir = currentDir
        const fileName = pathParts[pathParts.length - 1]
        const dirPath = pathParts.slice(0, -1)

        for (const part of dirPath) {
          if (part === '..') {
            // Can't navigate up from workspace root - just stay at current dir
            // This is a limitation of File System Access API
            console.warn('Cannot navigate above workspace root')
          } else {
            targetDir = await targetDir.getDirectoryHandle(part)
          }
        }

        // Read the file
        const fileHandle = await targetDir.getFileHandle(fileName)
        const file = await fileHandle.getFile()
        const text = await file.text()

        // Compute normalized path relative to workspace for tab matching
        // Start from current file's directory and apply relative path
        const currentDirParts = currentFilePath ? currentFilePath.split('/').slice(0, -1) : []
        const resultParts = [...currentDirParts]
        for (const part of pathParts.slice(0, -1)) {
          if (part === '..') {
            resultParts.pop()
          } else if (part !== '.') {
            resultParts.push(part)
          }
        }
        resultParts.push(fileName)
        const normalizedName = resultParts.join('/')

        console.log('Opening local file in editor...', { normalizedName })
        onOpenFile({
          name: normalizedName,
          handle: fileHandle,
          text
        })
        console.log('Local file opened successfully')
        return
      }

      // Handle package references
      console.log('Downloading package:', parsedInherits.packageName, parsedInherits.version)
      const blob = await registryApi.downloadPackage(parsedInherits.packageName, parsedInherits.version)
      if (!blob) throw new Error('Failed to download package')

      console.log('Loading ZIP...')
      const zip = await JSZip.loadAsync(blob)
      console.log('Extracting file:', parsedInherits.filePath)
      const file = zip.file(parsedInherits.filePath)
      if (!file) {
        console.error('File not found in package. Available files:', Object.keys(zip.files))
        throw new Error(`File "${parsedInherits.filePath}" not found in package`)
      }

      console.log('Reading file content...')
      const text = await file.async('text')
      console.log('Opening file in editor...')
      onOpenFile({
        name: `${parsedInherits.packageName}@${parsedInherits.version}/${parsedInherits.filePath}`,
        text,
        readOnly: true,
        packageSource: {
          packageId: `${parsedInherits.packageName}@${parsedInherits.version}`,
          filePath: parsedInherits.filePath
        }
      })
      console.log('File opened successfully')
    } catch (err) {
      console.error('Failed to open inherited file:', err)
      setErrorMessage(`Failed to open inherited file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Only re-fetch inherited sections when the inherits field actually changes, not on every body edit
  const inheritsFieldValue = parsed.frontmatter.inherits ?? ''

  // Fetch inherited template sections when inherits field changes
  useEffect(() => {
    const fetchInheritedSections = async () => {
      if (!inheritsFieldValue) {
        setInheritedSections([])
        setInheritedParams({})
        return
      }

      const parsedInheritsValue = parseInheritsValue(inheritsFieldValue)
      if (!parsedInheritsValue) {
        setInheritedSections([])
        setInheritedParams({})
        return
      }

      try {
        console.log('[DesignView] Fetching inherited template sections from:', parsedInheritsValue)

        let text: string

        // Handle local file references
        if (parsedInheritsValue.isLocal && parsedInheritsValue.localPath) {
          if (!workspaceHandle) {
            console.warn('[DesignView] Cannot fetch local inherited file: No workspace folder')
            setInheritedSections([])
            setInheritedParams({})
            return
          }

          const electronAPI = (window as any).electronAPI
          const isElectronHandle = (workspaceHandle as any)._electronPath && electronAPI?.readFile

          if (isElectronHandle) {
            // Electron mode: Use electronAPI to read files
            const workspacePath = (workspaceHandle as any)._electronPath

            // Get the directory of the current file (for relative path resolution)
            let basePath = workspacePath
            if (currentFilePath) {
              const cleanCurrentPath = currentFilePath.replace(/^\.?\//, '').replace(/\\/g, '/')
              const dirParts = cleanCurrentPath.split('/').slice(0, -1)
              if (dirParts.length > 0) {
                basePath = `${workspacePath}/${dirParts.join('/')}`
              }
            }

            // Resolve the relative path (relative to current file's directory)
            const localPath = parsedInheritsValue.localPath
            let fullPath: string

            console.log('[DesignView] fetchInheritedSections Electron debug:', { workspacePath, currentFilePath, basePath, localPath })

            if (localPath.startsWith('./')) {
              // "./" means relative to current file's directory (sibling files)
              fullPath = `${basePath}/${localPath.slice(2)}`
            } else if (localPath.startsWith('../')) {
              // "../" means go up from the current file's directory
              const parts = basePath.split(/[/\\]/).filter((p: string) => p)
              const relativeParts = localPath.split('/')
              for (const part of relativeParts) {
                if (part === '..') {
                  parts.pop()
                } else if (part !== '.' && part !== '') {
                  parts.push(part)
                }
              }
              fullPath = parts.join('/')
            } else {
              // No prefix - treat as relative to current file's directory
              fullPath = `${basePath}/${localPath}`
            }

            console.log('[DesignView] Reading inherited file via Electron:', fullPath)
            const result = await electronAPI.readFile(fullPath)
            if (!result.success) {
              throw new Error(result.error || 'Failed to read file')
            }
            text = result.content || ''
          } else {
            // Browser File System Access API mode
            // Parse the relative path
            const pathParts = parsedInheritsValue.localPath.split('/').filter(p => p && p !== '.')

            // Get the current file's directory
            let currentDir = workspaceHandle
            if (currentFilePath) {
              const dirParts = currentFilePath.split('/').slice(0, -1)
              for (const part of dirParts) {
                if (part) {
                  currentDir = await currentDir.getDirectoryHandle(part)
                }
              }
            }

            // Navigate to the target file
            let targetDir = currentDir
            const fileName = pathParts[pathParts.length - 1]
            const dirPath = pathParts.slice(0, -1)

            for (const part of dirPath) {
              if (part === '..') {
                console.warn('Cannot navigate above workspace root')
              } else {
                targetDir = await targetDir.getDirectoryHandle(part)
              }
            }

            // Read the file
            const fileHandle = await targetDir.getFileHandle(fileName)
            const file = await fileHandle.getFile()
            text = await file.text()
          }
        } else {
          // Handle package references
          const blob = await registryApi.downloadPackage(parsedInheritsValue.packageName, parsedInheritsValue.version)
          if (!blob) throw new Error('Failed to download package')

          const zip = await JSZip.loadAsync(blob)
          const file = zip.file(parsedInheritsValue.filePath)
          if (!file) throw new Error('File not found in package')

          text = await file.async('text')
        }

        const parsedTemplate = parsePrompd(text)
        const templateSections = extractSections(parsedTemplate.body)

        console.log('[DesignView] Extracted sections from inherited template:', templateSections.map(s => s.title))
        console.log('[DesignView] Extracted parameters from inherited template:', Object.keys(parsedTemplate.paramsSchema))
        setInheritedSections(templateSections)
        setInheritedParams(parsedTemplate.paramsSchema || {})
      } catch (err) {
        console.warn('[DesignView] Failed to fetch inherited template sections:', err)
        setInheritedSections([])
        setInheritedParams({})
      }
    }

    fetchInheritedSections()
  }, [inheritsFieldValue, workspaceHandle, currentFilePath])

  // Debounced search for inherits
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (inheritsSearchQuery.trim()) {
        await searchInheritsPackages(inheritsSearchQuery)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [inheritsSearchQuery, searchInheritsPackages])

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inheritsDropdownRef.current && !inheritsDropdownRef.current.contains(event.target as Node) &&
          inheritsInputRef.current && !inheritsInputRef.current.contains(event.target as Node)) {
        setInheritsShowDropdown(false)
        setInheritsShowFileDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Build minimap sections from metadata, parameters, and content
  const minimapSections = useMemo((): MinimapSection[] => {
    const sections: MinimapSection[] = []

    // Metadata section
    sections.push({
      id: 'metadata-section',
      type: 'metadata',
      label: 'Metadata',
      depth: 0
    })

    // Parameters section if any exist
    if (Object.keys(editableParams).length > 0) {
      sections.push({
        id: 'params-section',
        type: 'params',
        label: `Parameters (${Object.keys(editableParams).length})`,
        depth: 0
      })
      // Add individual parameters
      Object.keys(editableParams).forEach((paramName, i) => {
        sections.push({
          id: `param-${i}`,
          type: 'params',
          label: paramName,
          depth: 1
        })
      })
    }

    // Context/specialty sections if any have files
    const activeSections = specialtySections.filter(s => visibleSpecialtySections.has(s.name) && s.files.length > 0)
    if (activeSections.length > 0) {
      sections.push({
        id: 'context-section',
        type: 'context',
        label: 'Context Sections',
        depth: 0
      })
      activeSections.forEach((s) => {
        sections.push({
          id: `context-${s.name}`,
          type: 'context',
          label: `${s.label} (${s.files.length})`,
          depth: 1
        })
      })
    }

    // Content section
    sections.push({
      id: 'content-section',
      type: 'content',
      label: isXmlContent ? 'XML Content' : 'Markdown Content',
      depth: 0
    })

    // For XML content, extract elements for minimap
    if (isXmlContent && parsed.body) {
      const extractXmlElements = (xml: string, depth: number, startIndex: number): { items: MinimapSection[], nextIndex: number } => {
        const result: MinimapSection[] = []
        let index = startIndex
        let remaining = xml.trim()

        while (remaining.length > 0) {
          const tagMatch = remaining.match(/^<([a-zA-Z_][\w.-]*)((?:\s+[^>]*?)?)(\/?)\s*>/)
          if (tagMatch) {
            const [fullMatch, tagName, , selfClosing] = tagMatch
            result.push({
              id: `xml-${index++}`,
              type: 'element',
              label: `<${tagName}>`,
              depth: depth + 1
            })

            remaining = remaining.substring(fullMatch.length)

            if (!selfClosing) {
              const closingTag = `</${tagName}>`
              let nestLevel = 1
              let searchIdx = 0
              let contentEnd = -1

              while (nestLevel > 0 && searchIdx < remaining.length) {
                const nextOpen = remaining.indexOf(`<${tagName}`, searchIdx)
                const nextClose = remaining.indexOf(closingTag, searchIdx)

                if (nextClose === -1) break

                if (nextOpen !== -1 && nextOpen < nextClose) {
                  const afterOpen = remaining[nextOpen + tagName.length + 1]
                  if (afterOpen === '>' || afterOpen === ' ' || afterOpen === '/') {
                    nestLevel++
                  }
                  searchIdx = nextOpen + 1
                } else {
                  nestLevel--
                  if (nestLevel === 0) {
                    contentEnd = nextClose
                  }
                  searchIdx = nextClose + 1
                }
              }

              if (contentEnd !== -1) {
                const innerContent = remaining.substring(0, contentEnd)
                remaining = remaining.substring(contentEnd + closingTag.length).trim()

                const { items: childItems, nextIndex } = extractXmlElements(innerContent, depth + 1, index)
                result.push(...childItems)
                index = nextIndex
              }
            }
            continue
          }

          const nextTag = remaining.indexOf('<')
          if (nextTag === -1) {
            break
          } else if (nextTag > 0) {
            remaining = remaining.substring(nextTag)
          } else if (remaining.startsWith('<!--')) {
            const endComment = remaining.indexOf('-->')
            if (endComment !== -1) {
              remaining = remaining.substring(endComment + 3).trim()
            } else {
              break
            }
          } else if (remaining.startsWith('</')) {
            const endIdx = remaining.indexOf('>')
            if (endIdx !== -1) {
              remaining = remaining.substring(endIdx + 1).trim()
            } else {
              break
            }
          } else {
            remaining = remaining.substring(1)
          }
        }

        return { items: result, nextIndex: index }
      }

      const { items: xmlItems } = extractXmlElements(parsed.body, 0, 0)
      sections.push(...xmlItems)
    } else if (!isXmlContent && parsed.body) {
      // For markdown, extract headings
      const lines = parsed.body.split('\n')
      let headingIndex = 0
      for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
        if (headingMatch) {
          const level = headingMatch[1].length
          sections.push({
            id: `heading-${headingIndex++}`,
            type: 'heading',
            label: headingMatch[2],
            depth: level
          })
        }
      }
    }

    return sections
  }, [editableParams, specialtySections, visibleSpecialtySections, isXmlContent, parsed.body])

  // Scroll to a section when clicked in minimap
  const scrollToSection = useCallback((sectionId: string) => {
    const container = scrollContainerRef.current
    if (!container) return

    // Helper to scroll after potential expand
    const scrollTo = (selector: string, delay: number = 0) => {
      setTimeout(() => {
        const element = container.querySelector(selector)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, delay)
    }

    // For metadata-section, expand and scroll to metadata
    if (sectionId === 'metadata-section') {
      const needsExpand = metadataCollapsed
      if (needsExpand) {
        setMetadataCollapsed(false)
      }
      scrollTo('[data-section="metadata"]', needsExpand ? 100 : 0)
      return
    }

    // For params-section, expand metadata if collapsed (params are inside metadata)
    if (sectionId === 'params-section' || sectionId.startsWith('param-')) {
      const needsExpand = metadataCollapsed
      if (needsExpand) {
        setMetadataCollapsed(false)
      }
      scrollTo('[data-section="params"]', needsExpand ? 100 : 0)
      return
    }

    // Context sections — scroll to the context area (inside metadata)
    if (sectionId === 'context-section' || sectionId.startsWith('context-')) {
      const needsExpand = metadataCollapsed
      if (needsExpand) {
        setMetadataCollapsed(false)
      }
      scrollTo('[data-section="context"]', needsExpand ? 100 : 0)
      return
    }

    // For content-section, scroll to content
    if (sectionId === 'content-section') {
      scrollTo('[data-section="content"]', 0)
      return
    }

    // For XML elements, expand ancestors and scroll to the specific node
    if (sectionId.startsWith('xml-')) {
      // Extract index from section ID (xml-0, xml-1, etc.)
      const index = parseInt(sectionId.replace('xml-', ''), 10)
      if (!isNaN(index)) {
        // First, expand all ancestors so the node becomes visible
        xmlDesignViewRef.current?.expandToNodeIndex(index)
        // Wait for expansion to render, then scroll
        setTimeout(() => {
          const allNodes = container.querySelectorAll('[data-node-id]')
          if (index < allNodes.length) {
            const targetNode = allNodes[index]
            targetNode.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 100)
      }
      return
    }

    // For headings, find the actual heading element in the rendered content
    if (sectionId.startsWith('heading-')) {
      const index = parseInt(sectionId.replace('heading-', ''), 10)
      if (!isNaN(index)) {
        // In DesignView markdown mode, sections are rendered as ContentSections
        // Look for section headers by data attribute or heading elements
        const headings = container.querySelectorAll('[data-section="content"] h1, [data-section="content"] h2, [data-section="content"] h3, [data-section="content"] h4, [data-section="content"] h5, [data-section="content"] h6')
        if (index < headings.length) {
          headings[index].scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          scrollTo('[data-section="content"]', 0)
        }
      }
      return
    }
  }, [metadataCollapsed])

  return (
    <div
      ref={designViewContainerRef}
      style={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
    <div
      ref={scrollContainerRef}
      style={{
        height: '100%',
        overflow: 'auto',
        background: 'var(--panel)',
        paddingTop: 0,
        paddingRight: showMinimap && minimapSections.length > 0 ? '154px' : (contentFullscreen ? '24px' : '24px'),
        paddingBottom: contentFullscreen ? '16px' : '24px',
        paddingLeft: contentFullscreen ? '24px' : '24px'
      }}
    >
      <div style={{ maxWidth: contentFullscreen ? 'none' : '1200px', margin: '0 auto', paddingTop: contentFullscreen ? '16px' : '24px' }}>
        {!contentFullscreen && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text)' }}>
              Design View
            </h2>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              Press Ctrl+S to save
            </span>
          </div>
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              background: showMinimap ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              color: showMinimap ? '#3b82f6' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}
            title={showMinimap ? 'Hide minimap' : 'Show minimap'}
          >
            <MapIcon size={16} />
          </button>
        </div>
        )}

        {/* Combined Metadata Section */}
        {!contentFullscreen && (<div
          data-section="metadata"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '24px',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: metadataCollapsed ? 'none' : '1px solid var(--border)'
            }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <span>Metadata</span>
            {metadataCollapsed && (
              <span style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontWeight: 400,
                fontStyle: 'italic'
              }}>
                {metadata.name || metadata.id || 'Untitled'}
                {metadata.version ? ` v${metadata.version}` : ''}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              {readOnly && (
                <span style={{
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--accent)',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid var(--accent)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Eye size={12} />
                  READ-ONLY REFERENCE
                </span>
              )}
              {metadataCollapsed ? (
                <button
                  onClick={() => !readOnly && setMetadataCollapsed(false)}
                  disabled={readOnly}
                  style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    fontWeight: 500,
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    borderRadius: '4px',
                    cursor: readOnly ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: readOnly ? 0.5 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  <Edit3 size={10} />
                  Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setMetadataCollapsed(true)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background: 'transparent',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      regeneratePrompd()
                      setMetadataCollapsed(true)
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background: 'var(--success)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Check size={10} />
                    Save
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Collapsed Summary View */}
          {metadataCollapsed && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                padding: '12px 20px 20px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {/* Name, ID, Version Card */}
              <div style={{
                padding: '12px',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {metadata.name}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      ID
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)' }}>
                      {metadata.id}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      Version
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)' }}>
                      {metadata.version}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Grid - Parameters & Sections */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <Settings size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1 }}>
                      Parameters
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginTop: '3px' }}>
                      {Object.keys(parsed.paramsSchema).length}
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: '10px 12px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1 }}>
                      Sections
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginTop: '3px' }}>
                      {visibleSpecialtySections.size}
                    </div>
                  </div>
                </div>
              </div>

              {/* Description Card (conditional) */}
              {metadata.description && (
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px'
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Description
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {metadata.description}
                  </div>
                </div>
              )}

              {/* Tags Card (conditional) */}
              {metadata.tags && metadata.tags.length > 0 && (
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px'
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Tags
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {metadata.tags.map((tag: string) => (
                      <span
                        key={tag}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 500,
                          borderRadius: '10px',
                          background: theme === 'dark'
                            ? 'rgba(139, 92, 246, 0.2)'
                            : 'rgba(139, 92, 246, 0.15)',
                          color: theme === 'dark' ? '#c4b5fd' : '#7c3aed',
                          border: `1px solid ${theme === 'dark' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.25)'}`
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!metadataCollapsed && (<div style={{ padding: '0 20px 20px 20px' }}>

          {/* Basic Metadata Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--text)' }}>
                ID <span style={{ color: 'var(--error)' }}>*</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>(kebab-case)</span>
              </label>
              <input
                type="text"
                value={metadata.id}
                onChange={(e) => handleMetadataChange('id', e.target.value)}
                placeholder="my-prompt"
                disabled={readOnly}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontFamily: 'monospace'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--text)' }}>
                <span>Version <span style={{ color: 'var(--error)' }}>*</span></span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)' }}>(x.y.z)</span>
              </label>
              {readOnly ? (
                <input
                  type="text"
                  value={metadata.version}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '6px',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontFamily: 'monospace',
                    opacity: 0.7
                  }}
                />
              ) : (
                <VersionInput
                  value={metadata.version}
                  onChange={(v) => handleMetadataChange('version', v)}
                  placeholder="1.0.0"
                  compact
                  hideHelperText
                  colors={{
                    input: 'var(--input-bg)',
                    border: 'var(--input-border)',
                    text: 'var(--text)',
                    textSecondary: 'var(--text-secondary)',
                    primary: 'var(--accent)',
                    bgSecondary: 'var(--panel-2)'
                  }}
                />
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--text)' }}>
                Name <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <input
                type="text"
                value={metadata.name}
                onChange={(e) => handleMetadataChange('name', e.target.value)}
                placeholder="My Custom Prompt"
                disabled={readOnly}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--text)' }}>
                Description
              </label>
              <textarea
                value={metadata.description}
                onChange={(e) => handleMetadataChange('description', e.target.value)}
                placeholder="A brief description of your prompt..."
                rows={2}
                disabled={readOnly}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Tags Section */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--text)' }}>
                <Tag size={12} style={{ color: 'var(--accent)' }} />
                Tags
                <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)' }}>(for search and categorization)</span>
              </label>
              <TagInput
                tags={metadata.tags}
                onChange={(tags) => handleMetadataChange('tags', tags)}
                placeholder="Add tags (press Enter or comma to add)"
                disabled={readOnly}
                theme={theme}
              />
            </div>

            {/* Parameters Section - Inline in Metadata */}
            <div data-section="params" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
              <div
                onClick={() => setShowParametersModal(true)}
                data-hint-target="parameters-section"
                style={{
                  cursor: 'pointer',
                  padding: '12px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: Object.keys(parsed.paramsSchema).length > 0 ? '12px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Settings size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      Parameters
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)' }}>
                      {Object.keys(parsed.paramsSchema).length > 0
                        ? `${Object.keys(parsed.paramsSchema).length} parameter${Object.keys(parsed.paramsSchema).length !== 1 ? 's' : ''}`
                        : 'Click to add parameters'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Click to manage →
                  </span>
                </div>

                {/* Parameter List - Compact format with type badges */}
                {Object.keys(parsed.paramsSchema).length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    alignItems: 'center'
                  }}>
                    {Object.entries(parsed.paramsSchema).map(([name, schema]: [string, any]) => {
                      const TypeIcon = getTypeIcon(schema.type)
                      const typeColors = getTypeColor(schema.type)

                      return (
                        <div
                          key={name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            background: 'var(--panel-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}
                        >
                          <span style={{
                            color: 'var(--text)',
                            fontWeight: 600,
                            fontFamily: 'monospace'
                          }}>
                            {name}
                          </span>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 5px',
                            background: typeColors.bg,
                            border: `1px solid ${typeColors.border}`,
                            borderRadius: '3px',
                            fontSize: '9px',
                            fontWeight: 600,
                            color: typeColors.text
                          }}>
                            <TypeIcon size={9} />
                            {schema.type}
                          </span>
                          {schema.required && (
                            <span style={{
                              padding: '1px 4px',
                              background: 'var(--accent)',
                              color: 'white',
                              borderRadius: '3px',
                              fontSize: '8px',
                              fontWeight: 700
                            }}>
                              REQ
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Warning for required inherited parameters that need values */}
                {requiredInheritedParams.length > 0 && (
                  <div style={{
                    marginTop: Object.keys(parsed.paramsSchema).length > 0 ? '12px' : '0',
                    padding: '10px 12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#ef4444'
                    }}>
                      <AlertTriangle size={14} />
                      Required Parameters Need Values
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4
                    }}>
                      These required parameters from the base template have no default value.
                      Set a default or they will fail at compile time:
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px'
                    }}>
                      {requiredInheritedParams.map(({ name, schema }) => {
                        const TypeIcon = getTypeIcon(schema.type)
                        return (
                          <div
                            key={name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px dashed rgba(239, 68, 68, 0.5)',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              setExpandedParams(prev => {
                                const next = new Set(prev)
                                next.add(name)
                                return next
                              })
                            }}
                          >
                            <TypeIcon size={10} style={{ color: '#ef4444' }} />
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#ef4444' }}>
                              {name}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                              ({schema.type}, required)
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Inherits Manager - Combined Package Imports & Template Inheritance */}
            <div style={{ gridColumn: '1 / -1' }} data-hint-target="inherits-section">
              <InheritsManager
                inheritsValue={parsed.frontmatter.inherits || ''}
                onInheritsChange={handleInheritsManagerChange}
                usingDeclarations={memoizedUsingDeclarations}
                onUsingDeclarationsChange={handleUsingDeclarationsChange}
                onPackageSearch={searchPackagesForManager}
                onLoadPackageFiles={fetchInheritsPackageFilesForManager}
                onLocalFileSearch={workspaceHandle ? searchLocalFilesForManager : undefined}
                onOpenInheritedFile={onOpenFile ? openInheritedFile : undefined}
                readOnly={readOnly}
              />
            </div>
          </div>

          {/* Specialty Sections (system, user, task, output, response, context) */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '20px', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  Specialty Sections
                </span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  Role-based and context sections for structured prompts
                </span>
              </div>
              {/* Add Section Button */}
              {Array.from(['system', 'user', 'task', 'output', 'response', 'context']).some(s => !visibleSpecialtySections.has(s)) && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowAddSectionMenu(!showAddSectionMenu)}
                    onBlur={(e) => {
                      // Delay to allow click events on menu items
                      setTimeout(() => setShowAddSectionMenu(false), 200)
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '10px',
                      background: 'transparent',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--accent)'
                      e.currentTarget.style.color = 'white'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--accent)'
                    }}
                    title="Add specialty section"
                  >
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                    <span>Add Section</span>
                  </button>

                  {/* Dropdown Menu */}
                  {showAddSectionMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        minWidth: '140px'
                      }}
                    >
                      {['system', 'user', 'task', 'output', 'response', 'context']
                        .filter(s => !visibleSpecialtySections.has(s))
                        .map(section => (
                          <div
                            key={section}
                            onClick={() => {
                              setVisibleSpecialtySections(prev => new Set([...prev, section]))
                              setShowAddSectionMenu(false)
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--text)',
                              textTransform: 'capitalize',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            {section}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div data-section="context">
              <PrompdContextArea
                sections={specialtySections.filter(s => visibleSpecialtySections.has(s.name))}
                value={specialtyFileSections}
                onChange={handleSpecialtyChange}
                onSelectFromBrowser={onSelectFileFromBrowser}
                onFileClick={onOpenFile ? openContextFile : undefined}
                hasFolderOpen={!!workspaceHandle}
                currentFilePath={currentFilePath}
                workspacePath={((workspaceHandle as unknown) as { _electronPath?: string })?._electronPath}
                variant="card"
              />
            </div>
          </div>
          </div>)}
        </div>)}

        {/* Content Body - XML Design View or Markdown Sections */}
        {isXmlContent ? (
          <div data-section="content">
            <XmlDesignView
              ref={xmlDesignViewRef}
              xmlContent={parsed.body}
              onChange={handleXmlBodyChange}
              theme={theme || 'dark'}
              readOnly={readOnly}
            />
          </div>
        ) : (
          /* Sections List (Markdown content) */
          <ContentSections
            sections={allDisplaySections}
            sectionOverrides={sectionOverrides}
            body={parsed.body}
            editingSection={editingSection}
            editContent={editContent}
            hasInheritance={hasInheritance}
            availableSections={availableSections}
            readOnly={readOnly || false}
            theme={theme || 'dark'}
            fullscreen={contentFullscreen}
            onToggleFullscreen={() => setContentFullscreen(f => !f)}
            onStartEditing={startEditing}
            onCancelEditing={cancelEditing}
            onSaveSection={saveSection}
            onEditContentChange={setEditContent}
            onAddSection={addSection}
            onDeleteSection={deleteSection}
            onRenameSection={renameSection}
            onReorderSections={reorderSections}
            onToggleVisibility={toggleSectionVisibility}
            onResetSection={resetSection}
            onBodyChange={handleBodyChange}
            variables={editableParams}
          />
        )}

        {/* Parameters Modal */}
        {showParametersModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => {
              persistParameterChanges()
              setShowParametersModal(false)
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(900px, 92vw)',
                maxHeight: '85vh',
                overflow: 'auto',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
              }}
            >
              {/* Modal Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={18} style={{ color: 'var(--accent)' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                    Parameters
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {Object.keys(parsed.paramsSchema).length} defined
                  </span>
                </div>
                <button
                  onClick={() => {
                    persistParameterChanges()
                    setShowParametersModal(false)
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px'
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '20px' }}>
                {/* Add Parameter Section */}
                <div style={{ marginBottom: '20px' }}>
                  {!isAddingParameter ? (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button
                        onClick={() => setIsAddingParameter(true)}
                        style={{
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 500,
                          background: 'var(--accent)',
                          color: 'var(--panel)',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span style={{ fontSize: '16px', lineHeight: '1' }}>+</span>
                        Add Parameter
                      </button>
                      <div style={{ flex: 1, borderTop: '1px solid var(--border)' }} />
                    </div>
                  ) : (
                    <div style={{
                      padding: '16px',
                      background: 'var(--panel-2)',
                      border: '2px solid var(--accent)',
                      borderRadius: '8px'
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text)' }}>
                        New Parameter
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={newParamName}
                          onChange={(e) => setNewParamName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addParameter()
                            if (e.key === 'Escape') cancelAddParameter()
                          }}
                          placeholder="parameter_name"
                          autoFocus
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '13px',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            background: 'var(--panel)',
                            color: 'var(--text)',
                            fontFamily: 'monospace'
                          }}
                        />
                        <button
                          onClick={addParameter}
                          disabled={!newParamName.trim()}
                          style={{
                            padding: '8px 16px',
                            fontSize: '13px',
                            background: newParamName.trim() ? 'var(--accent)' : 'var(--panel-2)',
                            color: newParamName.trim() ? 'var(--panel)' : 'var(--text-secondary)',
                            border: `1px solid ${newParamName.trim() ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: '6px',
                            cursor: newParamName.trim() ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={14} />
                          Add
                        </button>
                        <button
                          onClick={cancelAddParameter}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            background: 'transparent',
                            color: 'var(--text)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                        Press Enter to add, Escape to cancel
                      </div>
                    </div>
                  )}
                </div>

                {/* Upload JSON Section */}
                <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ flex: 1, borderTop: '1px solid var(--border)' }} />
                  <label style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <FileText size={14} />
                    Upload JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleJsonUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <div style={{ flex: 1, borderTop: '1px solid var(--border)' }} />
                </div>

                {/* Editable Parameters Grid */}
                {Object.keys(editableParams).length > 0 ? (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text)' }}>
                      Defined Parameters
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                      gap: '12px'
                    }}>
                      {Object.entries(editableParams).map(([name, schema]) => {
                        const isExpanded = expandedParams.has(name)
                        return (
                          <div
                            key={name}
                            style={{
                              background: 'var(--panel-2)',
                              border: `1px solid ${isExpanded ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: '8px',
                              overflow: 'hidden',
                              transition: 'border 0.2s'
                            }}
                          >
                            <div
                              onClick={() => toggleParameter(name)}
                              style={{
                                padding: '12px 14px',
                                cursor: 'pointer',
                                userSelect: 'none'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  flex: 1,
                                  minWidth: 0
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: 'var(--text-secondary)',
                                    transition: 'transform 0.2s',
                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                    display: 'inline-block',
                                    flexShrink: 0
                                  }}>▶</span>

                                  {/* Type icon with colored badge */}
                                  {(() => {
                                    const TypeIcon = getTypeIcon(schema.type)
                                    const typeColors = getTypeColor(schema.type)
                                    return (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '3px 7px',
                                        background: typeColors.bg,
                                        border: `1px solid ${typeColors.border}`,
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        color: typeColors.text,
                                        flexShrink: 0
                                      }}>
                                        <TypeIcon size={11} />
                                        {schema.type}
                                      </span>
                                    )
                                  })()}

                                  {/* Parameter name */}
                                  <span style={{
                                    fontFamily: 'monospace',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: 'var(--text)',
                                    flexShrink: 0
                                  }}>
                                    {name}
                                  </span>

                                  {/* Required badge */}
                                  {schema.required && (
                                    <span style={{
                                      padding: '2px 6px',
                                      background: 'var(--accent)',
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      flexShrink: 0,
                                      letterSpacing: '0.5px'
                                    }}>
                                      REQ
                                    </span>
                                  )}

                                  {/* Has default indicator */}
                                  {schema.default !== undefined && (
                                    <div title={`Has default value: ${JSON.stringify(schema.default)}`}>
                                      <CheckCircle
                                        size={13}
                                        style={{ color: 'var(--success)', flexShrink: 0 }}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Delete button */}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const confirmed = await showConfirm({
                                      title: 'Delete Parameter',
                                      message: `Delete parameter "${name}"?`,
                                      confirmLabel: 'Delete',
                                      cancelLabel: 'Cancel',
                                      confirmVariant: 'danger'
                                    })
                                    if (confirmed) {
                                      deleteParameter(name)
                                    }
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    flexShrink: 0,
                                    borderRadius: '4px',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                                    e.currentTarget.style.color = '#ef4444'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color = 'var(--text-secondary)'
                                  }}
                                  title="Delete parameter"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{ padding: '0 14px 14px 14px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                  {/* Type Selector with Icon */}
                                  <div>
                                    <label style={{
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      color: 'var(--text-secondary)',
                                      display: 'block',
                                      marginBottom: '6px'
                                    }}>
                                      Type
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                      {(() => {
                                        const TypeIcon = getTypeIcon(schema.type)
                                        return (
                                          <TypeIcon
                                            size={14}
                                            style={{
                                              position: 'absolute',
                                              left: '10px',
                                              top: '50%',
                                              transform: 'translateY(-50%)',
                                              color: 'var(--text-secondary)',
                                              pointerEvents: 'none'
                                            }}
                                          />
                                        )
                                      })()}
                                      <select
                                        value={schema.type}
                                        onChange={(e) => {
                                          e.stopPropagation()
                                          updateParameter(name, { type: e.target.value })
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        onFocus={(e) => e.stopPropagation()}
                                        style={{
                                          width: '100%',
                                          padding: '8px 12px 8px 32px',
                                          fontSize: '12px',
                                          border: '1px solid var(--input-border)',
                                          borderRadius: '6px',
                                          background: 'var(--input-bg)',
                                          color: 'var(--text)',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <option value="string">string</option>
                                        <option value="number">number</option>
                                        <option value="boolean">boolean</option>
                                        <option value="array">array</option>
                                        <option value="object">object</option>
                                      </select>
                                    </div>
                                  </div>

                                  {/* Required Toggle */}
                                  <div>
                                    <label style={{
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      color: 'var(--text-secondary)',
                                      display: 'block',
                                      marginBottom: '6px'
                                    }}>
                                      Required
                                    </label>
                                    <div
                                      onClick={() => updateParameter(name, { required: !schema.required })}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 12px',
                                        background: 'var(--input-bg)',
                                        border: '1px solid var(--input-border)',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        height: '36px'
                                      }}
                                    >
                                      <div style={{
                                        position: 'relative',
                                        width: '36px',
                                        height: '20px',
                                        background: schema.required ? 'var(--accent)' : 'var(--muted)',
                                        borderRadius: '10px',
                                        transition: 'background 0.2s',
                                        flexShrink: 0
                                      }}>
                                        <div style={{
                                          position: 'absolute',
                                          top: '2px',
                                          left: schema.required ? '18px' : '2px',
                                          width: '16px',
                                          height: '16px',
                                          background: 'white',
                                          borderRadius: '50%',
                                          transition: 'left 0.2s',
                                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                        }} />
                                      </div>
                                      <span style={{
                                        fontSize: '12px',
                                        color: schema.required ? 'var(--accent)' : 'var(--text-secondary)',
                                        fontWeight: schema.required ? 600 : 400
                                      }}>
                                        {schema.required ? 'Yes' : 'No'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Allowed Values (enum) - for string and array types */}
                                {(schema.type === 'string' || schema.type === 'array') && (
                                  <div style={{ marginBottom: '12px' }}>
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (schema.enum !== undefined) {
                                          updateParameter(name, { enum: undefined })
                                        } else {
                                          updateParameter(name, { enum: [] })
                                        }
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        cursor: 'pointer',
                                        marginBottom: (schema.enum !== undefined) ? '8px' : '0'
                                      }}
                                    >
                                      <div style={{
                                        width: '16px',
                                        height: '16px',
                                        border: '2px solid ' + (schema.enum !== undefined ? 'var(--accent)' : 'var(--input-border)'),
                                        borderRadius: '4px',
                                        background: schema.enum !== undefined ? 'var(--accent)' : 'transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s',
                                        flexShrink: 0
                                      }}>
                                        {schema.enum !== undefined && (
                                          <Check size={10} style={{ color: 'white' }} />
                                        )}
                                      </div>
                                      <span style={{
                                        fontSize: '12px',
                                        color: schema.enum !== undefined ? 'var(--text)' : 'var(--text-secondary)'
                                      }}>
                                        Restrict to allowed values
                                      </span>
                                    </div>

                                    {/* Pill input for enum values */}
                                    {schema.enum !== undefined && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          display: 'flex',
                                          flexWrap: 'wrap',
                                          gap: '6px',
                                          padding: '8px',
                                          background: 'var(--input-bg)',
                                          border: '1px solid var(--input-border)',
                                          borderRadius: '6px',
                                          minHeight: '40px',
                                          alignItems: 'center'
                                        }}
                                      >
                                        {/* Existing pills */}
                                        {(schema.enum || []).map((value, idx) => (
                                          <div
                                            key={idx}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '4px 8px',
                                              background: 'var(--accent)',
                                              color: 'white',
                                              borderRadius: '4px',
                                              fontSize: '11px',
                                              fontFamily: 'monospace'
                                            }}
                                          >
                                            <span>{value}</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                const newEnum = [...(schema.enum || [])]
                                                newEnum.splice(idx, 1)
                                                updateParameter(name, { enum: newEnum })
                                              }}
                                              style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'rgba(255,255,255,0.7)',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                fontSize: '14px',
                                                lineHeight: 1
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                                              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                                            >
                                              <X size={12} />
                                            </button>
                                          </div>
                                        ))}
                                        {/* Input for new value */}
                                        <input
                                          type="text"
                                          placeholder={schema.enum?.length ? "Add value..." : "Press Enter to add value..."}
                                          onKeyDown={(e) => {
                                            e.stopPropagation()
                                            if (e.key === 'Enter') {
                                              e.preventDefault()
                                              const input = e.currentTarget
                                              const value = input.value.trim()
                                              if (value && !(schema.enum || []).includes(value)) {
                                                updateParameter(name, { enum: [...(schema.enum || []), value] })
                                                input.value = ''
                                              }
                                            }
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          onFocus={(e) => e.stopPropagation()}
                                          style={{
                                            flex: 1,
                                            minWidth: '120px',
                                            padding: '4px 8px',
                                            fontSize: '11px',
                                            border: 'none',
                                            background: 'transparent',
                                            color: 'var(--text)',
                                            outline: 'none',
                                            fontFamily: 'monospace'
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Description */}
                                <div style={{ marginBottom: '12px' }}>
                                  <label style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--text-secondary)',
                                    display: 'block',
                                    marginBottom: '6px'
                                  }}>
                                    Description
                                  </label>
                                  <textarea
                                    value={schema.description || ''}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      updateParameter(name, { description: e.target.value })
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onFocus={(e) => e.stopPropagation()}
                                    placeholder="Describe what this parameter does..."
                                    rows={2}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      fontSize: '12px',
                                      border: '1px solid var(--input-border)',
                                      borderRadius: '6px',
                                      background: 'var(--input-bg)',
                                      color: 'var(--text)',
                                      resize: 'vertical',
                                      fontFamily: 'inherit'
                                    }}
                                  />
                                </div>

                                {/* Default Value */}
                                <div>
                                  <label style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--text-secondary)',
                                    display: 'block',
                                    marginBottom: '6px'
                                  }}>
                                    Default Value
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>
                                      (optional)
                                    </span>
                                  </label>
                                  {schema.type === 'string' ? (
                                    <input
                                      type="text"
                                      value={schema.default !== undefined ? schema.default : ''}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        updateParameter(name, { default: e.target.value || undefined })
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => e.stopPropagation()}
                                      placeholder="Enter default string..."
                                      style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        border: '1px solid var(--input-border)',
                                        borderRadius: '6px',
                                        background: 'var(--input-bg)',
                                        color: 'var(--text)',
                                        fontFamily: 'monospace'
                                      }}
                                    />
                                  ) : schema.type === 'number' ? (
                                    <input
                                      type="number"
                                      value={schema.default !== undefined ? schema.default : ''}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        const val = e.target.value ? parseFloat(e.target.value) : undefined
                                        updateParameter(name, { default: val })
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => e.stopPropagation()}
                                      placeholder="Enter default number..."
                                      style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        border: '1px solid var(--input-border)',
                                        borderRadius: '6px',
                                        background: 'var(--input-bg)',
                                        color: 'var(--text)',
                                        fontFamily: 'monospace'
                                      }}
                                    />
                                  ) : schema.type === 'boolean' ? (
                                    <select
                                      value={schema.default !== undefined ? String(schema.default) : ''}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        const val = e.target.value === '' ? undefined : e.target.value === 'true'
                                        updateParameter(name, { default: val })
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => e.stopPropagation()}
                                      style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        border: '1px solid var(--input-border)',
                                        borderRadius: '6px',
                                        background: 'var(--input-bg)',
                                        color: 'var(--text)',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <option value="">No default</option>
                                      <option value="true">true</option>
                                      <option value="false">false</option>
                                    </select>
                                  ) : schema.type === 'array' && schema.enum && schema.enum.length > 0 ? (
                                    /* Pill selector for array params with enum - toggle items on/off */
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {schema.enum.map((enumVal) => {
                                        const currentDefaults = Array.isArray(schema.default) ? schema.default : []
                                        const isSelected = currentDefaults.includes(enumVal)
                                        return (
                                          <button
                                            key={enumVal}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              const updated = isSelected
                                                ? currentDefaults.filter((v: string) => v !== enumVal)
                                                : [...currentDefaults, enumVal]
                                              updateParameter(name, { default: updated.length > 0 ? updated : undefined })
                                            }}
                                            style={{
                                              padding: '4px 10px',
                                              fontSize: '11px',
                                              fontWeight: 500,
                                              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--input-border)'}`,
                                              borderRadius: '12px',
                                              background: isSelected ? 'var(--accent)' : 'transparent',
                                              color: isSelected ? 'white' : 'var(--text-secondary)',
                                              cursor: 'pointer',
                                              transition: 'all 0.15s ease'
                                            }}
                                          >
                                            {enumVal}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <textarea
                                      value={schema.default !== undefined ? JSON.stringify(schema.default, null, 2) : ''}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        try {
                                          const val = e.target.value ? JSON.parse(e.target.value) : undefined
                                          updateParameter(name, { default: val })
                                        } catch {
                                          // Invalid JSON, ignore
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => e.stopPropagation()}
                                      placeholder={schema.type === 'array' ? '["item1", "item2"]' : '{"key": "value"}'}
                                      rows={3}
                                      style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        border: '1px solid var(--input-border)',
                                        borderRadius: '6px',
                                        background: 'var(--input-bg)',
                                        color: 'var(--text)',
                                        fontFamily: 'monospace',
                                        resize: 'vertical'
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    background: 'var(--panel-2)',
                    border: '2px dashed var(--border)',
                    borderRadius: '8px',
                    marginBottom: '24px'
                  }}>
                    <Settings
                      size={48}
                      style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '16px' }}
                    />
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: '8px'
                    }}>
                      No Parameters Defined
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginBottom: '16px'
                    }}>
                      Click "+ Add Parameter" above to define input parameters for this prompt
                    </div>
                  </div>
                )}

                {/* Uploaded JSON Parameters (Read-only, grouped visually) */}
                {uploadedParams && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '12px',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Uploaded Parameters (Read-only)
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 400,
                          padding: '2px 8px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: 'var(--accent)',
                          borderRadius: '4px',
                          border: '1px solid rgba(59, 130, 246, 0.2)'
                        }}>
                          {Object.keys(uploadedParams).length} param{Object.keys(uploadedParams).length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setUploadedParams(null)
                          setUploadedParamsJson(null)
                        }}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                          e.currentTarget.style.color = 'rgb(239, 68, 68)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }}
                        title="Remove uploaded parameters"
                      >
                        <X size={12} />
                        Clear
                      </button>
                    </div>
                    <div style={{
                      padding: '16px',
                      background: 'var(--panel-2)',
                      border: '2px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '8px'
                    }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '12px'
                      }}>
                        {Object.entries(uploadedParams).map(([name, value]) => (
                          <div
                            key={name}
                            style={{
                              padding: '12px',
                              background: 'var(--panel)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px'
                            }}
                          >
                            <div style={{
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--text)',
                              marginBottom: '6px'
                            }}>
                              {name}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              fontFamily: 'monospace',
                              wordBreak: 'break-all'
                            }}>
                              <span style={{ color: 'var(--muted)' }}>value:</span> {JSON.stringify(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {Object.keys(editableParams).length === 0 && !uploadedParams && (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '13px'
                  }}>
                    No parameters defined yet. Click "+ Add Parameter" or upload a JSON file to get started.
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 20px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={() => {
                    persistParameterChanges()
                    setShowParametersModal(false)
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Dialog for section deletion */}
      <ConfirmDialogComponent />

      {/* Error Message Modal (replaces native alert) */}
      {errorMessage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setErrorMessage(null)}
        >
          <div
            style={{
              background: 'var(--panel-2, var(--background, #ffffff))',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--foreground)'
            }}>
              Error
            </h3>
            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'var(--text-muted)',
              lineHeight: 1.5
            }}>
              {errorMessage}
            </p>
            <button
              onClick={() => setErrorMessage(null)}
              style={{
                padding: '10px 20px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Minimap overlay */}
    {showMinimap && minimapSections.length > 0 && (
      <ContentMinimap
        sections={minimapSections}
        theme={theme || 'dark'}
        containerRef={designViewContainerRef}
        onScrollToSection={scrollToSection}
      />
    )}
    </div>
  )
}
