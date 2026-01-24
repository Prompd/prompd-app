import { CompilationService } from '../services/CompilationService.js'
import { ValidationService } from '../services/ValidationService.js'
import { ProjectService } from '../services/ProjectService.js'
import { agentService } from '../services/AgentService.js'

export function setupSocketHandlers(io) {
  const compilationService = new CompilationService()
  const validationService = new ValidationService()
  const projectService = new ProjectService()

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`)

    // Project collaboration
    socket.on('project:join', async (projectId) => {
      try {
        await socket.join(`project:${projectId}`)
        socket.emit('project:joined', { projectId, socketId: socket.id })
        
        // Notify other users in the project
        socket.to(`project:${projectId}`).emit('user:joined', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        socket.emit('error', { message: 'Failed to join project', error: error.message })
      }
    })

    socket.on('project:leave', async (projectId) => {
      try {
        await socket.leave(`project:${projectId}`)
        socket.to(`project:${projectId}`).emit('user:left', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('Error leaving project:', error)
      }
    })

    // Real-time compilation
    socket.on('compilation:start', async (data) => {
      try {
        const { content, projectId, format = 'markdown', parameters = {} } = data
        
        socket.emit('compilation:progress', { stage: 'starting', progress: 0 })
        
        // Notify project members
        if (projectId) {
          socket.to(`project:${projectId}`).emit('compilation:started', {
            socketId: socket.id,
            timestamp: new Date().toISOString()
          })
        }

        const result = await compilationService.compileWithProgress(
          content,
          format,
          parameters,
          (progress) => {
            socket.emit('compilation:progress', progress)
          }
        )

        socket.emit('compilation:complete', {
          success: true,
          result,
          timestamp: new Date().toISOString()
        })

        if (projectId) {
          socket.to(`project:${projectId}`).emit('compilation:finished', {
            socketId: socket.id,
            success: true,
            timestamp: new Date().toISOString()
          })
        }

      } catch (error) {
        console.error('Compilation error:', error)
        socket.emit('compilation:complete', {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        })

        if (data.projectId) {
          socket.to(`project:${data.projectId}`).emit('compilation:finished', {
            socketId: socket.id,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          })
        }
      }
    })

    // Real-time validation
    socket.on('validation:start', async (data) => {
      try {
        const { content, projectId } = data
        
        const result = await validationService.validateContent(content)
        
        socket.emit('validation:complete', {
          success: true,
          result,
          timestamp: new Date().toISOString()
        })

        if (projectId) {
          socket.to(`project:${projectId}`).emit('validation:update', {
            socketId: socket.id,
            result,
            timestamp: new Date().toISOString()
          })
        }

      } catch (error) {
        console.error('Validation error:', error)
        socket.emit('validation:complete', {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // File change notifications for collaboration
    socket.on('file:change', (data) => {
      const { projectId, fileName, changeType, content } = data
      
      if (projectId) {
        socket.to(`project:${projectId}`).emit('file:changed', {
          fileName,
          changeType,
          content,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Live cursor positions for collaboration
    socket.on('cursor:update', (data) => {
      const { projectId, fileName, position, selection } = data
      
      if (projectId) {
        socket.to(`project:${projectId}`).emit('cursor:position', {
          fileName,
          position,
          selection,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Execution operations
    socket.on('execute', async (data) => {
      try {
        const { prompt, provider = 'openai', model = 'gpt-4o', parameters = {}, projectId } = data
        
        socket.emit('execution:progress', { stage: 'starting', progress: 0 })
        
        // Notify project members
        if (projectId) {
          socket.to(`project:${projectId}`).emit('execution:started', {
            socketId: socket.id,
            provider,
            model,
            timestamp: new Date().toISOString()
          })
        }

        const result = await compilationService.execute(
          prompt,
          provider,
          model,
          parameters
        )

        socket.emit('execution:complete', {
          success: result.success,
          response: result.response,
          usage: result.usage,
          metadata: result.metadata,
          timestamp: new Date().toISOString()
        })

        if (projectId) {
          socket.to(`project:${projectId}`).emit('execution:finished', {
            socketId: socket.id,
            success: result.success,
            provider,
            model,
            timestamp: new Date().toISOString()
          })
        }

      } catch (error) {
        console.error('Execution error:', error)
        socket.emit('execution:error', {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        })

        if (data.projectId) {
          socket.to(`project:${data.projectId}`).emit('execution:finished', {
            socketId: socket.id,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          })
        }
      }
    })

    // Package operations
    socket.on('package:install', async (data) => {
      try {
        const { packageName, version, projectId } = data
        
        socket.emit('package:progress', { stage: 'downloading', progress: 25 })
        
        // Installation logic would go here
        await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate installation
        
        socket.emit('package:progress', { stage: 'installing', progress: 75 })
        
        await new Promise(resolve => setTimeout(resolve, 500))
        
        socket.emit('package:installed', {
          packageName,
          version,
          success: true,
          timestamp: new Date().toISOString()
        })

        if (projectId) {
          socket.to(`project:${projectId}`).emit('package:updated', {
            packageName,
            version,
            action: 'installed',
            socketId: socket.id,
            timestamp: new Date().toISOString()
          })
        }

      } catch (error) {
        socket.emit('package:installed', {
          packageName: data.packageName,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Agent mode operations
    // Architecture: Backend only handles LLM calls, frontend executes tools locally
    socket.on('agent:chat', async (data) => {
      try {
        const { userId, sessionId, provider, model, messages, maxTokens, temperature } = data

        console.log(`[Agent] Chat request - session: ${sessionId}, provider: ${provider}`)

        // Call LLM via AgentService
        const result = await agentService.chat(userId, sessionId, {
          provider,
          model,
          messages,
          maxTokens,
          temperature
        })

        // Send response back to frontend
        // Frontend will handle tool execution locally
        socket.emit('agent:response', {
          sessionId,
          ...result
        })

      } catch (error) {
        console.error('[Agent] Chat error:', error)
        socket.emit('agent:error', {
          sessionId: data.sessionId,
          error: error.message
        })
      }
    })

    socket.on('agent:stop', (data) => {
      const { sessionId } = data
      console.log(`[Agent] Stop requested for session ${sessionId}`)
      agentService.stopSession(sessionId)
      socket.emit('agent:stopped', { sessionId })
    })

    // Heartbeat to keep connection alive
    socket.on('ping', () => {
      socket.emit('pong')
    })

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`)
      
      // Notify all rooms this user was in
      const rooms = Array.from(socket.rooms)
      rooms.forEach(room => {
        if (room.startsWith('project:')) {
          socket.to(room).emit('user:disconnected', {
            socketId: socket.id,
            timestamp: new Date().toISOString()
          })
        }
      })
    })

    // Error handling
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error)
    })
  })

  // Global error handling
  io.on('error', (error) => {
    console.error('Socket.IO server error:', error)
  })

  console.log('Socket.IO handlers configured')
}