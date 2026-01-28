import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const UserSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true
    // Note: unique constraint removed - doesn't work correctly for embedded arrays
    // and causes duplicate key errors when users have empty sessions arrays
  },
  deviceInfo: {
    userAgent: String,
    ip: String,
    platform: String,
    browser: String
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
})

const UserPreferencesSchema = new mongoose.Schema({
  editor: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    fontSize: {
      type: Number,
      min: 10,
      max: 24,
      default: 14
    },
    tabSize: {
      type: Number,
      min: 2,
      max: 8,
      default: 2
    },
    wordWrap: {
      type: Boolean,
      default: true
    },
    minimap: {
      type: Boolean,
      default: true
    },
    autoSave: {
      type: Boolean,
      default: true
    },
    autoCompile: {
      type: Boolean,
      default: true
    }
  },
  compilation: {
    defaultFormat: {
      type: String,
      enum: ['markdown', 'openai-json', 'anthropic-json'],
      default: 'markdown'
    },
    defaultProvider: {
      type: String,
      default: 'openai'
    },
    defaultModel: {
      type: String,
      default: 'gpt-4o'
    },
    autoValidate: {
      type: Boolean,
      default: true
    }
  },
  ui: {
    sidebarPosition: {
      type: String,
      enum: ['left', 'right'],
      default: 'left'
    },
    panelPosition: {
      type: String,
      enum: ['bottom', 'right'],
      default: 'bottom'
    },
    defaultMode: {
      type: String,
      enum: ['visual', 'code', 'split'],
      default: 'visual'
    },
    showWelcome: {
      type: Boolean,
      default: true
    },
    enableAnimations: {
      type: Boolean,
      default: true
    }
  },
  notifications: {
    email: {
      compilationResults: {
        type: Boolean,
        default: false
      },
      packageUpdates: {
        type: Boolean,
        default: true
      },
      collaborationInvites: {
        type: Boolean,
        default: true
      },
      newsletter: {
        type: Boolean,
        default: false
      }
    },
    inApp: {
      compilationResults: {
        type: Boolean,
        default: true
      },
      packageUpdates: {
        type: Boolean,
        default: true
      },
      collaborationActivity: {
        type: Boolean,
        default: true
      }
    }
  }
}, {
  _id: false
})

const UserSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    sparse: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-z0-9_-]+$/
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    type: String,
    required: false,
    minlength: 8
  },
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500
    },
    avatar: {
      type: String, // URL to avatar image
      trim: true
    },
    website: {
      type: String,
      trim: true
    },
    location: {
      type: String,
      trim: true,
      maxlength: 100
    },
    company: {
      type: String,
      trim: true,
      maxlength: 100
    }
  },
  preferences: {
    type: UserPreferencesSchema,
    default: () => ({})
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'free_plan', 'pro', 'pro_plan', 'team', 'team_plan', 'enterprise', 'admin'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'expired'],
      default: 'active'
    },
    expiresAt: {
      type: Date
    },
    features: {
      maxProjects: {
        type: Number,
        default: 5
      },
      maxCollaborators: {
        type: Number,
        default: 0
      },
      maxFileSize: {
        type: Number,
        default: 10 * 1024 * 1024 // 10MB
      },
      privatePackages: {
        type: Boolean,
        default: false
      },
      prioritySupport: {
        type: Boolean,
        default: false
      }
    }
  },
  apiKeys: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    key: {
      type: String,
      required: true
    },
    permissions: [{
      type: String,
      enum: ['read', 'write', 'admin']
    }],
    lastUsed: {
      type: Date
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  sessions: [UserSessionSchema],
  statistics: {
    projectsCreated: {
      type: Number,
      default: 0
    },
    compilationsRun: {
      type: Number,
      default: 0
    },
    packagesPublished: {
      type: Number,
      default: 0
    },
    packagesInstalled: {
      type: Number,
      default: 0
    },
    collaborationsStarted: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  aiFeatures: {
    // Quota tracking (for users without own API key)
    generations: {
      used: {
        type: Number,
        default: 0
      },
      limit: {
        type: Number,
        default: 5 // Free tier default
      },
      resetAt: Date // null = lifetime, Date = monthly reset (future)
    },
    executions: {
      used: {
        type: Number,
        default: 0
      },
      limit: {
        type: Number,
        default: 10
      },
      resetAt: Date
    },
    // Dynamic LLM provider API keys - supports any provider
    // Keys are provider IDs (e.g., 'openai', 'anthropic', 'groq', 'custom_xyz')
    // Values contain encrypted API key data
    llmProviders: {
      type: Map,
      of: new mongoose.Schema({
        hasKey: {
          type: Boolean,
          default: false
        },
        encryptedKey: String, // AES-256-GCM encrypted
        iv: String, // Initialization vector
        addedAt: {
          type: Date,
          default: Date.now
        },
        // Custom provider fields (for user-defined providers)
        isCustom: {
          type: Boolean,
          default: false
        },
        customConfig: {
          displayName: String,
          baseUrl: String, // e.g., 'https://api.custom-provider.com/v1'
          models: [String], // Available model IDs
          keyPrefix: String // e.g., 'sk-' for validation hints
        }
      }, { _id: false }),
      default: () => new Map()
    },
    // Default provider preference
    defaultProvider: {
      type: String,
      default: null // Will use server's default if not set
    },
    // Usage history (for analytics)
    history: {
      lastGeneratedAt: Date,
      lastExecutedAt: Date,
      totalGenerations: {
        type: Number,
        default: 0
      },
      totalExecutions: {
        type: Number,
        default: 0
      }
    }
  },
  emailVerification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    token: {
      type: String
    },
    expiresAt: {
      type: Date
    }
  },
  passwordReset: {
    token: {
      type: String
    },
    expiresAt: {
      type: Date
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  suspensionReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password
      delete ret.apiKeys
      delete ret.sessions
      delete ret.emailVerification
      delete ret.passwordReset
      return ret
    }
  },
  toObject: { virtuals: true }
})

// Indexes for efficient queries
UserSchema.index({ username: 1 }, { unique: true })
UserSchema.index({ email: 1 }, { unique: true })
UserSchema.index({ 'emailVerification.token': 1 })
UserSchema.index({ 'passwordReset.token': 1 })
UserSchema.index({ 'sessions.sessionId': 1 })
UserSchema.index({ 'statistics.lastActivity': -1 })

// Virtual properties
UserSchema.virtual('fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`
  }
  return this.profile.displayName || this.username
})

UserSchema.virtual('isEmailVerified').get(function() {
  return this.emailVerification.isVerified
})

UserSchema.virtual('activeSessions').get(function() {
  return this.sessions.filter(session => 
    session.isActive && session.expiresAt > new Date()
  )
})

UserSchema.virtual('canCreateProjects').get(function() {
  // This would need to be calculated by counting actual projects
  return true // Simplified for now
})

// Instance methods
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

UserSchema.methods.generateAuthToken = function() {
  const payload = {
    userId: this._id,
    username: this.username,
    email: this.email
  }
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'fallback-secret', {
    expiresIn: '7d'
  })
}

UserSchema.methods.generateApiKey = function(name, permissions = ['read']) {
  const crypto = require('crypto')
  const key = 'prompd_' + crypto.randomBytes(32).toString('hex')
  
  this.apiKeys.push({
    name,
    key: bcrypt.hashSync(key, 10), // Store hashed version
    permissions,
    createdAt: new Date()
  })
  
  return key // Return unhashed key to user
}

UserSchema.methods.validateApiKey = function(key) {
  const apiKey = this.apiKeys.find(ak => 
    ak.isActive && 
    (!ak.expiresAt || ak.expiresAt > new Date()) &&
    bcrypt.compareSync(key, ak.key)
  )
  
  if (apiKey) {
    apiKey.lastUsed = new Date()
    return apiKey
  }
  
  return null
}

UserSchema.methods.createSession = function(deviceInfo) {
  const crypto = require('crypto')
  const sessionId = crypto.randomUUID()
  
  const session = {
    sessionId,
    deviceInfo,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }
  
  this.sessions.push(session)
  
  // Clean up old sessions (keep only last 10)
  if (this.sessions.length > 10) {
    this.sessions = this.sessions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
  }
  
  return session
}

UserSchema.methods.endSession = function(sessionId) {
  const session = this.sessions.find(s => s.sessionId === sessionId)
  if (session) {
    session.isActive = false
    return true
  }
  return false
}

UserSchema.methods.updateActivity = function() {
  this.statistics.lastActivity = new Date()
}

UserSchema.methods.updatePreferences = function(newPreferences) {
  this.preferences = { ...this.preferences.toObject(), ...newPreferences }
  return this.preferences
}

// LLM Provider management methods
UserSchema.methods.hasProviderKey = function(providerId) {
  const providers = this.aiFeatures?.llmProviders
  if (!providers) return false
  const provider = providers.get(providerId)
  return provider?.hasKey === true
}

UserSchema.methods.getConfiguredProviders = function() {
  const providers = this.aiFeatures?.llmProviders
  if (!providers) return []

  const configured = []
  for (const [providerId, config] of providers.entries()) {
    if (config.hasKey) {
      configured.push({
        providerId,
        isCustom: config.isCustom || false,
        customConfig: config.customConfig || null,
        addedAt: config.addedAt
      })
    }
  }
  return configured
}

UserSchema.methods.setProviderKey = function(providerId, encryptedKey, iv, customConfig = null) {
  if (!this.aiFeatures) {
    this.aiFeatures = {}
  }
  if (!this.aiFeatures.llmProviders) {
    this.aiFeatures.llmProviders = new Map()
  }

  const providerData = {
    hasKey: true,
    encryptedKey,
    iv,
    addedAt: new Date(),
    isCustom: !!customConfig,
    customConfig: customConfig || undefined
  }

  this.aiFeatures.llmProviders.set(providerId, providerData)
  this.markModified('aiFeatures.llmProviders')
  return providerData
}

UserSchema.methods.removeProviderKey = function(providerId) {
  const providers = this.aiFeatures?.llmProviders
  if (!providers) return false

  if (providers.has(providerId)) {
    providers.delete(providerId)
    this.markModified('aiFeatures.llmProviders')
    return true
  }
  return false
}

UserSchema.methods.getProviderKeyData = function(providerId) {
  const providers = this.aiFeatures?.llmProviders
  if (!providers) return null
  return providers.get(providerId) || null
}

UserSchema.methods.canPerformAction = async function(action, resourceType = null) {
  if (this.isSuspended) return false

  const limits = this.subscription.features

  switch (action) {
    case 'create_project': {
      // Admin users have unlimited projects
      if (this.role === 'admin') return true

      // Check if user has reached project limit
      const Project = this.model('Project')
      const projectCount = await Project.countDocuments({
        userId: this._id,
        isArchived: { $ne: true } // Don't count archived projects
      })

      return projectCount < limits.maxProjects
    }
    case 'upload_file':
      return true // Would check against maxFileSize
    case 'add_collaborator':
      return limits.maxCollaborators > 0
    case 'publish_private_package':
      return limits.privatePackages
    default:
      return true
  }
}

// Static methods
UserSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier.toLowerCase() }
    ]
  })
}

UserSchema.statics.findByApiKey = function(apiKey) {
  // This is a simplified version - in practice you'd need to hash and compare
  return this.findOne({
    'apiKeys.key': apiKey,
    'apiKeys.isActive': true
  })
}

// Pre-save middleware
UserSchema.pre('save', async function(next) {
  // Hash password if it's new or modified (skip if password is undefined - Clerk users)
  if (this.password && (this.isNew || this.isModified('password'))) {
    try {
      const salt = await bcrypt.genSalt(12)
      this.password = await bcrypt.hash(this.password, salt)
    } catch (error) {
      return next(error)
    }
  }
  
  // Set display name if not provided
  if (!this.profile.displayName) {
    this.profile.displayName = this.username
  }
  
  // Clean up expired sessions
  this.sessions = this.sessions.filter(session => 
    session.expiresAt > new Date()
  )
  
  next()
})

export const User = mongoose.model('User', UserSchema, 'users')