import { useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  height?: string
  readOnly?: boolean
  theme?: 'light' | 'dark'
}

export default function CodeEditor({
  value,
  onChange,
  language = 'markdown',
  height = '300px',
  readOnly = false,
  theme = 'light'
}: CodeEditorProps) {
  const editorRef = useRef<any>(null)

  const handleEditorDidMount = (editor: any, monaco: typeof Monaco) => {
    editorRef.current = editor

    // Register custom language for .prmd files with syntax highlighting
    if (!monaco.languages.getLanguages().some(lang => lang.id === 'prmd')) {
      monaco.languages.register({ id: 'prmd' })

      monaco.languages.setMonarchTokensProvider('prmd', {
        defaultToken: '',
        tokenPostfix: '.prmd',

        tokenizer: {
          root: [
            // Start of YAML frontmatter
            [/^---\s*$/, { token: 'meta.yaml', next: '@yaml_frontmatter' }],

            // Jinja2 statements: {% if %}, {% for %}, {% endfor %}, etc.
            [/\{%[-~]?/, 'delimiter.jinja', '@jinja_statement'],

            // Jinja2 expressions: {{ variable }}, {{ function() }}
            [/\{\{[-~]?/, 'delimiter.jinja', '@jinja_expression'],

            // Jinja2 comments: {# comment #}
            [/\{#/, 'comment.jinja', '@jinja_comment'],

            // Flow blocks: {{flow:...}} (must come after jinja to avoid conflict)
            [/\{\{flow:[^}]+\}\}/, 'keyword.control'],

            // Parameters: {parameter_name}
            [/\{[a-zA-Z_][a-zA-Z0-9_]*\}/, 'variable.parameter'],

            // Variables: ${variable_name}
            [/\$\{[a-zA-Z_][a-zA-Z0-9_]*\}/, 'variable'],

            // Markdown headers
            [/^#{1,6}\s+.*$/, 'markup.heading'],

            // Markdown bold
            [/\*\*[^*]+\*\*/, 'markup.bold'],

            // Markdown italic
            [/\*[^*]+\*/, 'markup.italic'],

            // Markdown code inline
            [/`[^`]+`/, 'string'],

            // Markdown code blocks
            [/^```/, 'string', '@codeblock'],

            // Markdown links
            [/\[([^\]]+)\]\(([^)]+)\)/, 'string.link'],
          ],

          yaml_frontmatter: [
            // End of YAML frontmatter
            [/^---\s*$/, { token: 'meta.yaml', next: '@pop' }],

            // YAML comments
            [/#.*$/, 'comment.yaml'],

            // YAML keys - special known fields
            [/^\s*(id|name|version|description|author|license|tags|using|inherits|parameters|override|extends|include)(\s*)(:)/,
              ['key.yaml.special', 'white', 'delimiter.yaml']],

            // YAML keys - general
            [/^\s*([a-zA-Z_][\w-]*)(\s*)(:)/, ['key.yaml', 'white', 'delimiter.yaml']],

            // YAML nested keys (with indentation)
            [/^(\s+)([a-zA-Z_][\w-]*)(\s*)(:)/, ['white', 'key.yaml', 'white', 'delimiter.yaml']],

            // YAML string values (quoted)
            [/"([^"\\]|\\.)*"/, 'string.yaml'],
            [/'([^'\\]|\\.)*'/, 'string.yaml'],

            // YAML numbers
            [/\b\d+\.?\d*\b/, 'number.yaml'],

            // YAML booleans
            [/\b(true|false|yes|no|on|off)\b/, 'constant.yaml'],

            // YAML null
            [/\b(null|~)\b/, 'constant.yaml'],

            // YAML list markers
            [/^\s*-\s+/, 'delimiter.yaml'],

            // YAML anchors and aliases
            [/&[a-zA-Z_][\w-]*/, 'type.yaml'],
            [/\*[a-zA-Z_][\w-]*/, 'type.yaml'],

            // YAML block scalars
            [/[|>][-+]?\d*/, 'keyword.yaml'],
          ],

          jinja_statement: [
            [/[-~]?%\}/, 'delimiter.jinja', '@pop'],
            [/\b(if|elif|else|endif|for|endfor|block|endblock|extends|include|macro|endmacro|set|raw|endraw)\b/, 'keyword.jinja'],
            [/\b(in|and|or|not|is)\b/, 'keyword.operator.jinja'],
            [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.jinja'],
            [/"([^"\\]|\\.)*"/, 'string.jinja'],
            [/'([^'\\]|\\.)*'/, 'string.jinja'],
            [/\d+/, 'number.jinja'],
            [/[()[\].,|]/, 'delimiter.jinja'],
          ],

          jinja_expression: [
            [/[-~]?\}\}/, 'delimiter.jinja', '@pop'],
            [/\b(true|false|none)\b/, 'constant.jinja'],
            [/[a-zA-Z_][a-zA-Z0-9_]*\(/, 'function.jinja'],
            [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.jinja'],
            [/"([^"\\]|\\.)*"/, 'string.jinja'],
            [/'([^'\\]|\\.)*'/, 'string.jinja'],
            [/\d+/, 'number.jinja'],
            [/[()[\].,|]/, 'delimiter.jinja'],
          ],

          jinja_comment: [
            [/#\}/, 'comment.jinja', '@pop'],
            [/./, 'comment.jinja']
          ],

          codeblock: [
            [/^```/, 'string', '@pop'],
            [/.*$/, 'string']
          ]
        }
      })

      // Define custom theme colors for our tokens
      monaco.editor.defineTheme('prmd-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'variable.parameter', foreground: '0066CC', fontStyle: 'bold' },
          { token: 'variable', foreground: '008800' },
          { token: 'keyword.control', foreground: 'CC0000', fontStyle: 'bold' },
          { token: 'markup.heading', foreground: '0000FF', fontStyle: 'bold' },
          { token: 'markup.bold', fontStyle: 'bold' },
          { token: 'markup.italic', fontStyle: 'italic' },
          { token: 'string', foreground: 'A31515' },
          { token: 'string.link', foreground: '0066CC', fontStyle: 'underline' },
          { token: 'type', foreground: '267F99', fontStyle: 'bold' },
          // YAML tokens
          { token: 'meta.yaml', foreground: 'AF00DB', fontStyle: 'bold' },
          { token: 'key.yaml.special', foreground: '0000FF', fontStyle: 'bold' },
          { token: 'key.yaml', foreground: '001080', fontStyle: 'bold' },
          { token: 'delimiter.yaml', foreground: '000000' },
          { token: 'string.yaml', foreground: 'A31515' },
          { token: 'number.yaml', foreground: '098658' },
          { token: 'constant.yaml', foreground: '0000FF' },
          { token: 'comment.yaml', foreground: '008000', fontStyle: 'italic' },
          { token: 'type.yaml', foreground: '267F99' },
          { token: 'keyword.yaml', foreground: 'AF00DB' },
          // Jinja2 tokens
          { token: 'delimiter.jinja', foreground: 'CC6600', fontStyle: 'bold' },
          { token: 'keyword.jinja', foreground: 'AF00DB', fontStyle: 'bold' },
          { token: 'keyword.operator.jinja', foreground: '0000FF' },
          { token: 'variable.jinja', foreground: '001080' },
          { token: 'function.jinja', foreground: '795E26' },
          { token: 'string.jinja', foreground: 'A31515' },
          { token: 'number.jinja', foreground: '098658' },
          { token: 'constant.jinja', foreground: '0000FF' },
          { token: 'comment.jinja', foreground: '008000', fontStyle: 'italic' },
        ],
        colors: {}
      })

      monaco.editor.defineTheme('prmd-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'variable.parameter', foreground: '4EC9B0', fontStyle: 'bold' },
          { token: 'variable', foreground: '9CDCFE' },
          { token: 'keyword.control', foreground: 'FF6B6B', fontStyle: 'bold' },
          { token: 'markup.heading', foreground: '569CD6', fontStyle: 'bold' },
          { token: 'markup.bold', fontStyle: 'bold' },
          { token: 'markup.italic', fontStyle: 'italic' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'string.link', foreground: '4EC9B0', fontStyle: 'underline' },
          { token: 'type', foreground: '4EC9B0', fontStyle: 'bold' },
          // YAML tokens
          { token: 'meta.yaml', foreground: 'C586C0', fontStyle: 'bold' },
          { token: 'key.yaml.special', foreground: '569CD6', fontStyle: 'bold' },
          { token: 'key.yaml', foreground: '9CDCFE', fontStyle: 'bold' },
          { token: 'delimiter.yaml', foreground: 'D4D4D4' },
          { token: 'string.yaml', foreground: 'CE9178' },
          { token: 'number.yaml', foreground: 'B5CEA8' },
          { token: 'constant.yaml', foreground: '569CD6' },
          { token: 'comment.yaml', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'type.yaml', foreground: '4EC9B0' },
          { token: 'keyword.yaml', foreground: 'C586C0' },
          // Jinja2 tokens
          { token: 'delimiter.jinja', foreground: 'FFA500', fontStyle: 'bold' },
          { token: 'keyword.jinja', foreground: 'C586C0', fontStyle: 'bold' },
          { token: 'keyword.operator.jinja', foreground: '569CD6' },
          { token: 'variable.jinja', foreground: '9CDCFE' },
          { token: 'function.jinja', foreground: 'DCDCAA' },
          { token: 'string.jinja', foreground: 'CE9178' },
          { token: 'number.jinja', foreground: 'B5CEA8' },
          { token: 'constant.jinja', foreground: '569CD6' },
          { token: 'comment.jinja', foreground: '6A9955', fontStyle: 'italic' },
        ],
        colors: {}
      })
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '')
  }

  // Use custom prmd language and theme when language is markdown (for .prmd files)
  const editorLanguage = language === 'markdown' ? 'prmd' : language
  const editorTheme = language === 'markdown'
    ? (theme === 'dark' ? 'prmd-dark' : 'prmd-light')
    : (theme === 'dark' ? 'vs-dark' : 'vs-light')

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '6px',
      overflow: 'hidden'
    }}>
      <Editor
        height={height}
        language={editorLanguage}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={editorTheme}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 10, bottom: 10 },
          fixedOverflowWidgets: true
        }}
      />
    </div>
  )
}
