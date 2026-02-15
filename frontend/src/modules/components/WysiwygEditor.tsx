import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import ImageExtension from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import { NunjucksHighlight } from '../lib/tiptap/nunjucksExtension'
import WysiwygToolbar from './WysiwygToolbar'
import './WysiwygEditor.css'

/** Extract markdown string from editor via tiptap-markdown storage */
function getEditorMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as Record<string, { getMarkdown?: () => string }>
  return storage.markdown?.getMarkdown?.() ?? ''
}

/** Normalize markdown for comparison to prevent re-render loops from whitespace differences */
function normalizeForCompare(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Pre-process markdown to convert base64 image syntax to HTML img tags.
 * tiptap-markdown's markdown-it parser struggles with very long data: URLs
 * in image syntax (escapes characters, truncates, or fails to parse).
 * Converting to <img> tags works reliably when html: true is enabled.
 * Also normalizes whitespace in base64 data that LLMs sometimes add.
 */
function preprocessBase64Images(markdown: string): string {
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
}

export default function WysiwygEditor({
  value,
  onChange,
  height = '400px',
  theme = 'dark',
  readOnly = false,
  placeholder = 'Start writing... (use markdown shortcuts like # for headings, ** for bold)',
  showToolbar = true
}: WysiwygEditorProps) {
  const isUpdatingRef = useRef(false)
  const lastValueRef = useRef(value)

  const handleUpdate = useCallback(({ editor }: { editor: Editor }) => {
    if (!editor || isUpdatingRef.current) return
    const markdown = getEditorMarkdown(editor)
    lastValueRef.current = markdown
    onChange?.(markdown)
  }, [onChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: {
          HTMLAttributes: { class: 'hljs' }
        },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false }
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
      NunjucksHighlight
    ],
    content: preprocessBase64Images(value),
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
    editor.commands.setContent(preprocessBase64Images(value))
    isUpdatingRef.current = false
  }, [value, editor])

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
