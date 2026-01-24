# Config - System Configuration

## Overview
Configuration modules for database connections, Socket.IO setup, and environment management.

## Files

### `database.js`
MongoDB connection management using Mongoose:
- **connectDB()** - Establishes MongoDB connection with retry logic
- **disconnectDB()** - Gracefully closes database connections
- Connection pooling and error handling
- Environment-specific configuration

### `socket.js` 
Socket.IO server configuration and event handlers:
- **setupSocketHandlers(io)** - Configures all socket event listeners
- Real-time compilation events
- Project collaboration features
- Connection management and error handling
- Room-based organization for projects

## Key Features
- **Database Resilience**: Automatic reconnection with exponential backoff
- **Real-time Events**: Comprehensive WebSocket event handling
- **Environment Config**: Development vs production optimizations
- **Error Recovery**: Graceful handling of connection failures

## Socket Events
- `project:join` - Join project room for collaboration
- `compilation:start` - Begin real-time compilation
- `compilation:progress` - Compilation progress updates
- `compilation:complete` - Compilation finished with results
- `validation:update` - Real-time validation feedback
- `file:change` - File modification notifications