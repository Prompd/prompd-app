# Hooks System - Proposal

**Status:** Design proposal - NOT IMPLEMENTED
**Created:** 2025-02-04
**Related:** [AGENTS.md](../AGENTS.md), [editor.md](./editor.md)

## Overview

Hooks allow users to execute custom shell commands in response to application events. This document explores what a hooks system could look like for Prompd, inspired by Claude Code's implementation.

## What Are Hooks?

Hooks are user-defined shell commands that execute automatically when specific events occur:

```yaml
# ~/.prompd/hooks.yaml (proposed)
hooks:
  before_execute:
    - command: "git status"
      description: "Check repo status before running prompts"

  after_execute:
    - command: "npm run format {output_file}"
      description: "Auto-format generated code"

  on_error:
    - command: "notify-send 'Prompd Error' '{error_message}'"
      description: "Desktop notification on errors"
```

## Claude Code's Approach

Based on observation, Claude Code uses hooks for:

1. **Pre-submit validation** - Run linters/formatters before sending to LLM
2. **Post-generation actions** - Format code, run tests, commit changes
3. **Environment setup** - Activate virtual environments, load configs
4. **Notifications** - Desktop alerts, Slack messages, logging

### Example Use Cases from Claude Code

```bash
# Before tool use - validate environment
before_tool_use: "./scripts/check-api-keys.sh"

# After file write - format and lint
after_file_write: "prettier --write {file_path}"

# After command execution - notify team
after_command: "slack-notify 'Command completed: {command}'"
```

## Proposed Architecture for Prompd

### 1. Hook Events

```typescript
type HookEvent =
  // Execution lifecycle
  | 'before_execute'     // Before prompt execution starts
  | 'after_execute'      // After successful execution
  | 'on_execute_error'   // On execution error

  // File operations
  | 'before_file_save'   // Before saving .prmd file
  | 'after_file_save'    // After saving .prmd file
  | 'before_compile'     // Before prompt compilation
  | 'after_compile'      // After successful compilation

  // Workflow operations
  | 'before_workflow_run'   // Before workflow execution
  | 'after_workflow_run'    // After workflow completion
  | 'on_workflow_error'     // On workflow error

  // Git integration
  | 'before_git_commit'  // Before git operations
  | 'after_git_push'     // After successful push
```

### 2. Hook Configuration

**Global hooks** (`~/.prompd/hooks.yaml`):
```yaml
hooks:
  before_execute:
    - command: "git status"
      enabled: true
      working_dir: "{workspace_root}"

  after_execute:
    - command: "npm run format {output_file}"
      enabled: true
      timeout: 30000  # 30 seconds
      on_error: "continue"  # or "abort"
```

**Workspace hooks** (`.prompd/hooks.yaml` in project root):
```yaml
hooks:
  before_compile:
    - command: "npm run validate-schema"
      description: "Validate prompt schema"

  after_workflow_run:
    - command: "./scripts/deploy.sh {workflow_output}"
      description: "Auto-deploy successful workflows"
```

### 3. Variable Interpolation

Available variables in hook commands:

```typescript
interface HookVariables {
  // File context
  file_path: string           // Current .prmd file path
  file_name: string           // Filename only
  workspace_root: string      // Workspace directory

  // Execution context
  provider: string            // LLM provider (openai, anthropic)
  model: string              // Model name
  output_file?: string       // Generated output path

  // Workflow context
  workflow_id?: string       // Workflow ID if applicable
  workflow_output?: string   // Workflow result

  // Error context
  error_message?: string     // Error details if on_error hook
  error_code?: string        // Error type
}
```

### 4. Security Constraints

**Critical security measures:**

```typescript
interface HookSecurity {
  // Whitelist approach - only allow specific commands
  allowedCommands: string[]  // ['git', 'npm', 'prettier', etc.]

  // Path restrictions
  allowedPaths: string[]     // Only run hooks in workspace

  // Command validation
  validateCommand(cmd: string): boolean

  // User confirmation for destructive operations
  requireConfirmation: boolean  // Prompt before running

  // Timeout enforcement
  maxTimeout: number  // Kill hooks after 60s
}
```

**Execution safety:**
- Run hooks in sandboxed environment
- No arbitrary code execution without user approval
- Whitelist allowed binaries (no `rm`, `dd`, etc.)
- Validate all file paths to prevent traversal
- User confirmation for first-time hooks

### 5. Implementation Phases

**Phase 1: Built-in Policies** (Recommended starting point)
```typescript
// Built-in, safe, UI-configured policies
interface BuiltInPolicy {
  autoFormat: boolean          // Run prettier after generation
  autoTest: boolean           // Run test suite after changes
  gitAutoCommit: boolean      // Commit successful executions
  notifyOnError: boolean      // Desktop notification on errors
}
```

**Phase 2: Limited Hooks** (If demand exists)
```typescript
// Curated set of safe hook points
type LimitedHookEvent =
  | 'after_execute'
  | 'after_file_save'
  | 'on_error'

// Only allow whitelisted commands
const ALLOWED_COMMANDS = ['git', 'npm', 'prettier', 'eslint']
```

**Phase 3: Full Hooks** (Only if critical demand)
```typescript
// Full flexibility with strong safeguards
interface FullHook {
  event: HookEvent
  command: string
  sandbox: boolean           // Run in isolated environment
  confirmation: boolean      // Require user approval
  timeout: number
}
```

## Recommended Approach

**Start with Phase 1 (Built-in Policies), NOT full hooks.**

**Rationale:**
1. **Safer** - No arbitrary command execution
2. **Simpler** - UI checkboxes instead of YAML editing
3. **Cross-platform** - Works on Windows/Mac/Linux without shell differences
4. **Maintainable** - We control the implementation
5. **Sufficient** - Covers 90% of use cases

**Phase 1 Implementation Example:**

```typescript
// In uiStore.ts
interface Policies {
  autoFormat: boolean           // prettier --write after generation
  autoTest: boolean            // npm test after file changes
  gitAutoStage: boolean        // git add . after execution
  desktopNotifications: boolean // System notifications
}

// In settings UI
<Checkbox
  checked={policies.autoFormat}
  onChange={() => togglePolicy('autoFormat')}
  label="Auto-format generated code"
/>
```

Only move to Phase 2/3 if users request specific hooks that can't be solved with built-in policies.

## Claude Code Comparison

**What Claude Code does:**
- Hooks execute before/after tool use
- User-defined shell commands in `~/.claude/hooks.yaml`
- Variable interpolation (file paths, command args, etc.)
- Can abort operations if hook fails
- Security: User confirms hooks on first run

**What we could do differently:**
- Start with safe built-in policies instead of arbitrary hooks
- UI-first configuration (checkboxes) vs YAML editing
- Stronger sandboxing (Electron security model)
- Workflow-specific hooks (not just file operations)
- Python CLI compatibility from day one

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Arbitrary code execution | Whitelist commands, require user approval |
| Malicious package hooks | Workspace hooks require explicit enable |
| Platform differences | Abstract shell commands to cross-platform APIs |
| Performance impact | Timeout enforcement, async execution |
| Debugging difficulty | Hook execution logs, verbose error messages |
| Python CLI parity | Implement hooks in both Electron and Python CLI |

## Open Questions

1. **Do we need full hooks?** Most use cases solvable with built-in policies.
2. **Workspace vs global?** Allow `.prompd/hooks.yaml` in projects?
3. **Python CLI support?** Implement hooks in Python CLI from day one or Electron-only?
4. **Hook marketplace?** Share common hooks in registry?
5. **UI vs YAML?** Configure hooks via settings UI or edit YAML directly?

## Next Steps (if approved)

1. Gather user feedback on actual hook use cases
2. Implement Phase 1 (built-in policies) first
3. Monitor demand for custom hooks
4. Design cross-platform command abstraction layer
5. Implement Python CLI hook support if proceeding
6. Build UI for hook configuration and management

## Related Files

- [frontend/src/stores/uiStore.ts](../frontend/src/stores/uiStore.ts) - Would store policy settings
- [frontend/electron/main.js](../frontend/electron/main.js) - Hook execution via IPC
- [backend/src/config/hooks.js](../backend/src/config/hooks.js) - Hook configuration loader (proposed)
- [frontend/src/modules/services/hookExecutor.ts](../frontend/src/modules/services/hookExecutor.ts) - Hook execution service (proposed)

---

**Conclusion:** Hooks are powerful but introduce security and complexity risks. Recommend starting with built-in policies (checkboxes in UI) and only implementing full hooks if specific user demand exists that can't be solved with safer alternatives.
