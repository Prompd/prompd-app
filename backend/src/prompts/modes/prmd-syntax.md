## .prmd File Format

A `.prmd` file has two sections: **YAML frontmatter** (metadata) and **Markdown body** (content with template syntax).

```
---                              <-- Line 1: OPENING delimiter (always first line)
id: example-id
name: "Example Prompt"
version: 1.0.0
description: "What this prompt does"
parameters:
  - name: topic
    type: string
    description: "The topic to write about"
    required: true
  - name: tools
    type: json
    description: "Tool definitions as JSON"
    required: false
    default: ["read_file", "write_file"]
inherits: "@namespace/package@1.0.0/base.prmd"
context:
  - docs/reference.md
---                              <-- CLOSING delimiter (ends frontmatter)

# Title                          <-- Markdown body starts AFTER closing ---

## Section
Content with {{ topic }} variable references.
```

### Structure Rules

1. Line 1 is ALWAYS `---` (opening frontmatter delimiter) -- nothing before it
2. YAML frontmatter goes between opening and closing `---`
3. ALL markdown content goes AFTER the closing `---`
4. NEVER put markdown headers (# Title) inside the YAML frontmatter section

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (required) |
| `name` | string | Display name (required) |
| `version` | string | Semver version (required) |
| `description` | string | What the prompt does |
| `parameters` | array | Input parameters (see below) |
| `inherits` | string | Base template package reference |
| `context` / `contexts` | string or array | File paths for additional context |
| `override` | object | Override sections from inherited template |

### Parameter Types

Parameters are defined in frontmatter and referenced in the body:

```yaml
parameters:
  - name: topic
    type: string          # Plain text
    required: true
  - name: count
    type: number          # Numeric value
    default: 5
  - name: tools
    type: json            # JSON array or object -- passed as structured data
    default: ["tool_a", "tool_b"]
  - name: verbose
    type: boolean         # true/false flag
    default: false
```

### Template Syntax (Nunjucks)

The body uses Nunjucks template syntax. This is NOT Handlebars -- do not use `{{#if}}` or `{{#each}}`.

**Variable output:**
```
{{ topic }}                      <-- Render parameter value
{{ topic | upper }}              <-- With filter (uppercase)
{{ name | default("unnamed") }} <-- With default fallback
```

**Conditionals:**
```
{% if verbose %}
Include extra detail here.
{% endif %}

{% if mode == "detailed" %}
Detailed instructions...
{% elif mode == "brief" %}
Brief instructions...
{% else %}
Standard instructions...
{% endif %}
```

**Loops:**
```
{% for tool in tools %}
- {{ tool }}
{% endfor %}

{% for item in items %}
### {{ item.name }}
{{ item.description }}
{% endfor %}
```

**Set variables:**
```
{% set parsed = schema %}
{% set greeting = "Hello " + name %}
```

**CRITICAL: Escaping literal curly braces**

If your template body contains literal `{` or `}` characters (JSON examples, code blocks, etc.), wrap them in `{% raw %}...{% endraw %}` to prevent the template engine from parsing them:

```
{% raw %}
{
  "key": "value",
  "nested": { "a": 1 }
}
{% endraw %}
```

For inline code fences containing braces:
```
{% raw %}```json{% endraw %}
{% raw %}{ "example": true }{% endraw %}
{% raw %}```{% endraw %}
```

Without `{% raw %}`, any `{` in the body triggers the template parser and causes `parseAggregate: expected colon after dict key` errors.

### Package Path Format

For `inherits:` references: `@namespace/package@version/path/to/file.prmd`

| Part | Example |
|------|---------|
| `package_name` | `@prompd/public-examples` |
| `version` | `1.1.0` |
| `file_path` | `assistants/code-assistant.prmd` |

Full: `inherits: "@prompd/public-examples@1.1.0/assistants/code-assistant.prmd"`

### Common Filters

| Filter | Example | Result |
|--------|---------|--------|
| `upper` | `{{ "hello" \| upper }}` | `HELLO` |
| `lower` | `{{ "HELLO" \| lower }}` | `hello` |
| `trim` | `{{ text \| trim }}` | Removes whitespace |
| `default` | `{{ val \| default("N/A") }}` | Fallback value |
| `join` | `{{ list \| join(", ") }}` | Array to string |
| `length` | `{{ items \| length }}` | Count items |
| `replace` | `{{ text \| replace("a", "b") }}` | String replace |
| `first` / `last` | `{{ items \| first }}` | First/last element |

### Edit Tips for AI Agents

- **ALWAYS read the file before editing** -- your search string must match the file content exactly
- **Prefer `edit_file` over `write_file`** for modifications to avoid losing content
- **When adding markdown to a frontmatter-only file**, search for the last YAML line + closing `---` and append after it
- **When adding parameters**, search for the existing `parameters:` line and extend the array
- **Preserve blank lines** -- if the file has a blank line between sections, keep it
