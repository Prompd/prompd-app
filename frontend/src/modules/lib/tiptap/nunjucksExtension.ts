/**
 * Tiptap extension for Nunjucks template syntax support.
 *
 * Provides:
 * 1. Decoration-based highlighting for {{ variable }}, {% tag %}, and {# comment #}
 * 2. Hover tooltips showing variable metadata (type, description, default)
 * 3. Preserves exact syntax during markdown round-trip via tiptap-markdown storage
 */
import { Mark } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'

const NUNJUCKS_REGEX = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\})/g

/** Variable metadata provided by the editor for hover tooltips */
export interface VariableInfo {
  type?: string
  description?: string
  default?: unknown
  required?: boolean
  enum?: unknown[]
}

/** Variables map: parameter name -> metadata */
export type VariablesMap = Record<string, VariableInfo>

/**
 * Parse a nunjucks expression to determine its kind and extract the key identifier.
 * Returns { kind, name, fullText } where:
 * - kind: 'variable' | 'tag' | 'comment'
 * - name: the variable name or tag keyword
 */
function parseExpression(text: string): { kind: 'variable' | 'tag' | 'comment'; name: string } {
  const trimmed = text.trim()

  // {{ variable }} or {{ object.property }} or {{ fn(args) }}
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    const inner = trimmed.slice(2, -2).trim()
    // Extract the first identifier (before dots, pipes, parens, brackets)
    const nameMatch = /^(\w+)/.exec(inner)
    return { kind: 'variable', name: nameMatch?.[1] || inner }
  }

  // {% tag ... %}
  if (trimmed.startsWith('{%') && trimmed.endsWith('%}')) {
    const inner = trimmed.slice(2, -2).trim()
    const tagMatch = /^(\w+)/.exec(inner)
    return { kind: 'tag', name: tagMatch?.[1] || inner }
  }

  // {# comment #}
  return { kind: 'comment', name: '' }
}

/**
 * Build tooltip HTML content for a nunjucks expression.
 */
function buildTooltipContent(expr: { kind: string; name: string }, variables: VariablesMap): string {
  if (expr.kind === 'comment') {
    return '<div class="nunjucks-tooltip-row"><span class="nunjucks-tooltip-label">Template comment</span></div>'
  }

  if (expr.kind === 'tag') {
    const tagDescriptions: Record<string, string> = {
      if: 'Conditional block',
      elif: 'Else-if condition',
      else: 'Else branch',
      endif: 'End conditional',
      for: 'Loop iteration',
      endfor: 'End loop',
      include: 'Include template file',
      block: 'Template block',
      endblock: 'End block',
      extends: 'Extend base template',
      macro: 'Define macro',
      endmacro: 'End macro',
      call: 'Call macro',
      endcall: 'End call',
      set: 'Set variable',
      raw: 'Raw output (no parsing)',
      endraw: 'End raw',
      filter: 'Apply filter',
      endfilter: 'End filter',
    }
    const desc = tagDescriptions[expr.name] || 'Template tag'
    return `<div class="nunjucks-tooltip-row">` +
      `<span class="nunjucks-tooltip-tag">${expr.name}</span>` +
      `<span class="nunjucks-tooltip-desc">${desc}</span>` +
      `</div>`
  }

  // Variable
  const info = variables[expr.name]
  if (!info) {
    return `<div class="nunjucks-tooltip-row">` +
      `<span class="nunjucks-tooltip-name">${expr.name}</span>` +
      `<span class="nunjucks-tooltip-warning">not defined in parameters</span>` +
      `</div>`
  }

  let html = `<div class="nunjucks-tooltip-row">`
  html += `<span class="nunjucks-tooltip-name">${expr.name}</span>`
  if (info.type) {
    html += `<span class="nunjucks-tooltip-type">${info.type}</span>`
  }
  if (info.required) {
    html += `<span class="nunjucks-tooltip-required">required</span>`
  }
  html += `</div>`

  if (info.description) {
    html += `<div class="nunjucks-tooltip-description">${escapeHtml(info.description)}</div>`
  }

  if (info.default !== undefined && info.default !== null) {
    const defaultStr = typeof info.default === 'string' ? `"${info.default}"` : String(info.default)
    html += `<div class="nunjucks-tooltip-default">Default: <code>${escapeHtml(defaultStr)}</code></div>`
  }

  if (info.enum && info.enum.length > 0) {
    const enumStr = info.enum.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(' | ')
    html += `<div class="nunjucks-tooltip-enum">Values: <code>${escapeHtml(enumStr)}</code></div>`
  }

  return html
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Create the hover tooltip plugin.
 * Reads variable data from editor.storage.nunjucksHighlight.variables
 */
function createTooltipPlugin(storage: { variables: VariablesMap }): Plugin {
  let tooltip: HTMLDivElement | null = null
  let currentTarget: HTMLElement | null = null

  function getOrCreateTooltip(): HTMLDivElement {
    if (!tooltip) {
      tooltip = document.createElement('div')
      tooltip.className = 'nunjucks-tooltip'
      tooltip.style.display = 'none'
      document.body.appendChild(tooltip)
    }
    return tooltip
  }

  function showTooltip(target: HTMLElement) {
    const text = target.textContent || ''
    const expr = parseExpression(text)
    const variables = storage.variables || {}
    const content = buildTooltipContent(expr, variables)

    const tip = getOrCreateTooltip()
    tip.innerHTML = content
    tip.style.display = 'block'

    // Position using viewport coordinates (fixed positioning)
    const targetRect = target.getBoundingClientRect()

    // First measure tooltip size
    const tipHeight = tip.offsetHeight
    const tipWidth = tip.offsetWidth

    // Default: show above the target
    let top = targetRect.top - tipHeight - 6
    if (top < 4) {
      // Not enough room above — show below
      top = targetRect.bottom + 6
      tip.classList.add('nunjucks-tooltip-below')
      tip.classList.remove('nunjucks-tooltip-above')
    } else {
      tip.classList.add('nunjucks-tooltip-above')
      tip.classList.remove('nunjucks-tooltip-below')
    }

    // Clamp left so tooltip stays within viewport
    const left = Math.max(4, Math.min(targetRect.left, window.innerWidth - tipWidth - 8))

    tip.style.top = `${top}px`
    tip.style.left = `${left}px`
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.style.display = 'none'
    }
    currentTarget = null
  }

  return new Plugin({
    key: new PluginKey('nunjucksTooltip'),
    view() {
      getOrCreateTooltip()

      return {
        destroy() {
          if (tooltip && tooltip.parentElement) {
            tooltip.parentElement.removeChild(tooltip)
          }
          tooltip = null
          currentTarget = null
        }
      }
    },
    props: {
      handleDOMEvents: {
        mouseover(_view, event) {
          const target = event.target as HTMLElement
          const nunjucksEl = target.closest?.('.nunjucks-expression') as HTMLElement | null
          if (nunjucksEl && nunjucksEl !== currentTarget) {
            currentTarget = nunjucksEl
            showTooltip(nunjucksEl)
          } else if (!nunjucksEl && currentTarget) {
            hideTooltip()
          }
          return false
        },
        mouseout(_view, event) {
          const related = (event as MouseEvent).relatedTarget as HTMLElement | null
          if (!related?.closest?.('.nunjucks-expression')) {
            hideTooltip()
          }
          return false
        }
      }
    }
  })
}

/**
 * NunjucksHighlight extension - decorates Nunjucks expressions with visual styling
 * and shows hover tooltips with variable metadata.
 * Uses ProseMirror decorations for purely visual highlighting.
 */
export const NunjucksHighlight = Mark.create({
  name: 'nunjucksHighlight',

  addStorage() {
    return {
      variables: {} as VariablesMap,
    }
  },

  addProseMirrorPlugins() {
    return [
      // Decoration plugin — highlights {{ }}, {% %}, and {# #} patterns
      new Plugin({
        key: new PluginKey('nunjucksHighlight'),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = []
            const doc = state.doc

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return

              let match: RegExpExecArray | null
              const regex = new RegExp(NUNJUCKS_REGEX.source, 'g')

              while ((match = regex.exec(node.text)) !== null) {
                const from = pos + match.index
                const to = from + match[0].length

                decorations.push(
                  Decoration.inline(from, to, {
                    class: 'nunjucks-expression',
                    'data-nunjucks': 'true'
                  })
                )
              }
            })

            return DecorationSet.create(doc, decorations)
          }
        }
      }),

      // Tooltip plugin — shows variable info on hover
      createTooltipPlugin(this.storage as { variables: VariablesMap })
    ]
  }
})

export default NunjucksHighlight
