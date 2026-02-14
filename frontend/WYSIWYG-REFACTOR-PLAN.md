# WYSIWYG Refactor Plan: Extract ContentSections + Inline Toggle

## Context

We built a WYSIWYG editor using Tiptap (Phase 1 complete). Currently it's wired as a separate top-level view mode (`Design | WYSIWYG | Code`). The user wants to refactor so that:

1. **Revert to 2 view modes**: `Design | Code` (with Preview | Chat toggles)
2. **Extract the content sections** from DesignView into a new `ContentSections` component
3. **Add a toggle inside ContentSections**: `Sections` (per-section editors) vs `Document` (single continuous Tiptap editor)
4. **Per-section editors** can swap between Monaco and Tiptap
5. **Add Nunjucks snippet insertion** (dropdown to insert `{{ }}`, `{% %}` patterns)

## What Already Exists (Keep These)

These files were built and are ready to use - DO NOT delete:

- `frontend/src/modules/components/WysiwygEditor.tsx` - Core Tiptap editor component (markdown ↔ rich text)
- `frontend/src/modules/components/WysiwygEditor.css` - Styles matching MarkdownPreview
- `frontend/src/modules/components/WysiwygToolbar.tsx` - Formatting toolbar (bold, italic, headings, lists, etc.)
- `frontend/src/modules/lib/tiptap/nunjucksExtension.ts` - ProseMirror decoration plugin for `{{ }}` / `{% %}` highlighting
- All Tiptap npm dependencies in `frontend/package.json`

## Step 1: Revert Top-Level WYSIWYG View Mode

Remove `'wysiwyg'` from the view mode union type everywhere. Revert to `'wizard' | 'design' | 'code'`.

**Files to revert** (change `'wizard' | 'design' | 'code' | 'wysiwyg'` back to `'wizard' | 'design' | 'code'`):

| File | What to revert |
|------|---------------|
| `frontend/src/stores/types.ts:20` | `viewMode` type on Tab interface |
| `frontend/src/stores/uiStore.ts:90,93,159,160` | `mode`, `defaultViewMode`, `setMode`, `setDefaultViewMode` types |
| `frontend/src/stores/editorStore.ts:34,139,266,430` | `viewModes`, `addTabWithMode` types |
| `frontend/src/modules/types.ts:30` | `viewMode` type |
| `frontend/src/modules/hooks/useTabManager.ts:28` | `viewMode` type |
| `frontend/src/modules/services/localProjectStorage.ts:14` | `viewMode` type |
| `frontend/src/modules/App.tsx:1982` | `handleSetViewMode` cast + includes check. Also **remove** the `else if (mode === 'wysiwyg')` block (~lines 5026-5034) and the `WysiwygView` import |
| `frontend/src/modules/App.tsx:836` | Remove `|| mode === 'wysiwyg'` from fallback logic |
| `frontend/src/modules/editor/EditorHeader.tsx:1,288,289` | Remove `PenTool` import, revert Props type, **remove the WYSIWYG button** (~lines 653-679) |

**Files to delete:**
- `frontend/src/modules/editor/WysiwygView.tsx` - No longer needed as top-level view

## Step 2: Extract ContentSections from DesignView

Extract the "Content Sections" block from `DesignView.tsx` (lines ~2779-3078) into a new component.

**New file:** `frontend/src/modules/components/ContentSections.tsx`

### Props interface:

```typescript
interface ContentSectionsProps {
  /** All sections to display (local + inherited) */
  sections: Section[]
  /** Override values per section (null = hidden) */
  sectionOverrides: Record<string, string | null>
  /** Currently editing section ID */
  editingSection: string | null
  /** Content being edited */
  editContent: string
  /** Whether file uses inheritance */
  hasInheritance: boolean
  /** Available section suggestions for SectionAdder */
  availableSections: string[]
  /** Read-only mode */
  readOnly: boolean
  /** Theme */
  theme: 'light' | 'dark'
  /** Monaco beforeMount handler */
  beforeMount: BeforeMount

  // Callbacks
  onStartEditing: (section: Section) => void
  onCancelEditing: () => void
  onSaveSection: (sectionId: string) => void
  onEditContentChange: (content: string) => void
  onAddSection: (title: string, type: string, index: number) => void
  onDeleteSection: (sectionId: string, title: string) => void
  onToggleVisibility: (sectionId: string) => void
  onResetSection: (sectionId: string) => void
}
```

### Internal state:

```typescript
// Toggle between section-by-section editing and full document WYSIWYG
type ContentViewMode = 'sections' | 'document'
const [contentViewMode, setContentViewMode] = useState<ContentViewMode>('sections')
```

### Layout:

```
┌─────────────────────────────────────────────────┐
│ Content Sections          [Sections] [Document]  │
│ Main prompt sections...   ← small toggle buttons │
├─────────────────────────────────────────────────┤
│                                                   │
│  (if "Sections" mode)                            │
│    Per-section cards with edit/preview/hide       │
│    Each section's edit mode uses Monaco OR Tiptap │
│                                                   │
│  (if "Document" mode)                            │
│    Single continuous WysiwygEditor                │
│    All sections as natural headings               │
│                                                   │
└─────────────────────────────────────────────────┘
```

### "Sections" mode:

Move the existing JSX from DesignView lines 2779-3078 into this component. The per-section edit mode currently uses Monaco `<Editor>`. Add a small toggle per-section to swap between Monaco and Tiptap:

```
[MD] [WYSIWYG]  ← per-section toggle when editing
```

When "WYSIWYG" is selected for a section, render `<WysiwygEditor>` instead of `<Editor>` for that section's edit content.

### "Document" mode:

Reconstruct the full markdown body from all visible sections, pass to a single `<WysiwygEditor>`. On change, parse the markdown back into sections and call the appropriate update callbacks.

**Key challenge:** Mapping continuous markdown back to individual sections. The simplest approach:
- Join all non-hidden sections with `# sectionTitle\n\ncontent` format
- On update, split by `# sectionTitle` headings to extract per-section content
- Only available for local sections (no inheritance complexity)

**Fallback:** If the file uses inheritance, disable "Document" mode or show a warning.

## Step 3: Wire ContentSections into DesignView

In `DesignView.tsx`, replace the extracted JSX block (lines ~2779-3078) with:

```tsx
<ContentSections
  sections={allDisplaySections}
  sectionOverrides={sectionOverrides}
  editingSection={editingSection}
  editContent={editContent}
  hasInheritance={hasInheritance}
  availableSections={availableSections}
  readOnly={readOnly}
  theme={theme}
  beforeMount={beforeMount}
  onStartEditing={startEditing}
  onCancelEditing={cancelEditing}
  onSaveSection={saveSection}
  onEditContentChange={setEditContent}
  onAddSection={addSection}
  onDeleteSection={deleteSection}
  onToggleVisibility={toggleSectionVisibility}
  onResetSection={resetSection}
/>
```

This requires verifying that all referenced functions/variables are accessible. The existing functions `startEditing`, `cancelEditing`, `saveSection`, `deleteSection`, `toggleSectionVisibility`, `resetSection` are defined in DesignView and will be passed as props.

## Step 4: Nunjucks Snippet Insertion

**New file:** `frontend/src/modules/components/NunjucksSnippetMenu.tsx`

A dropdown button that inserts Nunjucks template snippets at the cursor position. Works with both Monaco and Tiptap editors.

### Snippets:

| Label | Inserts | Description |
|-------|---------|-------------|
| Variable | `{{ name }}` | Insert a variable reference |
| If/Else | `{% if condition %}\n\n{% else %}\n\n{% endif %}` | Conditional block |
| For Loop | `{% for item in list %}\n\n{% endfor %}` | Loop block |
| Include | `{% include "file.prmd" %}` | Include another file |
| Block | `{% block name %}\n\n{% endblock %}` | Override block |
| Comment | `{# comment #}` | Template comment |

### Integration:

1. **In WysiwygToolbar.tsx** - Add a `{ }` button that opens the snippet dropdown. On select, insert text at Tiptap cursor position via `editor.chain().focus().insertContent(snippet).run()`

2. **In Monaco section editors** - The snippet menu can also be used with Monaco by calling `editor.executeEdits()` to insert at cursor. Pass an `onInsertSnippet` callback prop.

### UI:

```tsx
<button onClick={() => setShowSnippets(!showSnippets)}>
  <Braces size={15} />  {/* lucide icon */}
</button>
{showSnippets && (
  <div className="snippet-dropdown">
    {snippets.map(s => (
      <button key={s.label} onClick={() => insertSnippet(s.template)}>
        <span className="snippet-label">{s.label}</span>
        <span className="snippet-preview">{s.preview}</span>
      </button>
    ))}
  </div>
)}
```

## Step 5: Verify

1. Open a `.prmd` file in Design mode
2. Scroll to Content Sections - should see `[Sections] [Document]` toggle
3. "Sections" mode: Per-section cards work as before (edit, preview, hide, delete)
4. Click edit on a section - see `[MD] [WYSIWYG]` toggle for the editor
5. Switch to WYSIWYG - section edits in Tiptap rich text
6. Switch to "Document" mode - single continuous WYSIWYG editor with all sections
7. Use Nunjucks snippet button - inserts template at cursor
8. Switch to Code mode - verify markdown is correct
9. TypeScript compiles clean: `npx tsc --noEmit`

## File Summary

### New files (2):
- `frontend/src/modules/components/ContentSections.tsx` (~350 lines, extracted + toggle logic)
- `frontend/src/modules/components/NunjucksSnippetMenu.tsx` (~120 lines)

### Modified files:
- `frontend/src/modules/editor/DesignView.tsx` - Replace ~300 lines of section JSX with `<ContentSections>` component
- `frontend/src/modules/components/WysiwygToolbar.tsx` - Add Nunjucks snippet button
- Revert 9 files (types, stores, EditorHeader, App.tsx) to remove `'wysiwyg'` view mode

### Deleted files (1):
- `frontend/src/modules/editor/WysiwygView.tsx`

### Kept as-is:
- `WysiwygEditor.tsx`, `WysiwygEditor.css`, `nunjucksExtension.ts` - Used by ContentSections
