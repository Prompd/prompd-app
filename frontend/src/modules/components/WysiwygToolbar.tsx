import { useState, useRef, useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link,
  Image,
  FileCode2,
  Undo2,
  Redo2,
  Pilcrow
} from 'lucide-react'
import NunjucksSnippetMenu from './NunjucksSnippetMenu'

interface WysiwygToolbarProps {
  editor: Editor | null
}

export default function WysiwygToolbar({ editor }: WysiwygToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)

  // Force re-render when cursor/selection changes so isActive() reflects current position
  const [, forceUpdate] = useReducer(x => x + 1, 0)

  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', forceUpdate)
    editor.on('transaction', forceUpdate)
    return () => {
      editor.off('selectionUpdate', forceUpdate)
      editor.off('transaction', forceUpdate)
    }
  }, [editor])

  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus()
    }
  }, [showLinkInput])

  if (!editor) return null

  const handleLinkSubmit = () => {
    if (linkUrl.trim()) {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    }
    setLinkUrl('')
    setShowLinkInput(false)
  }

  return (
    <div className="wysiwyg-toolbar">
      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={15} />
        </button>
      </div>

      {/* Heading levels */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={!editor.isActive('heading') ? 'is-active' : ''}
          title="Paragraph"
        >
          <Pilcrow size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
          title="Heading 1"
        >
          <Heading1 size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
          title="Heading 2"
        >
          <Heading2 size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
          title="Heading 3"
        >
          <Heading3 size={15} />
        </button>
      </div>

      {/* Inline formatting */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
          title="Bold (Ctrl+B)"
        >
          <Bold size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
          title="Italic (Ctrl+I)"
        >
          <Italic size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'is-active' : ''}
          title="Strikethrough"
        >
          <Strikethrough size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editor.can().chain().focus().toggleCode().run()}
          className={editor.isActive('code') ? 'is-active' : ''}
          title="Inline Code"
        >
          <Code size={15} />
        </button>
      </div>

      {/* Block elements */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
          title="Bullet List"
        >
          <List size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
          title="Ordered List"
        >
          <ListOrdered size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'is-active' : ''}
          title="Blockquote"
        >
          <Quote size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'is-active' : ''}
          title="Code Block"
        >
          <FileCode2 size={15} />
        </button>
      </div>

      {/* Insert */}
      <div className="toolbar-group">
        <button
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run()
            } else {
              setShowLinkInput(!showLinkInput)
            }
          }}
          className={editor.isActive('link') ? 'is-active' : ''}
          title={editor.isActive('link') ? 'Remove Link' : 'Insert Link (Ctrl+K)'}
        >
          <Link size={15} />
        </button>
        <button
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = () => {
              const file = input.files?.[0]
              if (file) {
                const reader = new FileReader()
                reader.onload = () => {
                  editor.chain().focus().setImage({ src: reader.result as string }).run()
                }
                reader.readAsDataURL(file)
              }
            }
            input.click()
          }}
          title="Insert Image"
        >
          <Image size={15} />
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus size={15} />
        </button>
      </div>

      {/* Nunjucks snippets */}
      <div className="toolbar-group">
        <NunjucksSnippetMenu
          onInsert={(snippet) => {
            editor.chain().focus().insertContent(snippet).run()
          }}
        />
      </div>

      {/* Link URL input */}
      {showLinkInput && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginLeft: '8px',
          borderLeft: '1px solid var(--border)',
          paddingLeft: '8px'
        }}>
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleLinkSubmit()
              if (e.key === 'Escape') { setShowLinkInput(false); setLinkUrl('') }
            }}
            placeholder="https://..."
            style={{
              height: '24px',
              padding: '0 8px',
              fontSize: '12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              outline: 'none',
              width: '200px'
            }}
          />
          <button
            onClick={handleLinkSubmit}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              height: '24px'
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
