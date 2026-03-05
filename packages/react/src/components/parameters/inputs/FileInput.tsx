/**
 * File input component for file-type parameters
 * Supports drag & drop, click to browse, and file preview
 */

import { useState, useRef } from 'react'
import { clsx } from 'clsx'
import { X, Upload, FileText } from 'lucide-react'
import type { ParameterInputProps } from '../utils/types'

export interface FileValue {
  name: string
  content: string
  type: string
  size: number
  path?: string
}

interface FileInputProps extends ParameterInputProps<FileValue | undefined> {
  /** Comma-separated accepted file extensions (e.g., '.pdf,.docx,.csv') */
  accept?: string
  /** Max file size in bytes (default 10MB) */
  maxSize?: number
}

const DEFAULT_ACCEPT = [
  '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf',
  '.xlsx', '.xls', '.csv', '.tsv',
  '.pptx', '.ppt',
  '.json', '.yaml', '.yml', '.xml',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h',
].join(',')

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileLabel(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const labels: Record<string, string> = {
    pdf: 'PDF', doc: 'DOC', docx: 'DOC',
    xlsx: 'XLS', xls: 'XLS', csv: 'CSV', tsv: 'TSV',
    pptx: 'PPT', ppt: 'PPT',
    json: 'JSON', yaml: 'YAML', yml: 'YAML', xml: 'XML',
    png: 'IMG', jpg: 'IMG', jpeg: 'IMG', gif: 'IMG', webp: 'IMG', svg: 'SVG',
    txt: 'TXT', md: 'MD', rtf: 'RTF',
  }
  return labels[ext] || ext.toUpperCase() || 'FILE'
}

export function FileInput({
  value,
  onChange,
  disabled = false,
  error: externalError,
  className,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
}: FileInputProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const error = externalError || localError

  const processFile = async (file: File) => {
    setLocalError(null)

    if (file.size > maxSize) {
      setLocalError(`File too large. Maximum size is ${formatFileSize(maxSize)}.`)
      return
    }

    try {
      let content: string
      if (file.type.startsWith('image/')) {
        const buffer = await file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        content = `data:${file.type};base64,${base64}`
      } else {
        content = await file.text()
      }

      onChange({
        name: file.name,
        content,
        type: file.type || 'application/octet-stream',
        size: file.size,
      })
    } catch {
      setLocalError('Failed to read file')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await processFile(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await processFile(files[0])
    }
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(undefined)
    setLocalError(null)
  }

  const hasFile = value && value.name

  return (
    <div className={clsx('prompd-file-input', className)}>
      {hasFile ? (
        <div className={clsx(
          'flex items-center gap-3 p-3 rounded-md border',
          'bg-slate-50 dark:bg-slate-800/50',
          'border-slate-200 dark:border-slate-700'
        )}>
          <div className={clsx(
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
            'bg-blue-100 dark:bg-blue-900/30'
          )}>
            {value.type?.startsWith('image/') && value.content?.startsWith('data:') ? (
              <img
                src={value.content}
                alt={value.name}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                {getFileLabel(value.name)}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
              {value.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatFileSize(value.size)}
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className={clsx(
                'flex-shrink-0 p-1.5 rounded-md transition-colors',
                'text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400'
              )}
              title="Remove file"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={clsx(
            'relative border-2 border-dashed rounded-lg p-4 text-center transition-all',
            disabled
              ? 'opacity-50 cursor-not-allowed border-slate-300 dark:border-slate-600'
              : isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 cursor-copy'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            disabled={disabled}
            className="hidden"
          />
          <div className="space-y-2">
            <div className={clsx(
              'mx-auto w-10 h-10 rounded-full flex items-center justify-center',
              isDragging
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : 'bg-slate-100 dark:bg-slate-800'
            )}>
              {isDragging ? (
                <FileText size={20} className="text-blue-500 dark:text-blue-400" />
              ) : (
                <Upload size={20} className="text-slate-400 dark:text-slate-500" />
              )}
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="text-blue-500 dark:text-blue-400 font-medium">Click to upload</span>{' '}
                or drag and drop
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                PDF, Word, Excel, Images, CSV, JSON, and more
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
