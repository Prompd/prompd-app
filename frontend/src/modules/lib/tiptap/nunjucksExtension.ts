/**
 * Tiptap extension for Nunjucks template syntax support.
 *
 * Provides:
 * 1. A custom Mark that renders {{ variable }} and {% tag %} as styled inline chips
 * 2. Input rules that detect Nunjucks patterns and apply the mark
 * 3. Preserves exact syntax during markdown round-trip via tiptap-markdown storage
 */
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const NUNJUCKS_REGEX = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\})/g

/**
 * NunjucksHighlight extension - decorates Nunjucks expressions with visual styling
 * without converting them to marks (which would interfere with markdown serialization).
 * Uses ProseMirror decorations for purely visual highlighting.
 */
export const NunjucksHighlight = Mark.create({
  name: 'nunjucksHighlight',

  // This is a visual-only extension using decorations, not a real mark
  // It highlights {{ }}, {% %}, and {# #} patterns in the editor

  addProseMirrorPlugins() {
    return [
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
      })
    ]
  }
})

export default NunjucksHighlight
