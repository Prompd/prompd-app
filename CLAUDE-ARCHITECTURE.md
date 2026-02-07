# CLAUDE-ARCHITECTURE.md

Deep architectural details for Claude Code when working in this repository. Read [CLAUDE.md](CLAUDE.md) first for basic setup and commands.

## Table of Contents
- [Workflow System Architecture](#workflow-system-architecture)
- [State Management Deep Dive](#state-management-deep-dive)
- [Execution Model](#execution-model)
- [Security Architecture](#security-architecture)
- [Additional Services](#additional-services)

## Workflow System Architecture

### Complete Node Type Registry

**Source:** [frontend/src/modules/components/workflow/nodes/](frontend/src/modules/components/workflow/nodes/)

| Category | Node Type | Component File | Purpose |
|----------|-----------|----------------|---------|
| **Core Nodes** | | | |
| | `trigger` | TriggerNode.tsx | Workflow entry point (manual, scheduled, webhook) |
| | `prompt` | PromptNode.tsx | Execute .prmd file with parameters |
| | `agent` | AgentNode.tsx | Single-shot LLM agent |
| | `chatAgent` | ChatAgentNode.tsx | Multi-turn conversational agent with tool use |
| | `tool` | ToolNode.tsx | Function/API tool definition |
| | `mcpTool` | McpToolNode.tsx | Model Context Protocol tool integration |
| **Execution Nodes** | | | |
| | `command` | CommandNode.tsx | Execute shell commands (whitelisted) |
| | `code` | CodeNode.tsx | Execute JavaScript/TypeScript code |
| | `claudeCode` | ClaudeCodeNode.tsx | Invoke Claude Code agent |
| | `workflow` | WorkflowNode.tsx | Sub-workflow execution |
| **Flow Control** | | | |
| | `condition` | ConditionNode.tsx | Conditional branching (if/else) |
| | `loop` | LoopNode.tsx | Iteration over arrays/ranges |
| | `parallel` | ParallelNode.tsx | Base parallel execution node |
| | `parallelBroadcast` | ParallelBroadcastNode.tsx | Send same input to all branches |
| | `parallelFork` | ParallelForkNode.tsx | Distribute array items across branches |
| | `merge` | MergeNode.tsx | Combine outputs from multiple nodes |
| | `errorHandler` | ErrorHandlerNode.tsx | Catch and handle errors |
| | `guardrail` | GuardrailNode.tsx | Validate output against rules |
| **Data Nodes** | | | |
| | `transform` | TransformNode.tsx | Data transformation (jq-style queries) |
| | `memory` | MemoryNode.tsx | Store/retrieve from memory service |
| | `callback` | CallbackNode.tsx | HTTP callback to external service |
| | `provider` | ProviderNode.tsx | Set LLM provider/model for downstream nodes |
| **UI Nodes** | | | |
| | `userInput` | UserInputNode.tsx | Prompt user for input during execution |
| | `output` | OutputNode.tsx | Display output to user |
| **Routing Nodes** | | | |
| | `toolCallParser` | ToolCallParserNode.tsx | Parse LLM tool call responses |
| | `toolCallRouter` | ToolCallRouterNode.tsx | Route tool calls to appropriate handlers |
| | `container` | ContainerNode.tsx | Group nodes visually (no execution logic) |

**Total:** 25 distinct node types with 26 component files

### Workflow Execution State

**Source:** [frontend/src/stores/workflowStore.ts](frontend/src/stores/workflowStore.ts)

The workflow store tracks comprehensive execution state:

```typescript
interface WorkflowStoreState {
  // Execution state - persisted across tab switches
  executionState: WorkflowExecutionState | null  // Current running state
  executionResult: (WorkflowResult & { trace?: ExecutionTrace }) | null  // Last result
  checkpoints: CheckpointEvent[]  // Agent checkpoints captured
  promptsSent: PromptSentInfo[]  // All prompts sent to LLMs (for debugging)
  executionHistory: ExecutionHistoryEntry[]  // Past executions (last 50)

  // History entry structure
  interface ExecutionHistoryEntry {
    id: string
    workflowName: string
    status: 'success' | 'error' | 'cancelled'
    timestamp: number
    duration: number
    result: WorkflowResult & { trace?: ExecutionTrace }
    checkpoints: CheckpointEvent[]
    promptsSent: PromptSentInfo[]
  }
}
```

**Key Methods:**
- `setExecutionResult()` - Store workflow result
- `setCheckpoints()` - Update checkpoint list
- `setPromptsSent()` - Track prompts for debugging
- `clearExecutionState()` - Reset all execution state
- `loadExecutionFromHistory()` - Restore previous execution
- `clearExecutionHistory()` - Clear history

### Scheduler System

**Location:** [frontend/electron/main.js](frontend/electron/main.js) (lines 250-350 approx)

**Architecture:**
- Uses `node-cron@^3.0.3` in Electron main process (not renderer)
- Persistent storage of scheduled workflows
- Two scheduling modes:
  - **Cron:** Standard cron expressions (`*/5 * * * *`)
  - **Interval:** Simple millisecond intervals (`60000` = 1 minute)

**IPC Bridge:**
```typescript
// Add scheduled job
window.electronAPI.scheduler.addJob({
  workflowId: string,
  type: 'cron' | 'interval',
  cron?: string,  // For type='cron'
  interval?: number  // For type='interval'
})

// Remove scheduled job
window.electronAPI.scheduler.removeJob(jobId: string)

// List all jobs
window.electronAPI.scheduler.listJobs() // Returns array of job metadata
```

### Webhook Proxy System

**Feature:** Workflows can be triggered by webhooks via proxy service.

**Architecture:**
- Webhook URLs routed through proxy server
- Proxy forwards to local Electron app via persistent connection
- Allows local-first workflows to receive external HTTP triggers
- Security: Webhooks validated and rate-limited at proxy

**Implementation:** Details in commit "Add webhook proxy and persistent workflow scheduler"

### Workflow History & Undo/Redo

**Source:** [frontend/src/stores/workflowStore.ts](frontend/src/stores/workflowStore.ts)

**Configuration:**
- Max history size: 50 snapshots
- Debounce threshold: 300ms (prevents excessive snapshots during rapid edits)
- Snap threshold: 100px (minimum position change to trigger history)

**History Structure:**
```typescript
interface HistorySnapshot {
  workflowFile: WorkflowFile | null
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
  timestamp: number
}
```

**Triggers:**
- Node added/deleted/moved (>100px)
- Edge added/deleted
- Node data updated
- Load workflow (resets history)

**Methods:**
- `pushHistory()` - Create snapshot (debounced)
- `undo()` - Restore previous snapshot
- `redo()` - Restore next snapshot
- `canUndo()` / `canRedo()` - Check availability

## State Management Deep Dive

### Store Sizes and Complexity

| Store | File Size | Complexity | Key Responsibilities |
|-------|-----------|------------|----------------------|
| editorStore | ~18KB | Medium | Tabs, file tree, build output, dirty tracking |
| uiStore | ~35KB | Medium-High | Theme, sidebar, modals, LLM provider selection, API key management |
| wizardStore | ~3KB | Low | Transient wizard state (not persisted) |
| workflowStore | ~85KB | Very High | Canvas state, 25+ node types, undo/redo, execution tracking, history |

### workflowStore Complexity Breakdown

**Why 85KB?**
1. **Node Type Support:** 25+ node types each with unique data structures
2. **Execution Tracking:** Real-time execution state for all nodes (status, output, timing)
3. **History System:** 50 snapshots with full workflow state
4. **Execution History:** Past workflow runs with results, traces, checkpoints, prompts
5. **Validation:** Real-time validation with detailed error/warning structures
6. **Connections:** External service connections (SSH, DB, HTTP API)
7. **Custom Commands:** User-defined shell command whitelist
8. **Docking System:** Complex node docking/undocking logic

**Performance Considerations:**
- Immer middleware for immutable updates
- Debounced history snapshots (300ms)
- Selective Zustand subscriptions to prevent re-renders
- Persist middleware (state saved to localStorage)

### Selective Subscriptions Pattern

**CRITICAL:** Always use selective subscriptions to prevent unnecessary re-renders.

```typescript
// ❌ BAD - Component re-renders on ANY store change
const store = useWorkflowStore()

// ✅ GOOD - Component only re-renders when nodes change
const nodes = useWorkflowStore(state => state.nodes)

// ✅ GOOD - Multiple selective subscriptions
const nodes = useWorkflowStore(state => state.nodes)
const edges = useWorkflowStore(state => state.edges)
const isExecuting = useWorkflowStore(state => state.isExecuting)

// ✅ GOOD - Selector function for derived state
const nodeCount = useWorkflowStore(state => state.nodes.length)

// ✅ GOOD - Access actions without subscribing to state
const addNode = useWorkflowStore(state => state.addNode)
const deleteNode = useWorkflowStore(state => state.deleteNode)
```

**Why This Matters:**
- workflowStore updates frequently during execution
- A single component with `const store = useWorkflowStore()` will re-render on every node status change
- With 20+ nodes executing, this causes thousands of unnecessary renders
- Selective subscriptions ensure components only re-render when their specific data changes

## Execution Model

### Local-First Architecture

**All core operations execute locally:**

```
User Action
  ↓
executionRouter.ts (decides local vs backend)
  ↓
localExecutor.ts (local execution path)
  ↓
Direct HTTPS to LLM APIs (OpenAI, Anthropic, Google, etc.)
```

**For Compilation:**
```
User Action
  ↓
localCompiler.ts
  ↓
Electron IPC Bridge
  ↓
Main Process → @prompd/cli (Node.js modules)
  ↓
Compiled Prompt
```

**Why IPC for Compilation?**
- `@prompd/cli` main export uses Node.js modules (fs, path, crypto)
- These are not available in browser/renderer process
- Vite cannot bundle Node.js modules for browser
- Solution: Proxy via Electron IPC to main process

**What Uses Backend (Optional):**
- Provider/model list updates (`/api/llm-providers`) - cached locally for offline
- Registry package search (`registry.prompdhub.ai`)
- Usage analytics (`/api/usage/sync`)
- Cloud project sync (`/api/projects`)

### API Key Resolution Priority

1. **Workspace `.env` file** (current working directory)
2. **User config** (`~/.prompd/config.yaml`)
3. **System environment variables**

**Source:** [frontend/src/modules/services/configService.ts](frontend/src/modules/services/configService.ts)

### Workflow Execution Flow

**High-Level:**
```
1. WorkflowCanvas.tsx: User clicks "Run"
2. parseWorkflow() validates .pdflow file
3. createWorkflowExecutor() creates executor with callbacks
4. executor.execute() sends IPC to main process
5. Main process executes via @prompd/cli
6. IPC events stream back to renderer:
   - node-start, node-complete, node-error
   - progress (execution state updates)
   - trace-entry (debugging info)
   - checkpoint (agent events)
   - user-input-required (pause for input)
7. Renderer updates UI in real-time
8. WorkflowExecutionPanel displays results
```

**IPC Event System:**
- Main process emits events during execution
- Renderer listens via `window.electronAPI.workflow.onEvent()`
- Events are discriminated unions based on `type` field
- TypeScript narrows event.data based on event.type

**Callback Handlers:**
```typescript
const executor = createWorkflowExecutor(workflow, params, {
  onNodeStart: (nodeId) => { /* Update UI */ },
  onNodeComplete: (nodeId, output) => { /* Update UI */ },
  onNodeError: (nodeId, error) => { /* Show error */ },
  onProgress: (state) => { /* Update execution state */ },
  onCheckpoint: async (event) => { /* Handle agent checkpoint */ },
  onUserInput: async (request) => { /* Prompt user for input */ },
  onPromptExecute: async (request) => { /* Execute prompt node */ },
  onToolCall: async (request) => { /* Execute tool */ }
})
```

## Security Architecture

### Command Execution Security

**Source:** [frontend/electron/main.js](frontend/electron/main.js) - `runGitCommand()` + CommandNode execution

**Commit:** "Add secure command execution for workflow nodes"

**Git Commands Whitelist:**
- **Allowed (read-only):** `status`, `log`, `diff`, `show`, `branch`, `remote`, `fetch`
- **Allowed (user-initiated):** `add`, `commit`, `push`, `pull`, `checkout`, `merge`, `rebase`, `clone`, `init`, `config`
- **Blocked (destructive):** `gc`, `reflog`, `filter-branch`, `update-ref`
- **Blocked (server/execution):** `daemon`, `http-backend`, `shell`
- **Blocked flags:** `--exec`, `--upload-pack` (remote code execution)

**CommandNode Security:**
- Custom command whitelist managed per-workspace
- User must explicitly allow commands before execution
- Commands stored in workflowStore.customCommands
- UI prompts for approval on first use
- Scoped to workspace directory (path traversal protection)

**Path Traversal Protection:**
- All file operations validate paths
- Rejects paths containing `..`
- Normalizes paths before operations
- Scoped to workspace directory or user home

### OAuth & Protocol Registration

**Custom Protocol:** `prompd://`

**Purpose:** OAuth callbacks for services like Clerk authentication

**Configuration:** [frontend/package.json](frontend/package.json) → `build.protocols`

**Flow:**
1. User clicks "Login with Google" (via Clerk)
2. OAuth provider redirects to `prompd://auth/callback?code=...`
3. Electron intercepts `prompd://` URL
4. Main process parses URL and extracts code
5. Renderer receives callback via IPC
6. Frontend completes OAuth flow

## Additional Services

### prompd-service Directory

**Location:** [prompd-service/](prompd-service/)

**Purpose:** Standalone background service (separate from main Electron app)

**Features:**
- Docker deployment support ([Dockerfile](prompd-service/Dockerfile))
- Persistent scheduler ([scheduler.js](prompd-service/scheduler.js))
- Shared data models with main app

**Use Case:** Run scheduled workflows on headless server without Electron

**Relationship:**
- Electron app: Interactive desktop usage
- prompd-service: Headless server deployment
- Both share same workflow execution engine via `@prompd/cli`

### scheduler-shared Directory

**Location:** [scheduler-shared/](scheduler-shared/)

**Purpose:** Shared data models and utilities for scheduler

**Contents:**
- Data models for scheduled jobs
- Shared between Electron main process and prompd-service
- Ensures consistency across deployment modes

**Usage:**
```javascript
// Both Electron and prompd-service use same models
import { Job, Schedule } from '../scheduler-shared/models'
```

### Memory Service

**Source:** [frontend/src/modules/services/memoryService.ts](frontend/src/modules/services/memoryService.ts)

**Purpose:** Simple key-value memory for workflows

**Features:**
- Scoped by workflow ID (each workflow has isolated memory)
- Persistent across workflow runs (stored in IndexedDB)
- Accessed via MemoryNode in workflows
- TTL support (optional expiration)

**API:**
```typescript
memoryService.set(workflowId, key, value, ttl?)
memoryService.get(workflowId, key)
memoryService.delete(workflowId, key)
memoryService.clear(workflowId)
memoryService.list(workflowId)
```

**Use Case:** Maintain state between workflow runs (e.g., last processed ID, counters, caches)

---

## Performance Tips

### Monaco Editor Optimization

**Problem:** Monaco is large (~5MB) and slows initial load

**Solution ([vite.config.ts](frontend/vite.config.ts)):**
```javascript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        monaco: ['monaco-editor']  // Separate chunk, lazy loaded
      }
    }
  }
}
```

**Result:** Monaco loads only when editor is opened, not on app start

### Workflow Store Persistence

**Problem:** 85KB store takes ~50ms to serialize/deserialize on every change

**Solution:**
- Debounce persistence (300ms)
- Only persist on significant changes
- Use Immer middleware for efficient updates
- Exclude transient state (dragState, dockingState) from persistence

### React Flow Performance

**Problem:** Large workflows (100+ nodes) cause lag

**Best Practices:**
- Use React.memo() for node components
- Selective Zustand subscriptions (as shown above)
- Disable animations during bulk operations
- Use onlyRenderVisibleElements prop (React Flow)

---

## Development Patterns

### Error Boundary Usage

**Source:** [frontend/src/modules/components/workflow/NodeErrorBoundary.tsx](frontend/src/modules/components/workflow/NodeErrorBoundary.tsx)

**Purpose:** Catch React errors in node components without crashing entire canvas

**Usage:**
```typescript
<NodeErrorBoundary nodeId={node.id}>
  <NodeComponent {...props} />
</NodeErrorBoundary>
```

**Recovery:** Error boundaries show error UI inline, allowing other nodes to continue working

### Monaco Diff Utilities

**Source:** [frontend/src/modules/services/diffUtils.ts](frontend/src/modules/services/diffUtils.ts)

**Purpose:** Show side-by-side diff in Monaco editor

**Use Case:** Workflow history comparison, code review

**API:**
```typescript
import { showDiff } from '@/services/diffUtils'

showDiff(
  originalContent,
  modifiedContent,
  'workflow-v1.pdflow',
  'workflow-v2.pdflow'
)
```

### Tool Executor System

**Source:** [frontend/src/modules/services/toolExecutor.ts](frontend/src/modules/services/toolExecutor.ts) (62KB - very complex)

**Purpose:** Execute tools called by agents (ChatAgentNode)

**Features:**
- HTTP API tool execution
- File system operations
- Database queries
- MCP tool integration
- Security sandboxing

**Tool Definition Format:**
```typescript
interface Tool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JSONSchema>
    required: string[]
  }
  handler: (args: Record<string, unknown>) => Promise<unknown>
}
```

---

## Testing Strategy

### Backend Tests

**Source:** [backend/src/](backend/src/)

**Framework:** Jest

**Requirements:** MongoDB must be running

**Run:**
```bash
cd backend
npm test                              # All tests
npm test -- packages.test.js          # Specific file
npm test -- --testNamePattern="create" # Pattern match
```

### Frontend Tests

**Current State:** No test suite configured

**Future:** Consider Vitest (already used in @prompd/react package)

---

## Deployment

### Electron Build Process

1. `npm run clean` - Remove old builds
2. `npm run generate-icons` - Create platform icons from source PNG
3. `npm run build` - Vite build (includes license generation)
4. `electron-builder` - Create installers

**Platform-Specific:**
- Windows: NSIS installer + portable .exe
- macOS: DMG + zip
- Linux: AppImage + deb

**Output:** [frontend/dist-electron/](frontend/dist-electron/)

### Distribut ion Channels

**Configured ([frontend/package.json](frontend/package.json)):**
```json
"publish": {
  "provider": "github",
  "owner": "Logikbug",
  "repo": "prompd.app"
}
```

**Auto-Update:** electron-updater configured but not yet implemented in main.js

**Manual Distribution:** Upload installers from dist-electron/ to GitHub Releases

---

## Future Enhancements

### Planned Features (from git commits and TODOs)

1. **Live Workflow Updates:** IPC event system partially implemented, needs bidirectional control
2. **Auto-Updates:** electron-updater dependency installed, needs main.js implementation
3. **Backend-Free Mode:** Remove all backend dependencies, make 100% local-first
4. **Workflow Templates:** Gallery of starter workflows
5. **Node Marketplace:** Community-contributed custom nodes
6. **Workflow Analytics:** Execution metrics, cost tracking, performance profiling

---

*Last Updated: 2026-02-01*
*For basic setup and commands, see [CLAUDE.md](CLAUDE.md)*
*For coding guidelines, see [AGENTS.md](AGENTS.md)*
