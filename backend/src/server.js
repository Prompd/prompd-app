import dotenv from 'dotenv'
// Load environment variables FIRST
dotenv.config()

// Node 24+ c-ares DNS resolver can't resolve SRV records through
// ISP DNS-over-HTTPS proxies (e.g., Cox doh). Use public DNS as fallback.
import dns from 'dns'
try {
  const resolver = new dns.Resolver()
  resolver.setServers(['8.8.8.8', '1.1.1.1'])
  resolver.resolveSrv('_mongodb._tcp.test.mongodb.net', () => {})
  // If the default resolver fails SRV lookups, this ensures MongoDB SRV works
  dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()])
} catch {
  // Ignore — default DNS is fine
}

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { connectDB } from './config/database.js'
import { setupSocketHandlers } from './config/socket.js'
import projectRoutes from './routes/projects.js'
import packageRoutes from './routes/packages.js'
import compilationRoutes from './routes/compilation.js'
import fileRoutes from './routes/files.js'
import registryRoutes from './routes/registry.js'
import providerRoutes from './routes/providers.js'
import llmProvidersRoutes from './routes/llmProviders.js'
import aiRoutes from './routes/ai.js'
import conversationalAiRoutes from './routes/conversational-ai.js'
import chatRoutes from './routes/chat.js'
import chatModesRoutes from './routes/chatModes.js'
import pricingRoutes from './routes/pricing.js'
import authRoutes from './routes/auth.js'
import usageRoutes from './routes/usage.js'
import startupRoutes from './routes/startup.js'
import errorReportRoutes from './routes/errors.js'
import webhookRoutes from './routes/webhooks.js'
import webhookProxyRoutes from './routes/webhookProxy.js'
import { errorHandler } from './middleware/errorHandler.js'
import { pricingService } from './services/PricingService.js'
import { requestLogger } from './middleware/logger.js'

// Debug environment variables
console.log('Environment variables loaded:')
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('MONGODB_URI:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + '...' : 'NOT SET')

const app = express()

// Trust proxy for Cloud Run (behind Google's load balancer)
// This is required for rate limiting to work correctly with X-Forwarded-For headers
app.set('trust proxy', 1)

const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "http://127.0.0.1:5173"
    ],
    credentials: true
  }
})

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
})

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}))
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://127.0.0.1:5173"
  ],
  credentials: true
}))
app.use(compression())
app.use(limiter)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(requestLogger)

// Routes
app.use('/api/projects', projectRoutes)
app.use('/api/packages', packageRoutes)
app.use('/api/compilation', compilationRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/registry', registryRoutes)
app.use('/api/v1/providers', providerRoutes)
app.use('/api/llm-providers', llmProvidersRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/conversational-ai', conversationalAiRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api', chatModesRoutes)
app.use('/api/pricing', pricingRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/usage', usageRoutes)
app.use('/api/startup', startupRoutes)
app.use('/api/errors', errorReportRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/webhook-proxy', webhookProxyRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  })
})

// Error handling
app.use(errorHandler)

// Socket.IO setup
setupSocketHandlers(io)

// Database connection and server startup
const PORT = process.env.PORT || 3010

async function startServer() {
  try {
    await connectDB()
    console.log('[ok] Connected to MongoDB')

    // Initialize pricing service and seed data if needed
    await pricingService.initialize()
    console.log('[ok] Pricing service initialized')

    // Sync pricing with provider APIs (adds new models, deprecates removed ones)
    try {
      const reseedResult = await pricingService.reseedPricing()
      console.log(`[ok] Pricing synced: ${reseedResult.totalAdded} added, ${reseedResult.totalExpired} deprecated, ${reseedResult.totalUnchanged} unchanged`)
      if (reseedResult.errors.length > 0) {
        console.warn('[warn] Pricing sync errors:', reseedResult.errors)
      }
    } catch (reseedError) {
      console.warn('[warn] Failed to sync pricing data:', reseedError.message)
    }

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`📡 Socket.IO server ready for real-time connections`)
      console.log(`🌐 API available at http://localhost:${PORT}`)
      console.log(`💾 MongoDB connected to 'database'`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

startServer()

export { app, io }