// Code snippets for Prompd IntelliSense
import type * as monacoEditor from 'monaco-editor'

export const PROMPD_SNIPPETS = {
  'prompd-basic': {
    label: 'prompd-basic',
    kind: 'Snippet' as const,
    insertText: [
      '---',
      'id: ${1:prompt-id}',
      'name: ${2:Prompt Name}',
      'description: "${3:Description}"',
      'version: ${4:1.0.0}',
      'parameters:',
      '  - name: ${5:input}',
      '    type: ${6:string}',
      '    required: ${7:true}',
      '    description: "${8:Input parameter}"',
      '---',
      '',
      '# System',
      '${9:You are a helpful assistant.}',
      '',
      '# User',
      '{{ ${10:input} }}'
    ].join('\n'),
    documentation: 'Basic Prompd template structure',
    range: null as any
  },

  'prompd-advanced': {
    label: 'prompd-advanced',
    kind: 'Snippet' as const,
    insertText: [
      '---',
      'id: ${1:advanced-prompt}',
      'name: ${2:Advanced Prompt}',
      'description: "${3:Advanced prompt with multiple features}"',
      'version: ${4:1.0.0}',
      'using:',
      '  - name: "${5:@prompd/core@0.0.1}"',
      '    prefix: "${6:core}"',
      'provider: ${7:openai}',
      'model: ${8:gpt-4o-mini}',
      'temperature: ${9:0.7}',
      'max_tokens: ${10:1000}',
      'parameters:',
      '  - name: input',
      '    type: string',
      '    required: true',
      '    description: "Primary input"',
      '  - name: context',
      '    type: string',
      '    required: false',
      '    description: "Additional context"',
      '  - name: format',
      '    type: string',
      '    enum: [json, text, markdown]',
      '    default: text',
      '---',
      '',
      '# System',
      '${11:You are an expert assistant. Use the provided context to give accurate responses.}',
      '',
      '# Context',
      '{{ ${12:context} }}',
      '',
      '# User',
      '{{ ${13:input} }}',
      '',
      '# Response',
      'Format: {{ ${14:format} }}'
    ].join('\n'),
    documentation: 'Advanced Prompd template with package imports and multiple parameters',
    range: null as any
  },

  'using-packages': {
    label: 'using',
    kind: 'Snippet' as const,
    insertText: [
      'using:',
      '  - name: "${1:@prompd/core@latest}"',
      '    prefix: "${2:core}"'
    ].join('\n'),
    documentation: 'Import packages with namespace alias for referencing in templates',
    range: null as any
  },

  'parameter-def': {
    label: 'param',
    kind: 'Snippet' as const,
    insertText: [
      '${1:parameter_name}:',
      '  type: ${2:string}',
      '  required: ${3:true}',
      '  description: ${4:Parameter description}',
      '  ${5:default: ${6:default_value}}'
    ].join('\n'),
    documentation: 'Parameter definition',
    range: null as any
  },

  'section-system': {
    label: 'system',
    kind: 'Snippet' as const,
    insertText: [
      '# System',
      '${1:You are a helpful assistant.}'
    ].join('\n'),
    documentation: 'System prompt section',
    range: null as any
  },

  'section-context': {
    label: 'context',
    kind: 'Snippet' as const,
    insertText: [
      '# Context',
      '${1:Additional context information}'
    ].join('\n'),
    documentation: 'Context section',
    range: null as any
  },

  'section-user': {
    label: 'user',
    kind: 'Snippet' as const,
    insertText: [
      '# User',
      '${1:{input}}'
    ].join('\n'),
    documentation: 'User input section',
    range: null as any
  },

  'inherits-template': {
    label: 'inherits',
    kind: 'Snippet' as const,
    insertText: 'inherits: ${1:base-template.prmd}',
    documentation: 'Template inheritance',
    range: null as any
  },

  // Nunjucks control flow snippets
  'nunjucks-if': {
    label: 'if',
    kind: 'Snippet' as const,
    insertText: '{% if ${1:condition} %}\n${2}\n{% endif %}',
    documentation: 'Nunjucks if block - conditionally include content',
    range: null as any
  },

  'nunjucks-if-else': {
    label: 'ifelse',
    kind: 'Snippet' as const,
    insertText: '{% if ${1:condition} %}\n${2}\n{% else %}\n${3}\n{% endif %}',
    documentation: 'Nunjucks if/else block',
    range: null as any
  },

  'nunjucks-if-elif': {
    label: 'ifelif',
    kind: 'Snippet' as const,
    insertText: '{% if ${1:condition1} %}\n${2}\n{% elif ${3:condition2} %}\n${4}\n{% else %}\n${5}\n{% endif %}',
    documentation: 'Nunjucks if/elif/else block',
    range: null as any
  },

  'nunjucks-for': {
    label: 'for',
    kind: 'Snippet' as const,
    insertText: '{% for ${1:item} in ${2:items} %}\n${3:{{ $1 }}}\n{% endfor %}',
    documentation: 'Nunjucks for loop - iterate over a collection',
    range: null as any
  },

  'nunjucks-for-else': {
    label: 'forelse',
    kind: 'Snippet' as const,
    insertText: '{% for ${1:item} in ${2:items} %}\n${3:{{ $1 }}}\n{% else %}\n${4:No items found}\n{% endfor %}',
    documentation: 'Nunjucks for loop with else (when collection is empty)',
    range: null as any
  },

  'nunjucks-set': {
    label: 'set',
    kind: 'Snippet' as const,
    insertText: '{% set ${1:variable} = ${2:value} %}',
    documentation: 'Nunjucks set variable',
    range: null as any
  },

  'nunjucks-set-block': {
    label: 'setblock',
    kind: 'Snippet' as const,
    insertText: '{% set ${1:variable} %}\n${2:content}\n{% endset %}',
    documentation: 'Nunjucks set block - assign multi-line content to variable',
    range: null as any
  },

  'nunjucks-macro': {
    label: 'macro',
    kind: 'Snippet' as const,
    insertText: '{% macro ${1:name}(${2:args}) %}\n${3}\n{% endmacro %}',
    documentation: 'Nunjucks macro definition - reusable template function',
    range: null as any
  },

  'nunjucks-call': {
    label: 'call',
    kind: 'Snippet' as const,
    insertText: '{% call ${1:macro_name}(${2:args}) %}\n${3}\n{% endcall %}',
    documentation: 'Nunjucks call block - invoke macro with caller content',
    range: null as any
  },

  'nunjucks-filter': {
    label: 'filter',
    kind: 'Snippet' as const,
    insertText: '{% filter ${1:filtername} %}\n${2:content}\n{% endfilter %}',
    documentation: 'Nunjucks filter block - apply filter to content',
    range: null as any
  },

  'nunjucks-raw': {
    label: 'raw',
    kind: 'Snippet' as const,
    insertText: '{% raw %}\n${1:content with {{ braces }} not processed}\n{% endraw %}',
    documentation: 'Nunjucks raw block - output without template processing',
    range: null as any
  },

  'nunjucks-include': {
    label: 'include',
    kind: 'Snippet' as const,
    insertText: '{% include "${1:template.prmd}" %}',
    documentation: 'Nunjucks include - import another template',
    range: null as any
  },

  'nunjucks-variable': {
    label: '{{',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:variable} }}',
    documentation: 'Nunjucks variable output',
    range: null as any
  },

  'nunjucks-variable-filter': {
    label: '{{|',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:variable} | ${2:filter} }}',
    documentation: 'Nunjucks variable with filter',
    range: null as any
  },

  'nunjucks-comment': {
    label: '{#',
    kind: 'Snippet' as const,
    insertText: '{# ${1:comment} #}',
    documentation: 'Nunjucks comment - not rendered in output',
    range: null as any
  },

  // Advanced data processing snippets for power users
  'data-csv-iterate': {
    label: 'csvloop',
    kind: 'Snippet' as const,
    insertText: '{% for row in ${1:csv_data} | fromcsv %}\n- {{ row.${2:column_name} }}: {{ row.${3:value_column} }}\n{% endfor %}',
    documentation: 'Parse CSV data and iterate over rows - access columns by header name',
    range: null as any
  },

  'data-csv-table': {
    label: 'csvtable',
    kind: 'Snippet' as const,
    insertText: '{% set rows = ${1:csv_data} | fromcsv %}\n| ${2:Column1} | ${3:Column2} | ${4:Column3} |\n|----------|----------|----------|\n{% for row in rows %}\n| {{ row.$2 }} | {{ row.$3 }} | {{ row.$4 }} |\n{% endfor %}',
    documentation: 'Parse CSV and format as markdown table',
    range: null as any
  },

  'data-json-parse': {
    label: 'jsonparse',
    kind: 'Snippet' as const,
    insertText: '{% set data = ${1:json_string} | fromjson %}\n{{ data.${2:property} }}',
    documentation: 'Parse JSON string and access properties',
    range: null as any
  },

  'data-json-iterate': {
    label: 'jsonloop',
    kind: 'Snippet' as const,
    insertText: '{% set items = ${1:json_array} | fromjson %}\n{% for item in items %}\n- {{ item.${2:name} }}: {{ item.${3:value} }}\n{% endfor %}',
    documentation: 'Parse JSON array and iterate over items',
    range: null as any
  },

  'data-lines-iterate': {
    label: 'linesloop',
    kind: 'Snippet' as const,
    insertText: '{% for line in ${1:text} | lines %}\n{{ loop.index }}. {{ line | trim }}\n{% endfor %}',
    documentation: 'Split text into lines and iterate with line numbers',
    range: null as any
  },

  'data-split-iterate': {
    label: 'splitloop',
    kind: 'Snippet' as const,
    insertText: '{% for item in ${1:text} | split("${2:,}") %}\n- {{ item | trim }}\n{% endfor %}',
    documentation: 'Split string by delimiter and iterate',
    range: null as any
  },

  'data-filter-chain': {
    label: 'filterchain',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:value} | ${2:trim} | ${3:lower} | ${4:replace("${5:old}", "${6:new}")} }}',
    documentation: 'Chain multiple filters together',
    range: null as any
  },

  'data-conditional-default': {
    label: 'defaultval',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:variable} | default("${2:fallback value}") }}',
    documentation: 'Use default value if variable is undefined',
    range: null as any
  },

  'data-list-format': {
    label: 'listformat',
    kind: 'Snippet' as const,
    insertText: '{% for item in ${1:items} %}\n{% if loop.last %}and {% elif not loop.first %}, {% endif %}{{ item }}\n{%- endfor %}',
    documentation: 'Format list with commas and "and" before last item',
    range: null as any
  },

  'data-numbered-list': {
    label: 'numlist',
    kind: 'Snippet' as const,
    insertText: '{% for item in ${1:items} %}\n{{ loop.index }}. {{ item }}\n{% endfor %}',
    documentation: 'Create numbered list from array',
    range: null as any
  },

  'data-pluck-where': {
    label: 'pluckwhere',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:items} | where("${2:field}", ${3:value}) | pluck("${4:name}") | join(", ") }}',
    documentation: 'Filter objects then extract field values',
    range: null as any
  },

  'data-groupby-loop': {
    label: 'groupbyloop',
    kind: 'Snippet' as const,
    insertText: '{% set grouped = ${1:items} | groupby("${2:category}") %}\n{% for key, items in grouped %}\n## {{ key }}\n{% for item in items %}\n- {{ item.${3:name} }}\n{% endfor %}\n{% endfor %}',
    documentation: 'Group items by field and iterate over groups',
    range: null as any
  },

  'data-sample-examples': {
    label: 'randomexamples',
    kind: 'Snippet' as const,
    insertText: '{% for example in ${1:examples} | sample(${2:3}) %}\n- {{ example }}\n{% endfor %}',
    documentation: 'Pick N random items from array',
    range: null as any
  },

  'data-truncate-preview': {
    label: 'preview',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:text} | truncate(${2:100}, "...") }}',
    documentation: 'Truncate text with ellipsis for preview',
    range: null as any
  },

  'data-codeblock-wrap': {
    label: 'wrapcode',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:code} | dedent | codeblock("${2:python}") }}',
    documentation: 'Clean indentation and wrap in fenced code block',
    range: null as any
  },

  'data-unique-join': {
    label: 'uniquejoin',
    kind: 'Snippet' as const,
    insertText: '{{ ${1:items} | unique | join("${2:, }") }}',
    documentation: 'Remove duplicates and join as string',
    range: null as any
  },

  // Markdown snippets
  'md-heading1': {
    label: 'h1',
    kind: 'Snippet' as const,
    insertText: '# ${1:Heading 1}',
    documentation: 'Heading level 1',
    range: null as any
  },

  'md-heading2': {
    label: 'h2',
    kind: 'Snippet' as const,
    insertText: '## ${1:Heading 2}',
    documentation: 'Heading level 2',
    range: null as any
  },

  'md-heading3': {
    label: 'h3',
    kind: 'Snippet' as const,
    insertText: '### ${1:Heading 3}',
    documentation: 'Heading level 3',
    range: null as any
  },

  'md-heading4': {
    label: 'h4',
    kind: 'Snippet' as const,
    insertText: '#### ${1:Heading 4}',
    documentation: 'Heading level 4',
    range: null as any
  },

  'md-bold': {
    label: 'bold',
    kind: 'Snippet' as const,
    insertText: '**${1:bold text}**',
    documentation: 'Bold text',
    range: null as any
  },

  'md-italic': {
    label: 'italic',
    kind: 'Snippet' as const,
    insertText: '*${1:italic text}*',
    documentation: 'Italic text',
    range: null as any
  },

  'md-bold-italic': {
    label: 'bolditalic',
    kind: 'Snippet' as const,
    insertText: '***${1:bold italic text}***',
    documentation: 'Bold and italic text',
    range: null as any
  },

  'md-strikethrough': {
    label: 'strike',
    kind: 'Snippet' as const,
    insertText: '~~${1:strikethrough text}~~',
    documentation: 'Strikethrough text',
    range: null as any
  },

  'md-code-inline': {
    label: 'inlinecode',
    kind: 'Snippet' as const,
    insertText: '`${1:code}`',
    documentation: 'Inline code',
    range: null as any
  },

  'md-code-block': {
    label: 'codeblock',
    kind: 'Snippet' as const,
    insertText: '```${1:language}\n${2:code}\n```',
    documentation: 'Fenced code block with language',
    range: null as any
  },

  'md-link': {
    label: 'link',
    kind: 'Snippet' as const,
    insertText: '[${1:text}](${2:url})',
    documentation: 'Hyperlink',
    range: null as any
  },

  'md-link-titled': {
    label: 'linktitle',
    kind: 'Snippet' as const,
    insertText: '[${1:text}](${2:url} "${3:title}")',
    documentation: 'Hyperlink with title',
    range: null as any
  },

  'md-image': {
    label: 'img',
    kind: 'Snippet' as const,
    insertText: '![${1:alt text}](${2:url})',
    documentation: 'Image',
    range: null as any
  },

  'md-image-titled': {
    label: 'imgtitle',
    kind: 'Snippet' as const,
    insertText: '![${1:alt text}](${2:url} "${3:title}")',
    documentation: 'Image with title',
    range: null as any
  },

  'md-blockquote': {
    label: 'quote',
    kind: 'Snippet' as const,
    insertText: '> ${1:quoted text}',
    documentation: 'Blockquote',
    range: null as any
  },

  'md-blockquote-multi': {
    label: 'quotemulti',
    kind: 'Snippet' as const,
    insertText: '> ${1:first line}\n> ${2:second line}\n> ${3:third line}',
    documentation: 'Multi-line blockquote',
    range: null as any
  },

  'md-list-unordered': {
    label: 'ul',
    kind: 'Snippet' as const,
    insertText: '- ${1:item 1}\n- ${2:item 2}\n- ${3:item 3}',
    documentation: 'Unordered list',
    range: null as any
  },

  'md-list-ordered': {
    label: 'ol',
    kind: 'Snippet' as const,
    insertText: '1. ${1:item 1}\n2. ${2:item 2}\n3. ${3:item 3}',
    documentation: 'Ordered list',
    range: null as any
  },

  'md-checklist': {
    label: 'checklist',
    kind: 'Snippet' as const,
    insertText: '- [ ] ${1:unchecked item}\n- [x] ${2:checked item}\n- [ ] ${3:another item}',
    documentation: 'Task list / checklist',
    range: null as any
  },

  'md-table': {
    label: 'table',
    kind: 'Snippet' as const,
    insertText: '| ${1:Header 1} | ${2:Header 2} | ${3:Header 3} |\n|-------------|-------------|-------------|\n| ${4:Cell 1}   | ${5:Cell 2}   | ${6:Cell 3}   |\n| ${7:Cell 4}   | ${8:Cell 5}   | ${9:Cell 6}   |',
    documentation: 'Markdown table',
    range: null as any
  },

  'md-table-aligned': {
    label: 'tablealign',
    kind: 'Snippet' as const,
    insertText: '| ${1:Left} | ${2:Center} | ${3:Right} |\n|:--------|:--------:|--------:|\n| ${4:L1}  | ${5:C1}    | ${6:R1}   |\n| ${7:L2}  | ${8:C2}    | ${9:R2}   |',
    documentation: 'Table with column alignment (left, center, right)',
    range: null as any
  },

  'md-hr': {
    label: 'hr',
    kind: 'Snippet' as const,
    insertText: '\n---\n',
    documentation: 'Horizontal rule',
    range: null as any
  },

  'md-footnote': {
    label: 'footnote',
    kind: 'Snippet' as const,
    insertText: '[^${1:1}]: ${2:footnote text}',
    documentation: 'Footnote definition',
    range: null as any
  },

  'md-footnote-ref': {
    label: 'fnref',
    kind: 'Snippet' as const,
    insertText: '[^${1:1}]',
    documentation: 'Footnote reference',
    range: null as any
  },

  'md-details': {
    label: 'details',
    kind: 'Snippet' as const,
    insertText: '<details>\n<summary>${1:Click to expand}</summary>\n\n${2:Hidden content here}\n\n</details>',
    documentation: 'Collapsible section (HTML details/summary)',
    range: null as any
  },

  'md-kbd': {
    label: 'kbd',
    kind: 'Snippet' as const,
    insertText: '<kbd>${1:Ctrl}</kbd>+<kbd>${2:C}</kbd>',
    documentation: 'Keyboard shortcut styling',
    range: null as any
  }
}

// Common language identifiers for code block completions
export const CODE_BLOCK_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c',
  'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r',
  'sql', 'bash', 'shell', 'powershell', 'zsh',
  'html', 'css', 'scss', 'less', 'json', 'yaml', 'xml', 'toml',
  'markdown', 'plaintext', 'text',
  'dockerfile', 'makefile', 'cmake',
  'graphql', 'regex', 'diff', 'git',
  'lua', 'perl', 'haskell', 'elixir', 'erlang', 'clojure', 'fsharp',
  'vue', 'jsx', 'tsx', 'svelte', 'astro'
]

export function registerSnippets(monaco: typeof monacoEditor, languageId: string) {
  // Register snippets as completion items
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['!', '{', '%'],

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const lineContent = model.getLineContent(position.lineNumber)
      const textBeforeCursor = lineContent.substring(0, position.column - 1)

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      // Check if we're typing after {% - show Nunjucks control flow snippets
      // Match: {% or {% if or {%if (with optional space and partial keyword)
      const nunjucksMatch = textBeforeCursor.match(/\{%\s*(\w*)$/)
      const isNunjucksContext = !!nunjucksMatch

      // Check if we're typing after {{ - show variable snippets
      const variableMatch = textBeforeCursor.match(/\{\{\s*(\w*)$/)
      const isVariableContext = !!variableMatch

      const suggestions = Object.entries(PROMPD_SNIPPETS)
        .filter(([key]) => {
          // In {% context, prioritize control flow snippets
          if (isNunjucksContext) {
            return key.startsWith('nunjucks-') &&
                   !key.includes('variable') &&
                   !key.includes('comment')
          }
          // In {{ context, prioritize variable snippets
          if (isVariableContext) {
            return key.startsWith('nunjucks-variable')
          }
          // Otherwise show all snippets
          return true
        })
        .map(([key, snippet]) => {
          let insertText = snippet.insertText
          let adjustedRange = range

          // If triggered by {% , replace everything from {% to cursor
          if (isNunjucksContext && key.startsWith('nunjucks-') && !key.includes('variable') && nunjucksMatch) {
            // Calculate start column: position - length of matched text (e.g., "{% if" or "{%")
            const matchLength = nunjucksMatch[0].length
            adjustedRange = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - matchLength,
              endColumn: position.column
            }
          } else if (isVariableContext && key.startsWith('nunjucks-variable') && variableMatch) {
            // Calculate start column for {{ context
            const matchLength = variableMatch[0].length
            adjustedRange = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - matchLength,
              endColumn: position.column
            }
          }

          return {
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: snippet.documentation,
            detail: 'Snippet',
            sortText: isNunjucksContext || isVariableContext ? `0_${key}` : `snippet_${key}`,
            range: adjustedRange
          }
        })

      return { suggestions }
    }
  })

  // Register code block language completions after typing ```
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['`'],

    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber)
      const textBeforeCursor = lineContent.substring(0, position.column - 1)

      // Check if we're right after ``` (code fence start)
      const codeBlockMatch = textBeforeCursor.match(/```(\w*)$/)
      if (!codeBlockMatch) {
        return { suggestions: [] }
      }

      const partialLang = codeBlockMatch[1] || ''
      const matchStart = position.column - partialLang.length

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: matchStart,
        endColumn: position.column
      }

      // Filter languages that match the partial input
      const filteredLanguages = CODE_BLOCK_LANGUAGES.filter(lang =>
        lang.toLowerCase().startsWith(partialLang.toLowerCase())
      )

      const suggestions = filteredLanguages.map((lang, index) => ({
        label: lang,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: lang,
        documentation: `${lang} code block`,
        detail: 'Language',
        sortText: `lang_${index.toString().padStart(3, '0')}`,
        range
      }))

      return { suggestions }
    }
  })
}

// Auto-close pairs for markdown formatting
export const MARKDOWN_AUTO_CLOSE_PAIRS = [
  { open: '**', close: '**' },  // Bold
  { open: '*', close: '*' },    // Italic (single asterisk)
  { open: '_', close: '_' },    // Italic (underscore)
  { open: '~~', close: '~~' },  // Strikethrough
  { open: '`', close: '`' },    // Inline code
  { open: '```', close: '\n```' } // Code block
]

// Register auto-closing behavior for markdown markers
export function registerMarkdownAutoClose(monaco: typeof monacoEditor, languageId: string) {
  // Monaco's built-in auto-close doesn't handle multi-character pairs well,
  // so we configure the language to support common pairs
  monaco.languages.setLanguageConfiguration(languageId, {
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
      { open: '<', close: '>' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
      { open: '*', close: '*' },
      { open: '_', close: '_' },
      { open: '~', close: '~' },
      { open: '<', close: '>' }
    ],
    // Brackets for matching/highlighting
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['<', '>']
    ]
  })
}