# Prompd UI Tooltip & Help Text Audit

**Date:** 2026-03-04
**Requested by:** Stephen Baker (based on feedback from Nate)
**Purpose:** Identify every UI element that would benefit from tooltips, help text, or contextual guidance for new users.

---

## 1. Titlebar & Top Controls

### TitleBar.tsx

- [ ] **Menu bar buttons** (File, Edit, View, Project, Run, Help) — Lines 403-413
  Missing `aria-label` on all menu buttons. Text is visible but not annotated for accessibility.
  Suggested: `aria-label="File menu"`, `aria-label="Edit menu"`, etc.

- [ ] **Menu dropdown items** — Lines 197-210
  No `title` or `aria-label` on individual menu items inside dropdowns.
  Suggested: Each item gets `aria-label={item.label}`

### TabsBar.tsx

- [ ] **Dirty indicator (bullet dot)** — Line 210
  `<span className="dirty">` has no title, no aria-label. New users won't know it means "unsaved changes."
  Suggested: `title="Unsaved changes"` + `aria-label="File has unsaved changes"`

- [ ] **Tab close button** — Line 211
  `<span className="close">` is not a `<button>`, has no title, no aria-label, not keyboard-accessible.
  Suggested: Convert to `<button title="Close tab" aria-label="Close tab">`

- [ ] **AI generation indicator** — Lines 191-208
  Has `title="Generated with AI - Click for details"` but no `aria-label`.
  Suggested: Add `aria-label="AI-generated content indicator"`

- [ ] **Tab drag-and-drop** — Lines 141-186
  Tabs are draggable but no screen reader announcement or tooltip explaining reordering.
  Suggested: `aria-label="Tab, drag to reorder"`

- [ ] **AI generation details modal close button** — Lines 455-470
  Icon-only close button, no `title` or `aria-label`.
  Suggested: `title="Close details" aria-label="Close AI generation details"`

- [ ] **Context menu items** (Save, Save As, Close, Close All) — Lines 255-395
  No `aria-label` on any context menu button. Keyboard shortcuts not accessible to screen readers.
  Suggested: `aria-label="Save (Ctrl+S)"`, `aria-label="Close tab (Ctrl+W)"`, etc.

### StatusBar.tsx

- [ ] **Issues click area** — Lines 26-47
  `<div>` with click handler, not a `<button>`. No title, no aria-label, not keyboard-accessible.
  Suggested: Convert to `<button title="Click to view issues in output panel">`

- [ ] **BETA badge** — Lines 60-69
  Displays "BETA" text with no explanation.
  Suggested: `title="This is a beta release of Prompd"`

- [ ] **Version display** — Lines 51-59
  Shows `v{version}` with no context.
  Suggested: `title="Prompd version ${APP_VERSION}"`

---

## 2. Editor Area

### SplitEditor.tsx

- [ ] **Resize handle** — Lines 296-329
  Grip icon with `col-resize` cursor but no tooltip.
  Suggested: `title="Drag to resize editor and chat panels"`

- [ ] **Chat header — Chat History button** — Line 505
  Has `title="Chat History"` but too vague.
  Suggested: `title="View and restore previous conversations"`

### FileExplorer.tsx

- [ ] **Empty folder state** — Lines 1221-1289
  When a folder is open but has no files, shows only "No files" with zero guidance.
  Suggested: "This folder is empty. Right-click to create a new file, or drag files here."

- [ ] **"Open Folder" button (empty state)** — Line ~1250
  No `title` attribute.
  Suggested: `title="Open a local workspace folder"`

- [ ] **"Projects" button (empty state)** — Line ~1260
  No `title` attribute.
  Suggested: `title="Load a previously opened project"`

- [ ] **Folder expand/collapse icon** — Lines 684-691
  Icon marked `aria-hidden` with no visible label or tooltip.
  Suggested: `title={isOpen ? 'Collapse folder' : 'Expand folder'}`

- [ ] **File type icons** — Throughout tree rendering
  `.prmd`, `.pdflow`, `.json` icons have no identification tooltips.
  Suggested: `.prmd` = `title="Prompt file"`, `.pdflow` = `title="Workflow definition"`, `.json` = `title="Configuration file"`

### NewFileDialog.tsx

- [ ] **File type cards** — Lines 149-192
  Cards show label + description but no `aria-label` combining both.
  Suggested: `aria-label="Prompt file (.prmd) - Create a new AI prompt with YAML frontmatter"`

- [ ] **Brainstorm toggle** — Lines 230-256
  Has `title="Open with AI brainstorm chat"` but could be clearer.
  Suggested: `title="Open with AI brainstorm chat - collaborate with AI to write this file"` + `aria-pressed={brainstorm}`

- [ ] **"Advanced" toggle button** — Confusing label that alternates.
  Suggested: Change to "More options" / "Fewer options"

---

## 3. Generation Controls

### GenerationControls.tsx

- [ ] **Mode dropdown items (disabled)** — Lines 219-253
  Disabled mode buttons show "(not supported)" but no tooltip explaining why.
  Suggested: `title="This mode is not supported by the selected provider"`

- [ ] **"IMG" toggle button** — Lines 262-302
  Abbreviation "IMG" is cryptic for new users.
  Suggested: Change label to "Image" or add `title="Toggle image generation (if your model supports it)"`

- [ ] **Max tokens preset buttons** — Lines 324-350
  Numeric buttons with no tooltips.
  Suggested: `title="Set max tokens to {preset}"`

- [ ] **Custom max tokens input** — Lines 356-379
  Has `placeholder="Custom..."` but no `aria-label`.
  Suggested: `aria-label="Custom max tokens" title="Enter custom token limit (256-32768)"`

- [ ] **Temperature slider** — Lines 394-401
  No `aria-label` on the range input.
  Suggested: `aria-label="Temperature (0 = deterministic, 1 = creative)"`

---

## 4. Chat & AI Panels

### ChatTab.tsx — Permission Level Selector

- [ ] **Permission button (main)** — Line 965
  No `title`, no `aria-label`. Only shows an icon (lightning/shield/clipboard). New users have NO WAY to learn what Auto/Confirm/Plan mean without clicking.
  Suggested: `title="Permission Level: Controls how AI actions are approved" aria-label="Select permission level"`

- [ ] **"Auto" option** — Line ~1015
  No tooltip on the dropdown item.
  Suggested: `title="Auto: AI executes changes automatically with guardrails"`

- [ ] **"Confirm" option** — Line ~1030
  No tooltip on the dropdown item.
  Suggested: `title="Confirm: Requires your approval before writing files"`

- [ ] **"Plan" option** — Line ~1045
  No tooltip on the dropdown item.
  Suggested: `title="Plan: AI creates a plan for approval before execution"`

### ChatTab.tsx — Other Controls

- [ ] **Brainstorm toggle** — Line 1073
  Has `title="Enter/Exit brainstorm mode"` but doesn't explain WHAT brainstorm does.
  Suggested: `title="Brainstorm mode: Collaborative editing with AI on a working copy. Changes are proposed, not applied directly."`

- [ ] **Slash command button** — Line ~1101
  Has `title="Slash commands"` — too vague.
  Suggested: `title="Slash commands: Type / to see available actions (edit, search, refactor, etc.)"`

- [ ] **Undo button** — Lines 1133-1161
  Has dynamic title but no `aria-label`.
  Suggested: `aria-label="Undo the last AI-suggested edit"`

### AiChatPanel.tsx

- [ ] **More options button (three dots)** — Line 902
  Has `title="More options"` — too generic.
  Suggested: `title="More options: View chat history, undo changes, open in new tab"`

- [ ] **Chat History menu item** — Line ~960
  No description of what happens when clicked.
  Suggested: `title="View and restore previous conversations"`

- [ ] **Open in Tab menu item** — Line ~1000
  No explanation of the difference from current panel.
  Suggested: `title="Open this conversation in a full-width tab"`

- [ ] **Package Selector modal close button** — Lines 1059-1069
  Just an "x" with no title or aria-label.
  Suggested: `title="Close" aria-label="Close suggested packages dialog"`

### PrompdModeDropdown.tsx

- [ ] **Mode selector button** — Line 145
  Has `title={`Current mode: ${currentMode.label}`}` but doesn't explain what clicking does.
  Suggested: `title="Chat mode: ${currentMode.label}. Click to switch modes." aria-label="Chat mode selector"`

- [ ] **Mode dropdown items** — Lines 80-137
  Descriptions ARE shown in dropdown (good!) but no `aria-label` on the buttons.
  Suggested: `aria-label={`${mode.label}: ${mode.description}`}`

### PrompdChat.tsx — Empty State

- [ ] **Suggested prompt buttons** — Lines 360-383
  No `title`, no `aria-label`, no indication they're clickable until hover.
  Suggested: `title="Click to start: ${prompt.title}" aria-label="Suggested prompt: ${prompt.title}"`

- [ ] **Welcome message** — Lines 346-386
  Says "Start a conversation or describe what you'd like to accomplish" but no keyboard shortcut hint.
  Suggested: Add "(Type a message and press Enter to send)"

### PrompdParameterList.tsx

- [ ] **Parameter inputs** — Lines 160-240
  Placeholder is "--" which is unhelpful. No `aria-label`, no description shown inline by default.
  Suggested: `aria-label="${param.name}: ${param.type}${param.required ? ' (required)' : ''}" title="${param.description || 'Enter ' + param.type + ' value'}"`

- [ ] **Add Parameter button** — Lines 412-444
  No `aria-label` or `title`.
  Suggested: `title="Add a new custom parameter" aria-label="Add custom parameter"`

- [ ] **Required vs optional indicators** — Not visually distinguished.
  Suggested: Add `*` for required fields with `title="Required"`

---

## 5. Execution & Results

### PrompdExecutionTab.tsx

- [ ] **Execution history expand/collapse** — Line 345
  No `title`, no `aria-label` on the chevron toggle.
  Suggested: `title="Show/hide execution history" aria-label="Toggle execution history"`

- [ ] **Empty execution state** — Lines 221-234
  Says "No prompd executions yet" + "Execute a prompd to see it here" but doesn't say HOW.
  Suggested: "Fill in parameters below, then click the Execute button (or press F5) to run this prompt"

- [ ] **Context section file upload** — Lines 147-187
  No `title` on upload zones or browse buttons.
  Suggested: `title="Upload a file to attach as context" aria-label="Upload context file"`

- [ ] **GenerationControls in execution header** — Lines 245-257
  No help text explaining what max tokens, temperature, and mode mean for non-technical users.
  Suggested: Add small info icons with tooltips for each control

### ExecutionResultModal.tsx

- [ ] **Tab buttons (Response, Compiled Prompt, Details)** — Lines 388-435
  No `aria-label`, no `role="tab"`, no `aria-selected`.
  Suggested titles:
  - Response: `title="View the AI model's response"`
  - Compiled Prompt: `title="View the final prompt that was sent to the AI"`
  - Details: `title="View execution metadata (model, duration, tokens, cost)"`

### PrompdSessionHistory.tsx

- [ ] **View mode toggles (Rendered, Source, JSON)** — Lines 93-108
  Have titles but no `aria-label`.
  Suggested:
  - Rendered: `aria-label="View formatted markdown"`
  - Source: `aria-label="View raw text"`
  - JSON: `aria-label="Explore as interactive JSON tree"`

---

## 6. Workflow Canvas

### WorkflowCanvas.tsx

- [ ] **Empty canvas state** — No guidance when workflow is empty
  Users see a blank canvas with no instruction on how to start.
  Suggested: "Start building your workflow. Right-click to add nodes, or drag from the Node Palette. Every workflow starts with a Trigger node."

### UnifiedWorkflowToolbar.tsx

- [ ] **All toolbar buttons** — Lines 566-654
  Have `title` attributes but missing `aria-label` on every button (Zoom In, Zoom Out, Fit View, Toggle Grid, Toggle Node Palette, Toggle Connections, Toggle Minimap, Undo, Redo).
  Suggested: Add `aria-label` matching each title.

- [ ] **Execution mode selector** — Lines 389-406
  Button shows just "Auto"/"Debug"/"Step" with no explanation.
  Suggested: `title="Execution mode: Auto runs to completion, Debug pauses at checkpoints, Step pauses after each node"`

- [ ] **Deploy button disabled state** — Lines 566-583
  When disabled, tooltip doesn't explain WHY it's disabled.
  Suggested: `title="Deploy workflow (save first to enable)" or "Deploy workflow to run on a schedule"`

### NodePalette.tsx

- [ ] **Category headers** — Lines 636-645
  "Entry & Exit", "AI & Prompts", "Tools & Execution", etc. have NO descriptions or tooltips.
  Suggested descriptions:
  - Entry & Exit: "Start or end your workflow"
  - AI & Prompts: "AI agents, prompts, and guardrails"
  - Tools & Execution: "Execute commands, code, and external tools"
  - Tool Routing: "Route and parse tool calls between agents and tools"
  - Control Flow: "Conditions, loops, and parallel execution"
  - Data: "Transform data and store state"
  - Interaction & Debug: "User input, logging, and error handling"
  - Composition: "Sub-workflows and grouped nodes"

- [ ] **Node type descriptions in palette** — Lines 56-193
  Brief descriptions like "Workflow entry point" or "Autonomous agent with tools" don't help new users understand WHEN to use each node.
  Suggested: Add expanded `helpText` field to node registry:
  - trigger: "Start here. Can be manual, scheduled, or webhook-triggered."
  - agent: "AI that decides which tools to use. Use Chat Agent for user interaction."
  - guardrail: "Validates input. Rejected items route to error handler."
  - mcp-tool: "Calls an external MCP server tool."
  - memory: "Stores data as key-value, conversation history, or cache."
  - parallel: "Runs multiple branches at once, waits for all to finish."
  - loop: "Iterates over a list or runs N times."
  - condition: "Branches based on a JavaScript expression."

### ContextMenu.tsx

- [ ] **"Add Node" submenu items** — Lines 391-421
  Lists 30+ node types with ONLY labels, no descriptions shown.
  Suggested: Add `title={NODE_TYPE_REGISTRY[nodeType]?.description}` to each submenu item.

### NodeQuickActions.tsx

- [ ] **Lock/Unlock button** — Line 131
  Title says "Lock position" — unclear what "position" means.
  Suggested: `title="Lock node in place to prevent accidental movement (Ctrl+L)"`

- [ ] **Delete button** — Line 202
  Title says "Delete (Del)" — doesn't warn about undo availability.
  Suggested: `title="Delete this node (Del). Use Ctrl+Z to undo."`

---

## 7. Bottom Panels

### BottomPanelTabs.tsx

- [ ] **All tab buttons** (Errors, Prompds, Workflows, Packages) — Lines 166-210
  No `aria-label`, no `role="tab"`, no `aria-selected` attributes.
  Suggested:
  - Errors: `aria-label="Errors tab - compilation and validation errors" role="tab" aria-selected={...}`
  - Prompds: `aria-label="Prompds tab - prompt execution history"`
  - Workflows: `aria-label="Workflows tab - workflow execution results"`
  - Packages: `aria-label="Packages tab - package build history"`

- [ ] **Error count badge** — Lines 174-175
  Red badge with number, no explanation.
  Suggested: `aria-label="{count} errors found" title="{count} errors found"`

- [ ] **Workflow execution indicator (dot)** — Lines 202-203
  Animated dot with no label.
  Suggested: `title="Workflow execution in progress" aria-label="Executing"`

- [ ] **Pin/Unpin toggle** — Line 229
  Has `title` but no `aria-label`.
  Suggested: `aria-label={pinned ? 'Unpin panel (auto-hide when not focused)' : 'Pin panel (keep visible)'}`

- [ ] **Resize handle** — Line 156
  No accessibility attributes at all.
  Suggested: `aria-label="Drag to resize bottom panel" title="Drag to resize"`

### BuildOutputPanel.tsx

- [ ] **Context menu buttons** (Copy Message, Copy Details, Copy File Path, Copy All) — Lines 400-429
  No `aria-label` on any context menu action.
  Suggested: `aria-label="Copy error message to clipboard"`, etc.

- [ ] **"No errors" empty state** — Lines 374-380
  Shows checkmark + "No issues" but could guide the user better.
  Suggested: "No issues found. Build completed successfully."

### PackageBuildHistory.tsx

- [ ] **Empty state** — Lines 54-62
  Shows "No builds yet" with no guidance.
  Suggested: "No package builds yet. Use File > Package to create a package."

---

## 8. Dialogs & Modals

### PublishModal.tsx

- [ ] **Step labels** — No help text on step headers
  Suggested: Step 1: "Select where to publish", Step 2: "Choose files and add metadata", Step 3: "Review and confirm"

- [ ] **Package type dropdown** — Line ~159
  No guidance on what each type means.
  Suggested: `title="package = reusable prompts, workflow = automated processes, node-template = canvas templates, skill = tool declarations"`

- [ ] **Main File selector** — Line ~200
  No help text.
  Suggested: `title="The entry point file users will import first"`

- [ ] **Keywords input** — Line ~158
  No guidance on format.
  Suggested: `placeholder="Enter keywords separated by commas"` + `title="Keywords help users discover your package"`

- [ ] **License field** — Line ~127
  No guidance on format.
  Suggested: `title="SPDX license identifier (e.g., MIT, Apache-2.0)"`

- [ ] **Registry selector** — Line ~151
  No explanation of what a registry is.
  Suggested: `title="Select which registry to publish to"`

- [ ] **API Key input** — Line ~165
  No format guidance.
  Suggested: `placeholder="Paste your registry API key" title="Required to authenticate with this registry"`

- [ ] **Custom namespace warning** — Line ~154
  No explanation that custom namespaces need permission.
  Suggested: "This namespace isn't in your list. Make sure you have permission to publish to it."

### FirstTimeSetupWizard.tsx

- [ ] **Provider selection dropdown** — Line ~342
  No guidance on what a "provider" is.
  Suggested: `title="Select an AI provider. You'll need an API key from their developer console."`

- [ ] **API key visibility toggle (eye icon)** — Line ~344
  Has icon but no `aria-label`.
  Suggested: `aria-label={showApiKey ? 'Hide API key' : 'Show API key'}`

- [ ] **Custom provider fields** (ID, Name, Base URL) — Line ~354
  No placeholder text or help.
  Suggested: `placeholder="e.g., my-local-llm"`, `placeholder="Display name"`, `placeholder="https://localhost:8000/v1"`

- [ ] **Template vs Generate mode toggle** — Lines 357-361
  No explanation of the difference.
  Suggested: "Template: choose from ready-made prompts. Generate: AI creates a custom prompt from your description."

- [ ] **"Don't show again" checkbox** — Line ~366
  No `aria-label`.
  Suggested: `aria-label="Don't show this wizard again on startup"`

### WysiwygEditor.tsx (Toolbar)

- [ ] **Strikethrough button** — Line 136. Has `title="Strikethrough"` but no keyboard shortcut hint.
  Suggested: `title="Strikethrough (Ctrl+Shift+X)"`

- [ ] **Code button** — Line 144. Missing shortcut.
  Suggested: `title="Inline Code (Ctrl+\`)"`

- [ ] **Bullet List button** — Line 154. Missing shortcut.
  Suggested: `title="Bullet List (Ctrl+Shift+8)"`

- [ ] **Ordered List button** — Line 162. Missing shortcut.
  Suggested: `title="Ordered List (Ctrl+Shift+7)"`

- [ ] **Blockquote button** — Line 169. Missing shortcut.
  Suggested: `title="Blockquote (Ctrl+Shift+B)"`

- [ ] **Code Block button** — Line 176. Missing shortcut.
  Suggested: `title="Code Block (Ctrl+Alt+C)"`

- [ ] **Image button** — Line 214. Missing shortcut.
  Suggested: `title="Insert Image (Ctrl+Shift+I)"`

- [ ] **Horizontal Rule button** — Line 220. No format hint.
  Suggested: `title="Horizontal Rule (---)"`

- [ ] **Link URL input** — Lines 245-265. No `aria-label`.
  Suggested: `aria-label="URL for link"`

- [ ] **Nunjucks menu dropdown** — Line 228. No `title` on the trigger button.
  Suggested: `title="Insert template variables and Nunjucks syntax"`

---

## 9. Brainstorm Module

### BrainstormTab.tsx

- [ ] **Status label** ("Working copy has changes" / "Brainstorm") — Line 233
  No tooltip explaining what "working copy" means.
  Suggested: `title="You're editing a copy. Click 'Apply Changes' to save to the original file."`

### BlockCanvas.tsx

- [ ] **Proposal banner** ("Agent proposes X changes") — Lines 165-200
  No guidance text for what a "proposal" is.
  Suggested: Add subtitle: "Review the agent's suggested changes below. Accept or reject each one."

- [ ] **Accept/Reject buttons on banner** — Lines 182, 190
  No tooltips.
  Suggested: Accept = `title="Accept all proposed changes"`, Reject = `title="Reject all proposed changes and keep current content"`

- [ ] **"Canvas" heading** — Line 157
  New users don't know what "Canvas" means here.
  Suggested: `title="Visual editing area for document structure and metadata"`

### Block Renderers (MetadataBlock, ParametersBlock, ContentBlock)

- [ ] **Per-block Accept/Reject buttons** — Lines ~115-120 in each
  Have `title="Accept change"` but too generic.
  Suggested: `title="Accept this section's proposed changes"` / `title="Reject this section's proposed changes"`

- [ ] **Proposal description text** — Lines ~179-182
  Shows agent reasoning but no label explaining what it is.
  Suggested: Add prefix label "Agent's reasoning:" above the description

### App.tsx — Brainstorm Entry Point

- [ ] **GradientPrompdIcon (P button)** — Lines 4405-4408
  Has `title="Open Brainstorm"` but doesn't explain what brainstorm does.
  Suggested: `title="Open Brainstorm: Collaborate with AI to edit this file on a working copy you control"`

---

## Summary by Priority

### Critical (Blocks understanding for new users)
| Count | Area | Issue |
|-------|------|-------|
| 1 | Permission selector | No tooltip at all — users can't learn Auto/Confirm/Plan without clicking |
| 1 | Tab close button | Not a `<button>`, not keyboard-accessible |
| 1 | Status bar issues | Click area is a `<div>`, not a `<button>` |
| 1 | Empty workflow canvas | No onboarding guidance |
| 1 | Dirty indicator | Unexplained bullet dot |

### High (Significantly impacts learning curve)
| Count | Area | Issue |
|-------|------|-------|
| 4 | Permission options | Auto/Confirm/Plan lack tooltips explaining what they do |
| 1 | Brainstorm toggle | Tooltip doesn't explain what brainstorm mode IS |
| 1 | File Explorer empty state | "No files" with no guidance |
| 1 | Node palette categories | No descriptions on any category |
| 30+ | Context menu node types | No descriptions in "Add Node" submenu |
| 1 | Execution empty state | Doesn't explain HOW to execute |
| 1 | P button | Doesn't explain what brainstorm does |

### Medium (Quality of life)
| Count | Area | Issue |
|-------|------|-------|
| 8+ | WYSIWYG toolbar | Missing keyboard shortcut hints |
| 6 | Bottom panel tabs | Missing aria-label and tab roles |
| 5+ | Publish modal fields | No format guidance or help text |
| 5 | Setup wizard | Missing placeholders, labels, explanations |
| 4 | Chat panel menus | Vague titles on "More options" menu items |
| 3 | Execution result tabs | No aria-label or role attributes |
| 3 | Generation controls | Missing aria-label on slider/input |
| 2 | Brainstorm proposals | No guidance on accept/reject workflow |
| 1 | "IMG" toggle | Cryptic abbreviation |

### Low (Polish)
| Count | Area | Issue |
|-------|------|-------|
| 10+ | Various icon buttons | Missing aria-label (have title) |
| 5 | Toolbar buttons | Have title, missing aria-label |
| 2 | Version/BETA badges | Could have explanatory tooltips |
| 1 | Resize handles | No drag hint tooltip |
