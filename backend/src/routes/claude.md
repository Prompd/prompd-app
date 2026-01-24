# Routes - API Endpoint Definitions

## Overview
Express.js route handlers that define the HTTP API endpoints for the Prompd Editor. Each route file handles a specific domain of functionality.

## Files

### `projects.js`
Project management endpoints:
- **GET /api/projects** - List user's projects with filtering and pagination
- **POST /api/projects** - Create new project
- **GET /api/projects/:id** - Get specific project with files and metadata
- **PUT /api/projects/:id** - Update project settings and metadata
- **DELETE /api/projects/:id** - Delete project (owner only)
- **POST /api/projects/:id/files** - Add file to project
- **PUT /api/projects/:id/files/:path** - Update file content
- **DELETE /api/projects/:id/files/:path** - Remove file from project
- **POST /api/projects/:id/share** - Share project with collaborators
- **DELETE /api/projects/:id/collaborators/:userId** - Remove collaborator

### `packages.js`
Package management endpoints:
- **GET /api/packages/search** - Search packages in registry
- **GET /api/packages/:name** - Get package information
- **GET /api/packages/:name/versions** - List package versions
- **POST /api/packages/install** - Install package to project
- **DELETE /api/packages/uninstall** - Remove package from project
- **POST /api/packages/validate** - Validate package manifest
- **GET /api/packages/local** - List locally installed packages

### `compilation.js`
Compilation and validation endpoints:
- **POST /api/compilation/compile** - Compile Prompd content
- **POST /api/compilation/validate** - Validate content
- **GET /api/compilation/cache** - Get compilation cache statistics
- **DELETE /api/compilation/cache** - Clear compilation cache
- **POST /api/compilation/preview** - Real-time preview compilation

### `files.js`
File upload and processing endpoints:
- **POST /api/files/upload** - Upload and process files (Excel, Word, PDF, etc.)
- **GET /api/files/:id** - Download processed file
- **POST /api/files/extract** - Extract content from binary files
- **DELETE /api/files/:id** - Delete uploaded file
- **GET /api/files/types** - List supported file types

### `registry.js`
Registry proxy and caching endpoints:
- **GET /api/registry/search** - Proxy search to external registry
- **GET /api/registry/package/:name** - Get package info with caching
- **GET /api/registry/health** - Check registry connectivity
- **POST /api/registry/cache/clear** - Clear registry cache
- **GET /api/registry/popular** - Get popular packages with caching

## Route Architecture
- **Authentication**: JWT middleware for protected endpoints
- **Validation**: Joi schema validation for request bodies
- **Error Handling**: Consistent error response format
- **Rate Limiting**: Per-endpoint rate limiting configuration
- **Caching**: Response caching for registry and static data
- **Logging**: Request/response logging with sanitization

## Request/Response Format
- **Content-Type**: `application/json` for all endpoints
- **Authentication**: `Bearer <token>` in Authorization header
- **Error Format**: `{ success: false, error: string, code?: string }`
- **Success Format**: `{ success: true, data: any, meta?: object }`

## Middleware Chain
1. **Rate Limiting** - Per IP and per user limits
2. **Authentication** - JWT token validation
3. **Request Validation** - Joi schema validation
4. **Authorization** - Permission checks
5. **Route Handler** - Business logic execution
6. **Response Formatting** - Consistent response structure
7. **Error Handling** - Global error processing