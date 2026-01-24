/**
 * Filter definitions and completions for Nunjucks/Jinja2 template filters
 */
import type * as monacoEditor from 'monaco-editor'
import type { FilterDefinition } from './types'

/**
 * Built-in Prompd template filters
 */
export const PROMPD_FILTERS: FilterDefinition[] = [
  {
    name: 'fromcsv',
    description: 'Parse CSV string into array of objects',
    documentation: `**fromcsv** - Parse CSV string into array of objects

Converts a CSV-formatted string into an array of objects, where each object represents a row with column headers as keys.

**Features:**
- First row is used as headers
- Handles quoted values with commas inside
- Handles escaped quotes (\`""\`)
- Trims whitespace from values
- Skips empty lines`,
    example: `{% for record in csv_data | fromcsv %}
  Name: {{ record.name }}
  Email: {{ record.email }}
{% endfor %}`,
    returnType: 'Record<string, string>[]'
  },
  {
    name: 'fromjson',
    description: 'Parse JSON string into object/array',
    documentation: `**fromjson** - Parse JSON string into object/array

Parses a JSON-formatted string into a JavaScript object or array.

**Use cases:**
- Parse JSON parameters passed as strings
- Convert API response strings to objects
- Handle serialized configuration`,
    example: `{% set config = config_json | fromjson %}
Provider: {{ config.provider }}
Model: {{ config.model }}`,
    returnType: 'object | array | null'
  },
  {
    name: 'tojson',
    description: 'Convert object to JSON string',
    documentation: `**tojson** - Convert object to JSON string

Serializes an object or array to a JSON string. Optionally accepts an indent parameter for pretty-printing.

**Parameters:**
- \`indent\` (optional): Number of spaces for indentation`,
    example: `{{ user | tojson }}
{{ user | tojson(2) }}  {# Pretty print with 2-space indent #}`,
    parameters: [
      {
        name: 'indent',
        type: 'number',
        description: 'Number of spaces for indentation',
        optional: true
      }
    ],
    returnType: 'string'
  },
  {
    name: 'lines',
    description: 'Split string into array of lines',
    documentation: `**lines** - Split string into array of lines

Splits a string by line breaks (\\n or \\r\\n) into an array of strings.

**Use cases:**
- Process multi-line text line by line
- Iterate over file contents
- Handle text with multiple entries`,
    example: `{% for line in file_content | lines %}
  {{ loop.index }}. {{ line }}
{% endfor %}`,
    returnType: 'string[]'
  },
  {
    name: 'dedent',
    description: 'Remove common leading whitespace from text',
    documentation: `**dedent** - Remove common leading whitespace

Removes the common leading whitespace from all lines in a multi-line string. Perfect for cleaning up indented template blocks.

**Use cases:**
- Clean up code snippets embedded in prompts
- Format multi-line strings consistently
- Remove unwanted indentation from included content`,
    example: `{% set code %}
    def hello():
        print("world")
{% endset %}
{{ code | dedent }}
{# outputs:
def hello():
    print("world")
#}`,
    returnType: 'string'
  },
  {
    name: 'wordwrap',
    description: 'Wrap text at specified width',
    documentation: `**wordwrap** - Wrap text at specified character width

Wraps long lines of text at word boundaries, breaking at the specified character width.

**Parameters:**
- \`width\` (optional): Maximum line width (default: 80)
- \`break_long_words\` (optional): Break words longer than width (default: false)`,
    example: `{{ long_text | wordwrap(60) }}
{{ description | wordwrap(40, true) }}`,
    parameters: [
      {
        name: 'width',
        type: 'number',
        description: 'Maximum line width',
        default: '80',
        optional: true
      },
      {
        name: 'break_long_words',
        type: 'boolean',
        description: 'Break words longer than width',
        default: 'false',
        optional: true
      }
    ],
    returnType: 'string'
  },
  {
    name: 'truncate',
    description: 'Truncate string with ellipsis',
    documentation: `**truncate** - Truncate string to specified length

Truncates a string to the specified length and appends an ellipsis (or custom suffix).

**Parameters:**
- \`length\`: Maximum length including suffix
- \`suffix\` (optional): String to append (default: "...")
- \`preserve_words\` (optional): Don't break mid-word (default: true)`,
    example: `{{ long_text | truncate(100) }}
{{ title | truncate(50, "...more") }}
{{ description | truncate(80, "...", false) }}`,
    parameters: [
      {
        name: 'length',
        type: 'number',
        description: 'Maximum length including suffix'
      },
      {
        name: 'suffix',
        type: 'string',
        description: 'String to append when truncated',
        default: '"..."',
        optional: true
      },
      {
        name: 'preserve_words',
        type: 'boolean',
        description: 'Avoid breaking mid-word',
        default: 'true',
        optional: true
      }
    ],
    returnType: 'string'
  },
  {
    name: 'codeblock',
    description: 'Wrap content in fenced code block',
    documentation: `**codeblock** - Wrap content in markdown fenced code block

Wraps the input in triple backticks with optional language specifier for syntax highlighting.

**Parameters:**
- \`language\` (optional): Language identifier for syntax highlighting`,
    example: `{{ code | codeblock("python") }}
{# outputs:
\`\`\`python
def hello():
    print("world")
\`\`\`
#}`,
    parameters: [
      {
        name: 'language',
        type: 'string',
        description: 'Language for syntax highlighting',
        optional: true
      }
    ],
    returnType: 'string'
  },
  {
    name: 'bulletlist',
    description: 'Convert lines to bullet list',
    documentation: `**bulletlist** - Convert lines to markdown bullet list

Takes a multi-line string or array and formats each line/item as a bullet point.

**Use cases:**
- Quick formatting of list data
- Convert plain text to structured list`,
    example: `{{ items | bulletlist }}
{{ text | lines | bulletlist }}
{# outputs:
- Item 1
- Item 2
- Item 3
#}`,
    returnType: 'string'
  },
  {
    name: 'numberedlist',
    description: 'Convert lines to numbered list',
    documentation: `**numberedlist** - Convert lines to markdown numbered list

Takes a multi-line string or array and formats each line/item as a numbered list item.

**Use cases:**
- Create ordered lists from data
- Format steps or sequences`,
    example: `{{ steps | numberedlist }}
{# outputs:
1. First step
2. Second step
3. Third step
#}`,
    returnType: 'string'
  },
  {
    name: 'unique',
    description: 'Remove duplicate items from array',
    documentation: `**unique** - Remove duplicates from array

Returns a new array with duplicate values removed. Preserves first occurrence order.

**Use cases:**
- Deduplicate lists
- Clean up combined data sources`,
    example: `{{ [1, 2, 2, 3, 1] | unique }}
{# outputs: [1, 2, 3] #}

{{ tags | unique | join(", ") }}`,
    returnType: 'array'
  },
  {
    name: 'groupby',
    description: 'Group array items by field value',
    documentation: `**groupby** - Group objects by field value

Groups an array of objects by a specified field, returning an object where keys are the unique field values.

**Parameters:**
- \`field\`: The field name to group by`,
    example: `{% set byCategory = products | groupby("category") %}
{% for category, items in byCategory %}
## {{ category }}
{% for item in items %}
- {{ item.name }}
{% endfor %}
{% endfor %}`,
    parameters: [
      {
        name: 'field',
        type: 'string',
        description: 'Field name to group by'
      }
    ],
    returnType: 'Record<string, array>'
  },
  {
    name: 'pluck',
    description: 'Extract single field from array of objects',
    documentation: `**pluck** - Extract field values from array of objects

Returns an array containing just the values of the specified field from each object.

**Parameters:**
- \`field\`: The field name to extract`,
    example: `{{ users | pluck("name") | join(", ") }}
{# "Alice, Bob, Charlie" #}

{{ items | pluck("id") }}
{# [1, 2, 3] #}`,
    parameters: [
      {
        name: 'field',
        type: 'string',
        description: 'Field name to extract'
      }
    ],
    returnType: 'array'
  },
  {
    name: 'where',
    description: 'Filter objects by field value',
    documentation: `**where** - Filter array of objects by field value

Returns objects where the specified field matches the given value.

**Parameters:**
- \`field\`: The field name to check
- \`value\`: The value to match`,
    example: `{{ users | where("active", true) }}
{{ products | where("category", "electronics") }}

{% for item in items | where("status", "pending") %}
- {{ item.name }}
{% endfor %}`,
    parameters: [
      {
        name: 'field',
        type: 'string',
        description: 'Field name to filter on'
      },
      {
        name: 'value',
        type: 'any',
        description: 'Value to match'
      }
    ],
    returnType: 'array'
  },
  {
    name: 'shuffle',
    description: 'Randomize array order',
    documentation: `**shuffle** - Randomly reorder array elements

Returns a new array with elements in random order.

**Use cases:**
- Vary examples to avoid repetition
- Randomize quiz questions
- Create variety in generated content`,
    example: `{{ examples | shuffle | first }}
{# Random example each time #}

{% for item in options | shuffle %}
- {{ item }}
{% endfor %}`,
    returnType: 'array'
  },
  {
    name: 'sample',
    description: 'Pick random N items from array',
    documentation: `**sample** - Select random items from array

Returns N randomly selected items from the array. If count exceeds array length, returns all items shuffled.

**Parameters:**
- \`count\`: Number of items to select`,
    example: `{{ examples | sample(3) }}
{# 3 random examples #}

{% for example in dataset | sample(5) %}
- {{ example }}
{% endfor %}`,
    parameters: [
      {
        name: 'count',
        type: 'number',
        description: 'Number of items to select'
      }
    ],
    returnType: 'array'
  }
]

/**
 * Common Nunjucks built-in filters (for reference and completions)
 */
export const NUNJUCKS_BUILTIN_FILTERS: FilterDefinition[] = [
  {
    name: 'abs',
    description: 'Return absolute value of a number',
    documentation: '**abs** - Returns the absolute value of a number.',
    example: '{{ -5 | abs }}  {# outputs: 5 #}',
    returnType: 'number'
  },
  {
    name: 'capitalize',
    description: 'Capitalize first letter of string',
    documentation: '**capitalize** - Capitalizes the first letter of a string.',
    example: '{{ "hello" | capitalize }}  {# outputs: Hello #}',
    returnType: 'string'
  },
  {
    name: 'default',
    description: 'Return default value if variable is undefined',
    documentation: `**default** - Returns the default value if the variable is undefined.

**Alias:** \`d\``,
    example: '{{ undefined_var | default("fallback") }}',
    parameters: [
      {
        name: 'defaultValue',
        type: 'any',
        description: 'Value to use if variable is undefined'
      }
    ],
    returnType: 'any'
  },
  {
    name: 'first',
    description: 'Return first element of array',
    documentation: '**first** - Returns the first element of an array.',
    example: '{{ [1, 2, 3] | first }}  {# outputs: 1 #}',
    returnType: 'any'
  },
  {
    name: 'join',
    description: 'Join array elements with separator',
    documentation: '**join** - Joins array elements with a separator string.',
    example: '{{ ["a", "b", "c"] | join(", ") }}  {# outputs: a, b, c #}',
    parameters: [
      {
        name: 'separator',
        type: 'string',
        description: 'String to join elements with',
        default: '""'
      }
    ],
    returnType: 'string'
  },
  {
    name: 'last',
    description: 'Return last element of array',
    documentation: '**last** - Returns the last element of an array.',
    example: '{{ [1, 2, 3] | last }}  {# outputs: 3 #}',
    returnType: 'any'
  },
  {
    name: 'length',
    description: 'Return length of array or string',
    documentation: '**length** - Returns the length of an array or string.',
    example: '{{ "hello" | length }}  {# outputs: 5 #}',
    returnType: 'number'
  },
  {
    name: 'lower',
    description: 'Convert string to lowercase',
    documentation: '**lower** - Converts a string to lowercase.',
    example: '{{ "HELLO" | lower }}  {# outputs: hello #}',
    returnType: 'string'
  },
  {
    name: 'replace',
    description: 'Replace occurrences in string',
    documentation: '**replace** - Replaces occurrences of a substring with another string.',
    example: '{{ "hello world" | replace("world", "there") }}',
    parameters: [
      {
        name: 'search',
        type: 'string',
        description: 'String to search for'
      },
      {
        name: 'replacement',
        type: 'string',
        description: 'Replacement string'
      }
    ],
    returnType: 'string'
  },
  {
    name: 'reverse',
    description: 'Reverse array or string',
    documentation: '**reverse** - Reverses an array or string.',
    example: '{{ [1, 2, 3] | reverse }}  {# outputs: [3, 2, 1] #}',
    returnType: 'array | string'
  },
  {
    name: 'slice',
    description: 'Slice array from start to end index',
    documentation: '**slice** - Returns a slice of an array from start to end index.',
    example: '{{ [1, 2, 3, 4, 5] | slice(1, 3) }}  {# outputs: [2, 3] #}',
    parameters: [
      {
        name: 'start',
        type: 'number',
        description: 'Start index'
      },
      {
        name: 'end',
        type: 'number',
        description: 'End index (exclusive)',
        optional: true
      }
    ],
    returnType: 'array'
  },
  {
    name: 'sort',
    description: 'Sort array elements',
    documentation: '**sort** - Sorts array elements. Optionally by a specific attribute.',
    example: '{{ [3, 1, 2] | sort }}  {# outputs: [1, 2, 3] #}',
    parameters: [
      {
        name: 'reverse',
        type: 'boolean',
        description: 'Sort in reverse order',
        optional: true
      },
      {
        name: 'attribute',
        type: 'string',
        description: 'Attribute to sort by (for objects)',
        optional: true
      }
    ],
    returnType: 'array'
  },
  {
    name: 'split',
    description: 'Split string by delimiter',
    documentation: '**split** - Splits a string by a delimiter into an array.',
    example: '{{ "a,b,c" | split(",") }}  {# outputs: ["a", "b", "c"] #}',
    parameters: [
      {
        name: 'delimiter',
        type: 'string',
        description: 'String to split by'
      }
    ],
    returnType: 'string[]'
  },
  {
    name: 'trim',
    description: 'Remove whitespace from both ends',
    documentation: '**trim** - Removes whitespace from both ends of a string.',
    example: '{{ "  hello  " | trim }}  {# outputs: hello #}',
    returnType: 'string'
  },
  {
    name: 'upper',
    description: 'Convert string to uppercase',
    documentation: '**upper** - Converts a string to uppercase.',
    example: '{{ "hello" | upper }}  {# outputs: HELLO #}',
    returnType: 'string'
  }
]

/**
 * All available filters (Prompd custom + Nunjucks built-in)
 */
export const ALL_FILTERS = [...PROMPD_FILTERS, ...NUNJUCKS_BUILTIN_FILTERS]

/**
 * Get filter by name
 */
export function getFilterByName(name: string): FilterDefinition | undefined {
  return ALL_FILTERS.find(f => f.name === name)
}

/**
 * Create completion items for filters
 */
export function createFilterCompletions(
  monaco: typeof monacoEditor,
  range: monacoEditor.IRange,
  query: string = ''
): monacoEditor.languages.CompletionItem[] {
  const suggestions: monacoEditor.languages.CompletionItem[] = []
  const lowerQuery = query.toLowerCase()

  // Add Prompd custom filters first (higher priority)
  for (const filter of PROMPD_FILTERS) {
    if (filter.name.toLowerCase().includes(lowerQuery)) {
      const hasRequiredParams = filter.parameters?.some(p => !p.optional)
      suggestions.push({
        label: filter.name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: hasRequiredParams
          ? `${filter.name}($1)`
          : filter.name,
        insertTextRules: hasRequiredParams
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        detail: `(Prompd) ${filter.description}`,
        documentation: {
          value: `${filter.documentation}\n\n**Example:**\n\`\`\`jinja2\n${filter.example}\n\`\`\`\n\n**Returns:** \`${filter.returnType}\``
        },
        range,
        sortText: `0_${filter.name}` // Priority for Prompd filters
      })
    }
  }

  // Add Nunjucks built-in filters
  for (const filter of NUNJUCKS_BUILTIN_FILTERS) {
    if (filter.name.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        label: filter.name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: filter.parameters?.length
          ? `${filter.name}($1)`
          : filter.name,
        insertTextRules: filter.parameters?.length
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        detail: `(Nunjucks) ${filter.description}`,
        documentation: {
          value: `${filter.documentation}\n\n**Example:**\n\`\`\`jinja2\n${filter.example}\n\`\`\`\n\n**Returns:** \`${filter.returnType}\``
        },
        range,
        sortText: `1_${filter.name}` // Lower priority than Prompd filters
      })
    }
  }

  return suggestions
}

/**
 * Create hover content for a filter
 */
export function createFilterHover(
  monaco: typeof monacoEditor,
  filterName: string,
  range: monacoEditor.IRange
): monacoEditor.languages.Hover | null {
  const filter = getFilterByName(filterName)
  if (!filter) return null

  const contents: monacoEditor.IMarkdownString[] = []

  // Header with filter name
  const source = PROMPD_FILTERS.includes(filter) ? 'Prompd' : 'Nunjucks'
  contents.push({ value: `**${filter.name}** *(${source} filter)*` })

  // Description
  contents.push({ value: filter.description })

  // Parameters if any
  if (filter.parameters?.length) {
    const params = filter.parameters.map(p => {
      const optional = p.optional ? '?' : ''
      const defaultVal = p.default ? ` = ${p.default}` : ''
      return `- \`${p.name}${optional}: ${p.type}${defaultVal}\` - ${p.description}`
    }).join('\n')
    contents.push({ value: `**Parameters:**\n${params}` })
  }

  // Return type
  contents.push({ value: `**Returns:** \`${filter.returnType}\`` })

  // Example
  contents.push({ value: `**Example:**\n\`\`\`jinja2\n${filter.example}\n\`\`\`` })

  return { range, contents }
}
