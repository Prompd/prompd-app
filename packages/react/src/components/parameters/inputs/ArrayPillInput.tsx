/**
 * Array input component with pill/tag-based UX
 *
 * Features:
 * - Visual pills for each array item
 * - Keyboard-first: Enter or comma to add, Backspace to remove last
 * - Click X to remove individual items
 * - Paste support (comma or newline separated)
 * - Accessible with proper ARIA labels
 */

import { useState, useRef, useCallback, KeyboardEvent, ClipboardEvent } from 'react'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import type { ParameterInputProps } from '../utils/types'
import { sanitizeStringArray, MAX_LENGTHS } from '../utils/validation'

interface ArrayPillInputProps extends ParameterInputProps<string[]> {
  maxItems?: number
  maxItemLength?: number
  allowDuplicates?: boolean
}

export function ArrayPillInput({
  value = [],
  onChange,
  placeholder = 'Type and press Enter to add...',
  disabled = false,
  error,
  className,
  maxItems = MAX_LENGTHS.arrayItems,
  maxItemLength = MAX_LENGTHS.arrayItem,
  allowDuplicates = false,
}: ArrayPillInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ensure value is always an array
  const items: string[] = Array.isArray(value) ? value : []

  const addItem = useCallback((item: string) => {
    const trimmed = item.trim()
    if (!trimmed) return false

    // Check max items
    if (items.length >= maxItems) return false

    // Check duplicates
    if (!allowDuplicates && items.includes(trimmed)) return false

    // Sanitize and add
    const sanitized = trimmed.slice(0, maxItemLength)
    const newItems = [...items, sanitized]
    onChange(sanitizeStringArray(newItems, maxItems, maxItemLength))
    return true
  }, [items, onChange, maxItems, maxItemLength, allowDuplicates])

  const addMultipleItems = useCallback((text: string) => {
    // Split by comma or newline
    const newItems = text
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .filter(s => allowDuplicates || !items.includes(s))

    if (newItems.length === 0) return

    const combined = [...items, ...newItems]
    onChange(sanitizeStringArray(combined, maxItems, maxItemLength))
  }, [items, onChange, maxItems, maxItemLength, allowDuplicates])

  const removeItem = useCallback((index: number) => {
    const newItems = items.filter((_, i) => i !== index)
    onChange(newItems)
    // Refocus input after removal
    inputRef.current?.focus()
  }, [items, onChange])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    // Enter or comma to add
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (addItem(inputValue)) {
        setInputValue('')
      }
      return
    }

    // Backspace on empty input removes last item
    if (e.key === 'Backspace' && inputValue === '' && items.length > 0) {
      removeItem(items.length - 1)
      return
    }

    // Tab to add if there's text
    if (e.key === 'Tab' && inputValue.trim()) {
      e.preventDefault()
      if (addItem(inputValue)) {
        setInputValue('')
      }
      return
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')

    // If pasted content has commas or newlines, handle as multiple items
    if (pasted.includes(',') || pasted.includes('\n')) {
      e.preventDefault()
      addMultipleItems(pasted)
    }
    // Otherwise let default paste behavior happen
  }

  const handleContainerClick = () => {
    inputRef.current?.focus()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value

    // If user types a comma, treat it as adding an item
    if (newValue.endsWith(',')) {
      const withoutComma = newValue.slice(0, -1)
      if (addItem(withoutComma)) {
        setInputValue('')
      }
      return
    }

    setInputValue(newValue)
  }

  const isAtLimit = items.length >= maxItems

  return (
    <div className={clsx('prompd-array-pill-input', className)}>
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className={clsx(
          'flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-md transition-colors cursor-text',
          'bg-white dark:bg-slate-900',
          'border',
          error
            ? 'border-red-500'
            : 'border-slate-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400',
          'focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50',
          disabled && 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-950'
        )}
      >
        {/* Existing pills */}
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm',
              'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
              'border border-blue-200 dark:border-blue-800',
              'animate-fade-in'
            )}
          >
            <span className="max-w-[200px] truncate">{item}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeItem(index)
                }}
                className={clsx(
                  'flex-shrink-0 w-4 h-4 rounded-full',
                  'flex items-center justify-center',
                  'hover:bg-blue-200 dark:hover:bg-blue-800',
                  'text-blue-600 dark:text-blue-300',
                  'transition-colors'
                )}
                aria-label={`Remove ${item}`}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}

        {/* Input field */}
        {!disabled && !isAtLimit && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={items.length === 0 ? placeholder : ''}
            disabled={disabled}
            className={clsx(
              'flex-1 min-w-[120px] bg-transparent border-none outline-none',
              'text-sm text-slate-800 dark:text-slate-200',
              'placeholder:text-slate-400 dark:placeholder:text-slate-500'
            )}
            aria-label="Add new item"
          />
        )}

        {/* Limit indicator */}
        {isAtLimit && (
          <span className="text-xs text-slate-400 italic px-2 py-0.5">
            Max {maxItems} items reached
          </span>
        )}
      </div>

      {/* Helper text and error */}
      <div className="flex justify-between mt-1">
        {error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : (
          <p className="text-xs text-slate-400">
            Press Enter or comma to add
          </p>
        )}
        <span className="text-xs text-slate-400">
          {items.length}{maxItems < MAX_LENGTHS.arrayItems && ` / ${maxItems}`} items
        </span>
      </div>
    </div>
  )
}
