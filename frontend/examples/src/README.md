# @prompd/public-examples

Public example prompts demonstrating Prompd's core features and patterns. This package showcases inheritance, composition, templating, and package-based references.

## Installation

```bash
# Install the package
prompd install @prompd/public-examples

# Or run directly without installation
prompd run "@prompd/public-examples@latest/prompts/api-development.prmd"
```

## Package Contents

### 1. api-development.prmd (Main Entry Point)

**Purpose:** Generate comprehensive API development documentation and implementation plans.

**Features Demonstrated:**
- Complex conditional logic with Jinja2 templates
- Multiple parameter types (string, boolean, object)
- Framework-specific code generation
- Authentication strategy selection
- Validation level customization

**Usage:**
```bash
# Run with all features
prompd run "@prompd/public-examples@1.0.4/prompts/api-development.prmd" \
  --provider openai \
  --model gpt-4o \
  -p endpoint_name="user authentication" \
  -p framework="express" \
  -p http_method="POST" \
  -p include_auth=true \
  -p validation_level="strict"

# Run as main file (no path needed)
prompd run "@prompd/public-examples@latest" \
  --provider anthropic \
  -p endpoint_name="payment processing"
```

**Parameters:**
- `endpoint_name` (string, required) - Name of the API endpoint
- `http_method` (string) - HTTP method (GET, POST, PUT, DELETE)
- `framework` (string) - Backend framework (express, fastapi, spring)
- `include_auth` (boolean) - Include authentication
- `validation_level` (string) - comprehensive, standard, or basic

---

### 2. base-prompt.prmd

**Purpose:** Foundational template demonstrating clean prompt structure.

**Features Demonstrated:**
- Basic YAML frontmatter configuration
- Simple parameter substitution with `{variable}` syntax
- Well-structured sections (System, Context, User)
- Clean, reusable template pattern

**Usage:**
```bash
prompd run "@prompd/public-examples@1.0.4/prompts/base-prompt.prmd" \
  --provider openai \
  -p topic="machine learning" \
  -p context="building a recommendation system"
```

**Parameters:**
- `topic` (string, required) - Main topic to analyze
- `context` (string) - Additional background information

---

### 3. basic-inheritance.prmd

**Purpose:** Demonstrates local file inheritance and conditional logic.

**Features Demonstrated:**
- Template inheritance with `inherits: "./base-prompt.prmd"`
- Jinja2 conditionals (`{% if %}`, `{% elif %}`, `{% else %}`)
- Parameter-driven content generation
- Extending base templates

**Usage:**
```bash
prompd run "@prompd/public-examples@1.0.4/prompts/basic-inheritance.prmd" \
  --provider anthropic \
  --model claude-3-5-sonnet-20241022 \
  -p topic="blockchain technology" \
  -p analysis_depth="comprehensive"
```

**Parameters:**
- `topic` (string, required) - Inherited from base-prompt.prmd
- `context` (string) - Inherited from base-prompt.prmd
- `analysis_depth` (string) - comprehensive, detailed, or overview

**Inheritance Chain:**
```
basic-inheritance.prmd → base-prompt.prmd
```

---

### 4. package-inheritance.prmd

**Purpose:** Demonstrates cross-package inheritance and composition.

**Features Demonstrated:**
- Package-based inheritance: `inherits: "@prompd/public-examples@1.0.4/prompts/base-prompt.prmd"`
- Versioned dependency resolution
- Jinja2 loops (`{% for %}`, `{% endfor %}`)
- Array parameter handling
- Cross-version composition

**Usage:**
```bash
# Simple usage
prompd run "@prompd/public-examples@1.0.4/prompts/package-inheritance.prmd" \
  --provider openai \
  -p topic="software architecture"

# With custom stakeholders
prompd run "@prompd/public-examples@1.0.4/prompts/package-inheritance.prmd" \
  --provider anthropic \
  -p topic="cloud migration" \
  -f params.json
```

**params.json example:**
```json
{
  "topic": "microservices architecture",
  "context": "enterprise e-commerce platform",
  "stakeholders": [
    "development team",
    "DevOps engineers",
    "product managers",
    "security team"
  ]
}
```

**Parameters:**
- `topic` (string, required) - Inherited from @prompd/public-examples@1.0.4
- `context` (string) - Inherited from base package
- `stakeholders` (array) - List of stakeholder perspectives to analyze

**Inheritance Chain:**
```
package-inheritance.prmd (v1.0.5) → @prompd/public-examples@1.0.4/base-prompt.prmd
```

**Why This Matters:**
This example demonstrates a real-world use case where prompts can evolve across versions while maintaining backward compatibility through package dependencies.

---

### 5. code-assistant.prmd

**Purpose:** General-purpose coding assistant for various development tasks.

**Features Demonstrated:**
- Multi-language support (TypeScript, Python, Go, JavaScript, Java, Rust)
- Task mode selection (implement, debug, refactor, explain, optimize)
- Context file usage (TypeScript examples, code review checklist)
- Language-specific best practices
- Optional test generation

**Usage:**
```bash
# Implementation mode with TypeScript
prompd run "@prompd/public-examples@latest/assistants/code-assistant.prmd" \
  --provider anthropic \
  -p language="typescript" \
  -p task_mode="implement" \
  -p include_tests=true

# Debug mode with Python
prompd run "@prompd/public-examples@latest/assistants/code-assistant.prmd" \
  --provider openai \
  -p language="python" \
  -p task_mode="debug" \
  -p include_tests=false
```

**Parameters:**
- `language` (string) - Programming language (typescript, python, go, javascript, java, rust)
- `task_mode` (string) - Task type (implement, debug, refactor, explain, optimize)
- `include_tests` (boolean) - Include test cases with code

**Contexts:**
- `contexts/typescript-examples.ts` - Sample TypeScript class structures
- `contexts/code-review-checklist.md` - Comprehensive code review checklist

---

### 6. system-admin.prmd

**Purpose:** System administrator assistant for DevOps and infrastructure tasks.

**Features Demonstrated:**
- Environment-aware operations (development, staging, production)
- Task-specific guidance (deployment, monitoring, troubleshooting, security, backup)
- Context-driven configuration (deployment configs, monitoring alerts)
- Safety-first approach with rollback strategies
- Production change control procedures

**Usage:**
```bash
# Production deployment
prompd run "@prompd/public-examples@latest/systems/system-admin.prmd" \
  --provider anthropic \
  -p task_type="deployment" \
  -p environment="production" \
  -p include_rollback=true

# Development troubleshooting
prompd run "@prompd/public-examples@latest/systems/system-admin.prmd" \
  --provider openai \
  -p task_type="troubleshooting" \
  -p environment="development" \
  -p include_rollback=false
```

**Parameters:**
- `task_type` (string) - Type of task (deployment, monitoring, troubleshooting, security, backup)
- `environment` (string) - Target environment (development, staging, production)
- `include_rollback` (boolean) - Include rollback procedures

**Contexts:**
- `contexts/deployment-config.yaml` - Deployment strategies, monitoring alerts, backup policies

---

### 7. user-lead-engineer.prmd

**Purpose:** Lead engineer assistant for technical leadership and architecture decisions.

**Features Demonstrated:**
- Focus area specialization (architecture, code review, team mentoring, technical planning, incident response)
- Team size considerations (small, medium, large)
- Context-driven architecture patterns with tradeoffs
- Technology decision framework
- Leadership and communication guidance

**Usage:**
```bash
# Architecture guidance for medium team
prompd run "@prompd/public-examples@latest/users/user-lead-engineer.prmd" \
  --provider anthropic \
  -p focus_area="architecture" \
  -p team_size="medium" \
  -p include_tradeoffs=true

# Code review for large team
prompd run "@prompd/public-examples@latest/users/user-lead-engineer.prmd" \
  --provider openai \
  -p focus_area="code_review" \
  -p team_size="large" \
  -p include_tradeoffs=false
```

**Parameters:**
- `focus_area` (string) - Primary focus (architecture, code_review, team_mentoring, technical_planning, incident_response)
- `team_size` (string) - Team context (small, medium, large)
- `include_tradeoffs` (boolean) - Include technology tradeoff analysis

**Contexts:**
- `contexts/architecture-patterns.json` - Microservices, monolith, event-driven, serverless patterns with pros/cons

---

## Feature Showcase

### 1. Parameter Types
All primitive and complex types are supported:
- **string**: `{topic}`, `{endpoint_name}`
- **boolean**: `{include_auth}` → `{% if include_auth %}`
- **array**: `{stakeholders}` → `{% for stakeholder in stakeholders %}`
- **object**: `{request_body}` → `{request_body.field_name}`

### 2. Jinja2 Templating
Full Jinja2 support for dynamic content:

```jinja2
{%- if analysis_depth == "comprehensive" %}
  Provide exhaustive analysis with examples.
{%- elif analysis_depth == "detailed" %}
  Provide thorough explanation.
{%- else %}
  Provide high-level overview.
{%- endif %}
```

### 3. Inheritance Patterns

**Local Inheritance:**
```yaml
inherits: "./base-prompt.prmd"
```

**Package Inheritance:**
```yaml
inherits: "@prompd/public-examples@1.0.4/prompts/base-prompt.prmd"
```

### 4. Framework Detection
Automatic framework-specific code generation:

```jinja2
{%- if framework == "express" %}
  Node.js/Express implementation
{%- elif framework == "fastapi" %}
  Python/FastAPI implementation
{%- elif framework == "spring" %}
  Java/Spring Boot implementation
{%- endif %}
```

### 5. Context Files
External files that provide additional data and examples:

```yaml
context:
  - "contexts/typescript-examples.ts"
  - "contexts/code-review-checklist.md"
  - "contexts/deployment-config.yaml"
  - "contexts/architecture-patterns.json"
```

Context files are extracted and injected during compilation, supporting:
- **Code files** (TypeScript, Python, Go, etc.) - Sample implementations and type definitions
- **Markdown** - Documentation, checklists, guidelines
- **YAML/JSON** - Configuration data, structured information
- **Binary files** - Images, PDFs, spreadsheets (auto-extracted during compilation)

---

## Advanced Usage

### Compilation to Markdown
```bash
prompd compile "@prompd/public-examples@1.0.4/prompts/api-development.prmd" \
  --to-markdown \
  -p endpoint_name="user login" \
  -o output.md
```

### Compilation to Provider JSON
```bash
# OpenAI format
prompd compile "@prompd/public-examples@1.0.4/prompts/basic-inheritance.prmd" \
  --to-provider-json openai \
  -p topic="distributed systems"

# Anthropic format
prompd compile "@prompd/public-examples@1.0.4/prompts/package-inheritance.prmd" \
  --to-provider-json anthropic \
  -p topic="database design"
```

### Validation
```bash
# Validate individual file
prompd validate "@prompd/public-examples@1.0.4/prompts/api-development.prmd"

# Verbose validation
prompd validate "@prompd/public-examples@1.0.4/prompts/package-inheritance.prmd" -v
```

---

## Dependencies

This package demonstrates self-referential dependencies for educational purposes:

```json
{
  "dependencies": {
    "@prompd/public-examples": "1.0.4"
  }
}
```

**Why?** The `package-inheritance.prmd` file inherits from version 1.0.4 to demonstrate:
- Cross-version composition
- Dependency resolution
- Package-based inheritance patterns
- Version migration strategies

---

## File Structure

```
@prompd/public-examples/
├── manifest.json                        # Package metadata
├── README.md                            # This file
├── prompts/                             # Core prompt examples
│   ├── api-development.prmd            # Main: API documentation generator
│   ├── base-prompt.prmd                # Base template for inheritance
│   ├── basic-inheritance.prmd          # Local inheritance example
│   └── package-inheritance.prmd        # Cross-package inheritance
├── assistants/                          # Assistant role prompts
│   └── code-assistant.prmd             # General-purpose coding assistant
├── systems/                             # System role prompts
│   └── system-admin.prmd               # System administrator assistant
├── users/                               # User role prompts
│   └── user-lead-engineer.prmd         # Lead engineer assistant
└── contexts/                            # Context files for prompts
    ├── typescript-examples.ts          # TypeScript class examples
    ├── code-review-checklist.md        # Code review checklist
    ├── deployment-config.yaml          # Deployment configurations
    └── architecture-patterns.json      # Architecture patterns with tradeoffs
```

---

## Learn More

- [Prompd Documentation](https://github.com/Prompd/prompd-cli)
- [Format Specification](https://github.com/Prompd/prompd-cli/blob/main/docs/FORMAT.md)
- [Inheritance Guide](https://github.com/Prompd/prompd-cli/blob/main/docs/INHERITANCE.md)
- [CLI Reference](https://github.com/Prompd/prompd-cli/blob/main/docs/CLI.md)

---

## Contributing

Found an issue or want to improve these examples? Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Author

Created by the Prompd team as reference examples for the community.

**Package Registry:** [https://registry.prompdhub.ai](https://registry.prompdhub.ai)