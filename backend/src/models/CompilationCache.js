import mongoose from 'mongoose'
import crypto from 'crypto'

const CacheEntrySchema = new mongoose.Schema({
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  contentHash: {
    type: String,
    required: true,
    index: true
  },
  inputContent: {
    type: String,
    required: true,
    maxlength: 10 * 1024 * 1024 // 10MB limit
  },
  compilationParameters: {
    format: {
      type: String,
      enum: ['markdown', 'openai-json', 'anthropic-json'],
      required: true
    },
    provider: String,
    model: String,
    parameters: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map()
    },
    packageVersions: [{
      name: String,
      version: String
    }]
  },
  compiledOutput: {
    type: String,
    required: true,
    maxlength: 50 * 1024 * 1024 // 50MB limit for compiled output
  },
  metadata: {
    compilationTime: {
      type: Number, // milliseconds
      required: true
    },
    outputSize: {
      type: Number,
      required: true
    },
    stages: [{
      name: {
        type: String,
        required: true
      },
      duration: {
        type: Number, // milliseconds
        required: true
      },
      success: {
        type: Boolean,
        required: true
      },
      warnings: [String],
      errors: [String]
    }],
    dependencies: [{
      type: {
        type: String,
        enum: ['package', 'file', 'registry'],
        required: true
      },
      name: String,
      version: String,
      checksum: String
    }]
  },
  validationResults: {
    isValid: {
      type: Boolean,
      required: true
    },
    errors: [{
      type: {
        type: String,
        enum: ['syntax', 'semantic', 'dependency', 'parameter'],
        required: true
      },
      message: {
        type: String,
        required: true
      },
      line: Number,
      column: Number,
      severity: {
        type: String,
        enum: ['error', 'warning', 'info'],
        default: 'error'
      }
    }],
    warnings: [{
      type: String,
      message: String,
      line: Number,
      column: Number
    }],
    stats: {
      totalLines: Number,
      totalTokens: Number,
      parametersUsed: Number,
      packagesReferenced: Number
    }
  },
  hitCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastHit: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// Indexes for efficient queries
CacheEntrySchema.index({ contentHash: 1, 'compilationParameters.format': 1 })
CacheEntrySchema.index({ userId: 1, createdAt: -1 })
CacheEntrySchema.index({ projectId: 1, createdAt: -1 })
CacheEntrySchema.index({ hitCount: -1 })
CacheEntrySchema.index({ lastHit: -1 })

// Virtual properties
CacheEntrySchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime()
})

CacheEntrySchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date()
})

CacheEntrySchema.virtual('hitRate').get(function() {
  const ageInDays = this.age / (1000 * 60 * 60 * 24)
  return ageInDays > 0 ? this.hitCount / ageInDays : 0
})

// Instance methods
CacheEntrySchema.methods.incrementHit = function() {
  this.hitCount += 1
  this.lastHit = new Date()
  return this.save()
}

CacheEntrySchema.methods.isValidFor = function(content, parameters) {
  const newHash = this.constructor.generateContentHash(content, parameters)
  return this.cacheKey === newHash && !this.isExpired
}

CacheEntrySchema.methods.extendExpiry = function(additionalHours = 24) {
  this.expiresAt = new Date(Date.now() + additionalHours * 60 * 60 * 1000)
  return this.save()
}

// Static methods
CacheEntrySchema.statics.generateContentHash = function(content, parameters = {}) {
  const normalizedParams = {
    format: parameters.format || 'markdown',
    provider: parameters.provider || '',
    model: parameters.model || '',
    parameters: parameters.parameters || {},
    packageVersions: parameters.packageVersions || []
  }
  
  const hashInput = JSON.stringify({
    content: content.trim(),
    ...normalizedParams
  })
  
  return crypto.createHash('sha256').update(hashInput).digest('hex')
}

CacheEntrySchema.statics.generateCacheKey = function(content, parameters = {}) {
  return this.generateContentHash(content, parameters)
}

CacheEntrySchema.statics.findByContent = function(content, parameters = {}) {
  const cacheKey = this.generateCacheKey(content, parameters)
  return this.findOne({ 
    cacheKey,
    expiresAt: { $gt: new Date() }
  })
}

CacheEntrySchema.statics.findByProject = function(projectId, options = {}) {
  const { limit = 50, skip = 0 } = options
  
  return this.find({ 
    projectId,
    expiresAt: { $gt: new Date() }
  })
    .sort({ lastHit: -1 })
    .limit(limit)
    .skip(skip)
}

CacheEntrySchema.statics.findByUser = function(userId, options = {}) {
  const { limit = 100, skip = 0, includeExpired = false } = options
  
  const query = { userId }
  if (!includeExpired) {
    query.expiresAt = { $gt: new Date() }
  }
  
  return this.find(query)
    .sort({ lastHit: -1 })
    .limit(limit)
    .skip(skip)
}

CacheEntrySchema.statics.getPopular = function(options = {}) {
  const { limit = 20, minHits = 5, maxAge = 30 } = options
  const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000)
  
  return this.find({
    hitCount: { $gte: minHits },
    createdAt: { $gte: cutoffDate },
    expiresAt: { $gt: new Date() },
    isPublic: true
  })
    .sort({ hitCount: -1, lastHit: -1 })
    .limit(limit)
}

CacheEntrySchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  })
}

CacheEntrySchema.statics.cleanupOldEntries = function(maxAge = 90) {
  const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000)
  return this.deleteMany({
    createdAt: { $lt: cutoffDate },
    hitCount: { $lt: 10 } // Keep popular entries longer
  })
}

CacheEntrySchema.statics.getStatistics = function(userId = null) {
  const matchStage = userId ? { $match: { userId: mongoose.Types.ObjectId(userId) } } : { $match: {} }
  
  return this.aggregate([
    matchStage,
    {
      $group: {
        _id: null,
        totalEntries: { $sum: 1 },
        totalHits: { $sum: '$hitCount' },
        averageCompilationTime: { $avg: '$metadata.compilationTime' },
        totalCacheSize: { $sum: '$metadata.outputSize' },
        formatDistribution: {
          $push: '$compilationParameters.format'
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalEntries: 1,
        totalHits: 1,
        averageCompilationTime: { $round: ['$averageCompilationTime', 2] },
        totalCacheSize: 1,
        hitRate: { 
          $cond: [
            { $gt: ['$totalEntries', 0] },
            { $divide: ['$totalHits', '$totalEntries'] },
            0
          ]
        },
        formatDistribution: {
          $reduce: {
            input: '$formatDistribution',
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $arrayToObject: [[{
                    k: '$$this',
                    v: { $add: [{ $ifNull: [{ $getField: { field: '$$this', input: '$$value' } }, 0] }, 1] }
                  }]]
                }
              ]
            }
          }
        }
      }
    }
  ])
}

// Pre-save middleware
CacheEntrySchema.pre('save', function(next) {
  if (this.isNew) {
    // Set default expiry to 7 days for new entries
    if (!this.expiresAt) {
      this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
    
    // Calculate output size
    this.metadata.outputSize = Buffer.byteLength(this.compiledOutput, 'utf8')
    
    // Generate cache key if not provided
    if (!this.cacheKey) {
      this.cacheKey = this.constructor.generateCacheKey(
        this.inputContent, 
        this.compilationParameters
      )
    }
    
    // Generate content hash
    this.contentHash = this.constructor.generateContentHash(
      this.inputContent,
      this.compilationParameters
    )
  }
  
  next()
})

// Cache cleanup job (would be called by a cron job)
CacheEntrySchema.statics.performMaintenance = async function() {
  console.log('Starting cache maintenance...')
  
  // Remove expired entries
  const expiredResult = await this.cleanupExpired()
  console.log(`Removed ${expiredResult.deletedCount} expired cache entries`)
  
  // Remove old, unpopular entries
  const oldResult = await this.cleanupOldEntries()
  console.log(`Removed ${oldResult.deletedCount} old cache entries`)
  
  // Get statistics
  const stats = await this.getStatistics()
  console.log('Cache statistics:', stats[0] || 'No entries')
  
  return {
    expiredRemoved: expiredResult.deletedCount,
    oldRemoved: oldResult.deletedCount,
    statistics: stats[0] || null
  }
}

export const CompilationCache = mongoose.model('CompilationCache', CacheEntrySchema, 'compilationCache')