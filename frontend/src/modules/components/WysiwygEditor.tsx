import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import ImageExtension from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { Markdown } from 'tiptap-markdown'
import { NunjucksHighlight } from '../lib/tiptap/nunjucksExtension'
import type { VariablesMap } from '../lib/tiptap/nunjucksExtension'
import WysiwygToolbar from './WysiwygToolbar'
import 'highlight.js/styles/github-dark.css'
import './WysiwygEditor.css'

const lowlight = createLowlight(common)

/** Extract markdown string from editor via tiptap-markdown storage */
function getEditorMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as Record<string, { getMarkdown?: () => string }>
  const md = storage.markdown?.getMarkdown?.() ?? ''
  return unescapeNunjucks(md)
}

/**
 * Un-escape markdown special characters inside Nunjucks expressions.
 * tiptap-markdown's serializer escapes characters like [ ] * _ ~ inside text nodes,
 * which corrupts Nunjucks syntax (e.g. `{%- for x in [items] %}` → `{%- for x in \[items\] %}`).
 * This restores the original characters within {{ }}, {% %}, and {# #} blocks.
 */
function unescapeNunjucks(markdown: string): string {
  return markdown.replace(/(\{[{%#]-?[\s\S]*?-?[}%#]\})/g, (match) => {
    return match.replace(/\\([[\]\\*_~`|(){}])/g, '$1')
  })
}

/** Normalize markdown for comparison to prevent re-render loops from whitespace differences */
function normalizeForCompare(s: string | undefined | null): string {
  if (!s) return ''
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Treat \n{% same as \n\n{% — TipTap adds the blank line, original may not have it
    .replace(/([^\n])\n(\{%-?\s)/g, '$1\n\n$2')
    .trim()
}

/**
 * Ensure block-level Nunjucks tags ({% %} at column 0) are preceded by a blank line.
 * Without this, markdown-it's lazy continuation rule absorbs a standalone {% %} line
 * immediately after a list item into that list item's paragraph.
 * Inline {% %} within a paragraph are unaffected (they don't start at column 0).
 */
function preprocessNunjucksBlocks(markdown: string | undefined | null): string {
  if (!markdown) return ''
  return markdown.replace(/([^\n])\n(\{%-?\s)/g, '$1\n\n$2')
}


/**
 * Pre-process markdown to convert base64 image syntax to HTML img tags.
 * tiptap-markdown's markdown-it parser struggles with very long data: URLs
 * in image syntax (escapes characters, truncates, or fails to parse).
 * Converting to <img> tags works reliably when html: true is enabled.
 * Also normalizes whitespace in base64 data that LLMs sometimes add.
 */
function preprocessBase64Images(markdown: string | undefined | null): string {
  if (!markdown) return ''
  // Match ![alt](data:image/TYPE;base64,DATA) - base64 charset includes whitespace
  // that LLMs may insert as line breaks
  return markdown.replace(
    /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+)\)/g,
    (_, alt, src) => {
      const cleanSrc = src.replace(/\s+/g, '')
      const escapedAlt = (alt || '').replace(/"/g, '&quot;')
      return `<img src="${cleanSrc}" alt="${escapedAlt}">`
    }
  )
}

interface WysiwygEditorProps {
  value: string
  onChange?: (value: string) => void
  height?: string
  theme?: 'light' | 'dark'
  readOnly?: boolean
  placeholder?: string
  showToolbar?: boolean
  /** Parameter metadata for hover tooltips on {{ variable }} expressions */
  variables?: VariablesMap
}

export default function WysiwygEditor({
  value,
  onChange,
  height = '400px',
  theme = 'dark',
  readOnly = false,
  placeholder = 'Start writing... (use markdown shortcuts like # for headings, ** for bold)',
  showToolbar = true,
  variables
}: WysiwygEditorProps) {
  const isUpdatingRef = useRef(false)
  const lastValueRef = useRef(value)

  const handleUpdate = useCallback(({ editor }: { editor: Editor }) => {
    if (!editor || isUpdatingRef.current) return
    const rawMarkdown = getEditorMarkdown(editor)
    // If the only difference from the current value is blank-line normalization around
    // block {% %} tags (added by preprocessNunjucksBlocks), echo the original back so
    // the file is not marked dirty. On a real user edit the normalized forms will differ.
    const markdown = normalizeForCompare(rawMarkdown) === normalizeForCompare(lastValueRef.current)
      ? lastValueRef.current
      : rawMarkdown
    lastValueRef.current = markdown
    onChange?.(markdown)
  }, [onChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false }
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext'
      }),
      Markdown.configure({
        html: true,
        transformCopiedText: true,
        transformPastedText: true
      }),
      Placeholder.configure({ placeholder }),
      ImageExtension.configure({
        inline: false,
        allowBase64: true
      }),
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: 'wysiwyg-table' }
      }),
      TableRow,
      TableHeader,
      TableCell,
      NunjucksHighlight
    ],
    content: preprocessNunjucksBlocks(preprocessBase64Images(value)),
    editorProps: {
      attributes: {
        class: 'wysiwyg-editor',
        spellcheck: 'true'
      },
      handleClick: (_view, _pos, event) => {
        // Prevent links from opening on click in the editor
        const target = event.target as HTMLElement
        if (target.tagName === 'A' || target.closest('a')) {
          event.preventDefault()
          return true
        }
        return false
      }
    },
    editable: !readOnly,
    onUpdate: handleUpdate
  })

  // Sync external value changes (e.g., switching tabs, undo from outside)
  useEffect(() => {
    if (!editor) return
    if (value === lastValueRef.current) return

    // Check if the editor's current content is semantically the same as incoming value.
    // This prevents re-render loops when markdown round-trips through parsing produce
    // slightly different whitespace but equivalent content.
    const currentMarkdown = getEditorMarkdown(editor)
    if (normalizeForCompare(value) === normalizeForCompare(currentMarkdown)) {
      lastValueRef.current = value
      return
    }

    isUpdatingRef.current = true
    lastValueRef.current = value
    editor.commands.setContent(preprocessNunjucksBlocks(preprocessBase64Images(value)))
    isUpdatingRef.current = false
  }, [value, editor])

  // Sync variable metadata to nunjucks extension storage for hover tooltips
  useEffect(() => {
    if (editor) {
      const storage = editor.storage as unknown as Record<string, Record<string, unknown>>
      if (storage.nunjucksHighlight) {
        storage.nunjucksHighlight.variables = variables || {}
      }
    }
  }, [variables, editor])

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [readOnly, editor])

  if (!editor) return null

  const isAutoHeight = height === 'auto'

  return (
    <div
      className={`wysiwyg-container${isAutoHeight ? ' wysiwyg-auto-height' : ''}`}
      style={isAutoHeight ? undefined : { height }}
    >
      {showToolbar && !readOnly && (
        <WysiwygToolbar editor={editor} />
      )}

      <EditorContent
        editor={editor}
        style={isAutoHeight ? undefined : { flex: 1, overflow: 'auto' }}
      />
    </div>
  )
}
