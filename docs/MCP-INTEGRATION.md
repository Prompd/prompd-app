# MCP Integration Reference

## Overview

Prompd integrates with the Model Context Protocol (MCP) ecosystem via a client in the Electron main process. Users can discover, configure, and connect to MCP servers through the workflow canvas, then use their tools in workflow execution.

## Architecture

```
SearchStep (registry search) → ConfigureStep (env/headers) → TestStep (validate connection)
  → ConnectionStorage (connections.json) + McpConfig (~/.prompd/mcp-config.json)
    → useMcpTools hook → McpToolNodeProperties (tool dropdown + schema params)
      → Workflow executor → mcpService.callTool()
```

**Key files:**
- `frontend/electron/services/mcpService.js` — MCP client, connection pool, config, registry search
- `frontend/electron/ipc/McpIpcRegistration.js` — IPC handlers for `mcp:*` channels
- `frontend/src/modules/components/workflow/panels/McpServerSetupFlow.tsx` — Registry search + setup wizard
- `frontend/src/modules/components/workflow/nodes/McpToolNodeProperties.tsx` — Tool selection + schema-driven params
- `frontend/src/modules/hooks/useMcpTools.ts` — Tool discovery hook
- `frontend/src/electron.d.ts` — TypeScript types (`McpServerConfig`, `McpRegistryServer`, `McpToolDefinition`)

## Registries

### Official MCP Registry (integrated)

- **URL:** `https://registry.modelcontextprotocol.io/v0.1/servers`
- **Auth:** None required
- **Params:** `search`, `limit`, `cursor`, `offset`, `updated_since`, `isLatest`
- **No transport filter** — filtering by stdio vs http is done client-side
- **Response format:** Each server has `packages` (stdio/npx) and/or `remotes` (streamable-http endpoints)

### Smithery Registry (not yet integrated)

- **URL:** `GET https://registry.smithery.ai/servers`
- **Auth:** `Bearer <api_key>` — free key from [smithery.ai/account/api-keys](https://smithery.ai/account/api-keys)
- **Params:** `q` (semantic search, supports `owner:`, `is:verified`, `is:deployed`), `page`, `pageSize`
- **Response:**
  ```json
  {
    "servers": [{ "qualifiedName", "displayName", "description", "verified", "useCount", "remote" }],
    "pagination": { "currentPage", "pageSize", "totalPages", "totalCount" }
  }
  ```
- **7,300+ servers** indexed
- Could be added as a second search source if user provides API key

### Other Directories (browse-only, no API)

| Directory | URL | Notes |
|-----------|-----|-------|
| mcp.so | https://mcp.so/ | Community-driven, good for browsing |
| MCP Playground Online | https://mcpplaygroundonline.com/mcp-registry | 1000+ servers, in-browser testing |
| PulseMCP | https://www.pulsemcp.com/servers | 8,000+ servers, search/filter UI |
| mcpservers.org | https://mcpservers.org/ | Curated "awesome" list |
| npm / PyPI | Search `mcp-server` or `@modelcontextprotocol/server-*` | Package registries directly |

## Official First-Party MCP Servers

Servers maintained by the actual service companies (not community forks):

| Service | Official? | Type | Package / Endpoint |
|---------|-----------|------|--------------------|
| GitHub | Yes | stdio | `@github/mcp-server` |
| GitLab | Yes | stdio (OAuth 2.0) | Official GitLab package |
| Atlassian (Jira + Confluence) | Yes | Remote (hosted) | [Atlassian Remote MCP](https://www.atlassian.com/blog/announcements/remote-mcp-server) |
| Filesystem | Yes (reference) | stdio | `@modelcontextprotocol/server-filesystem` |
| Git | Yes (reference) | stdio | `@modelcontextprotocol/server-git` |
| Memory | Yes (reference) | stdio | `@modelcontextprotocol/server-memory` |
| Fetch | Yes (reference) | stdio | `@modelcontextprotocol/server-fetch` |

### No First-Party Server Yet

These popular services only have **community-built** MCP servers:

| Service | Community Options | Notes |
|---------|-------------------|-------|
| Gmail | Multiple on registry | No official Google MCP server |
| Outlook | Community packages | No official Microsoft MCP server |
| Slack | Zencoder fork | Was in reference repo, now archived |
| Google Drive | Community forks | Was in reference repo, now archived |
| Google Calendar | Workato pre-built | Third-party integration platform |

## Transport Types

### Stdio (Local)
- Server runs as a child process on the user's machine
- Started via `npx`, `docker run`, `uvx`, etc.
- No MCP-level auth needed (may need API keys for underlying services)
- Config: `command`, `args`, `env`

### Streamable HTTP (Remote/Hosted)
- Server is a remote endpoint (URL)
- Most require auth headers (bearer token, API key)
- Some are genuinely free (no auth declared in registry)
- Smithery-proxied servers always require a Smithery API key
- Config: `serverUrl`, `headers`

### Auth Patterns for Remote Servers

1. **Registry-declared auth** — `remotes[].headers` array with template values like `"Bearer {smithery_api_key}"`. Template vars are extracted as env inputs in the setup flow, resolved at config build time.
2. **Undeclared auth** — Server requires auth but registry metadata doesn't declare it (e.g., Waystation, MintMCP). Users add headers manually via the custom headers UI.
3. **No auth** — Server is genuinely open (e.g., some Exa, Explorium, community servers).

## Config Storage

### `~/.prompd/mcp-config.json`

Stores MCP server configs with encrypted sensitive values (env vars and headers encrypted via `safeStorage`):

```json
{
  "mcpServers": {
    "my-server": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": { "WORKSPACE_ROOT": "enc:v1:..." }
    },
    "smithery-brave": {
      "transport": "streamable-http",
      "serverUrl": "https://server.smithery.ai/...",
      "headers": { "Authorization": "enc:v1:..." }
    }
  }
}
```

### `connections.json` (workflow store)

Workflow connections reference MCP servers by `serverName` which maps to the key in `mcp-config.json`. The `env` field for `mcp-server` type connections is also encrypted via `connectionStorage.js`.

## Future: Multi-Registry Support

Potential architecture for supporting multiple registry sources:

```json
// In ~/.prompd/mcp-config.json
{
  "registries": [
    { "name": "Official MCP", "url": "https://registry.modelcontextprotocol.io/v0.1/servers", "enabled": true },
    { "name": "Smithery", "url": "https://registry.smithery.ai/servers", "apiKey": "enc:v1:...", "enabled": false }
  ],
  "mcpServers": { ... }
}
```

Search step would query all enabled registries in parallel, merge results, and tag each result with its source registry.
