/**
 * Base64 input component for base64-type parameters
 * Supports paste of base64 strings and file upload with auto-conversion
 * Shows decoded info (size, image preview) when possible
 */

import { useState, useRef, useMemo } from 'react'
import { clsx } from 'clsx'
import { X, Image, FileText, Clipboard } from 'lucide-react'
import type { ParameterInputProps } from '../utils/types'
import { MAX_LENGTHS } from '../utils/validation'

interface Base64InputProps extends ParameterInputProps<string | undefined> {
  /** Max file size in bytes for upload (default 10MB) */
  maxSize?: number
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Parse a data URI into its components, or return null if not a data URI */
function parseDataUri(value: string): { mimeType: string; data: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/)
  if (match) return { mimeType: match[1], data: match[2] }
  return null
}

/** Estimate decoded size from base64 string length */
function estimateDecodedSize(base64: string): number {
  const len = base64.length
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((len * 3) / 4) - padding
}

export function Base64Input({
  value,
  onChange,
  disabled = false,
  error: externalError,
  className,
  maxSize = DEFAULT_MAX_SIZE,
}: Base64InputProps) {
  const [localError, setLocalError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const error = externalError || localError

  // Analyze the current value
  const analysis = useMemo(() => {
    if (!value || typeof value !== 'string') return null

    const dataUri = parseDataUri(value)
    if (dataUri) {
      return {
        isDataUri: true,
        isImage: dataUri.mimeType.startsWith('image/'),
        mimeType: dataUri.mimeType,
        rawBase64: dataUri.data,
        decodedSize: estimateDecodedSize(dataUri.data),
        previewSrc: value,
      }
    }

    // Plain base64 string
    return {
      isDataUri: false,
      isImage: false,
      mimeType: null,
      rawBase64: value,
      decodedSize: estimateDecodedSize(value),
      previewSrc: null,
    }
  }, [value])

  const handleFileUpload = async (file: File) => {
    setLocalError(null)

    if (file.size > maxSize) {
      setLocalError(`File too large. Maximum size is ${formatSize(maxSize)}.`)
      return
    }

    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      const dataUri = `data:${file.type || 'application/octet-stream'};base64,${base64}`
      onChange(dataUri)
    } catch {
      setLocalError('Failed to read file')
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await handleFileUpload(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await handleFileUpload(files[0])
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const handlePaste = () => {
    navigator.clipboard.readText().then(text => {
      const trimmed = text.trim()
      if (!trimmed) return

      // Validate it looks like base64 or a data URI
      const isDataUri = trimmed.startsWith('data:')
      const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(trimmed.replace(/\s/g, ''))

      if (!isDataUri && !isBase64) {
        setLocalError('Clipboard content does not appear to be valid base64')
        return
      }

      setLocalError(null)
      onChange(trimmed)
    }).catch(() => {
      setLocalError('Failed to read clipboard')
    })
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, MAX_LENGTHS.text)
    setLocalError(null)
    onChange(newValue || undefined)
  }

  const handleClear = () => {
    onChange(undefined)
    setLocalError(null)
  }

  const hasValue = !!value

  return (
    <div className={clsx('prompd-base64-input', className)}>
      {hasValue && analysis ? (
        <div className="space-y-2">
          {/* Preview */}
          {analysis.isImage && analysis.previewSrc ? (
            <div className={clsx(
              'relative rounded-md border overflow-hidden',
              'border-slate-200 dark:border-slate-700',
              'bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#334155_0%_25%,transparent_0%_50%)]',
              'bg-[length:16px_16px]'
            )}>
              <img
                src={analysis.previewSrc}
                alt="Base64 preview"
                className="max-h-40 max-w-full mx-auto block"
              />
            </div>
          ) : (
            <div className={clsx(
              'flex items-center gap-3 p-3 rounded-md border',
              'bg-slate-50 dark:bg-slate-800/50',
              'border-slate-200 dark:border-slate-700'
            )}>
              <div className={clsx(
                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                'bg-purple-100 dark:bg-purple-900/30'
              )}>
                <FileText size={20} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Base64 encoded data
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {analysis.mimeType && <span>{analysis.mimeType} - </span>}
                  {formatSize(analysis.decodedSize)} decoded
                  {' - '}
                  {formatSize(analysis.rawBase64.length)} encoded
                </p>
              </div>
            </div>
          )}

          {/* Info bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {analysis.mimeType && (
                <span className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded font-mono',
                  'bg-slate-100 dark:bg-slate-700',
                  'text-slate-500 dark:text-slate-400'
                )}>
                  {analysis.mimeType}
                </span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formatSize(analysis.decodedSize)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {!disabled && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRaw(!showRaw)}
                    className={clsx(
                      'text-xs px-1.5 py-0.5 rounded transition-colors',
                      'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                      'hover:bg-slate-100 dark:hover:bg-slate-700'
                    )}
                  >
                    {showRaw ? 'Hide raw' : 'Show raw'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className={clsx(
                      'p-1 rounded transition-colors',
                      'text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400'
                    )}
                    title="Clear"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Raw base64 textarea (toggled) */}
          {showRaw && (
            <textarea
              value={value}
              onChange={handleTextChange}
              disabled={disabled}
              rows={4}
              spellCheck={false}
              className={clsx(
                'w-full px-3 py-2 text-xs rounded-md transition-colors resize-y',
                'bg-white dark:bg-slate-900',
                'border border-slate-300 dark:border-slate-600',
                'text-slate-800 dark:text-slate-200',
                'focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:border-blue-500',
                'font-mono break-all',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            />
          )}
        </div>
      ) : (
        /* Empty state - upload or paste */
        <div className="space-y-2">
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
            onDrop={handleDrop}
            onClick={() => !disabled && inputRef.current?.click()}
            className={clsx(
              'border-2 border-dashed rounded-lg p-4 text-center transition-all',
              disabled
                ? 'opacity-50 cursor-not-allowed border-slate-300 dark:border-slate-600'
                : 'border-slate-300 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={disabled}
              className="hidden"
            />
            <div className="space-y-2">
              <div className={clsx(
                'mx-auto w-10 h-10 rounded-full flex items-center justify-center',
                'bg-slate-100 dark:bg-slate-800'
              )}>
                <Image size={20} className="text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="text-purple-500 dark:text-purple-400 font-medium">Upload file</span>{' '}
                to encode as base64
              </p>
            </div>
          </div>

          {!disabled && (
            <button
              type="button"
              onClick={handlePaste}
              className={clsx(
                'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                'border border-slate-300 dark:border-slate-600',
                'text-slate-600 dark:text-slate-400',
                'hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500'
              )}
            >
              <Clipboard size={14} />
              Paste base64 from clipboard
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
