// Guarded TextMate loader for Monaco. Falls back to Monarch if TM deps are missing.
import type * as monacoEditor from 'monaco-editor'
import { setupIntelliSense } from './intellisense'

export async function setupPrompdLanguage(monaco: typeof monacoEditor) {
  const id = 'prompd'
  // Register language id once
  if (!(monaco.languages.getLanguages().some(l => l.id === id))) {
    monaco.languages.register({ id })
  }

  // Note: Theme definitions (prompd-dark, prompd-light) are in PrompdEditor.tsx's beforeMount
  // which provides comprehensive token rules and editor colors.
  // We don't define themes here to avoid conflicts.

  // Try to init TextMate support dynamically
  try {
    // Opt-in only: allow enabling via localStorage to avoid bundler resolution when deps are absent
    const enabledFlag = (window as any).__PROMPD_ENABLE_TM || localStorage.getItem('prompd.tm') === '1'
    if (!enabledFlag) throw new Error('TM disabled')

    // Use dynamic specifiers to avoid Vite pre-bundling resolution
    const tmId = ['monaco', '-textmate'].join('')
    const onigId = ['onig', 'asm'].join('')
    // @ts-ignore
    const [{ Registry }, onig] = await Promise.all([
      // @vite-ignore
      import(tmId),
      // @vite-ignore
      import(onigId)
    ])

    // Load onig wasm from public root if present
    const wasmUrl = '/onig.wasm'
    // @ts-ignore
    await onig.loadWASM(await (await fetch(wasmUrl)).arrayBuffer())

    const registry = new (Registry as any)({
      getGrammarDefinition: async (scopeName: string) => {
        if (scopeName === 'source.prompd') {
          const mod: any = await import('../grammars/prompd.tmLanguage.json')
          return { format: 'json', content: mod.default ?? mod }
        }
        return null as any
      }
    })

    const wireTmGrammars = (await import(/* @vite-ignore */ tmId) as any).wireTmGrammars
    const grammars = new Map<string, string>([[id, 'source.prompd']])
    await wireTmGrammars(monaco as any, registry as any, grammars)
    
    // Setup IntelliSense after TextMate
    setupIntelliSense(monaco)
    return { ok: true, via: 'textmate' as const }
  } catch (e) {
    // Fallback to a basic Monarch tokenizer
    monaco.languages.setMonarchTokensProvider(id, monarch)
    
    // Setup IntelliSense even with Monarch fallback
    setupIntelliSense(monaco)
    return { ok: false, via: 'monarch' as const, error: String(e) }
  }
}

// Enhanced Monarch tokenizer with proper state tracking for YAML frontmatter vs Markdown body
// Best practice: Use distinct states to avoid token conflicts between YAML and Markdown
const monarch: monacoEditor.languages.IMonarchLanguage = {
  defaultToken: '',

  tokenizer: {
    // Initial state: look for frontmatter start
    root: [
      // Frontmatter opening delimiter - switch to YAML state
      [/^---\s*$/, { token: 'punctuation.definition.frontmatter', next: '@frontmatter' }],
      // If no frontmatter, treat as markdown (empty match, switch state)
      [/(?=.)/, { token: '', next: '@markdown' }]
    ],

    // YAML frontmatter state
    frontmatter: [
      // Frontmatter closing delimiter - switch to markdown
      [/^---\s*$/, { token: 'punctuation.definition.frontmatter', next: '@markdown' }],

      // YAML comments (only valid in frontmatter, not markdown)
      [/(#.*)$/, 'comment.yaml'],

      // YAML list item with key-value: "  - name: value"
      [/^(\s*)(-)(\s+)([a-zA-Z_][a-zA-Z0-9_-]*)(:)/, ['', 'punctuation.definition.list.yaml', '', 'entity.name.tag.yaml', 'punctuation.separator.key-value.yaml']],

      // YAML key at line start: "key:" or "  key:"
      [/^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*)(:)/, ['', 'entity.name.tag.yaml', 'punctuation.separator.key-value.yaml']],

      // Package references in YAML values: "@namespace/package@version"
      [/@[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(@[^\s\]}"',]*)?/, 'variable.other.package'],
      [/@[a-zA-Z0-9_-]+/, 'support.class.package'],

      // YAML boolean values
      [/\b(true|false)\b/, 'constant.language.boolean.yaml'],

      // YAML null
      [/\b(null|~)\b/, 'constant.language.null.yaml'],

      // YAML numbers - semantic versions first (e.g., 0.0.1, 1.2.3-beta)
      [/\b\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?\b/, 'constant.numeric.version.yaml'],
      [/\b\d+\.\d+([eE][\-+]?\d+)?\b/, 'constant.numeric.float.yaml'],
      [/\b\d+\b/, 'constant.numeric.integer.yaml'],

      // Double-quoted strings
      [/"/, { token: 'string.quoted.double.yaml', next: '@yamlStringDouble' }],

      // Single-quoted strings
      [/'/, { token: 'string.quoted.single.yaml', next: '@yamlStringSingle' }],

      // Unquoted string values
      [/[^\s#"'\[\]{},:]+/, 'string.unquoted.yaml'],

      // YAML brackets and punctuation
      [/[\[\]{}]/, 'punctuation.bracket.yaml'],
      [/,/, 'punctuation.separator.yaml'],

      // Whitespace
      [/\s+/, '']
    ],

    yamlStringDouble: [
      [/[^"\\]+/, 'string.quoted.double.yaml'],
      [/\\./, 'constant.character.escape.yaml'],
      [/"/, { token: 'string.quoted.double.yaml', next: '@pop' }]
    ],

    yamlStringSingle: [
      [/[^']+/, 'string.quoted.single.yaml'],
      [/''/, 'constant.character.escape.yaml'],
      [/'/, { token: 'string.quoted.single.yaml', next: '@pop' }]
    ],

    // Markdown body state (after frontmatter)
    // Also supports XML tags for content-type: xml files
    markdown: [
      // Jinja2 comment blocks {# ... #}
      [/\{#/, { token: 'comment.block.jinja', next: '@jinjaComment' }],

      // Jinja2 control blocks {% ... %}
      [/\{%[-~]?/, { token: 'punctuation.definition.tag.jinja', next: '@jinjaBlock' }],

      // Jinja2 expression blocks {{ ... }} - must be before simple {param} patterns
      [/\{\{[-~]?/, { token: 'punctuation.definition.expression.jinja', next: '@jinjaExpression' }],

      // XML/HTML support for content-type: xml files
      // XML comments <!-- ... -->
      [/<!--/, { token: 'comment.block.xml', next: '@xmlComment' }],

      // Self-closing XML tags <tag ... />
      [/<([a-zA-Z_][\w.-]*)(\s+[^>]*)?(\s*)\/>/, ['tag.xml', 'attribute.xml', '']],

      // XML closing tags </tag>
      [/<\/([a-zA-Z_][\w.-]*)>/, 'tag.xml'],

      // XML opening tags <tag ...> - switch to tag state for attributes
      [/<([a-zA-Z_][\w.-]*)/, { token: 'tag.xml', next: '@xmlTag' }],

      // Section headers with semantic highlighting (prompd-specific sections)
      [/^(#{1,6})(\s+)(System|Context|User|Response|Assistant|Tools?|Functions?|Examples?|Instructions?|Output Format?)(\s*)$/, ['punctuation.definition.heading.markdown', '', 'entity.name.section.prompd', '']],

      // Regular markdown headers
      [/^(#{1,6})(\s+)(.+)$/, ['punctuation.definition.heading.markdown', '', 'markup.heading.markdown']],

      // Fenced code blocks with language (supports Jinja templating in language identifier)
      [/^(\s*)(```|~~~)(.*)$/, { token: 'punctuation.definition.code.fenced', next: '@codeblock.$2' }],

      // Inline code
      [/`[^`]+`/, 'markup.inline.raw.markdown'],

      // Parameter references - simple style {param} (not Jinja2, just shorthand)
      [/\{[a-zA-Z_][\w.]*\}/, 'variable.other.simple.prompd'],

      // Package references in markdown
      [/@[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(@[^\s\]}"',]*)?/, 'variable.other.package'],

      // Bold **text** or __text__
      [/\*\*[^*]+\*\*/, 'markup.bold.markdown'],
      [/__[^_]+__/, 'markup.bold.markdown'],

      // Italic *text* or _text_
      [/\*[^*\s][^*]*\*/, 'markup.italic.markdown'],
      [/_[^_\s][^_]*_/, 'markup.italic.markdown'],

      // Strikethrough ~~text~~
      [/~~[^~]+~~/, 'markup.strikethrough.markdown'],

      // Links [text](url)
      [/\[[^\]]+\]\([^)]+\)/, 'markup.underline.link.markdown'],

      // Images ![alt](url)
      [/!\[[^\]]*\]\([^)]+\)/, 'markup.underline.link.image.markdown'],

      // Reference links [text][ref]
      [/\[[^\]]+\]\[[^\]]+\]/, 'markup.underline.link.markdown'],

      // Unordered list items
      [/^(\s*)([*+-])(\s+)/, ['', 'punctuation.definition.list.markdown', '']],

      // Ordered list items
      [/^(\s*)(\d+\.)(\s+)/, ['', 'punctuation.definition.list.markdown', '']],

      // Blockquotes
      [/^(\s*)(>)/, ['', 'punctuation.definition.quote.markdown']],

      // Horizontal rules
      [/^[-*_]{3,}\s*$/, 'punctuation.definition.hr.markdown'],

      // Default - no special highlighting
      [/./, '']
    ],

    // XML comment state <!-- ... -->
    xmlComment: [
      [/-->/, { token: 'comment.block.xml', next: '@pop' }],
      [/./, 'comment.block.xml']
    ],

    // XML tag state (for parsing attributes after opening <tag)
    xmlTag: [
      // End of opening tag
      [/>/, { token: 'tag.xml', next: '@pop' }],
      // Self-closing end
      [/\/>/, { token: 'tag.xml', next: '@pop' }],
      // Jinja2 expressions in attributes {{ ... }}
      [/\{\{[-~]?/, { token: 'punctuation.definition.expression.jinja', next: '@xmlTagJinja' }],
      // Attribute name
      [/[a-zA-Z_][\w.-]*/, 'attribute.name.xml'],
      // Attribute value (double-quoted)
      [/"/, { token: 'string.xml', next: '@xmlAttrDouble' }],
      // Attribute value (single-quoted)
      [/'/, { token: 'string.xml', next: '@xmlAttrSingle' }],
      // Equals sign
      [/=/, 'punctuation.xml'],
      // Whitespace
      [/\s+/, '']
    ],

    // XML attribute double-quoted string
    xmlAttrDouble: [
      // Jinja2 expressions inside attribute values
      [/\{\{[-~]?/, { token: 'punctuation.definition.expression.jinja', next: '@xmlAttrJinja' }],
      [/[^"{\n]+/, 'string.xml'],
      [/"/, { token: 'string.xml', next: '@pop' }]
    ],

    // XML attribute single-quoted string
    xmlAttrSingle: [
      // Jinja2 expressions inside attribute values
      [/\{\{[-~]?/, { token: 'punctuation.definition.expression.jinja', next: '@xmlAttrJinja' }],
      [/[^'{\n]+/, 'string.xml'],
      [/'/, { token: 'string.xml', next: '@pop' }]
    ],

    // Jinja2 inside XML tag attributes
    xmlTagJinja: [
      [/[-~]?\}\}/, { token: 'punctuation.definition.expression.jinja', next: '@pop' }],
      [/\b(env|loop|self|super|caller|varargs|kwargs|renderBase)\b/, 'support.variable.jinja'],
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],
      [/[\[\]()]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],
      [/\s+/, '']
    ],

    // Jinja2 inside XML attribute values - return to the correct string state
    xmlAttrJinja: [
      [/[-~]?\}\}/, { token: 'punctuation.definition.expression.jinja', next: '@pop' }],
      [/\b(env|loop|self|super|caller|varargs|kwargs|renderBase)\b/, 'support.variable.jinja'],
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],
      [/[\[\]()]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],
      [/\s+/, '']
    ],

    // Code block states - track which fence type was used
    // Important: Jinja2 expressions ARE highlighted inside code blocks for .prmd files
    'codeblock.```': [
      [/^(\s*)(```)(\s*)$/, { token: 'punctuation.definition.code.fenced', next: '@markdown' }],
      // Jinja2 expressions inside code blocks
      [/\{\{[-~]?/, { token: 'punctuation.definition.expression.jinja', next: '@codeblockJinjaExpr.```' }],
      [/\{%[-~]?/, { token: 'punctuation.definition.tag.jinja', next: '@codeblockJinjaBlock.```' }],
      [/\{#/, { token: 'comment.block.jinja', next: '@codeblockJinjaComment.```' }],
      // Everything else is code block content
      [/[^`{\n]+/, 'markup.raw.block.markdown'],
      [/./, 'markup.raw.block.markdown']
    ],
    'codeblock.~~~': [
      [/^(\s*)(~~~)(\s*)$/, { token: 'punctuation.definition.code.fenced', next: '@markdown' }],
      // Jinja2 expressions inside code blocks
      [/\{\{[-~]?/, { token: 'punctuation.definition.expression.jinja', next: '@codeblockJinjaExpr.~~~' }],
      [/\{%[-~]?/, { token: 'punctuation.definition.tag.jinja', next: '@codeblockJinjaBlock.~~~' }],
      [/\{#/, { token: 'comment.block.jinja', next: '@codeblockJinjaComment.~~~' }],
      // Everything else is code block content
      [/[^~{\n]+/, 'markup.raw.block.markdown'],
      [/./, 'markup.raw.block.markdown']
    ],

    // Jinja expressions inside ``` code blocks
    'codeblockJinjaExpr.```': [
      [/[-~]?\}\}/, { token: 'punctuation.definition.expression.jinja', next: '@codeblock.```' }],
      [/\b(env|loop|self|super|caller|varargs|kwargs|renderBase)\b/, 'support.variable.jinja'],
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],
      [/[\[\]()]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],
      [/\s+/, '']
    ],
    'codeblockJinjaExpr.~~~': [
      [/[-~]?\}\}/, { token: 'punctuation.definition.expression.jinja', next: '@codeblock.~~~' }],
      [/\b(env|loop|self|super|caller|varargs|kwargs|renderBase)\b/, 'support.variable.jinja'],
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],
      [/[\[\]()]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],
      [/\s+/, '']
    ],

    // Jinja blocks inside ``` code blocks
    'codeblockJinjaBlock.```': [
      [/[-~]?%\}/, { token: 'punctuation.definition.tag.jinja', next: '@codeblock.```' }],
      [/\b(if|elif|else|endif|for|endfor|set|endset|block|endblock|extends|include|import|from|macro|endmacro|call|endcall|filter|endfilter|with|endwith|raw|endraw|autoescape|endautoescape)\b/, 'keyword.control.jinja'],
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],
      [/[\[\](){}]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],
      [/\s+/, '']
    ],
    'codeblockJinjaBlock.~~~': [
      [/[-~]?%\}/, { token: 'punctuation.definition.tag.jinja', next: '@codeblock.~~~' }],
      [/\b(if|elif|else|endif|for|endfor|set|endset|block|endblock|extends|include|import|from|macro|endmacro|call|endcall|filter|endfilter|with|endwith|raw|endraw|autoescape|endautoescape)\b/, 'keyword.control.jinja'],
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],
      [/[\[\](){}]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],
      [/\s+/, '']
    ],

    // Jinja comments inside code blocks
    'codeblockJinjaComment.```': [
      [/#\}/, { token: 'comment.block.jinja', next: '@codeblock.```' }],
      [/./, 'comment.block.jinja']
    ],
    'codeblockJinjaComment.~~~': [
      [/#\}/, { token: 'comment.block.jinja', next: '@codeblock.~~~' }],
      [/./, 'comment.block.jinja']
    ],

    // Jinja2 comment block state {# ... #}
    jinjaComment: [
      [/#\}/, { token: 'comment.block.jinja', next: '@pop' }],
      [/./, 'comment.block.jinja']
    ],

    // Jinja2 control block state {% ... %}
    jinjaBlock: [
      // Closing tag
      [/[-~]?%\}/, { token: 'punctuation.definition.tag.jinja', next: '@pop' }],

      // Control keywords
      [/\b(if|elif|else|endif|for|endfor|set|endset|block|endblock|extends|include|import|from|macro|endmacro|call|endcall|filter|endfilter|with|endwith|raw|endraw|autoescape|endautoescape)\b/, 'keyword.control.jinja'],

      // Built-in tests and filters
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],

      // Strings in Jinja
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],

      // Numbers
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],

      // Operators
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],

      // Brackets and punctuation
      [/[\[\](){}]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],

      // Variables/identifiers
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],

      // Whitespace
      [/\s+/, '']
    ],

    // Jinja2 expression block state {{ ... }}
    jinjaExpression: [
      // Closing tag
      [/[-~]?\}\}/, { token: 'punctuation.definition.expression.jinja', next: '@pop' }],

      // Built-in objects and functions like 'env', 'loop', 'renderBase'
      [/\b(env|loop|self|super|caller|varargs|kwargs|renderBase)\b/, 'support.variable.jinja'],

      // Built-in tests and filters
      [/\b(in|not|and|or|is|defined|undefined|none|true|false|True|False|None)\b/, 'keyword.operator.jinja'],

      // Strings in Jinja
      [/"[^"]*"/, 'string.quoted.double.jinja'],
      [/'[^']*'/, 'string.quoted.single.jinja'],

      // Numbers
      [/\b\d+(\.\d+)?\b/, 'constant.numeric.jinja'],

      // Operators (including filter pipe)
      [/[=!<>]=?|[+\-*/%]|\|/, 'keyword.operator.jinja'],

      // Brackets and punctuation
      [/[\[\]()]/, 'punctuation.bracket.jinja'],
      [/[,.]/, 'punctuation.separator.jinja'],

      // Variables/identifiers (after dot for property access)
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.other.jinja'],

      // Whitespace
      [/\s+/, '']
    ]
  }
}
