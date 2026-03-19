/**
 * Hover providers for IntelliSense
 */
import type * as monacoEditor from 'monaco-editor'
import { registryApi } from '../../services/registryApi'
import { detectHoverContext } from './context'
import { extractParametersWithMetadata } from './utils'
import { createFilterHover } from './filters'
import { getEnvVarsCache } from './envCache'
import { getCurrentFilePath, getWorkspacePath } from './validation'

/**
 * Nunjucks/Jinja2 syntax help - shown when hovering over template tags
 */
const nunjucksHelp: Record<string, { description: string; example?: string; link?: string }> = {
  // Control flow
  'if': { description: 'Conditional statement - executes block if condition is true', example: '{% if user %}Hello {{ user }}!{% endif %}', link: 'https://mozilla.github.io/nunjucks/templating.html#if' },
  'elif': { description: 'Else-if condition - tests another condition if previous was false', example: '{% elif count > 0 %}Has items{% endif %}' },
  'else': { description: 'Else block - executes when all previous conditions are false', example: '{% else %}No results{% endif %}' },
  'for': { description: 'Loop over arrays or objects', example: '{% for item in items %}{{ item }}{% endfor %}', link: 'https://mozilla.github.io/nunjucks/templating.html#for' },
  'set': { description: 'Define or update a variable', example: '{% set total = items | length %}' },

  // Built-in variables
  'loop': { description: 'Loop metadata object with index, first, last, length properties', example: '{{ loop.index }} - {{ loop.first }} - {{ loop.last }}' },
  'env': { description: 'Environment variables from .env files', example: '{{ env.API_KEY }} - {{ env.DATABASE_URL }}' },
  'renderBase': { description: 'Render parent template block content (template inheritance)', example: '{{ renderBase("block_name") }} or {{ renderBase() }}', link: 'https://docs.prompdhub.ai/templates/inheritance' },

  // Workflow runtime variables (injected by workflowExecutor when .prmd runs in a workflow)
  'workflow': { description: 'Workflow parameters object - access values passed when the workflow is triggered', example: '{{ workflow.api_key }} - {{ workflow.user_input }}' },
  'previous_output': { description: 'Output from the connected upstream node in a workflow', example: '{{ previous_output }} or {{ previous_output.field }}' },
  'previous_step': { description: 'Alias for previous_output - output from the connected upstream node', example: '{{ previous_step }} or {{ previous_step.result }}' },
  'input': { description: 'Alias for previous_output - commonly used in code and transform nodes', example: '{{ input }} or {{ input.data }}' },

  // Test evaluator variables (injected by @prompd/test when running .test.prmd evaluator prompts)
  'prompt': { description: 'The compiled prompt that was sent to the LLM for evaluation', example: '{{ prompt }}' },
  'response': { description: 'The LLM response being evaluated', example: '{{ response }}' },

  // Operators
  'in': { description: 'Test if item is in array/object', example: '{% if "admin" in user.roles %}' },
  'not': { description: 'Logical NOT - negates expression', example: '{% if not user %}No user{% endif %}' },
  'and': { description: 'Logical AND - both conditions must be true', example: '{% if user and user.active %}' },
  'or': { description: 'Logical OR - at least one condition must be true', example: '{% if admin or moderator %}' },
  'is': { description: 'Test operator for checking conditions', example: '{% if value is defined %}' },

  // Tests
  'defined': { description: 'Returns true if variable is defined', example: '{% if email is defined %}' },
  'undefined': { description: 'Returns true if variable is not defined', example: '{% if optional is undefined %}' }
}

/**
 * Register command to open package details modal
 */
function registerOpenPackageCommand(monaco: typeof monacoEditor): void {
  // Register command that dispatches custom event for App.tsx to handle
  monaco.editor.registerCommand('prompd.openPackage', (_accessor, args) => {
    try {
      const params = typeof args === 'string' ? JSON.parse(decodeURIComponent(args)) : args
      console.log('[IntelliSense] Opening package:', params)

      // Dispatch custom event that App.tsx will listen for
      window.dispatchEvent(new CustomEvent('prompd-open-package', {
        detail: {
          name: params.name,
          version: params.version
        }
      }))
    } catch (error) {
      console.error('[IntelliSense] Failed to open package:', error)
    }
  })
}

/**
 * Documentation for parameter sub-fields inside a `parameters:` block.
 */
const PARAMETER_FIELD_DOCS: Record<string, {
  summary: string
  type: string
  required?: boolean
  example?: string
  values?: string
  notes?: string
}> = {
  name: {
    summary: 'Parameter identifier — used to reference this value in templates.',
    type: 'string',
    required: true,
    example: 'name: query',
    notes: 'Use snake_case. Referenced in content as `{{ query }}` or `{{ workflow.query }}`.'
  },
  type: {
    summary: 'Data type of the parameter — used for validation and UI generation.',
    type: 'string',
    required: true,
    example: 'type: string',
    values: 'string, number, integer, boolean, array, object, file'
  },
  required: {
    summary: 'Whether this parameter must be provided at runtime.',
    type: 'boolean',
    example: 'required: true',
    values: 'true, false',
    notes: 'When `true`, execution will fail if the parameter is not supplied.'
  },
  default: {
    summary: 'Default value used when the parameter is not provided.',
    type: 'any',
    example: 'default: "auto"\n# or for arrays:\ndefault: ["item1", "item2"]',
    notes: 'Must be compatible with the declared `type`.'
  },
  description: {
    summary: 'Human-readable explanation of what this parameter does.',
    type: 'string',
    example: 'description: "The user query to process"',
    notes: 'Shown in UI tooltips and generated documentation.'
  },
  enum: {
    summary: 'Restricts the parameter to a fixed set of allowed values.',
    type: 'string[]',
    example: 'enum: ["low", "medium", "high"]',
    notes: 'The value at runtime must exactly match one of these strings.'
  },
  min: {
    summary: 'Minimum allowed value (for `number` or `integer` types).',
    type: 'number',
    example: 'min: 0',
    notes: 'Only applies to numeric types.'
  },
  max: {
    summary: 'Maximum allowed value (for `number` or `integer` types).',
    type: 'number',
    example: 'max: 100',
    notes: 'Only applies to numeric types.'
  },
  pattern: {
    summary: 'Regular expression the value must match (for `string` type).',
    type: 'string',
    example: 'pattern: "^[a-z0-9-]+$"',
    notes: 'Applied as a regex test at runtime.'
  }
}

/**
 * Documentation for YAML frontmatter fields.
 * Shown when hovering over a key name in the frontmatter block.
 */
const FRONTMATTER_FIELD_DOCS: Record<string, {
  summary: string
  type: string
  required?: boolean
  example?: string
  values?: string
  notes?: string
}> = {
  id: {
    summary: 'Unique kebab-case identifier for this prompt.',
    type: 'string',
    required: true,
    example: 'id: my-prompt',
    notes: 'Must match the filename (without `.prmd`). Use lowercase letters, numbers, and hyphens only.'
  },
  name: {
    summary: 'Human-readable display name.',
    type: 'string',
    required: true,
    example: 'name: "My Prompt"'
  },
  version: {
    summary: 'Semantic version following semver (MAJOR.MINOR.PATCH).',
    type: 'string',
    required: true,
    example: 'version: 1.0.0',
    notes: 'Increment PATCH for fixes, MINOR for new features, MAJOR for breaking changes.'
  },
  description: {
    summary: 'Human-readable description of what this prompt does.',
    type: 'string',
    example: 'description: "Analyzes code for security vulnerabilities"'
  },
  author: {
    summary: 'Name or email of the prompt author.',
    type: 'string',
    example: 'author: "Jane Smith"'
  },
  license: {
    summary: 'License identifier for this prompt.',
    type: 'string',
    example: 'license: MIT',
    values: 'MIT, Apache-2.0, GPL-3.0, BSD-3-Clause, Elastic-2.0, Proprietary'
  },
  tags: {
    summary: 'Categorization tags for search and discovery.',
    type: 'string[]',
    example: 'tags: [code-review, security, typescript]'
  },
  provider: {
    summary: 'Execution hint — AI provider to use when running this prompt.',
    type: 'string',
    example: 'provider: anthropic',
    values: 'openai, anthropic, groq, ollama',
    notes: 'Overridden by CLI `--provider` flag and workflow node provider settings. Requires `model` to also be set.'
  },
  model: {
    summary: 'Execution hint — specific model ID to use when running this prompt.',
    type: 'string',
    example: 'model: claude-sonnet-4-5-20250929',
    notes: 'Overridden by CLI `--model` flag and workflow node model settings. Requires `provider` to also be set.'
  },
  temperature: {
    summary: 'Execution hint — controls response randomness.',
    type: 'number',
    example: 'temperature: 0.7',
    values: '0.0 – 2.0',
    notes: '0 = deterministic, 0.7 = default, 2.0 = maximum creativity. Overridden by CLI options.'
  },
  max_tokens: {
    summary: 'Execution hint — maximum number of tokens in the response.',
    type: 'integer',
    example: 'max_tokens: 4096',
    notes: 'Actual limit depends on the model\'s context window. Overridden by CLI options.'
  },
  parameters: {
    summary: 'Input parameter definitions — declares variables the prompt accepts.',
    type: 'object[]',
    example: 'parameters:\n  - name: query\n    type: string\n    required: true',
    notes: 'Referenced in content as `{{ param_name }}` or `{{ workflow.param_name }}` in workflows.'
  },
  inherits: {
    summary: 'Inherit content and parameters from another `.prmd` file or registry package.',
    type: 'string',
    example: 'inherits: "./base-reviewer.prmd"\n# or from registry:\ninherits: "@prompd.io/code-review@^1.0.0/review.prmd"',
    notes: 'Parameters and sections are merged. Local content overrides inherited content.'
  },
  using: {
    summary: 'Package dependencies to install from the registry.',
    type: 'string[]',
    example: 'using:\n  - "@prompd.io/helpers@^1.0.0"',
    notes: 'Run `prompd install` to resolve and cache these packages locally.'
  },
  context: {
    summary: 'File(s) to include as context at compile time.',
    type: 'string | string[]',
    example: 'context: "./docs/api.md"\n# or multiple:\ncontext:\n  - "./docs/api.md"\n  - "./schema.json"',
    notes: 'Files are read and injected into the compiled prompt. Paths are relative to the `.prmd` file.'
  },
  contexts: {
    summary: 'File(s) to include as context at compile time (plural form, same as `context`).',
    type: 'string | string[]',
    example: 'contexts:\n  - "./data.json"\n  - "./readme.md"'
  },
  system: {
    summary: 'System prompt file reference — path to a `.md` file used as the system message.',
    type: 'string',
    example: 'system: "./systems/reviewer.md"',
    notes: 'File is compiled and injected as the `## System` section.'
  },
  user: {
    summary: 'User message file reference — path to a `.md` file used as the user turn.',
    type: 'string',
    example: 'user: "./prompts/user.md"'
  },
  task: {
    summary: 'Task specification file reference.',
    type: 'string',
    example: 'task: "./task.md"'
  },
  output: {
    summary: 'Output format specification file reference.',
    type: 'string',
    example: 'output: "./output-schema.md"'
  },
  override: {
    summary: 'Override specific sections inherited from a parent `.prmd` file.',
    type: 'object',
    example: 'override:\n  system: "./custom-system.md"\n  user: null  # Hide this section',
    notes: 'Keys are section IDs. Set to a file path to replace, or `null` to suppress.'
  }
}

/**
 * Register the hover provider
 */
export function registerHoverProvider(
  monaco: typeof monacoEditor,
  languageId: string
): monacoEditor.IDisposable {
  // Register package open command (only once)
  registerOpenPackageCommand(monaco)

  return monaco.languages.registerHoverProvider(languageId, {
    async provideHover(model, position) {
      if (model.isDisposed()) return null
      const word = model.getWordAtPosition(position)
      if (!word) return null

      const line = model.getLineContent(position.lineNumber)
      const wordText = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn
      })
      const context = detectHoverContext(line, word)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )

      // Dynamic hover for 'workflow' — show "Prompd: workflow" with actual parameter list
      if (wordText === 'workflow') {
        const content = model.getValue()
        const { parameters } = extractParametersWithMetadata(content)
        const contents: monacoEditor.IMarkdownString[] = []

        contents.push({ value: '**Prompd: `workflow`**' })
        contents.push({ value: 'Workflow parameters object — access values passed when the workflow is triggered.' })

        if (parameters.length > 0) {
          // Build a TypeScript-like signature from frontmatter parameters
          const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
          const paramEntries: string[] = []
          for (const paramName of parameters) {
            let paramType = 'string'
            if (frontmatter) {
              const yaml = frontmatter[1]
              // Try object format: paramName: { type: integer }
              const objMatch = yaml.match(new RegExp(`${paramName}:\\s*\\{[^}]*type:\\s*(\\w+)`))
              if (objMatch) {
                paramType = objMatch[1]
              } else {
                // Try array format: - name: paramName\n    type: integer
                const lines = yaml.split(/\r?\n/)
                let found = false
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].trim().match(new RegExp(`-\\s*name:\\s*["']?${paramName}["']?`))) {
                    found = true
                    continue
                  }
                  if (found) {
                    const typeMatch = lines[i].match(/^\s+type:\s*(\w+)/)
                    if (typeMatch) { paramType = typeMatch[1]; break }
                    if (lines[i].trim().startsWith('-') || (lines[i].match(/^\w/) && lines[i].includes(':'))) break
                  }
                }
              }
            }
            paramEntries.push(`${paramName}: ${paramType}`)
          }
          contents.push({ value: `\`\`\`typescript\nworkflow: { ${paramEntries.join(', ')} }\n\`\`\`` })
        } else {
          contents.push({ value: '_No parameters defined in frontmatter._' })
        }

        contents.push({ value: '---' })
        contents.push({ value: '**Usage:** `{{ workflow.param_name }}`' })
        contents.push({ value: 'When run outside a workflow, properties resolve to empty.' })

        return { range, contents }
      }

      // Frontmatter field key hover — detect `key:` pattern in the frontmatter block
      if (wordText && FRONTMATTER_FIELD_DOCS[wordText]) {
        // Confirm: (a) the word is followed by `:` on the same line, (b) we're inside frontmatter
        const afterWord = line.substring(word.endColumn - 1).trimStart()
        const isKey = afterWord.startsWith(':')
        if (isKey) {
          const allLines = model.getValue().split('\n')
          let fmStart = -1
          let fmEnd = -1
          for (let i = 0; i < allLines.length; i++) {
            if (allLines[i].trim() === '---') {
              if (fmStart === -1) { fmStart = i; continue }
              fmEnd = i; break
            }
          }
          const lineIdx = position.lineNumber - 1
          const inFrontmatter = fmStart !== -1 && fmEnd !== -1 && lineIdx > fmStart && lineIdx < fmEnd
          if (inFrontmatter) {
            const doc = FRONTMATTER_FIELD_DOCS[wordText]
            const contents: monacoEditor.IMarkdownString[] = []
            const reqBadge = doc.required ? ' *(required)*' : ''
            contents.push({ value: `**\`${wordText}\`**${reqBadge} — \`${doc.type}\`` })
            contents.push({ value: doc.summary })
            if (doc.values) {
              contents.push({ value: `**Allowed values:** ${doc.values}` })
            }
            if (doc.example) {
              contents.push({ value: `**Example:**\n\`\`\`yaml\n${doc.example}\n\`\`\`` })
            }
            if (doc.notes) {
              contents.push({ value: `> ${doc.notes}` })
            }
            return { range, contents }
          }
        }
      }

      // Parameter sub-field hover — detect indented `key:` inside a parameters: block
      if (wordText && PARAMETER_FIELD_DOCS[wordText]) {
        const afterWord = line.substring(word.endColumn - 1).trimStart()
        const isKey = afterWord.startsWith(':')
        const isIndented = line.match(/^\s{2,}/)
        if (isKey && isIndented) {
          const allLines = model.getValue().split('\n')
          let fmStart = -1
          let fmEnd = -1
          for (let i = 0; i < allLines.length; i++) {
            if (allLines[i].trim() === '---') {
              if (fmStart === -1) { fmStart = i; continue }
              fmEnd = i; break
            }
          }
          const lineIdx = position.lineNumber - 1
          const inFrontmatter = fmStart !== -1 && fmEnd !== -1 && lineIdx > fmStart && lineIdx < fmEnd
          if (inFrontmatter) {
            // Walk back to see if we're inside a parameters: block
            let inParameters = false
            for (let i = lineIdx - 1; i >= fmStart; i--) {
              const checkLine = allLines[i]
              if (checkLine.match(/^\s*parameters:\s*$/)) { inParameters = true; break }
              // Stop if we hit another unindented top-level key
              if (checkLine.match(/^\w+:/) && !checkLine.match(/^\s/)) break
            }
            if (inParameters) {
              const doc = PARAMETER_FIELD_DOCS[wordText]
              const contents: monacoEditor.IMarkdownString[] = []
              const reqBadge = doc.required ? ' *(required)*' : ''
              contents.push({ value: `**\`${wordText}\`**${reqBadge} — \`${doc.type}\`` })
              contents.push({ value: doc.summary })
              if (doc.values) {
                contents.push({ value: `**Allowed values:** ${doc.values}` })
              }
              if (doc.example) {
                contents.push({ value: `**Example:**\n\`\`\`yaml\n${doc.example}\n\`\`\`` })
              }
              if (doc.notes) {
                contents.push({ value: `> ${doc.notes}` })
              }
              return { range, contents }
            }
          }
        }
      }

      // Nunjucks/Jinja2 syntax help - check if hovering over keywords
      if (wordText && nunjucksHelp[wordText]) {
        const help = nunjucksHelp[wordText]
        const contents: monacoEditor.IMarkdownString[] = []

        contents.push({ value: `**Nunjucks: \`${wordText}\`**` })
        contents.push({ value: help.description })

        if (help.example) {
          contents.push({ value: '**Example:**' })
          contents.push({ value: `\`\`\`jinja\n${help.example}\n\`\`\`` })
        }

        if (help.link) {
          contents.push({ value: `[📖 View Documentation](${help.link})` })
        }

        return { range, contents }
      }

      // Filter hover
      if (context.type === 'filter') {
        return createFilterHover(monaco, context.value, range)
      }

      // Environment variable hover
      if (context.type === 'envvar') {
        const envVars = getEnvVarsCache()
        const contents: monacoEditor.IMarkdownString[] = []

        if (context.value === 'env') {
          // Hovering over 'env' namespace
          const varCount = Object.keys(envVars).length
          contents.push({ value: '**Environment Variables**' })
          contents.push({ value: `Namespace for accessing environment variables from .env files.` })
          contents.push({ value: `${varCount} variable${varCount !== 1 ? 's' : ''} available.` })
          contents.push({ value: '---' })
          contents.push({ value: '**Usage:** `{{ env.VAR_NAME }}`' })
        } else {
          // Hovering over specific env var name
          const varName = context.value
          const varValue = envVars[varName]

          contents.push({ value: `**Environment Variable: ${varName}**` })

          if (varValue !== undefined) {
            // Truncate long values for display
            const displayValue = varValue.length > 50
              ? varValue.substring(0, 47) + '...'
              : varValue
            contents.push({ value: `**Value:** \`${displayValue}\`` })
          } else {
            contents.push({ value: '*Not defined in current .env file*' })
          }

          contents.push({ value: '---' })
          contents.push({ value: 'Loaded from selected .env file at compile time.' })
        }

        return { range, contents }
      }

      // Workflow variable hover — proxy to frontmatter parameter info
      // When hovering over 'api_key' in {{ workflow.api_key }}, show the parameter definition
      if (context.type === 'workflowvar') {
        const content = model.getValue()
        const { parameters } = extractParametersWithMetadata(content)
        const paramName = context.value
        const contents: monacoEditor.IMarkdownString[] = []

        contents.push({ value: `**Workflow Proxy: workflow.${paramName}**` })

        if (parameters.includes(paramName)) {
          // Look up parameter definition in frontmatter (same logic as parameter hover)
          const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
          let paramInfo: Record<string, unknown> | null = null

          if (frontmatter) {
            const yamlContent = frontmatter[1]
            const objectMatch = yamlContent.match(new RegExp(`${paramName}:\\s*\\{([^}]+)\\}`))
            if (objectMatch) {
              try { paramInfo = JSON.parse(`{${objectMatch[1]}}`) } catch { /* ignore */ }
            } else {
              const lines = yamlContent.split(/\r?\n/)
              let inParamBlock = false
              let paramLines: string[] = []
              let baseIndent = -1

              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed.startsWith('- name:') && trimmed.includes(paramName)) {
                  inParamBlock = true
                  baseIndent = line.match(/^\s*/)![0].length
                  continue
                }
                if (inParamBlock) {
                  const currentIndent = line.match(/^\s*/)![0].length
                  if (trimmed.startsWith('-') && currentIndent <= baseIndent) break
                  if (currentIndent <= baseIndent && trimmed.length > 0) break
                  if (trimmed.length > 0) paramLines.push(line)
                }
              }

              if (paramLines.length > 0) {
                paramInfo = {}
                const paramBlock = paramLines.join('\n')
                const typeMatch = paramBlock.match(/^\s*type:\s*(.+?)\s*$/m)
                if (typeMatch) paramInfo.type = typeMatch[1].trim()
                const descMatch = paramBlock.match(/^\s*description:\s*["'](.+?)["']\s*$/m)
                if (descMatch) paramInfo.description = descMatch[1]
                else {
                  const descPlain = paramBlock.match(/^\s*description:\s*(.+?)\s*$/m)
                  if (descPlain) paramInfo.description = descPlain[1].trim()
                }
                const defaultMatch = paramBlock.match(/^\s*default:\s*(.+?)\s*$/m)
                if (defaultMatch) paramInfo.default = defaultMatch[1].trim()
              }
            }
          }

          if (paramInfo && Object.keys(paramInfo).length > 0) {
            if (paramInfo.type) contents.push({ value: `**Type:** \`${paramInfo.type}\`` })
            if (paramInfo.description) contents.push({ value: `**Description:** ${paramInfo.description}` })
            if (paramInfo.default !== undefined) contents.push({ value: `**Default:** \`${JSON.stringify(paramInfo.default)}\`` })
          }

          contents.push({ value: '---' })
          contents.push({ value: `Resolves to \`{{ ${paramName} }}\` at runtime. In a workflow, uses the workflow-level value; standalone, uses the frontmatter parameter.` })
        } else {
          contents.push({ value: `*Parameter \`${paramName}\` is not defined in frontmatter.*` })
          contents.push({ value: '---' })
          contents.push({ value: `Add \`${paramName}\` to the \`parameters:\` section for this proxy to resolve.` })
        }

        return { range, contents }
      }

      // Inherits hover - resolve reference and show prompt metadata
      if (context.type === 'inherits') {
        try {
          const inheritsRef = context.value
          const contents: monacoEditor.IMarkdownString[] = []
          const modelContent = model.getValue()

          // Parse using: block to build prefix → package mapping
          const prefixMap = new Map<string, string>()
          const frontmatterMatch = modelContent.match(/^---\r?\n([\s\S]*?)\r?\n---/)
          if (frontmatterMatch) {
            const yaml = frontmatterMatch[1]
            // Match object-format using entries: name: "@pkg@ver" + prefix: "@alias"
            const usingEntries = Array.from(yaml.matchAll(/(?:^|\n)\s*-\s*(?:name:\s*["']?(@[\w./-]+@?[\w.^~*-]*)["']?\s+prefix:\s*["']?(@[\w-]+)["']?|prefix:\s*["']?(@[\w-]+)["']?\s+name:\s*["']?(@[\w./-]+@?[\w.^~*-]*)["']?)/g))
            for (const entry of usingEntries) {
              const pkg = entry[1] || entry[4]
              const prefix = entry[2] || entry[3]
              if (pkg && prefix) {
                prefixMap.set(prefix, pkg)
              }
            }
          }

          // Determine type of reference
          let resolvedPackage: string | null = null
          let resolvedFilePath: string | null = null
          let packageName = ''
          let packageVersion = ''
          let subPath = ''

          // Check if it's a prefix alias reference (e.g., @core/prompts/base.prmd)
          const prefixMatch = inheritsRef.match(/^(@[\w-]+)\/(.+)$/)
          if (prefixMatch && prefixMap.has(prefixMatch[1])) {
            const pkgRef = prefixMap.get(prefixMatch[1])!
            subPath = prefixMatch[2]

            // Parse package name and version from the using entry
            const versionAt = pkgRef.lastIndexOf('@')
            if (versionAt > 0 && pkgRef[0] === '@') {
              packageName = pkgRef.substring(0, versionAt)
              packageVersion = pkgRef.substring(versionAt + 1)
            } else {
              packageName = pkgRef
            }
            resolvedPackage = pkgRef
          }
          // Check if it's a direct package ref (e.g., @prompd/core@0.0.1/prompts/base.prmd)
          else if (inheritsRef.startsWith('@')) {
            const versionAt = inheritsRef.indexOf('@', 1)
            if (versionAt > 0) {
              packageName = inheritsRef.substring(0, versionAt)
              const rest = inheritsRef.substring(versionAt + 1)
              const slashIdx = rest.indexOf('/')
              if (slashIdx >= 0) {
                packageVersion = rest.substring(0, slashIdx)
                subPath = rest.substring(slashIdx + 1)
              } else {
                packageVersion = rest
              }
              resolvedPackage = `${packageName}@${packageVersion}`
            } else {
              // No version specifier: @scope/name/path/to/file.prmd
              const parts = inheritsRef.split('/')
              if (parts.length >= 3) {
                packageName = `${parts[0]}/${parts[1]}` // @scope/name
                subPath = parts.slice(2).join('/')
                resolvedPackage = packageName
              }
            }
          }
          // Local relative path
          else {
            const currentFile = getCurrentFilePath()
            if (currentFile) {
              const sep = currentFile.includes('\\') ? '\\' : '/'
              const dir = currentFile.substring(0, currentFile.lastIndexOf(sep))
              resolvedFilePath = `${dir}${sep}${inheritsRef.replace(/\//g, sep)}`
            }
          }

          // Try to resolve the file path for package references
          // Check workspace cache first, then fall back to global cache
          if (resolvedPackage && !resolvedFilePath) {
            const nsSlash = packageName.indexOf('/')
            const ns = packageName.substring(1, nsSlash) // strip @
            const name = packageName.substring(nsSlash + 1)

            const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as {
              readFile?: (p: string) => Promise<{ success: boolean; content?: string }>
              readDir?: (p: string) => Promise<{ success: boolean; files?: { name: string; isDirectory: boolean }[] }>
              getHomePath?: () => Promise<string>
            } | undefined

            // Helper: try to find file inside a cache base, scanning for versions if needed
            const tryResolveInDir = async (cacheBase: string, sep: string): Promise<string | null> => {
              const pkgDir = [cacheBase, `@${ns}`, name].join(sep)

              // If we have a specific version, try that directly
              if (packageVersion) {
                const filePath = [pkgDir, packageVersion, subPath].join(sep)
                if (electronAPI?.readFile) {
                  const check = await electronAPI.readFile(filePath)
                  if (check.success) return filePath
                }
              }

              // No version or version not found — scan for available versions
              if (electronAPI?.readDir) {
                try {
                  const result = await electronAPI.readDir(pkgDir)
                  if (result.success && result.files) {
                    const versionDirs = result.files
                      .filter(e => e.isDirectory)
                      .map(e => e.name)
                      .sort()
                      .reverse()

                    for (const ver of versionDirs) {
                      const filePath = [pkgDir, ver, subPath].join(sep)
                      if (electronAPI.readFile) {
                        const check = await electronAPI.readFile(filePath)
                        if (check.success) {
                          // Update packageVersion for display in hover tooltip
                          if (!packageVersion) packageVersion = ver
                          return filePath
                        }
                      }
                    }
                  }
                } catch {
                  // Directory doesn't exist
                }
              }

              return null
            }

            // Try workspace .prompd/cache/ and .prompd/packages/
            const wsPath = getWorkspacePath()
            if (wsPath) {
              const sep = wsPath.includes('\\') ? '\\' : '/'
              resolvedFilePath = await tryResolveInDir([wsPath, '.prompd', 'cache'].join(sep), sep)
              if (!resolvedFilePath) {
                resolvedFilePath = await tryResolveInDir([wsPath, '.prompd', 'packages'].join(sep), sep)
              }
            }

            // Fall back to global ~/.prompd/cache/ and ~/.prompd/packages/
            if (!resolvedFilePath && electronAPI?.getHomePath) {
              try {
                const homePath = await electronAPI.getHomePath()
                const sep = homePath.includes('\\') ? '\\' : '/'
                resolvedFilePath = await tryResolveInDir([homePath, '.prompd', 'cache'].join(sep), sep)
                if (!resolvedFilePath) {
                  resolvedFilePath = await tryResolveInDir([homePath, '.prompd', 'packages'].join(sep), sep)
                }
              } catch {
                // Can't resolve home path
              }
            }
          }

          // Try to read the .prmd file and extract frontmatter metadata
          let promptMeta: Record<string, string | string[]> | null = null
          if (resolvedFilePath) {
            try {
              const electronAPI = (window as { electronAPI?: { readFile: (p: string) => Promise<{ success: boolean; content?: string }> } }).electronAPI
              if (electronAPI) {
                const result = await electronAPI.readFile(resolvedFilePath)
                if (result.success && result.content) {
                  const normalized = result.content.replace(/\r\n/g, '\n')
                  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---/)
                  if (fmMatch) {
                    const yamlStr = fmMatch[1]
                    // Extract key fields from frontmatter
                    promptMeta = {}
                    const nameMatch = yamlStr.match(/^name:\s*["']?(.+?)["']?\s*$/m)
                    if (nameMatch) promptMeta.name = nameMatch[1]
                    const descMatch = yamlStr.match(/^description:\s*["']?(.+?)["']?\s*$/m)
                    if (descMatch) promptMeta.description = descMatch[1]
                    const providerMatch = yamlStr.match(/^provider:\s*["']?(.+?)["']?\s*$/m)
                    if (providerMatch) promptMeta.provider = providerMatch[1]
                    const modelMatch = yamlStr.match(/^model:\s*["']?(.+?)["']?\s*$/m)
                    if (modelMatch) promptMeta.model = modelMatch[1]
                    const versionMatch = yamlStr.match(/^version:\s*["']?(.+?)["']?\s*$/m)
                    if (versionMatch) promptMeta.version = versionMatch[1]
                    const idMatch = yamlStr.match(/^id:\s*["']?(.+?)["']?\s*$/m)
                    if (idMatch) promptMeta.id = idMatch[1]

                    // Extract parameter names
                    const paramNames: string[] = []
                    const paramNameMatches = Array.from(yamlStr.matchAll(/^\s+(?:- name:\s*["']?(\w+)["']?|(\w+):\s*\{)/gm))
                    for (const m of paramNameMatches) {
                      const pName = m[1] || m[2]
                      if (pName) paramNames.push(pName)
                    }
                    if (paramNames.length > 0) promptMeta.parameters = paramNames
                  }
                }
              }
            } catch {
              // File read failed - continue without metadata
            }
          }

          // Build hover content
          if (resolvedPackage) {
            contents.push({ value: `### Inherits: \`${inheritsRef}\`` })
            contents.push({ value: `**Package:** \`${packageName}${packageVersion ? '@' + packageVersion : ''}\`` })
            if (subPath) {
              contents.push({ value: `**File:** \`${subPath}\`` })
            }
          } else {
            contents.push({ value: `### Inherits: \`${inheritsRef}\`` })
            if (resolvedFilePath) {
              contents.push({ value: `**Path:** \`${resolvedFilePath}\`` })
            }
          }

          if (promptMeta) {
            contents.push({ value: '---' })
            if (promptMeta.name) contents.push({ value: `**Name:** ${promptMeta.name}` })
            if (promptMeta.description) contents.push({ value: `> ${promptMeta.description}` })
            if (promptMeta.id) contents.push({ value: `**ID:** \`${promptMeta.id}\`` })
            if (promptMeta.version) contents.push({ value: `**Version:** \`${promptMeta.version}\`` })
            if (promptMeta.provider) contents.push({ value: `**Provider:** \`${promptMeta.provider}\`` })
            if (promptMeta.model) contents.push({ value: `**Model:** \`${promptMeta.model}\`` })
            if (promptMeta.parameters && Array.isArray(promptMeta.parameters) && promptMeta.parameters.length > 0) {
              const paramList = promptMeta.parameters.map(p => `\`${p}\``).join(', ')
              contents.push({ value: `**Parameters:** ${paramList}` })
            }
          } else if (!resolvedFilePath) {
            contents.push({ value: '---' })
            contents.push({ value: '_Could not resolve file path_' })
          } else {
            contents.push({ value: '---' })
            contents.push({ value: '_File not found or could not be read_' })
          }

          // Widen hover range to cover the full inherits value (quoted or not)
          const inheritsLineMatch = line.match(/inherits:\s*["']?([^"'\s#]+)["']?/)
          if (inheritsLineMatch) {
            const valueStart = line.indexOf(inheritsLineMatch[1])
            const valueEnd = valueStart + inheritsLineMatch[1].length
            const fullRange = new monaco.Range(
              position.lineNumber, valueStart + 1,
              position.lineNumber, valueEnd + 1
            )
            return { range: fullRange, contents }
          }

          return { range, contents }
        } catch (error) {
          console.warn('[IntelliSense] Inherits hover failed:', error)
        }
      }

      // Re-check after async operations — model may have been disposed during file I/O
      if (model.isDisposed()) return null

      if (context.type === 'package') {
        try {
          // Parse package reference to extract name and version
          // Format: @scope/package@version or @scope/package
          const packageRefMatch = context.value.match(/^(@[a-z0-9-]+\/[a-z0-9-]+)(?:@(.+))?$/i)
          const packageName = packageRefMatch?.[1] || context.value
          const specifiedVersion = packageRefMatch?.[2] // e.g., "1.1.3" or undefined

          const packageInfo = await registryApi.getPackageInfo(packageName)
          if (packageInfo) {
            const contents: monacoEditor.IMarkdownString[] = []

            // Use specified version if provided, otherwise show latest from registry
            const displayVersion = specifiedVersion || packageInfo.version
            const fullPackageName = `${packageInfo.name}@${displayVersion}`

            // Clickable package header with full name (@namespace/package@version)
            // Using command: protocol to trigger custom event
            contents.push({
              value: `### [${fullPackageName}](command:prompd.openPackage?${encodeURIComponent(JSON.stringify({ name: packageInfo.name, version: displayVersion }))})`,
              isTrusted: true,
              supportHtml: true
            })

            // Description
            if (packageInfo.description) {
              contents.push({
                value: `> ${packageInfo.description}`
              })
            }

            // Author and stats
            const stats = []
            if (packageInfo.author) stats.push(`${packageInfo.author}`)
            if (packageInfo.downloads) stats.push(`${packageInfo.downloads.toLocaleString()} downloads`)
            if (packageInfo.stars) stats.push(`${packageInfo.stars} stars`)
            if (stats.length > 0) {
              contents.push({ value: stats.join(' | ') })
            }

            // Tags/keywords
            if (packageInfo.keywords && packageInfo.keywords.length > 0) {
              const tags = packageInfo.keywords.slice(0, 5).map(tag => `\`${tag}\``).join(' ')
              contents.push({ value: tags })
            }

            // Repository link
            if (packageInfo.repository) {
              contents.push({
                value: `[Repository](${packageInfo.repository})`,
                isTrusted: true
              })
            }

            // Click hint
            contents.push({ value: '---' })
            contents.push({
              value: `_Click package name to view details_`,
              isTrusted: true
            })

            // Usage example - use the displayed version
            if (packageInfo.examples && packageInfo.examples.length > 0) {
              contents.push({ value: '---' })
              contents.push({ value: '**Example Usage:**' })
              contents.push({
                value: `\`\`\`yaml\nusing:\n  - "${packageInfo.name}@${displayVersion}"\n\`\`\``
              })
            }

            return { range, contents }
          }
        } catch (error) {
          console.warn('Failed to fetch package info for hover:', error)
          // Fallback with basic info
          return {
            range,
            contents: [
              { value: `**${context.value}**` },
              { value: 'Package information unavailable (registry offline)' },
              { value: `\`\`\`yaml\nusing:\n  - "${context.value}"\n\`\`\`` }
            ]
          }
        }
      }

      // Enhanced parameter hover
      if (context.type === 'parameter') {
        const content = model.getValue()
        const { parameters, loopVariables } = extractParametersWithMetadata(content)
        const paramName = context.value

        // Check if this is a set variable ({% set VAR = VALUE %})
        const setVarMatch = content.match(new RegExp(`\\{%-?\\s*set\\s+${paramName}\\s*=\\s*([^%]+)%\\}`))
        if (setVarMatch) {
          const setValue = setVarMatch[1].trim()
          // Clean up the value for display (truncate if too long)
          const displayValue = setValue.length > 50 ? setValue.substring(0, 47) + '...' : setValue

          const contents: monacoEditor.IMarkdownString[] = []
          contents.push({ value: `**Set Variable: ${paramName}**` })
          contents.push({ value: `**Value:** \`${displayValue}\`` })
          contents.push({ value: '---' })
          contents.push({ value: `Defined by \`{% set ${paramName} = ... %}\` block` })
          contents.push({ value: 'Available for use throughout the template.' })

          return { range, contents }
        }

        // Check if this is a loop variable first
        if (loopVariables.has(paramName)) {
          // Find the for loop that defines this variable
          const forLoopMatch = content.match(new RegExp(`\\{%-?\\s*for\\s+${paramName}\\s+in\\s+(\\w+)`))
          if (forLoopMatch) {
            const collectionName = forLoopMatch[1]

            const contents: monacoEditor.IMarkdownString[] = []
            contents.push({ value: `**Loop Variable: ${paramName}**` })
            contents.push({ value: `Iterates over: \`${collectionName}\`` })
            contents.push({ value: '---' })
            contents.push({ value: `Defined by \`{% for ${paramName} in ${collectionName} %}\` block` })

            return { range, contents }
          }
        }

        // Check for 'loop' helper variable
        if (paramName === 'loop' && loopVariables.has('loop')) {
          const contents: monacoEditor.IMarkdownString[] = []
          contents.push({ value: '**Loop Helper: loop**' })
          contents.push({ value: 'Built-in Nunjucks loop variable' })
          contents.push({ value: '---' })
          contents.push({ value: '**Properties:**' })
          contents.push({ value: '- `loop.index` - 1-based iteration count' })
          contents.push({ value: '- `loop.index0` - 0-based iteration count' })
          contents.push({ value: '- `loop.first` - true if first iteration' })
          contents.push({ value: '- `loop.last` - true if last iteration' })
          contents.push({ value: '- `loop.length` - total items in collection' })

          return { range, contents }
        }

        // Workflow runtime built-in variables (injected by workflowExecutor when .prmd runs in a workflow)
        const workflowBuiltins: Record<string, { title: string; desc: string; usage: string }> = {
          'workflow': {
            title: 'Workflow Parameters',
            desc: 'Access parameters passed to the workflow at execution time. When run outside a workflow, resolves to empty.',
            usage: '{{ workflow.api_key }} or {{ workflow.user_input }}'
          },
          'previous_output': {
            title: 'Previous Node Output',
            desc: 'The output from the connected upstream node. When run outside a workflow, resolves to empty.',
            usage: '{{ previous_output }} or {{ previous_output.field }}'
          },
          'previous_step': {
            title: 'Previous Step Output',
            desc: 'Alias for previous_output \u2014 the output from the connected upstream node.',
            usage: '{{ previous_step }} or {{ previous_step.result }}'
          },
          'input': {
            title: 'Node Input',
            desc: 'Alias for previous_output \u2014 commonly used in code and transform nodes.',
            usage: '{{ input }} or {{ input.data }}'
          }
        }

        if (workflowBuiltins[paramName]) {
          const bi = workflowBuiltins[paramName]
          const contents: monacoEditor.IMarkdownString[] = []

          if (paramName === 'workflow') {
            // Dynamic parameter list for workflow
            contents.push({ value: '**Prompd: `workflow`**' })
            contents.push({ value: bi.desc })

            if (parameters.length > 0) {
              const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
              const paramEntries: string[] = []
              for (const pName of parameters) {
                let paramType = 'string'
                if (frontmatter) {
                  const yaml = frontmatter[1]
                  const objMatch = yaml.match(new RegExp(`${pName}:\\s*\\{[^}]*type:\\s*(\\w+)`))
                  if (objMatch) {
                    paramType = objMatch[1]
                  } else {
                    const lines = yaml.split(/\r?\n/)
                    let found = false
                    for (let i = 0; i < lines.length; i++) {
                      if (lines[i].trim().match(new RegExp(`-\\s*name:\\s*["']?${pName}["']?`))) {
                        found = true
                        continue
                      }
                      if (found) {
                        const typeMatch = lines[i].match(/^\s+type:\s*(\w+)/)
                        if (typeMatch) { paramType = typeMatch[1]; break }
                        if (lines[i].trim().startsWith('-') || (lines[i].match(/^\w/) && lines[i].includes(':'))) break
                      }
                    }
                  }
                }
                paramEntries.push(`${pName}: ${paramType}`)
              }
              contents.push({ value: `\`\`\`typescript\nworkflow: { ${paramEntries.join(', ')} }\n\`\`\`` })
            }
          } else {
            contents.push({ value: `**Workflow Built-in: ${paramName}**` })
            contents.push({ value: bi.desc })
          }

          contents.push({ value: '---' })
          contents.push({ value: `**Usage:** \`${bi.usage}\`` })
          contents.push({ value: `Use \`{{ ${paramName} | default("fallback") }}\` to handle standalone execution.` })
          return { range, contents }
        }

        // Test evaluator built-in variables (injected by @prompd/test for .test.prmd evaluator prompts)
        const testEvalBuiltins: Record<string, { title: string; desc: string; usage: string }> = {
          'prompt': {
            title: 'Compiled Prompt',
            desc: 'The compiled prompt that was sent to the LLM. Contains the fully resolved .prmd output with all parameters substituted.',
            usage: '{{ prompt }}'
          },
          'response': {
            title: 'LLM Response',
            desc: 'The response returned by the LLM being evaluated. This is the text your evaluator should assess.',
            usage: '{{ response }}'
          },
          'params': {
            title: 'Test Parameters',
            desc: 'The parameters object from the test case. Access individual values with dot notation.',
            usage: '{{ params }} or {{ params.name }}'
          }
        }

        if (testEvalBuiltins[paramName]) {
          const bi = testEvalBuiltins[paramName]
          const contents: monacoEditor.IMarkdownString[] = []
          contents.push({ value: `**Test Evaluator: \`${paramName}\`**` })
          contents.push({ value: bi.desc })
          contents.push({ value: '---' })
          contents.push({ value: `**Usage:** \`${bi.usage}\`` })
          contents.push({ value: 'Available in the content block of `.test.prmd` files when used as an evaluator prompt.' })
          return { range, contents }
        }

        if (parameters.includes(paramName)) {
          // Try to find parameter definition in frontmatter (handle CRLF)
          const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
          let paramInfo: Record<string, unknown> | null = null

          if (frontmatter) {
            const yamlContent = frontmatter[1]

            // Try object format first: tech_stack: { type: string, description: "..." }
            const objectMatch = yamlContent.match(new RegExp(`${paramName}:\\s*\\{([^}]+)\\}`))
            if (objectMatch) {
              try {
                paramInfo = JSON.parse(`{${objectMatch[1]}}`)
              } catch {
                // Ignore parse errors
              }
            } else {
              // Try array format: - name: tech_stack
              //                      type: object
              //                      description: "..."
              // Match lines with proper indentation handling
              const lines = yamlContent.split(/\r?\n/)
              let inParamBlock = false
              let paramLines: string[] = []
              let baseIndent = -1

              for (const line of lines) {
                const trimmed = line.trim()

                // Check if this is the start of our parameter
                if (trimmed.startsWith('- name:') && trimmed.includes(paramName)) {
                  inParamBlock = true
                  baseIndent = line.match(/^\s*/)![0].length
                  continue
                }

                if (inParamBlock) {
                  const currentIndent = line.match(/^\s*/)![0].length

                  // If we hit another parameter or dedented line, stop
                  if (trimmed.startsWith('-') && currentIndent <= baseIndent) {
                    break
                  }
                  if (currentIndent <= baseIndent && trimmed.length > 0) {
                    break
                  }

                  // Collect property lines
                  if (trimmed.length > 0) {
                    paramLines.push(line)
                  }
                }
              }

              if (paramLines.length > 0) {
                paramInfo = {}
                const paramBlock = paramLines.join('\n')

                // Parse type
                const typeMatch = paramBlock.match(/^\s*type:\s*(.+?)\s*$/m)
                if (typeMatch) paramInfo.type = typeMatch[1].trim()

                // Parse description (handle quotes)
                const descMatch = paramBlock.match(/^\s*description:\s*["'](.+?)["']\s*$/m)
                if (descMatch) {
                  paramInfo.description = descMatch[1]
                } else {
                  const descPlainMatch = paramBlock.match(/^\s*description:\s*(.+?)\s*$/m)
                  if (descPlainMatch) paramInfo.description = descPlainMatch[1].trim()
                }

                // Parse default (handle JSON objects/arrays)
                const defaultMatch = paramBlock.match(/^\s*default:\s*(.+?)\s*$/m)
                if (defaultMatch) {
                  const defaultValue = defaultMatch[1].trim()
                  // Try to parse as JSON if it looks like an object/array
                  if (defaultValue.startsWith('{') || defaultValue.startsWith('[')) {
                    try {
                      paramInfo.default = JSON.parse(defaultValue)
                    } catch {
                      paramInfo.default = defaultValue
                    }
                  } else if (defaultValue === 'true') {
                    paramInfo.default = true
                  } else if (defaultValue === 'false') {
                    paramInfo.default = false
                  } else {
                    paramInfo.default = defaultValue
                  }
                }

                // Parse required
                const requiredMatch = paramBlock.match(/^\s*required:\s*(true|false)\s*$/m)
                if (requiredMatch) paramInfo.required = requiredMatch[1] === 'true'

                // Parse enum
                const enumMatch = paramBlock.match(/^\s*enum:\s*\[(.+?)\]\s*$/m)
                if (enumMatch) {
                  try {
                    paramInfo.enum = JSON.parse(`[${enumMatch[1]}]`)
                  } catch {
                    paramInfo.enum = enumMatch[1].split(',').map(s => s.trim().replace(/["']/g, ''))
                  }
                }
              }
            }
          }

          const contents: monacoEditor.IMarkdownString[] = []
          contents.push({ value: `**Parameter: ${paramName}**` })

          if (paramInfo && Object.keys(paramInfo).length > 0) {
            // Show all parameter properties in a structured way
            if (paramInfo.type) {
              contents.push({ value: `**Type:** \`${paramInfo.type}\`` })
            }
            if (paramInfo.description) {
              contents.push({ value: `**Description:** ${paramInfo.description}` })
            }
            if (paramInfo.default !== undefined) {
              contents.push({ value: `**Default:** \`${JSON.stringify(paramInfo.default)}\`` })
            }
            if (paramInfo.required !== undefined) {
              contents.push({
                value: `**Required:** ${paramInfo.required ? 'Yes' : 'No'}`
              })
            }

            // Show enum values if present
            if (paramInfo.enum) {
              const enumValues = Array.isArray(paramInfo.enum)
                ? paramInfo.enum.map(v => `\`${v}\``).join(', ')
                : `\`${JSON.stringify(paramInfo.enum)}\``
              contents.push({ value: `**Allowed Values:** ${enumValues}` })
            }

            // Show any additional properties not already displayed
            const displayedKeys = ['type', 'description', 'default', 'required', 'enum']
            const additionalKeys = Object.keys(paramInfo).filter(k => !displayedKeys.includes(k))
            if (additionalKeys.length > 0) {
              contents.push({ value: '**Additional Properties:**' })
              additionalKeys.forEach(key => {
                const value = paramInfo[key]
                contents.push({
                  value: `- **${key}:** \`${JSON.stringify(value)}\``
                })
              })
            }
          } else {
            contents.push({ value: 'Parameter reference - define in frontmatter' })
          }

          contents.push({ value: '---' })

          // Show example with actual type if available, otherwise show generic example
          const exampleType = paramInfo?.type || 'string'
          const exampleDescription = paramInfo?.description || '...'
          contents.push({
            value: `\`\`\`yaml\nparameters:\n  ${paramName}: { type: ${exampleType}, description: "${exampleDescription}" }\n\`\`\``
          })

          return { range, contents }
        }
      }

      return null
    }
  })
}

/**
 * Register signature help provider for function-like constructs
 */
export function registerSignatureHelpProvider(
  monaco: typeof monacoEditor,
  languageId: string
): monacoEditor.IDisposable {
  return monaco.languages.registerSignatureHelpProvider(languageId, {
    signatureHelpTriggerCharacters: ['(', ','],
    async provideSignatureHelp(_model, _position) {
      // Could provide signature help for template functions or package imports
      return null
    }
  })
}
