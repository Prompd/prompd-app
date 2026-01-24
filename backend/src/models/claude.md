# Models - MongoDB Data Schemas

## Overview
Mongoose schemas and models for MongoDB data persistence. Defines the structure and validation rules for all application data.

## Files

### `Project.js`
User project data model:
- **Project Schema**: Complete project structure with files, settings, metadata
- **ProjectFile Schema**: Individual file data within projects
- **Validation**: File type validation, size limits, required fields
- **Methods**: Project operations (addFile, removeFile, updateSettings)
- **Virtuals**: Computed properties (fileCount, totalSize, lastModified)

### `Package.js`
Package metadata and cache model:
- **Package Schema**: Registry package information cache
- **PackageVersion Schema**: Version-specific data and dependencies
- **LocalPackage Schema**: User's local package installations
- **Methods**: Version management, dependency resolution
- **Indexes**: Optimized queries for package search and discovery

### `User.js`
User account and preferences:
- **User Schema**: Account information, preferences, settings
- **UserSession Schema**: Active session tracking
- **UserProject Schema**: Project ownership and permissions
- **Methods**: Authentication helpers, preference management
- **Security**: Password hashing, token generation

### `CompilationCache.js`
Compilation result caching:
- **CacheEntry Schema**: Compiled output with metadata
- **CacheKey Schema**: Content-based cache key generation
- **TTL**: Automatic cache expiration
- **Methods**: Cache invalidation, hit/miss tracking

## Validation Rules
- **File Size Limits**: 50MB max for uploads, 10MB for .prmd files
- **File Type Validation**: Allowed extensions and MIME types
- **Parameter Validation**: Type checking, required fields, constraints
- **Security**: Input sanitization, XSS prevention

## Indexes
- **Project Queries**: User ID, creation date, name
- **Package Search**: Name, keywords, author, download count
- **Cache Lookup**: Content hash, compilation parameters
- **User Operations**: Email, username, session tokens