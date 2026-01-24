# Backend - Node.js API Server

## Overview
Complete Node.js backend for the Prompd Editor with MongoDB integration, WebSocket support, and file processing capabilities. Provides REST API endpoints for project management, package operations, and real-time compilation.

## Architecture
- **Express.js** - HTTP server and REST API
- **Socket.IO** - WebSocket server for real-time features
- **MongoDB/Mongoose** - Data persistence
- **Multer** - File upload handling
- **Child Process** - Python CLI integration

## Key Features
- Project CRUD operations with MongoDB persistence
- Package management (create, validate, install from registry)
- Real-time compilation and validation via WebSocket
- File processing (Excel, Word, PDF, images)
- Rate limiting and security middleware
- Comprehensive error handling and validation

## Folder Structure
```
backend/
├── src/
│   ├── server.js           # Main server entry point
│   ├── config/
│   │   ├── database.js     # MongoDB connection setup
│   │   └── socket.js       # Socket.IO configuration
│   ├── controllers/        # Request handlers for each endpoint
│   ├── models/            # Mongoose schemas and models
│   ├── routes/            # Express route definitions
│   ├── middleware/        # Custom middleware functions
│   ├── services/          # Business logic and external integrations
│   └── utils/             # Utility functions and helpers
├── uploads/               # Temporary file storage
└── cache/                # Python CLI output cache
```

## Environment Variables
- `PORT` - Server port (default: 3001)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `PROMPD_REGISTRY_URL` - Prompd registry URL (shared with @prompd/cli)
- `PYTHON_CLI_PATH` - Path to Python CLI executable

## API Endpoints Summary
- **Projects**: CRUD operations for user projects
- **Packages**: Registry integration and local package management
- **Compilation**: Real-time compilation and validation
- **Files**: Upload and processing of various file types
- **WebSocket**: Real-time events for compilation and validation

## Dependencies
- Express ecosystem for HTTP handling
- MongoDB/Mongoose for data persistence
- Socket.IO for real-time communication
- File processing libraries (mammoth, pdf-parse, xlsx, sharp)
- Security middleware (helmet, cors, rate-limiting)