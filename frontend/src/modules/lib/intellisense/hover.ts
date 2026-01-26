/**
 * Hover providers for IntelliSense
 */
import type * as monacoEditor from 'monaco-editor'
import { registryApi } from '../../services/registryApi'
import { detectHoverContext } from './context'
import { extractParametersWithMetadata } from './utils'
import { createFilterHover } from './filters'
import { getEnvVarsCache } from './envCache'

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
      const word = model.getWordAtPosition(position)
      if (!word) return null

      const line = model.getLineContent(position.lineNumber)
      const context = detectHoverContext(line, word)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )

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

        if (parameters.includes(paramName)) {
          // Try to find parameter definition in frontmatter (handle CRLF)
          const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
          let paramInfo: Record<string, unknown> | null = null

          if (frontmatter) {
            const yamlContent = frontmatter[1]
            // Look for parameter definition
            const paramMatch = yamlContent.match(new RegExp(`${paramName}:\\s*\\{([^}]+)\\}`))
            if (paramMatch) {
              try {
                paramInfo = JSON.parse(`{${paramMatch[1]}}`)
              } catch {
                // Ignore parse errors
              }
            }
          }

          const contents: monacoEditor.IMarkdownString[] = []
          contents.push({ value: `**Parameter: ${paramName}**` })

          if (paramInfo) {
            if (paramInfo.type) {
              contents.push({ value: `**Type:** \`${paramInfo.type}\`` })
            }
            if (paramInfo.description) {
              contents.push({ value: `**Description:** ${paramInfo.description}` })
            }
            if (paramInfo.default !== undefined) {
              contents.push({ value: `**Default:** \`${paramInfo.default}\`` })
            }
            if (paramInfo.required !== undefined) {
              contents.push({
                value: `**Required:** ${paramInfo.required ? 'Yes' : 'No'}`
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
