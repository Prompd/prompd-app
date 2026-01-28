# Prompd Agent Integration Architecture

## Overview

This document outlines the architecture for integrating Cline-like AI coding agent capabilities into Prompd. The goal is to enable autonomous AI-assisted development workflows within the editor.

## What We're Building

An **Agent Mode** that allows the AI to:
1. Read and analyze files in the project
2. Write/modify files (with user approval)
3. Execute terminal commands (with user approval)
4. Search and navigate the codebase
5. Work autonomously on multi-step tasks

## Existing Infrastructure We Can Leverage

### Already Have
| Component | Location | What It Does |
|-----------|----------|--------------|
| Monaco Editor | `frontend/src/modules/editor/` | Full editor with file tabs |
| Electron IPC | `frontend/electron/main.js` | File read/write, directory listing |
| Git Integration | `GitPanel.tsx` + IPC handlers | Whitelisted git commands |
| LLM Execution | `backend/src/services/` | OpenAI, Anthropic, Google APIs |
| Chat UI | `AiChatPanel.tsx` | Multi-mode conversation interface |
| Chat Modes | `backend/src/prompts/modes/` | Mode-specific system prompts |

### Need to Build
| Component | Purpose |
|-----------|---------|
| Tool Definitions | JSON schema for agent tools |
| Agentic Loop | Execute tools, handle responses, iterate |
| Approval Flow | User confirms file writes/commands |
| Context Manager | Track files read, changes made |
| Terminal Integration | Execute and stream command output |

---

## Architecture Design

### 1. New Chat Mode: "Agent"

Add to existing chat modes in `backend/src/prompts/modes/agent.json`:

```json
{
  "id": "agent",
  "name": "Agent",
  "icon": "robot",
  "description": "Autonomous coding assistant that can read, write, and execute",
  "systemPrompt": "You are an AI coding agent...",
  "tools": ["read_file", "write_file", "list_files", "search_files", "run_command", "ask_user"],
  "requiresApproval": ["write_file", "run_command"],
  "maxIterations": 25
}
```

### 2. Tool Schema Definitions

```typescript
// frontend/src/modules/services/agentTools.ts

export interface Tool {
  name: string
  description: string
  parameters: JSONSchema
  requiresApproval: boolean
}

export const AGENT_TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from workspace root" }
      },
      required: ["path"]
    },
    requiresApproval: false
  },
  {
    name: "write_file",
    description: "Write content to a file (creates or overwrites)",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" }
      },
      required: ["path", "content"]
    },
    requiresApproval: true  // User must approve
  },
  {
    name: "list_files",
    description: "List files in a directory",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", default: "." },
        recursive: { type: "boolean", default: false }
      }
    },
    requiresApproval: false
  },
  {
    name: "search_files",
    description: "Search for text pattern in files",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        glob: { type: "string", default: "**/*" }
      },
      required: ["pattern"]
    },
    requiresApproval: false
  },
  {
    name: "run_command",
    description: "Execute a shell command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string", description: "Working directory (relative)" }
      },
      required: ["command"]
    },
    requiresApproval: true  // User must approve
  },
  {
    name: "ask_user",
    description: "Ask the user a clarifying question",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" }
      },
      required: ["question"]
    },
    requiresApproval: false
  }
]
```

### 3. Agentic Loop Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Message                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Agent Service                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Build Context:                                      │   │
│  │  - System prompt (agent mode)                        │   │
│  │  - Tool definitions                                  │   │
│  │  - Workspace structure                               │   │
│  │  - Previously read files                             │   │
│  │  - Conversation history                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      LLM API Call                           │
│  (with tools/function calling enabled)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    Text Response        │     │    Tool Call(s)         │
│    (Display to user)    │     │                         │
└─────────────────────────┘     └─────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                ┌─────────────────────────┐   ┌─────────────────────────┐
                │  No Approval Needed     │   │  Approval Required      │
                │  (read_file, list_files)│   │  (write_file, run_cmd)  │
                └─────────────────────────┘   └─────────────────────────┘
                              │                               │
                              │                               ▼
                              │               ┌─────────────────────────┐
                              │               │  Show Approval Dialog   │
                              │               │  - Preview changes      │
                              │               │  - Diff view            │
                              │               │  [Approve] [Reject]     │
                              │               └─────────────────────────┘
                              │                               │
                              │               ┌───────────────┴───────────┐
                              │               │                           │
                              ▼               ▼                           ▼
                ┌─────────────────────────────────────┐   ┌───────────────────┐
                │         Execute Tool                │   │  Rejected         │
                │         Return Result               │   │  (Tell AI)        │
                └─────────────────────────────────────┘   └───────────────────┘
                              │                                    │
                              └──────────────┬─────────────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────────────┐
                              │  Add Tool Result to Conversation    │
                              │  Loop back to LLM API Call          │
                              │  (until done or max iterations)     │
                              └─────────────────────────────────────┘
```

### 4. Frontend Components

#### AgentChatPanel (extends existing AiChatPanel)

```typescript
// New or modified: frontend/src/modules/editor/AgentChatPanel.tsx

interface AgentState {
  isRunning: boolean
  currentIteration: number
  maxIterations: number
  pendingApproval: PendingApproval | null
  toolHistory: ToolExecution[]
  filesRead: Set<string>
  filesWritten: Set<string>
}

interface PendingApproval {
  id: string
  tool: string
  params: Record<string, unknown>
  preview?: string  // For write_file, show diff
}

interface ToolExecution {
  tool: string
  params: Record<string, unknown>
  result: string
  approved: boolean
  timestamp: Date
}
```

#### Approval Dialog Component

```typescript
// frontend/src/modules/components/ApprovalDialog.tsx

interface ApprovalDialogProps {
  approval: PendingApproval
  onApprove: () => void
  onReject: () => void
  onApproveAll: () => void  // "Trust this session"
}

// For write_file: Show Monaco diff editor
// For run_command: Show command with warning about shell access
```

### 5. Backend Service

```javascript
// backend/src/services/AgentService.js

export class AgentService {
  constructor(llmService, fileService) {
    this.llmService = llmService
    this.fileService = fileService
    this.activeSessions = new Map()
  }

  async executeAgentLoop(sessionId, userMessage, context) {
    const session = this.getOrCreateSession(sessionId)
    session.messages.push({ role: 'user', content: userMessage })

    let iterations = 0
    const maxIterations = context.maxIterations || 25

    while (iterations < maxIterations) {
      iterations++

      // Call LLM with tools
      const response = await this.llmService.chat({
        messages: session.messages,
        tools: this.getToolDefinitions(),
        model: context.model || 'claude-sonnet-4-20250514'
      })

      // Check if LLM wants to use tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          // Emit tool call event (frontend shows approval if needed)
          const result = await this.executeToolWithApproval(
            sessionId,
            toolCall,
            context.workspacePath
          )

          // Add tool result to messages
          session.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          })
        }
      } else {
        // No more tool calls, return final response
        session.messages.push({ role: 'assistant', content: response.content })
        return {
          done: true,
          response: response.content,
          iterations,
          toolHistory: session.toolHistory
        }
      }
    }

    return {
      done: false,
      response: "Reached maximum iterations. Pausing for input.",
      iterations
    }
  }
}
```

### 6. WebSocket Events for Real-time Updates

```typescript
// Real-time communication between frontend and backend

// Frontend -> Backend
socket.emit('agent:start', { message, context })
socket.emit('agent:approve', { approvalId })
socket.emit('agent:reject', { approvalId, reason })
socket.emit('agent:stop')

// Backend -> Frontend
socket.emit('agent:thinking', { iteration })
socket.emit('agent:tool_call', { tool, params, requiresApproval })
socket.emit('agent:tool_result', { tool, result })
socket.emit('agent:approval_needed', { approvalId, tool, params, preview })
socket.emit('agent:message', { content, done })
socket.emit('agent:error', { error })
socket.emit('agent:complete', { summary })
```

### 7. Tool Executors (Electron IPC)

```javascript
// frontend/electron/main.js - Add new IPC handlers

// Already have:
// - readFile, writeFile, readDir

// Need to add:
ipcMain.handle('agent:search-files', async (event, { pattern, glob, cwd }) => {
  // Use ripgrep or node-glob for fast searching
  const { execSync } = require('child_process')
  try {
    // Security: validate pattern, prevent command injection
    const sanitizedPattern = pattern.replace(/[`$()]/g, '')
    const result = execSync(
      `rg --json "${sanitizedPattern}" --glob "${glob}"`,
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    )
    return { success: true, matches: parseRipgrepOutput(result) }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('agent:run-command', async (event, { command, cwd }) => {
  // CRITICAL: This is dangerous - needs careful sandboxing
  // Option 1: Whitelist allowed commands
  // Option 2: Run in Docker container
  // Option 3: Use pseudo-terminal with user confirmation

  const allowedPrefixes = ['npm', 'node', 'git', 'npx', 'yarn', 'pnpm', 'tsc', 'eslint']
  const firstWord = command.split(' ')[0]

  if (!allowedPrefixes.includes(firstWord)) {
    return {
      success: false,
      error: `Command '${firstWord}' not in allowed list. Allowed: ${allowedPrefixes.join(', ')}`
    }
  }

  // Execute with timeout
  const { spawn } = require('child_process')
  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, cwd, timeout: 60000 })
    let stdout = '', stderr = ''

    proc.stdout.on('data', (data) => { stdout += data })
    proc.stderr.on('data', (data) => { stderr += data })

    proc.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr, exitCode: code })
    })
  })
})
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Add `agent.json` chat mode configuration
- [ ] Define tool schemas in TypeScript
- [ ] Create basic `AgentService` backend service
- [ ] Add WebSocket events for agent communication

### Phase 2: Tool Execution (Week 2)
- [ ] Implement `read_file` tool (uses existing IPC)
- [ ] Implement `list_files` tool (uses existing IPC)
- [ ] Implement `search_files` tool (new IPC handler)
- [ ] Create approval dialog component
- [ ] Implement `write_file` with diff preview

### Phase 3: Agentic Loop (Week 3)
- [ ] Implement iteration loop in AgentService
- [ ] Add tool result handling
- [ ] Create context accumulation (files read, etc.)
- [ ] Add stop/pause controls
- [ ] Implement max iterations safeguard

### Phase 4: Command Execution (Week 4)
- [ ] Implement `run_command` with sandboxing
- [ ] Add terminal output streaming
- [ ] Create command history view
- [ ] Security review and hardening

### Phase 5: Polish (Week 5)
- [ ] Tool execution progress indicators
- [ ] Session persistence/resume
- [ ] Cost tracking per session
- [ ] "Trust this session" feature
- [ ] Keyboard shortcuts (Approve: Enter, Reject: Esc)

---

## Security Considerations

### File System Access
- **Scope**: Only allow access within workspace directory
- **Path Traversal**: Block `..` and absolute paths outside workspace
- **Sensitive Files**: Warn on `.env`, credentials, keys

### Command Execution
- **Whitelist Approach**: Only allow known-safe commands
- **Timeout**: 60 second max per command
- **Output Limits**: Cap stdout/stderr at 1MB
- **No Shell Metacharacters**: Reject `|`, `>`, `&&`, `;`, backticks

### LLM Safety
- **Iteration Limit**: Max 25 iterations per request
- **Token Limit**: Cap context at reasonable size
- **Cost Tracking**: Show estimated cost before expensive operations

---

## UI/UX Mockup

```
┌─────────────────────────────────────────────────────────────┐
│  Chat Mode: [Generate] [Explore] [Edit] [Discuss] [●Agent]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User: Add a dark mode toggle to the settings page          │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Agent: I'll help you add a dark mode toggle. Let me first  │
│  explore the codebase to understand the current setup.      │
│                                                             │
│  📖 Reading: src/modules/components/SettingsModal.tsx       │
│  📖 Reading: src/stores/uiStore.ts                          │
│  🔍 Searching: "theme" in **/*.ts                           │
│                                                             │
│  I found the settings modal and UI store. I'll now create   │
│  the dark mode toggle.                                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ⚠️ APPROVAL REQUIRED                                 │   │
│  │                                                      │   │
│  │ Write to: src/stores/uiStore.ts                     │   │
│  │                                                      │   │
│  │ @@ -15,6 +15,8 @@                                   │   │
│  │  interface UIState {                                │   │
│  │    sidebarOpen: boolean                             │   │
│  │ +  darkMode: boolean                                │   │
│  │ +  toggleDarkMode: () => void                       │   │
│  │  }                                                  │   │
│  │                                                      │   │
│  │  [Approve] [Reject] [Approve All This Session]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Stop Agent]  Iteration 3/25  Files: 4 read, 0 written     │
├─────────────────────────────────────────────────────────────┤
│  > Type a message or give feedback...              [Send]   │
└─────────────────────────────────────────────────────────────┘
```

---

## Open Questions for Discussion

1. **Approval Granularity**: Per-file, per-tool, or per-session trust?

2. **Command Execution Strategy**:
   - Whitelist only (safer, limited)
   - Docker sandbox (complex, flexible)
   - User confirms every command (safer, slower)

3. **Context Window Management**: How to handle large codebases without exceeding token limits?

4. **Cost Controls**: Should we require users to set spending limits?

5. **Multi-file Operations**: How to handle operations that need to modify multiple files atomically?

6. **Integration with Existing Modes**: Should agent mode subsume edit mode, or stay separate?

---

## Comparison with Cline

| Feature | Cline | Our Plan |
|---------|-------|----------|
| Read files | ✅ | ✅ Phase 2 |
| Write files | ✅ | ✅ Phase 2 |
| Terminal commands | ✅ | ✅ Phase 4 |
| Approval flow | ✅ | ✅ Phase 2 |
| Browser automation | ✅ | ❌ Not planned |
| MCP integration | ✅ | 🔄 Future |
| Multi-model support | ✅ | ✅ Already have |
| Cost tracking | ✅ | ✅ Phase 5 |

---

## Next Steps

1. Review this architecture together
2. Decide on security approach for command execution
3. Prioritize which tools to implement first
4. Create detailed tickets for Phase 1