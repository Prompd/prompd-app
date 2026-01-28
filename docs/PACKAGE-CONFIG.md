# Package Configuration: prompd.json

This document explains the canonical package configuration file naming decision for Prompd projects.

## Summary

**Canonical config file: `prompd.json`**

Prompd uses `prompd.json` as the primary package configuration file, similar to how other ecosystems use uniquely-named config files (`package.json` for npm, `Cargo.toml` for Rust, `deno.json` for Deno).

## Rationale

### The Collision Problem

When choosing a configuration filename, we considered the overlap with existing ecosystems:

| Filename | Used By | Collision Risk |
|----------|---------|----------------|
| `package.json` | npm, Node.js, Yarn, pnpm | High - Most JS projects have this |
| `manifest.json` | Chrome Extensions, Unity, PWAs, Android | High - Common in web/app projects |
| `config.json` | Various tools | High - Generic name |
| `prompd.json` | Prompd only | None - Unique to our ecosystem |

### Why Not `manifest.json`?

Initially, `manifest.json` seemed like a good choice to avoid npm's `package.json`. However:

1. **Chrome Extensions**: Every browser extension uses `manifest.json`
2. **Progressive Web Apps (PWAs)**: Web app manifests use this name
3. **Unity**: Game projects use manifest.json for package management
4. **Android**: Native app manifests

A Prompd project that is also a Chrome extension or PWA would have filename conflicts.

### Why Not `package.json`?

While `package.json` is semantically appropriate for "packages", it has critical issues:

1. **npm Collision**: Most JavaScript projects already have one
2. **Tooling Confusion**: npm, yarn, pnpm would try to parse it
3. **CI/CD Issues**: Build systems assume npm semantics
4. **Dual-purpose Projects**: Many Prompd projects are also npm packages

### Why `prompd.json`?

Following the pattern of other modern tools:

| Tool | Config File | Pattern |
|------|-------------|---------|
| npm | `package.json` | Generic but first-mover |
| Deno | `deno.json` | Tool-specific naming |
| Bun | `bun.lockb` | Tool-specific naming |
| ESLint | `eslint.config.js` | Tool-prefixed |
| TypeScript | `tsconfig.json` | Tool-prefixed |
| Prompd | `prompd.json` | Tool-specific naming |

Benefits of `prompd.json`:
- **Zero collisions**: No other tool uses this filename
- **Clear ownership**: Immediately identifies as Prompd config
- **Future-proof**: Won't conflict with new tools
- **Discoverable**: Easy to search for in codebases

## File Structure

```json
{
  "name": "@namespace/package-name",
  "version": "1.0.0",
  "description": "A composable AI prompt package",
  "author": "Your Name <email@example.com>",
  "license": "MIT",
  "keywords": ["ai", "prompt", "llm"],
  "repository": {
    "type": "git",
    "url": "https://github.com/user/repo"
  },
  "main": "prompts/main.prmd",
  "files": [
    "prompts/**/*.prmd",
    "templates/**/*"
  ],
  "dependencies": {
    "@prompd.io/core-patterns": "^2.0.0"
  },
  "prompd": {
    "minCliVersion": "0.4.0",
    "registries": ["https://registry.prompdhub.ai"]
  }
}
```

## Lookup Order

When searching for project metadata (e.g., description), the editor uses this priority:

1. **`prompd.json`** - Canonical package config (preferred)
2. **`*.pdproj`** - IDE project state files
3. **`package.json`** - Fallback for npm projects with prompts

## Related Files

| File | Purpose |
|------|---------|
| `prompd.json` | Package configuration and metadata |
| `*.pdproj` | IDE project state (editor settings, open files) |
| `*.prmd` | Individual prompt files |
| `*.pdflow` | Workflow definitions |
| `*.pdpkg` | Distribution packages (ZIP archives) |

## Migration

If you have existing projects using `manifest.json`:

1. Rename `manifest.json` to `prompd.json`
2. Update any scripts or tools referencing the old filename
3. The schema remains unchanged

## Implementation Notes

- The Prompd CLI, IDE, and web editor all recognize `prompd.json`
- Package validation checks for `prompd.json` in `.pdpkg` archives
- Registry publishing extracts metadata from `prompd.json`

## See Also

- [Package Format Specification](../../prompd-docs/docs/PACKAGE.md)
- [CLI Documentation](../../prompd-docs/docs/CLI.md)
- [Editor Documentation](./editor.md)
