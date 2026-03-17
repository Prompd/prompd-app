/**
 * Completion providers for IntelliSense
 */
import type * as monacoEditor from 'monaco-editor'
import { registryApi, BUILTIN_SUGGESTIONS } from '../../services/registryApi'
import { detectContext } from './context'
import { extractParametersWithMetadata, extractParameterMetadata } from './utils'
import { createFilterCompletions } from './filters'
import { getEnvVarsCache } from './envCache'
import { getIncludableFiles, getContextFiles, getFolders } from '../../services/workspaceService'
import { getSuggestedParameters } from './promptPatterns'

/**
 * Module-level cache of the current provider/model selection from the UI store.
 * Updated via setProviderModelHints() called from React when the selection changes.
 */
interface ProviderModelHints {
  currentProvider: string
  currentModel: string
  availableProviders: Array<{ id: string; displayName: string; models: Array<{ id: string; displayName?: string }> }>
}

let providerModelHints: ProviderModelHints | null = null

export function setProviderModelHints(hints: ProviderModelHints): void {
  providerModelHints = hints
}

/**
 * Static fallback map of well-known providers and their models.
 * Used when the provider isn't in availableProviders (e.g. no API key configured locally).
 * Keeps model completions accurate regardless of local key setup.
 */
const KNOWN_PROVIDER_MODELS: Record<string, Array<{ id: string; displayName: string }>> = {
  openai: [
    { id: 'gpt-4o', displayName: 'GPT-4o' },
    { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
    { id: 'gpt-4.1', displayName: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano' },
    { id: 'o1', displayName: 'o1' },
    { id: 'o1-mini', displayName: 'o1 Mini' },
    { id: 'o3', displayName: 'o3' },
    { id: 'o3-mini', displayName: 'o3 Mini' },
    { id: 'o4-mini', displayName: 'o4 Mini' }
  ],
  anthropic: [
    { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
    { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B' },
    { id: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it', displayName: 'Gemma 2 9B' }
  ],
  ollama: [
    { id: 'llama3', displayName: 'Llama 3' },
    { id: 'mistral', displayName: 'Mistral' },
    { id: 'codellama', displayName: 'Code Llama' },
    { id: 'phi3', displayName: 'Phi 3' }
  ]
}

/**
 * Resolve models for a given provider ID.
 * Prefers live availableProviders data, falls back to KNOWN_PROVIDER_MODELS.
 */
function resolveModelsForProvider(
  providerId: string,
  hints: ProviderModelHints
): Array<{ id: string; displayName?: string }> {
  // Exact match first
  const entry = hints.availableProviders.find(p => p.id === providerId)
  if (entry) return entry.models
  // Case-insensitive match (handles 'Anthropic' vs 'anthropic')
  const entryCI = hints.availableProviders.find(p => p.id.toLowerCase() === providerId.toLowerCase())
  if (entryCI) return entryCI.models
  // Fall back to static known map
  return KNOWN_PROVIDER_MODELS[providerId.toLowerCase()] || []
}

/**
 * Register the completion item provider
 */
export function registerCompletionProvider(
  monaco: typeof monacoEditor,
  languageId: string
): monacoEditor.IDisposable {
  return monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['@', '{', ':', ' ', '#', '|', '.'],

    async provideCompletionItems(model, position) {
      console.log('[IntelliSense] provideCompletionItems called at line', position.lineNumber, 'column', position.column)

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })

      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      /**
       * Build a range that replaces the entire value on a `key: <value>` line.
       * Used for provider/model completions so `gpt-` → `gpt-4o-mini` replaces the whole typed prefix.
       */
      const buildValueRange = (lineContent: string): monacoEditor.languages.CompletionItem['range'] => {
        const colonIdx = lineContent.indexOf(':')
        if (colonIdx === -1) return range
        // start right after `: ` (or just `:`)
        const valueStart = colonIdx + 1 + (lineContent[colonIdx + 1] === ' ' ? 1 : 0)
        // end at first comment character or end of trimmed line content
        const trimmedEnd = lineContent.trimEnd().length
        return {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: valueStart + 1, // 1-based
          endColumn: Math.max(trimmedEnd + 1, position.column) // 1-based, at least cursor
        }
      }

      const suggestions: monacoEditor.languages.CompletionItem[] = []
      const context = detectContext(textUntilPosition, position.lineNumber, position.column)

      console.log('[IntelliSense] Detected context:', context.type, 'query:', context.query)

      // Filter suggestions
      if (context.type === 'filter') {
        const filterSuggestions = createFilterCompletions(monaco, range, context.query)
        suggestions.push(...filterSuggestions)
      }

      // Environment variable suggestions (after {{ env.)
      if (context.type === 'envvar') {
        const envVars = getEnvVarsCache()
        const query = (context.query || '').toLowerCase()

        Object.entries(envVars).forEach(([varName, value]) => {
          if (varName.toLowerCase().includes(query)) {
            // Truncate long values for display
            const displayValue = value.length > 50 ? value.substring(0, 47) + '...' : value
            suggestions.push({
              label: varName,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: varName,
              detail: `env var: ${displayValue}`,
              documentation: `**Environment Variable**\n\n\`${varName}\`\n\n**Value:** \`${value}\`\n\n*Loaded from .env file. Available at compile-time as \`{{ env.${varName} }}\`*`,
              range,
              sortText: `0_${varName}`
            })
          }
        })

        // If no env vars in cache, show helpful message
        if (Object.keys(envVars).length === 0) {
          suggestions.push({
            label: 'No env vars loaded',
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: '',
            detail: 'Select a .env file to load environment variables',
            documentation: 'Use the .env file selector in the header to load environment variables. Variables will then be available for autocompletion.',
            range,
            sortText: '9_noenv'
          })
        }
      }

      // Workflow variable suggestions (after {{ workflow.)
      // Proxies to frontmatter parameters — workflow.X resolves to parameter X at runtime
      if (context.type === 'workflowvar') {
        const content = model.getValue()
        const { parameters } = extractParametersWithMetadata(content)
        const query = (context.query || '').toLowerCase()

        parameters.forEach((paramName) => {
          if (paramName.toLowerCase().includes(query)) {
            suggestions.push({
              label: paramName,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: paramName,
              detail: `workflow parameter (proxy to ${paramName})`,
              documentation: `**Workflow Parameter Proxy**\n\n\`{{ workflow.${paramName} }}\` resolves to the \`${paramName}\` parameter.\n\nIn a workflow: uses the workflow-level parameter value.\nStandalone: falls back to the frontmatter parameter value.`,
              range,
              sortText: `0_${paramName}`
            })
          }
        })

        if (parameters.length === 0) {
          suggestions.push({
            label: 'No parameters defined',
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: '',
            detail: 'Define parameters in frontmatter to see suggestions',
            documentation: 'Add a `parameters:` section in the YAML frontmatter. Workflow parameter access proxies to these parameter definitions.',
            range,
            sortText: '9_noparam'
          })
        }
      }

      // Version suggestions (after @namespace/package@)
      if (context.type === 'version' && context.packageName) {
        try {
          const versions = await registryApi.getPackageVersions(context.packageName)
          versions.forEach((version, index) => {
            suggestions.push({
              label: version,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: version,
              detail: index === 0 ? 'Latest version' : 'Package version',
              documentation: `Install ${context.packageName}@${version}`,
              range,
              sortText: `0_${index.toString().padStart(3, '0')}` // Latest first
            })
          })
        } catch (error) {
          console.warn('Failed to fetch package versions:', error)
        }
      }

      // Package suggestions
      if (context.type === 'using' || context.type === 'inherits' || textUntilPosition.endsWith('@')) {
        const query = context.query || word.word
        if (query.length >= 1) {
          try {
            const packageSuggestions = await registryApi.getSuggestions(query, 'package')
            packageSuggestions.forEach(pkgName => {
              suggestions.push({
                label: pkgName,
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: `${pkgName}@`,
                detail: 'Package',
                documentation: `Prompd package: ${pkgName}\n\nType @ to see available versions`,
                range,
                sortText: `0_${pkgName}` // Priority sorting
              })
            })
          } catch (error) {
            console.warn('Failed to fetch package suggestions:', error)
          }
        }

        // Built-in package prefixes
        BUILTIN_SUGGESTIONS.packagePrefixes.forEach(prefix => {
          if (prefix && prefix.toLowerCase().includes((context.query || word.word).toLowerCase())) {
            suggestions.push({
              label: prefix,
              kind: monaco.languages.CompletionItemKind.Text,
              insertText: prefix,
              detail: 'Scope',
              range
            })
          }
        })
      }

      // Parameter type suggestions with enhanced types
      if (context.type === 'paramtype') {
        const query = context.query || ''

        const parameterTypes = [
          {
            type: 'string',
            description: 'Text value',
            example: '{ type: string, description: "User name" }'
          },
          {
            type: 'number',
            description: 'Numeric value (integer or float)',
            example: '{ type: number, description: "Age", default: 25 }'
          },
          {
            type: 'integer',
            description: 'Whole number value',
            example: '{ type: integer, description: "Count", min: 0, max: 100 }'
          },
          {
            type: 'boolean',
            description: 'True or false value',
            example: '{ type: boolean, description: "Enable feature", default: true }'
          },
          {
            type: 'array',
            description: 'List of values',
            example: '{ type: array, description: "Tags", items: { type: string } }'
          },
          {
            type: 'object',
            description: 'Structured data',
            example: '{ type: object, description: "User profile", properties: { name: string, age: number } }'
          },
          {
            type: 'enum',
            description: 'One of predefined values',
            example: '{ type: enum, enum: ["small", "medium", "large"], description: "Size" }'
          },
          {
            type: 'date',
            description: 'Date value (ISO 8601)',
            example: '{ type: date, description: "Birth date" }'
          },
          {
            type: 'email',
            description: 'Email address',
            example: '{ type: email, description: "Contact email" }'
          },
          {
            type: 'url',
            description: 'URL/URI',
            example: '{ type: url, description: "Website" }'
          }
        ]

        parameterTypes.forEach(({ type, description, example }) => {
          if (type.toLowerCase().includes(query.toLowerCase())) {
            suggestions.push({
              label: type,
              kind: monaco.languages.CompletionItemKind.TypeParameter,
              insertText: type,
              detail: description,
              documentation: `**${type} type**\n\n${description}\n\n**Example:**\n\`\`\`yaml\nparameters:\n  myParam: ${example}\n\`\`\``,
              range,
              sortText: `0_${type}`
            })
          }
        })
      }

      // File path suggestions for context: field
      if (context.type === 'filepath') {
        const query = context.query || ''

        // Calculate custom range that includes the path the user has already typed
        const filepathRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - query.length,
          endColumn: position.column
        }

        // Get actual workspace files
        const contextFiles = getContextFiles()
        const folders = getFolders()

        // Add actual files from workspace
        contextFiles.forEach(filePath => {
          if (filePath.toLowerCase().includes(query.toLowerCase())) {
            const fileName = filePath.split('/').pop() || filePath
            suggestions.push({
              label: filePath,
              kind: monaco.languages.CompletionItemKind.File,
              insertText: filePath,
              detail: fileName,
              documentation: `Include ${filePath} as context`,
              range: filepathRange,
              sortText: `0_${filePath}`
            })
          }
        })

        // Add folder suggestions
        folders.forEach(folderPath => {
          if (folderPath.toLowerCase().includes(query.toLowerCase())) {
            suggestions.push({
              label: folderPath,
              kind: monaco.languages.CompletionItemKind.Folder,
              insertText: folderPath,
              detail: 'Directory',
              documentation: `Include files from ${folderPath}`,
              range: filepathRange,
              sortText: `1_${folderPath}`
            })
          }
        })

        // If no workspace files, show helpful template
        if (contextFiles.length === 0 && folders.length === 0) {
          suggestions.push({
            label: './relative/path.md',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '${1:./path/to/file.md}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Open a workspace folder to see file suggestions',
            documentation: 'Use relative paths from the current file location. Open a workspace folder to get file suggestions.',
            range: filepathRange,
            sortText: '2_template'
          })
        }
      }

      // Include directive file path suggestions: {% include "..." %}
      if (context.type === 'include') {
        const query = context.query || ''

        // Calculate custom range that includes the path the user has already typed
        // The query contains what's after the quote (e.g., "./" or "./gree")
        // We need to replace that entire path, not just the word at cursor
        const includeRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - query.length,
          endColumn: position.column
        }

        // Get actual workspace files
        const { prmd: prmdFiles, text: textFiles } = getIncludableFiles()
        const folders = getFolders()

        // Add .prmd files first (highest priority - compile-aware includes)
        prmdFiles.forEach(filePath => {
          if (filePath.toLowerCase().includes(query.toLowerCase())) {
            const fileName = filePath.split('/').pop() || filePath
            suggestions.push({
              label: filePath,
              kind: monaco.languages.CompletionItemKind.File,
              insertText: filePath,
              detail: `${fileName} (compiled)`,
              documentation: `Include ${filePath} - .prmd files are compiled (body only, frontmatter stripped)`,
              range: includeRange,
              sortText: `0_${filePath}`
            })
          }
        })

        // Add folder suggestions
        folders.forEach(folderPath => {
          if (folderPath.toLowerCase().includes(query.toLowerCase())) {
            suggestions.push({
              label: folderPath,
              kind: monaco.languages.CompletionItemKind.Folder,
              insertText: folderPath,
              detail: 'Directory',
              documentation: `Browse files in ${folderPath}`,
              range: includeRange,
              sortText: `1_${folderPath}`
            })
          }
        })

        // Add text files (markdown, txt - included as-is)
        textFiles.forEach(filePath => {
          if (filePath.toLowerCase().includes(query.toLowerCase())) {
            const fileName = filePath.split('/').pop() || filePath
            suggestions.push({
              label: filePath,
              kind: monaco.languages.CompletionItemKind.File,
              insertText: filePath,
              detail: `${fileName} (raw)`,
              documentation: `Include ${filePath} - raw text files are included as-is`,
              range: includeRange,
              sortText: `2_${filePath}`
            })
          }
        })

        // If no workspace files, show helpful template
        if (prmdFiles.length === 0 && textFiles.length === 0 && folders.length === 0) {
          suggestions.push({
            label: './path/to/template.prmd',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '${1:./path/to/template.prmd}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Open a workspace folder to see file suggestions',
            documentation: 'Include a .prmd template. Open a workspace folder to get file suggestions.',
            range: includeRange,
            sortText: '3_template'
          })
        }
      }

      // Parameter suggestions
      if (context.type === 'parameter') {
        const query = context.query || word.word

        // Pattern-based parameter suggestions (context-aware)
        // Detect patterns in the document and suggest relevant parameters
        const fullContent = model.getValue()
        const patternSuggestions = getSuggestedParameters(fullContent)

        // Add pattern-based suggestions first (highest priority)
        patternSuggestions.forEach((param, index) => {
          if (!query || param.name.toLowerCase().includes(query.toLowerCase())) {
            const typeLabel = param.type === 'array' ? 'array' : param.type
            const requiredBadge = param.required ? ' (required)' : ''

            suggestions.push({
              label: param.name,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${param.name}: { type: ${param.type}, description: "\${1:${param.description}}"${param.default !== undefined ? `, default: ${JSON.stringify(param.default)}` : ''}${param.required ? ', required: true' : ''} }`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: `${typeLabel}${requiredBadge} - ${param.source}`,
              documentation: {
                value: `**${param.name}** (${typeLabel})\n\n${param.description}${param.default !== undefined ? `\n\n**Default:** \`${JSON.stringify(param.default)}\`` : ''}${param.required ? '\n\n**Required**' : ''}\n\n*Pattern-detected suggestion from: ${param.source}*`,
                isTrusted: true
              },
              range,
              sortText: `0_pattern_${index.toString().padStart(3, '0')}` // Highest priority
            })
          }
        })

        // Registry parameter suggestions
        try {
          const paramSuggestions = await registryApi.getSuggestions(query, 'parameter')
          paramSuggestions.forEach(param => {
            suggestions.push({
              label: param,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: param,
              detail: 'Parameter',
              range
            })
          })
        } catch (error) {
          console.warn('Failed to fetch parameter suggestions:', error)
        }

        // Built-in parameter types
        BUILTIN_SUGGESTIONS.parameterTypes.forEach(type => {
          if (type.toLowerCase().includes(query.toLowerCase())) {
            suggestions.push({
              label: type,
              kind: monaco.languages.CompletionItemKind.TypeParameter,
              insertText: type,
              detail: 'Type',
              range
            })
          }
        })
      }

      // YAML frontmatter field suggestions
      if (context.type === 'frontmatter') {
        const frontmatterFields = [
          {
            label: 'id',
            detail: 'Unique identifier',
            insertText: 'id: ${1:my-prompt}',
            documentation: 'A unique identifier for this prompt. Use kebab-case format (e.g., my-prompt-id)'
          },
          {
            label: 'name',
            detail: 'Display name',
            insertText: 'name: ${1:My Prompt}',
            documentation: 'Human-readable name shown in the UI'
          },
          {
            label: 'description',
            detail: 'Description',
            insertText: 'description: ${1:A brief description of what this prompt does}',
            documentation: 'Detailed description of the prompt\'s purpose and functionality'
          },
          {
            label: 'version',
            detail: 'Semantic version',
            insertText: 'version: ${1:1.0.0}',
            documentation: 'Semantic version number (MAJOR.MINOR.PATCH)'
          },
          {
            label: 'using',
            detail: 'Package imports',
            insertText: 'using:\n  - "${1:@namespace/package@version}"',
            documentation: 'Import external packages. Use @namespace/package@version format'
          },
          {
            label: 'inherits',
            detail: 'Template inheritance',
            insertText: 'inherits: "${1:@namespace/template@version}"',
            documentation: 'Inherit from another prompt template. Child prompts extend parent functionality'
          },
          {
            label: 'parameters',
            detail: 'Input parameters',
            insertText: 'parameters:\n  ${1:paramName}: { type: ${2|string,number,boolean,array,object|}, description: "${3:Parameter description}" }',
            documentation: 'Define input parameters with type validation and descriptions'
          },
          {
            label: 'context',
            detail: 'Context files',
            insertText: 'context:\n  - "${1:./path/to/file}"',
            documentation: 'List of context files to include (supports relative paths)'
          },
          {
            label: 'provider',
            detail: 'AI provider',
            insertText: 'provider: ${1|openai,anthropic,google,azure,local|}',
            documentation: 'LLM provider to use for execution'
          },
          {
            label: 'model',
            detail: 'AI model',
            insertText: 'model: ${1|gpt-4o,claude-3-5-sonnet,gemini-pro|}',
            documentation: 'Specific model to use from the provider'
          },
          {
            label: 'temperature',
            detail: 'Randomness (0-2)',
            insertText: 'temperature: ${1:0.7}',
            documentation: 'Controls randomness. 0 = deterministic, 2 = very creative. Default: 0.7'
          },
          {
            label: 'max_tokens',
            detail: 'Max output tokens',
            insertText: 'max_tokens: ${1:2000}',
            documentation: 'Maximum number of tokens in the response'
          },
          {
            label: 'author',
            detail: 'Author name',
            insertText: 'author: ${1:Your Name}',
            documentation: 'Name of the prompt author'
          },
          {
            label: 'license',
            detail: 'License type',
            insertText: 'license: ${1|MIT,Apache-2.0,GPL-3.0,BSD-3-Clause,Proprietary|}',
            documentation: 'License for this prompt'
          },
          {
            label: 'tags',
            detail: 'Search tags',
            insertText: 'tags:\n  - ${1:tag1}\n  - ${2:tag2}',
            documentation: 'Tags for categorization and search'
          }
        ]

        frontmatterFields.forEach(field => {
          if (field.label.toLowerCase().includes((context.query || word.word).toLowerCase())) {
            suggestions.push({
              label: field.label,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: field.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: field.detail,
              documentation: field.documentation,
              range,
              sortText: `1_${field.label}` // Priority sorting for frontmatter fields
            })
          }
        })

        // Provider suggestions
        if (context.field === 'provider') {
          const vRange = buildValueRange(model.getLineContent(position.lineNumber))
          if (providerModelHints) {
            suggestions.push({
              label: providerModelHints.currentProvider,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: providerModelHints.currentProvider,
              detail: 'Current provider',
              documentation: 'Your currently selected provider',
              range: vRange,
              sortText: '0_current'
            })
            providerModelHints.availableProviders
              .filter(p => p.id !== providerModelHints!.currentProvider)
              .forEach((p, i) => {
                suggestions.push({
                  label: p.id,
                  kind: monaco.languages.CompletionItemKind.Value,
                  insertText: p.id,
                  detail: p.displayName,
                  range: vRange,
                  sortText: `1_${String(i).padStart(3, '0')}`
                })
              })
          } else {
            BUILTIN_SUGGESTIONS.providers.forEach(provider => {
              suggestions.push({
                label: provider,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: provider,
                detail: 'AI Provider',
                range: vRange
              })
            })
          }
        }

        // Model suggestions
        if (context.field === 'model') {
          const vRange = buildValueRange(model.getLineContent(position.lineNumber))
          if (providerModelHints) {
            const content = model.getValue()
            const providerMatch = content.match(/^provider:\s*["']?(\S+?)["']?\s*$/m)
            const frontmatterProvider = providerMatch?.[1]
            const targetProvider = frontmatterProvider || providerModelHints.currentProvider
            const providerModels = resolveModelsForProvider(targetProvider, providerModelHints)

            // Pin the active model first when targeting the same provider as UI selection
            if (targetProvider.toLowerCase() === providerModelHints.currentProvider.toLowerCase()) {
              suggestions.push({
                label: providerModelHints.currentModel,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: providerModelHints.currentModel,
                detail: 'Current model',
                documentation: 'Your currently selected model',
                range: vRange,
                sortText: '0_current'
              })
            }

            if (providerModels.length > 0) {
              providerModels
                .filter(m => m.id !== providerModelHints!.currentModel || targetProvider.toLowerCase() !== providerModelHints!.currentProvider.toLowerCase())
                .forEach((m, i) => {
                  suggestions.push({
                    label: m.id,
                    kind: monaco.languages.CompletionItemKind.Value,
                    insertText: m.id,
                    detail: m.displayName || targetProvider,
                    range: vRange,
                    sortText: `1_${String(i).padStart(3, '0')}`
                  })
                })
            } else {
              // Unknown provider — show all known models across all providers
              Object.entries(KNOWN_PROVIDER_MODELS).forEach(([, models], pi) => {
                models.forEach((m, mi) => {
                  suggestions.push({
                    label: m.id,
                    kind: monaco.languages.CompletionItemKind.Value,
                    insertText: m.id,
                    detail: m.displayName,
                    range: vRange,
                    sortText: `2_${String(pi).padStart(2, '0')}_${String(mi).padStart(3, '0')}`
                  })
                })
              })
            }
          } else {
            BUILTIN_SUGGESTIONS.models.forEach(m => {
              suggestions.push({
                label: m,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: m,
                detail: 'AI Model',
                range: vRange
              })
            })
          }
        }

        // Temperature suggestions
        if (context.field === 'temperature') {
          const vRange = buildValueRange(model.getLineContent(position.lineNumber))
          const temperaturePresets = [
            { value: '0', detail: 'Deterministic — same output every time' },
            { value: '0.1', detail: 'Very focused — minimal variation' },
            { value: '0.3', detail: 'Focused — low creativity' },
            { value: '0.5', detail: 'Balanced' },
            { value: '0.7', detail: 'Default — moderate creativity' },
            { value: '1.0', detail: 'Creative — more variation' },
            { value: '1.5', detail: 'Very creative — high variation' },
            { value: '2.0', detail: 'Maximum — most random' }
          ]
          temperaturePresets.forEach(({ value, detail }, i) => {
            suggestions.push({
              label: value,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: value,
              detail,
              range: vRange,
              sortText: `0_${String(i).padStart(3, '0')}`
            })
          })
        }

        // Max tokens suggestions
        if (context.field === 'max_tokens') {
          const vRange = buildValueRange(model.getLineContent(position.lineNumber))
          const maxTokensPresets = [
            { value: '256', detail: 'Very short response' },
            { value: '512', detail: 'Short response' },
            { value: '1024', detail: 'Medium response' },
            { value: '2048', detail: 'Standard response' },
            { value: '4096', detail: 'Default — long response' },
            { value: '8192', detail: 'Extended response' },
            { value: '16384', detail: 'Very long response' },
            { value: '32768', detail: 'Maximum — context-dependent' }
          ]
          maxTokensPresets.forEach(({ value, detail }, i) => {
            suggestions.push({
              label: value,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: value,
              detail,
              range: vRange,
              sortText: `0_${String(i).padStart(3, '0')}`
            })
          })
        }
      }

      // Section header suggestions with enhanced documentation
      if (context.type === 'section') {
        const sectionDocs: Record<string, { description: string; example: string }> = {
          'System': {
            description: 'System instructions that set the AI\'s behavior, role, and constraints',
            example: '# System\nYou are a helpful assistant that provides concise, accurate answers.'
          },
          'Context': {
            description: 'Background information and context for the AI to understand the task',
            example: '# Context\nThe user is working on a TypeScript project using React and needs help with state management.'
          },
          'User': {
            description: 'The user\'s message or query',
            example: '# User\n{userQuery}'
          },
          'Assistant': {
            description: 'Example of desired AI response format or priming the response',
            example: '# Assistant\nHere\'s a structured breakdown:\n1. '
          },
          'Response': {
            description: 'Alternative to Assistant section for expected response format',
            example: '# Response\nProvide a JSON response with the following structure:'
          },
          'Examples': {
            description: 'Example interactions showing expected input/output patterns',
            example: '# Examples\nInput: "Hello"\nOutput: "Hi! How can I help you today?"'
          },
          'Tools': {
            description: 'Define tools or functions the AI can use',
            example: '# Tools\n- search(query): Search the knowledge base\n- calculate(expression): Perform calculations'
          },
          'Functions': {
            description: 'Function definitions for function calling',
            example: '# Functions\nfunction get_weather(location: string): Weather'
          }
        }

        BUILTIN_SUGGESTIONS.sections.forEach(section => {
          if (section.toLowerCase().includes((context.query || word.word).toLowerCase())) {
            const docs = sectionDocs[section]
            suggestions.push({
              label: `# ${section}`,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: `# ${section}\n${section === 'User' || section === 'Assistant' ? '${1:}' : ''}`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: 'Section Header',
              documentation: docs ? `**${section} Section**\n\n${docs.description}\n\n**Example:**\n\`\`\`\n${docs.example}\n\`\`\`` : `Creates a ${section} section`,
              range,
              sortText: `2_${section}` // Sort sections after frontmatter
            })
          }
        })
      }

      // Variable/parameter reference suggestions with enhanced metadata
      if (context.type === 'variable') {
        const query = context.query || ''

        // Find how many opening braces the user typed by looking back from cursor
        // Allow optional whitespace between braces and variable name ({{ var }})
        const lineText = model.getLineContent(position.lineNumber)
        const textBeforeCursor = lineText.substring(0, position.column - 1)
        const braceMatch = textBeforeCursor.match(/(\{+)(\s*)(\w*)$/)
        const openingBraces = braceMatch ? braceMatch[1] : '{'
        const spacesAfterBraces = braceMatch ? braceMatch[2].length : 0
        const isHandlebars = openingBraces.length >= 2

        // Range should cover the braces + spaces + any typed characters + auto-closed braces after cursor
        const replaceStart = position.column - openingBraces.length - spacesAfterBraces - query.length
        const textAfterCursor = lineText.substring(position.column - 1)
        // Consume optional trailing whitespace + closing braces after cursor
        const closingBraceMatch = textAfterCursor.match(/^(\s*\}+)/)
        const trailingChars = closingBraceMatch ? closingBraceMatch[1].length : 0
        const variableRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: replaceStart,
          endColumn: position.column + trailingChars
        }

        const { parameters, loopVariables } = extractParametersWithMetadata(model.getValue())
        const parameterMetadata = extractParameterMetadata(model.getValue())

        parameters.forEach(param => {
          if (param.toLowerCase().includes(query.toLowerCase())) {
            const meta = parameterMetadata.get(param)
            const isLoopVar = loopVariables.has(param)
            let documentation: string
            let detail: string

            if (isLoopVar) {
              if (param === 'loop') {
                detail = 'Loop helper'
                documentation = '**Nunjucks loop helper**\n\nAvailable properties:\n- `loop.index` - 1-based iteration count\n- `loop.index0` - 0-based iteration count\n- `loop.first` - true if first iteration\n- `loop.last` - true if last iteration\n- `loop.length` - total number of items'
              } else {
                detail = 'Loop variable'
                documentation = `**Loop iteration variable**\n\nDefined in \`{% for ${param} in ... %}\` block.`
              }
            } else if (meta) {
              const parts = []
              if (meta.type) parts.push(`**Type:** \`${meta.type}\``)
              if (meta.description) parts.push(meta.description)
              if (meta.default !== undefined) parts.push(`**Default:** \`${meta.default}\``)
              if (meta.required) parts.push('**Required:**')
              documentation = parts.join('\n\n')
              detail = meta.type ? `${meta.type} parameter` : 'Parameter'
            } else {
              documentation = 'Parameter reference - define in frontmatter'
              detail = 'Parameter'
            }

            if (isHandlebars) {
              // Match the user's whitespace style: "{{ param }}" vs "{{param}}"
              const sp = spacesAfterBraces > 0 ? ' ' : ''
              const label = '{{' + sp + param + sp + '}}'
              suggestions.push({
                label,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: label,
                filterText: label,
                detail,
                documentation,
                range: variableRange,
                sortText: '3_' + param
              })
            } else {
              // User typed "{" - offer single brace option
              suggestions.push({
                label: '{' + param + '}',
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: '{' + param + '}',
                detail,
                documentation,
                range: variableRange,
                sortText: '3_' + param
              })
              // Also offer handlebars option
              if (!isLoopVar) {
                suggestions.push({
                  label: '{{ ' + param + ' }}',
                  kind: monaco.languages.CompletionItemKind.Variable,
                  insertText: '{{ ' + param + ' }}',
                  filterText: '{{ ' + param + ' }}',
                  detail: detail + ' (handlebars)',
                  documentation,
                  range: variableRange,
                  sortText: '3_' + param + '_hbs'
                })
              }
            }
          }
        })

        // Built-in template functions
        const builtInFunctions = [
          {
            name: 'renderBase',
            signatures: ['renderBase()', 'renderBase("block_name")'],
            detail: 'Render parent block content',
            documentation: '**Template Inheritance Function**\n\nRenders the parent template\'s block content when using `inherits:`.\n\n**Usage:**\n- `{{ renderBase() }}` - Renders current block from parent\n- `{{ renderBase("block_name") }}` - Renders specific parent block\n\n**Example:**\n```yaml\n---\ninherits: "@namespace/base@^1.0.0"\n---\n\n{% block output_format %}\n{{ renderBase() }}\n\nAdditional formatting:\n- Include line numbers\n- Highlight syntax\n{% endblock %}\n```'
          },
          {
            name: 'env',
            signatures: ['env.VARIABLE_NAME'],
            detail: 'Environment variables',
            documentation: '**Environment Variables**\n\nAccess .env file variables.\n\n**Usage:**\n- `{{ env.API_KEY }}`\n- `{{ env.DATABASE_URL }}`\n\nType `.` after `env` to see available variables.'
          },
          // Workflow runtime variables (injected by workflowExecutor.ts)
          {
            name: 'workflow',
            signatures: ['workflow.PARAMETER_NAME'],
            detail: 'Workflow parameters',
            documentation: '**Workflow Parameters**\n\nAccess parameters passed to the workflow at execution time.\n\n**Usage:**\n- `{{ workflow.api_key }}`\n- `{{ workflow.user_input }}`\n\nParameters are defined in the workflow\'s parameter settings and passed when the workflow is triggered.'
          },
          {
            name: 'previous_output',
            signatures: ['previous_output'],
            detail: 'Previous node output',
            documentation: '**Previous Node Output**\n\nThe output from the directly connected upstream node.\n\n**Usage:**\n- `{{ previous_output }}` - Full output\n- `{{ previous_output.field }}` - Nested field access\n\nAvailable when this prompt is connected as a downstream node in a workflow.'
          },
          {
            name: 'input',
            signatures: ['input'],
            detail: 'Node input (alias)',
            documentation: '**Node Input**\n\nAlias for `previous_output` -- the output from the connected upstream node.\n\n**Usage:**\n- `{{ input }}` - Full input value\n- `{{ input.field }}` - Nested field access\n\nCommonly used in code nodes and transform nodes.'
          },
          {
            name: 'previous_step',
            signatures: ['previous_step'],
            detail: 'Previous step output (alias)',
            documentation: '**Previous Step Output**\n\nAlias for `previous_output` -- the output from the connected upstream node.\n\n**Usage:**\n- `{{ previous_step }}` - Full output\n- `{{ previous_step.field }}` - Nested field access'
          }
        ]

        const builtinSp = spacesAfterBraces > 0 ? ' ' : ''

        builtInFunctions.forEach(func => {
          if (func.name.toLowerCase().includes(query.toLowerCase())) {
            func.signatures.forEach((signature, idx) => {
              const label = isHandlebars
                ? `{{${builtinSp}${signature}${builtinSp}}}`
                : signature
              const insertText = label

              suggestions.push({
                label,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText,
                filterText: label,
                detail: func.detail,
                documentation: func.documentation,
                range: variableRange,
                sortText: `2_builtin_${idx}_${func.name}`
              })
            })
          }
        })

        // Suggest common parameter patterns if no parameters defined
        if (parameters.length === 0) {
          const commonParams = [
            {
              name: 'input',
              type: 'string',
              description: 'Main input text or query',
              example: 'parameters:\n  input: { type: string, description: "User input" }'
            },
            {
              name: 'context',
              type: 'string',
              description: 'Additional context information',
              example: 'parameters:\n  context: { type: string, description: "Background context" }'
            },
            {
              name: 'format',
              type: 'string',
              description: 'Output format specification',
              example: 'parameters:\n  format: { type: string, description: "Output format", default: "json" }'
            },
            {
              name: 'language',
              type: 'string',
              description: 'Target language for output',
              example: 'parameters:\n  language: { type: string, description: "Output language", default: "en" }'
            }
          ]

          commonParams.forEach(param => {
            if (param.name.toLowerCase().includes((context.query || word.word).toLowerCase())) {
              suggestions.push({
                label: param.name,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: param.name,
                detail: `Add ${param.type} parameter`,
                documentation: `${param.description}\n\n**Example:**\n\`\`\`yaml\n${param.example}\n\`\`\``,
                range,
                sortText: `4_${param.name}`
              })
            }
          })
        }
      }

      // Parameter property suggestions (when inside a parameter definition)
      if (context.type === 'paramprop') {
        const existingProps = context.existingProps || []
        const query = (context.query || word.word).toLowerCase()

        // All valid parameter properties with descriptions
        const parameterProperties = [
          {
            name: 'type',
            detail: 'Parameter type',
            insertText: 'type: ${1|string,number,integer,boolean,array,object,enum|}',
            documentation: 'The data type for this parameter.\n\n**Types:** string, number, integer, boolean, array, object, enum',
            required: true
          },
          {
            name: 'description',
            detail: 'Human-readable description',
            insertText: 'description: "${1:Parameter description}"',
            documentation: 'A clear description of what this parameter is for.',
            required: true
          },
          {
            name: 'required',
            detail: 'Whether parameter is required',
            insertText: 'required: ${1|true,false|}',
            documentation: 'Set to `true` if this parameter must be provided.\n\n**Default:** false'
          },
          {
            name: 'default',
            detail: 'Default value',
            insertText: 'default: ${1:value}',
            documentation: 'The default value used when parameter is not provided.'
          },
          {
            name: 'enum',
            detail: 'Allowed values list',
            insertText: 'enum:\n      - "${1:option1}"\n      - "${2:option2}"',
            documentation: 'A list of allowed values for this parameter.\n\n**Note:** Use with `type: enum` or `type: string`'
          },
          {
            name: 'pattern',
            detail: 'Regex validation pattern',
            insertText: 'pattern: "${1:^[a-z]+$}"',
            documentation: 'Regular expression pattern for string validation.\n\n**Example:** `^[a-zA-Z0-9_]+$`'
          },
          {
            name: 'min',
            detail: 'Minimum value',
            insertText: 'min: ${1:0}',
            documentation: 'Minimum value for number/integer types, or minimum length for strings/arrays.'
          },
          {
            name: 'max',
            detail: 'Maximum value',
            insertText: 'max: ${1:100}',
            documentation: 'Maximum value for number/integer types, or maximum length for strings/arrays.'
          },
          {
            name: 'items',
            detail: 'Array item schema',
            insertText: 'items:\n      type: ${1|string,number,boolean,object|}',
            documentation: 'Schema for array items.\n\n**Example:**\n```yaml\nitems:\n  type: string\n```'
          },
          {
            name: 'properties',
            detail: 'Object properties schema',
            insertText: 'properties:\n      ${1:propertyName}:\n        type: ${2|string,number,boolean|}',
            documentation: 'Schema for object properties.\n\n**Example:**\n```yaml\nproperties:\n  name:\n    type: string\n  age:\n    type: integer\n```'
          },
          {
            name: 'examples',
            detail: 'Example values',
            insertText: 'examples:\n      - "${1:example1}"\n      - "${2:example2}"',
            documentation: 'Example values to help users understand expected input.'
          }
        ]

        parameterProperties.forEach(prop => {
          // Skip if property already exists in this parameter
          if (existingProps.includes(prop.name)) return

          // Filter by query
          if (prop.name.toLowerCase().includes(query)) {
            suggestions.push({
              label: prop.name,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: prop.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: prop.detail + (prop.required ? ' (recommended)' : ''),
              documentation: prop.documentation,
              range,
              sortText: prop.required ? `0_${prop.name}` : `1_${prop.name}`
            })
          }
        })
      }

      // Fallback: If no specific context, provide general suggestions
      if (suggestions.length === 0) {
        // Check if we're in YAML frontmatter (before second ---)
        const isInFrontmatter = (textUntilPosition.match(/^---/m) && !textUntilPosition.match(/^---\s*\n[\s\S]*?^---/m))

        if (isInFrontmatter) {
          // Check if cursor is on the value side of a provider: or model: field
          const currentLineContent = (model as monacoEditor.editor.ITextModel).getLineContent(position.lineNumber)
          const beforeCursorOnLine = currentLineContent.substring(0, position.column - 1)
          const onProviderValue = beforeCursorOnLine.match(/^\s*provider:\s*[\w.-]*$/)
          const onModelValue = beforeCursorOnLine.match(/^\s*model:\s*[\w.:-]*$/)
          const onTemperatureValue = beforeCursorOnLine.match(/^\s*temperature:\s*[\d.]*$/)
          const onMaxTokensValue = beforeCursorOnLine.match(/^\s*max_tokens:\s*\d*$/)

          if (onProviderValue && providerModelHints) {
            const vRange = buildValueRange(currentLineContent)
            suggestions.push({
              label: providerModelHints.currentProvider,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: providerModelHints.currentProvider,
              detail: 'Current provider',
              documentation: 'Your currently selected provider',
              range: vRange,
              sortText: '0_current'
            })
            providerModelHints.availableProviders
              .filter(p => p.id !== providerModelHints!.currentProvider)
              .forEach((p, i) => {
                suggestions.push({
                  label: p.id,
                  kind: monaco.languages.CompletionItemKind.Value,
                  insertText: p.id,
                  detail: p.displayName,
                  range: vRange,
                  sortText: `1_${String(i).padStart(3, '0')}`
                })
              })
          } else if (onModelValue && providerModelHints) {
            // Detect provider from frontmatter content
            const fullContent = (model as monacoEditor.editor.ITextModel).getValue()
            const providerMatch = fullContent.match(/^provider:\s*["']?(\S+?)["']?\s*$/m)
            const targetProvider = providerMatch?.[1] || providerModelHints.currentProvider
            const providerModels = resolveModelsForProvider(targetProvider, providerModelHints)
            const vRange = buildValueRange(currentLineContent)

            if (targetProvider.toLowerCase() === providerModelHints.currentProvider.toLowerCase()) {
              suggestions.push({
                label: providerModelHints.currentModel,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: providerModelHints.currentModel,
                detail: 'Current model',
                documentation: 'Your currently selected model',
                range: vRange,
                sortText: '0_current'
              })
            }
            if (providerModels.length > 0) {
              providerModels
                .filter(m => m.id !== providerModelHints!.currentModel || targetProvider.toLowerCase() !== providerModelHints!.currentProvider.toLowerCase())
                .forEach((m, i) => {
                  suggestions.push({
                    label: m.id,
                    kind: monaco.languages.CompletionItemKind.Value,
                    insertText: m.id,
                    detail: m.displayName || targetProvider,
                    range: vRange,
                    sortText: `1_${String(i).padStart(3, '0')}`
                  })
                })
            } else {
              Object.entries(KNOWN_PROVIDER_MODELS).forEach(([, models], pi) => {
                models.forEach((m, mi) => {
                  suggestions.push({
                    label: m.id,
                    kind: monaco.languages.CompletionItemKind.Value,
                    insertText: m.id,
                    detail: m.displayName,
                    range: vRange,
                    sortText: `2_${String(pi).padStart(2, '0')}_${String(mi).padStart(3, '0')}`
                  })
                })
              })
            }
          } else if (onTemperatureValue) {
            const vRange = buildValueRange(currentLineContent)
            const temperaturePresets = [
              { value: '0', detail: 'Deterministic — same output every time' },
              { value: '0.1', detail: 'Very focused — minimal variation' },
              { value: '0.3', detail: 'Focused — low creativity' },
              { value: '0.5', detail: 'Balanced' },
              { value: '0.7', detail: 'Default — moderate creativity' },
              { value: '1.0', detail: 'Creative — more variation' },
              { value: '1.5', detail: 'Very creative — high variation' },
              { value: '2.0', detail: 'Maximum — most random' }
            ]
            temperaturePresets.forEach(({ value, detail }, i) => {
              suggestions.push({
                label: value,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: value,
                detail,
                range: vRange,
                sortText: `0_${String(i).padStart(3, '0')}`
              })
            })
          } else if (onMaxTokensValue) {
            const vRange = buildValueRange(currentLineContent)
            const maxTokensPresets = [
              { value: '256', detail: 'Very short response' },
              { value: '512', detail: 'Short response' },
              { value: '1024', detail: 'Medium response' },
              { value: '2048', detail: 'Standard response' },
              { value: '4096', detail: 'Default — long response' },
              { value: '8192', detail: 'Extended response' },
              { value: '16384', detail: 'Very long response' },
              { value: '32768', detail: 'Maximum — context-dependent' }
            ]
            maxTokensPresets.forEach(({ value, detail }, i) => {
              suggestions.push({
                label: value,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: value,
                detail,
                range: vRange,
                sortText: `0_${String(i).padStart(3, '0')}`
              })
            })
          } else {
            // Provide frontmatter field suggestions
            const frontmatterFields = ['id', 'name', 'description', 'version', 'author', 'tags', 'parameters', 'using', 'inherits', 'context', 'provider', 'model']
            frontmatterFields.forEach(field => {
              suggestions.push({
                label: field,
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: `${field}: `,
                detail: 'Frontmatter field',
                range
              })
            })
          }
        } else {
          // Only provide section suggestions if user typed # at beginning of line
          const currentLine = model.getLineContent(position.lineNumber)
          const lineBeforeCursor = currentLine.substring(0, position.column - 1)

          // Only show section headers when line starts with # (user is typing a header)
          if (lineBeforeCursor.match(/^#+\s*$/)) {
            const sections = BUILTIN_SUGGESTIONS.sections
            sections.forEach(section => {
              suggestions.push({
                label: `# ${section}`,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: `# ${section}\n\n`,
                detail: 'Section header',
                documentation: `Add a ${section} section to your prompt`,
                range
              })
            })
          }
          // Otherwise, don't provide any fallback suggestions outside frontmatter
          // unless user explicitly typed # for headers
        }
      }

      console.log('[IntelliSense] Returning', suggestions.length, 'suggestions')
      if (suggestions.length > 0) {
        console.log('[IntelliSense] First 3 suggestions:', suggestions.slice(0, 3).map(s => s.label))
      }

      return { suggestions, incomplete: true }
    }
  })
}
