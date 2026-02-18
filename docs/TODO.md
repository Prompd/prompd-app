# Prompd TODO / Backlog

## Node Templates (Save & Reuse Nodes)

**Summary:** Allow users to save any workflow node as a reusable template, packaged as a `.pdpkg`.

**Design decisions made:**
- Storage: workspace-level (`.prompd/templates/`) for now
- Format: `.pdpkg` with `type: "node-template"` in manifest — reuses existing packaging pipeline
- Scope: all node types saveable (prompt, agent, tool, condition, transform, etc.)
- File dependencies: packaged via existing dependency tracing (inherits, context, includes)

**Implementation:**
- [ ] Right-click context menu on canvas nodes: "Save as Template"
- [ ] Name/description prompt dialog
- [ ] Package node config + traced file dependencies into `.pdpkg`
- [ ] Save to `.prompd/templates/{name}.pdpkg`
- [ ] IPC handlers: `template:save`, `template:list`, `template:insert`
- [ ] Browse/insert UI (templates section in node picker or dedicated panel)
- [ ] Extract `.pdpkg` on insert, add node to canvas with restored config

**Registry integration (post-beta):**
- [ ] Add `packageType` field to Package model (`'package' | 'workflow' | 'node-template'`)
- [ ] Read `type` from uploaded manifest, store as `packageType`
- [ ] Search/filter API: filter by `packageType`
- [ ] PackagePanel UI: filter tabs or icons by type
- [ ] Publish node templates to registry

**Notes:**
- `.node` file extension is taken (Node.js native addon binaries) — use `.pdpkg` with `type` field instead
- CLI `PackageManifest.type` is already a loose `string` — no validation changes needed
- Existing types in practice: `"package"` (CLI), `"workflow"` (frontend deployment)
- MongoDB Package model currently has no `packageType` field — only `category` (ai-tools, templates, etc.)

---

## React Popup Chat Window (Migrate from vanilla HTML)

**Summary:** Replace `popup-input.html` (vanilla JS/HTML) with a React-based popup window using `@prompd/react` chat components for a richer workflow user-input experience.

**Why:**
- `@prompd/react` already has `PrompdChat`, `PrompdMessages`, `PrompdChatInput` with markdown rendering, streaming indicators, message history navigation, and theming
- Current vanilla HTML duplicates chat UI patterns that exist in the library
- React version would get markdown-formatted assistant messages, syntax-highlighted code blocks, and consistent theming with the main app

**Current state (what works today):**
- `frontend/electron/popup-input.html` — standalone frameless BrowserWindow
- `frontend/electron/popup-preload.js` — IPC bridge (`getRequestData`, `submitInput`, `cancel`, `onNewRequest`, `onDone`)
- `frontend/electron/main.js` — `createInputPopupWindow()` reuses window across loop iterations, `closePopupWindow()` on execution end
- Chat history persists within the window session (user bubbles, prompt bubbles, context bubbles, thinking dots, completion message)

**Implementation plan:**

### 1. Vite multi-page entry point
- [ ] Create `frontend/src/popup.tsx` — minimal React entry (`createRoot`, renders `<PopupChat />`)
- [ ] Create `frontend/popup.html` — HTML shell that loads the React entry
- [ ] Update `frontend/vite.config.ts` — add `build.rollupOptions.input.popup` for the second entry point
- [ ] Verify dev server serves `/popup.html` and production build outputs it

### 2. PopupChat component
- [ ] Create `frontend/src/modules/components/popup/PopupChat.tsx`
- [ ] Use `PrompdMessages` for the message list (map `UserInputRequest` to `PrompdChatMessage[]`)
- [ ] Use `PrompdChatInput` for the input area (wire `onSend` to `window.popupAPI.submitInput`)
- [ ] Support all input types: text, textarea, number, choice, confirm
- [ ] Handle `window.popupAPI.onNewRequest()` — append new prompt messages to state
- [ ] Handle `window.popupAPI.onDone()` — show completion system message
- [ ] Apply theming via CSS variables (dark theme to match current design)

### 3. Wire up main process
- [ ] Update `createInputPopupWindow()` in `main.js` to load:
  - Dev: `http://localhost:5173/popup.html`
  - Prod: `path.join(__dirname, '../dist/popup.html')`
- [ ] Keep `popup-preload.js` as-is (IPC bridge doesn't change)
- [ ] Verify `@prompd/react` CSS is bundled in the popup entry (not just the main app)

### 4. Electron Builder
- [ ] Verify `popup.html` + its JS/CSS chunks are included in the packaged app
- [ ] Test frameless window behavior on Windows/macOS

### 5. Cleanup
- [ ] Remove `popup-input.html` (replaced by React version)
- [ ] Remove `UserInputDialog.tsx` + `UserInputDialog.css` if no longer used in-app (or keep for non-automated mode)

**Risks / considerations:**
- Popup React bundle size — `@prompd/react` + React adds ~200-300KB. Acceptable for a desktop app.
- Vite multi-page builds are straightforward but need testing with electron-builder's asar packaging
- `popup-preload.js` IPC bridge stays vanilla — React component calls `window.popupAPI.*` the same way
- The in-app `UserInputDialog.tsx` (React modal in WorkflowCanvas) is separate and used for interactive (non-automated) mode — may want to unify later

**Dependencies:** `@prompd/react@0.2.0` (already installed in frontend)

---

## Multi-Window Architecture (1 Tray + N Children)

**Summary:** Evolve from a single-window Electron app to a tray-resident daemon that spawns N independent child windows. The main process stays alive as the service host; each child window is a full editor/workflow instance.

**Architecture:**

```
Main Process (always running)
├── Tray icon + menu
├── Services (MCP server, scheduler, webhooks, file watchers)
├── Window Manager (Map<windowId, BrowserWindow>)
├── IPC Router (dispatches events to correct window)
│
├── Child Window 1 — workspace A, workflow editor
├── Child Window 2 — workspace B, workflow editor
├── Child Window 3 — chat agent popup
└── ...N windows
```

**What already works in our favor:**
- Tray app (`tray.js`) runs independently of the main window
- Services (MCP server, deployment, triggers, webhooks) live in main process, window-agnostic
- Popup chat window proves multi-BrowserWindow works
- Zustand stores are per-renderer — each window gets isolated state automatically
- `event.sender` is already available in all IPC handlers (just not used yet)

### Implementation

#### 1. Window Manager
- [ ] Create `frontend/electron/windowManager.js` — `Map<id, BrowserWindow>` with create/destroy/get/list
- [ ] `createChildWindow(opts)` — spawns a new BrowserWindow loading the Vite app, tracks by ID
- [ ] Track which workspace each window owns (prevent two windows on same workspace)
- [ ] Emit `window-created` / `window-closed` events for tray menu updates

#### 2. IPC Routing (biggest effort)
- [ ] Audit all `mainWindow.webContents.send()` calls in `main.js` (~50+ occurrences)
- [ ] Replace with `event.sender.send()` or `windowManager.get(targetId).webContents.send()`
- [ ] For execution events: track `executionId -> windowId` mapping so results go to the right window
- [ ] For broadcast events (deployment-updated, trigger state changes): send to all windows
- [ ] Pattern: `windowManager.sendTo(windowId, channel, data)` and `windowManager.broadcast(channel, data)`

#### 3. Single Instance Lock
- [ ] Currently `app.requestSingleInstanceLock()` blocks second launches
- [ ] Change to: second launch sends `open-new-window` IPC to existing instance
- [ ] Existing instance spawns a new child window via windowManager
- [ ] Pass CLI args (file path, workspace) from second launch to new window

#### 4. Tray Menu Updates
- [ ] "New Window" menu item → `windowManager.createChildWindow()`
- [ ] Dynamic window list submenu — click to focus/bring to front
- [ ] Show workspace name per window in submenu
- [ ] Update menu on window create/close events

#### 5. File Watchers
- [ ] Currently one global watcher for one workspace
- [ ] Change to per-window watchers, or shared watcher with per-window dispatch
- [ ] `fileWatchService.watchForWindow(windowId, workspacePath)`
- [ ] On file change, only notify the window that owns that workspace

#### 6. App Lifecycle
- [ ] App stays alive when all windows close (tray-only mode) — partially done
- [ ] `app.on('window-all-closed')` → don't quit, keep tray
- [ ] "Quit" only from tray menu or last-window-close + shift (or preference)
- [ ] Services keep running in tray-only mode (MCP server, scheduled workflows)

#### 7. Shared State Coordination
- [ ] Main process holds authoritative state for: running deployments, active triggers, MCP server status
- [ ] Child windows query via IPC (already the pattern)
- [ ] For cross-window awareness (e.g., "workspace X is open in window 2"): thin registry in main process
- [ ] No shared Zustand — each renderer is independent, which is correct

**Effort estimate by area:**

| Area | Size | Notes |
|------|------|-------|
| Window Manager | Small | New module, ~100 lines |
| IPC Routing | Medium-Large | Audit + refactor ~50 handlers. Mechanical but wide. |
| Single Instance | Small | Change lock behavior + arg forwarding |
| Tray Menu | Small | Dynamic submenu from window list |
| File Watchers | Small-Medium | Per-window scoping |
| App Lifecycle | Small | Already partially implemented for tray |
| Shared State | Small | Main process registry, query-only from renderers |

**Key insight:** Each child window gets its own React app, Zustand stores, and Monaco instance for free. No shared-memory issues. Windows communicate through main process IPC, which is the Electron-blessed pattern.

**What does NOT need to change:**
- `@prompd/react` — renderer-only, window-isolated
- `@prompd/scheduler` — main-process service, already window-agnostic
- Monaco editor config — per-renderer
- Zustand stores — per-renderer
- Preload script — same for all windows

**Prerequisites:** None — can start incrementally. First step: extract `mainWindow` references into `windowManager` without changing behavior (single window via manager). Then add multi-window support.
