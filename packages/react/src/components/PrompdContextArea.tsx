import { useRef, useState } from 'react'
import { Upload, X, FileText, FolderOpen } from 'lucide-react'
import type { PrompdContextAreaProps } from '../types'
import { clsx } from 'clsx'

export function PrompdContextArea({
  sections,
  value,
  onChange,
  onFileUpload,
  onSelectFromBrowser,
  onFileClick,
  hasFolderOpen = false,
  activeSection,
  variant = 'compact',
  className
}: PrompdContextAreaProps) {
  const handleFileAdd = async (sectionName: string, files: FileList) => {
    const fileArray = Array.from(files)

    if (onFileUpload) {
      // Use custom upload handler
      const filePaths = await onFileUpload(sectionName, fileArray)
      updateSection(sectionName, [...(value.get(sectionName) || []), ...filePaths])
    } else {
      // Default: Just store file names
      const fileNames = fileArray.map(f => f.name)
      updateSection(sectionName, [...(value.get(sectionName) || []), ...fileNames])
    }
  }

  const handleFileRemove = (sectionName: string, fileIndex: number) => {
    const files = value.get(sectionName) || []
    const newFiles = files.filter((_, i) => i !== fileIndex)
    updateSection(sectionName, newFiles)
  }

  // Handle file path drops from FileExplorer
  const handleFilePathDrop = (sectionName: string, filePath: string) => {
    const section = sections.find(s => s.name === sectionName)
    if (!section) return

    const currentFiles = value.get(sectionName) || []
    const newFiles = section.allowMultiple ? [...currentFiles, filePath] : [filePath]
    updateSection(sectionName, newFiles)
  }

  const updateSection = (sectionName: string, files: string[]) => {
    const newValue = new Map(value)
    if (files.length === 0) {
      newValue.delete(sectionName)
    } else {
      newValue.set(sectionName, files)
    }
    onChange(newValue)
  }

  return (
    <div className={clsx('grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3', className)}>
      {sections.map(section => (
        <FileSection
          key={section.name}
          section={section}
          files={value.get(section.name) || []}
          onFileAdd={handleFileAdd}
          onFileRemove={handleFileRemove}
          onFilePathDrop={handleFilePathDrop}
          onFileClick={onFileClick}
          onSelectFromBrowser={onSelectFromBrowser}
          hasFolderOpen={hasFolderOpen}
          isActive={activeSection === section.name}
          variant={variant}
        />
      ))}
    </div>
  )
}

function FileSection({
  section,
  files,
  onFileAdd,
  onFileRemove,
  onFilePathDrop,
  onFileClick,
  onSelectFromBrowser,
  hasFolderOpen = false,
  isActive = false,
  variant = 'compact'
}: {
  section: PrompdContextAreaProps['sections'][0]
  files: string[]
  onFileAdd: (sectionName: string, files: FileList) => void
  onFileRemove: (sectionName: string, index: number) => void
  onFilePathDrop: (sectionName: string, filePath: string) => void
  onFileClick?: (filePath: string) => void
  onSelectFromBrowser?: (section: string) => void
  hasFolderOpen?: boolean
  isActive?: boolean
  variant?: 'compact' | 'card'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleClick = () => {
    // If folder is open and browser selection is available, use that
    if (hasFolderOpen && onSelectFromBrowser) {
      onSelectFromBrowser(section.name)
    } else {
      // Otherwise fall back to file upload
      inputRef.current?.click()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileAdd(section.name, e.target.files)
      e.target.value = '' // Reset input
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Allow both file drops and internal file path drops
    e.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set isDragging false if we're actually leaving the drop zone
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    // Check for file system files first
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileAdd(section.name, e.dataTransfer.files)
      return
    }

    // Check for internal file path drops from FileExplorer
    const contextFileData = e.dataTransfer.getData('application/x-prompd-context-file')
    if (contextFileData) {
      try {
        const { path } = JSON.parse(contextFileData)
        if (path) {
          onFilePathDrop(section.name, path)
        }
      } catch (err) {
        console.error('Failed to parse dropped file data:', err)
      }
      return
    }

    // Fallback to plain text (file path)
    const textData = e.dataTransfer.getData('text/plain')
    if (textData) {
      onFilePathDrop(section.name, textData)
    }
  }

  const sectionColors = {
    system: {
      gradient: 'from-red-500 to-orange-500',
      border: 'border-orange-400 dark:border-orange-600',
      bg: 'bg-orange-50/50 dark:bg-orange-950/20',
      hoverBorder: 'hover:border-orange-400 dark:hover:border-orange-600',
      hoverBg: 'hover:bg-orange-50 dark:hover:bg-orange-950/20',
      text: 'text-orange-600 dark:text-orange-400'
    },
    user: {
      gradient: 'from-purple-500 to-pink-500',
      border: 'border-purple-400 dark:border-purple-600',
      bg: 'bg-purple-50/50 dark:bg-purple-950/20',
      hoverBorder: 'hover:border-purple-400 dark:hover:border-purple-600',
      hoverBg: 'hover:bg-purple-50 dark:hover:bg-purple-950/20',
      text: 'text-purple-600 dark:text-purple-400'
    },
    context: {
      gradient: 'from-blue-500 to-cyan-500',
      border: 'border-cyan-400 dark:border-cyan-600',
      bg: 'bg-cyan-50/50 dark:bg-cyan-950/20',
      hoverBorder: 'hover:border-cyan-400 dark:hover:border-cyan-600',
      hoverBg: 'hover:bg-cyan-50 dark:hover:bg-cyan-950/20',
      text: 'text-cyan-600 dark:text-cyan-400'
    }
  }

  const colorScheme = sectionColors[section.name as keyof typeof sectionColors] || {
    gradient: 'from-slate-500 to-slate-600',
    border: 'border-slate-400 dark:border-slate-600',
    bg: 'bg-slate-50/50 dark:bg-slate-950/20',
    hoverBorder: 'hover:border-slate-400 dark:hover:border-slate-600',
    hoverBg: 'hover:bg-slate-50 dark:hover:bg-slate-950/20',
    text: 'text-slate-600 dark:text-slate-400'
  }

  const hasFiles = files.length > 0

  // Card variant styles - filled backgrounds with better visual hierarchy
  const getCardStyles = () => {
    if (variant === 'card') {
      if (isDragging) {
        return `${colorScheme.border} ${colorScheme.bg} shadow-lg border-dashed min-h-[80px]`
      }
      if (isActive) {
        return `border-blue-500 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-md border-solid min-h-[80px]`
      }
      // Card variant always has filled backgrounds
      return `${colorScheme.border} ${colorScheme.bg} hover:shadow-lg hover:-translate-y-1 border-solid min-h-[80px]`
    }

    // Compact variant (default) - original behavior
    if (isDragging) {
      return `${colorScheme.border} ${colorScheme.bg} shadow-lg border-dashed`
    }
    if (isActive) {
      return `border-blue-500 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-md border-solid`
    }
    if (hasFiles) {
      return `${colorScheme.border} bg-white dark:bg-slate-800 hover:shadow-md hover:-translate-y-0.5 border-solid`
    }
    return `${colorScheme.border} bg-slate-50 dark:bg-slate-900 hover:shadow-sm hover:-translate-y-0.5 border-dashed`
  }

  return (
    <div
      className={clsx("relative", isHovered && hasFiles && "z-[10000]")}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={section.allowMultiple}
        accept={section.accept}
        onChange={handleChange}
        className="hidden"
      />

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={clsx(
          'border-2 rounded-lg relative group',
          'transition-all duration-200 ease-out',
          'cursor-pointer',
          getCardStyles()
        )}
        title={section.description}
      >
        {variant === 'card' ? (
          /* Card variant - expanded view with metadata and files */
          <div className="flex flex-col gap-2 p-3">
            {/* Header with icon and label */}
            <div className="flex items-center gap-2">
              <div className={clsx(
                'flex-shrink-0 w-6 h-6 rounded flex items-center justify-center',
                `bg-gradient-to-br ${colorScheme.gradient}`
              )}>
                {hasFolderOpen && onSelectFromBrowser ? (
                  <FolderOpen className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Upload className="w-3.5 h-3.5 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={clsx(
                  'text-sm font-semibold',
                  hasFiles ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'
                )}>
                  {section.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {section.allowMultiple ? 'Multiple files' : 'Single file'}
                </div>
              </div>
            </div>

            {/* Files list or empty state */}
            {hasFiles ? (
              <div className="space-y-1 mt-1">
                {files.map((file, index) => (
                  <div
                    key={`${file}-${index}`}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white/50 dark:bg-slate-800/50 group hover:bg-white dark:hover:bg-slate-800"
                    style={{ pointerEvents: 'auto' }}
                  >
                    <div
                      className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onFileClick) {
                          onFileClick(file)
                        }
                      }}
                    >
                      <FileText className={clsx(
                        'w-3.5 h-3.5 flex-shrink-0',
                        colorScheme.text
                      )} />
                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate font-mono">
                        {file.split('/').pop()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onFileRemove(section.name, index)
                      }}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 hover:bg-red-100 dark:hover:bg-red-900/30 rounded p-0.5 transition-all"
                    >
                      <X className="w-3 h-3 text-slate-400 hover:text-red-600" />
                    </button>
                  </div>
                ))}
                {/* Drop zone hint when dragging - always visible at bottom for multi-file sections */}
                {section.allowMultiple && (
                  <div
                    className={clsx(
                      'text-center py-2 px-3 rounded border-2 border-dashed transition-all',
                      isDragging
                        ? `${colorScheme.border} ${colorScheme.bg}`
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'
                    )}
                    style={{ pointerEvents: 'none' }}
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                      {isDragging ? 'Drop to add more files' : 'Drag & drop or click to add more'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  {hasFolderOpen ? 'Drag from Explorer or click to select' : `Click to add ${section.allowMultiple ? 'files' : 'a file'}`}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Compact variant - original minimal design */
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {/* Icon */}
              <div className={clsx(
                'flex-shrink-0 w-5 h-5 rounded flex items-center justify-center',
                `bg-gradient-to-br ${colorScheme.gradient}`
              )}>
                {hasFolderOpen && onSelectFromBrowser ? (
                  <FolderOpen className="w-3 h-3 text-white" />
                ) : (
                  <Upload className="w-3 h-3 text-white" />
                )}
              </div>

              {/* Label and file count inline */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className={clsx(
                  'text-sm font-medium',
                  hasFiles ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                )}>
                  {section.label}
                </span>
                {hasFiles && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {files.length} {files.length === 1 ? 'File' : 'Files'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* File list dropdown - only for compact variant, shown on hover when has files */}
      {variant === 'compact' && hasFiles && isHovered && (
        <div className="absolute top-full left-0 right-0 z-[9999] mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 space-y-1">
          {files.map((file, index) => (
            <div
              key={`${file}-${index}`}
              className={clsx(
                'flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs',
                'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900'
              )}
            >
              <div
                className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onFileClick) {
                    onFileClick(file)
                  }
                }}
              >
                <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                <span className="text-slate-700 dark:text-slate-300 truncate">
                  {file.split('/').pop()}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onFileRemove(section.name, index)
                }}
                className="flex-shrink-0 hover:bg-red-100 dark:hover:bg-red-900/30 rounded p-1 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
