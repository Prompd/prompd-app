# Services - Business Logic Layer

## Overview
Service classes that implement the core business logic for the Prompd Editor. These services orchestrate between controllers, models, and external systems.

## Files

### `ProjectService.js`
Project management business logic:
- **CRUD Operations**: Create, read, update, delete projects
- **File Management**: Add, remove, update files within projects
- **Collaboration**: User permissions, sharing, real-time sync
- **Validation**: Project structure, file types, size limits
- **Methods**: 
  - `createProject(userId, projectData)`
  - `updateProject(projectId, updates, userId)`
  - `addFile(projectId, fileData, userId)`
  - `shareProject(projectId, userIds, role)`

### `CompilationService.js`
Prompd compilation and processing:
- **6-Stage Pipeline**: Lexical → Dependency → Semantic → Asset → Template → CodeGen
- **Format Support**: Markdown, OpenAI JSON, Anthropic JSON
- **Progress Tracking**: Real-time compilation progress via WebSocket
- **Caching**: Intelligent compilation result caching
- **Methods**:
  - `compile(content, format, parameters)`
  - `compileWithProgress(content, format, parameters, progressCallback)`
  - `validateContent(content)`

### `PackageService.js`
Package management and registry integration:
- **Registry Operations**: Search, install, publish packages
- **Dependency Resolution**: Version conflicts, compatibility checks
- **Local Management**: Package installation, configuration
- **Cache Management**: Package metadata and content caching
- **Methods**:
  - `searchPackages(query, options)`
  - `installPackage(packageName, version, projectId)`
  - `publishPackage(packageData, userId)`

### `ValidationService.js`
Content validation and error checking:
- **Syntax Validation**: YAML frontmatter, Markdown content
- **Semantic Validation**: Parameter references, package imports
- **Dependency Validation**: Package availability, version constraints
- **Real-time Validation**: Incremental validation for live feedback
- **Methods**:
  - `validateContent(content)`
  - `validateProject(projectId)`
  - `validatePackageManifest(manifest)`

### `FileProcessingService.js`
File upload and processing:
- **Multi-format Support**: Excel, Word, PDF, PowerPoint, Images
- **Content Extraction**: Text, data, metadata extraction
- **File Validation**: Type checking, size limits, security scanning
- **Storage Management**: Temporary files, cleanup, compression
- **Methods**:
  - `processUpload(file, type)`
  - `extractContent(file, format)`
  - `validateFile(file)`

### `RegistryClientService.js`
External registry communication:
- **API Integration**: HTTP client for registry operations
- **Authentication**: Token management, refresh handling
- **Caching**: Response caching, offline support
- **Error Handling**: Retry logic, fallback mechanisms
- **Methods**:
  - `searchRegistry(query)`
  - `getPackageInfo(name, version)`
  - `publishToRegistry(packageData)`

## Service Architecture
- **Dependency Injection**: Services can be injected with dependencies
- **Error Handling**: Consistent error types and handling patterns
- **Logging**: Comprehensive logging for debugging and monitoring
- **Testing**: Each service is unit testable with mocked dependencies
- **Caching**: Intelligent caching strategies for performance

## External Integrations
- **Python CLI**: Shell execution for compilation and validation
- **Registry API**: HTTP client for package operations
- **MongoDB**: Database operations via Mongoose models
- **File System**: Temporary file management and cleanup
- **Socket.IO**: Real-time event emission for progress updates