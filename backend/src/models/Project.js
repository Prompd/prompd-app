import mongoose from 'mongoose'
import crypto from 'crypto'

const ProjectFileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  path: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 10 * 1024 * 1024 // 10MB limit for .prmd files
  },
  type: {
    type: String,
    required: true,
    enum: ['prmd', 'pdflow', 'json', 'yaml', 'md', 'txt', 'other']
  },
  size: {
    type: Number,
    required: true,
    min: 0,
    max: 50 * 1024 * 1024 // 50MB limit
  },
  lastModified: {
    type: Date,
    default: Date.now
  },
  checksum: {
    type: String,
    required: true
  }
}, {
  timestamps: true
})

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  files: [ProjectFileSchema],
  settings: {
    defaultProvider: {
      type: String,
      default: 'openai'
    },
    defaultModel: {
      type: String,
      default: 'gpt-4o'
    },
    compilationFormat: {
      type: String,
      enum: ['markdown', 'openai-json', 'anthropic-json'],
      default: 'markdown'
    },
    autoSave: {
      type: Boolean,
      default: true
    },
    autoCompile: {
      type: Boolean,
      default: true
    },
    collaborationEnabled: {
      type: Boolean,
      default: false
    }
  },
  packages: [{
    name: {
      type: String,
      required: true
    },
    version: {
      type: String,
      required: true
    },
    installedAt: {
      type: Date,
      default: Date.now
    },
    source: {
      type: String,
      enum: ['registry', 'local', 'git'],
      default: 'registry'
    }
  }],
  metadata: {
    totalFiles: {
      type: Number,
      default: 0
    },
    totalSize: {
      type: Number,
      default: 0
    },
    lastCompiled: {
      type: Date
    },
    compilationCount: {
      type: Number,
      default: 0
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: 50
    }]
  },
  collaborators: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['owner', 'editor', 'viewer'],
      default: 'viewer'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// Indexes for efficient queries
ProjectSchema.index({ userId: 1, createdAt: -1 })
ProjectSchema.index({ name: 'text', description: 'text' })
ProjectSchema.index({ 'metadata.tags': 1 })
ProjectSchema.index({ isPublic: 1, isArchived: 1 })
ProjectSchema.index({ 'collaborators.userId': 1 })

// Virtual properties
ProjectSchema.virtual('fileCount').get(function() {
  return this.files.length
})

ProjectSchema.virtual('mainFile').get(function() {
  return this.files.find(file => file.type === 'prmd' && file.name.includes('main')) ||
         this.files.find(file => file.type === 'prmd') ||
         this.files[0]
})

ProjectSchema.virtual('lastActivity').get(function() {
  const lastFileModified = this.files.reduce((latest, file) => {
    return file.lastModified > latest ? file.lastModified : latest
  }, this.createdAt)
  
  return lastFileModified > this.updatedAt ? lastFileModified : this.updatedAt
})

// Instance methods
ProjectSchema.methods.addFile = function(fileData) {
  const checksum = crypto.createHash('sha256').update(fileData.content).digest('hex')
  
  const file = {
    ...fileData,
    checksum,
    size: Buffer.byteLength(fileData.content, 'utf8'),
    lastModified: new Date()
  }
  
  // Remove existing file with same path
  this.files = this.files.filter(f => f.path !== file.path)
  
  // Add new file
  this.files.push(file)
  
  // Update metadata
  this.metadata.totalFiles = this.files.length
  this.metadata.totalSize = this.files.reduce((sum, f) => sum + f.size, 0)
  
  return file
}

ProjectSchema.methods.removeFile = function(filePath) {
  const initialLength = this.files.length
  this.files = this.files.filter(f => f.path !== filePath)
  
  if (this.files.length < initialLength) {
    this.metadata.totalFiles = this.files.length
    this.metadata.totalSize = this.files.reduce((sum, f) => sum + f.size, 0)
    return true
  }
  return false
}

ProjectSchema.methods.updateSettings = function(newSettings) {
  this.settings = { ...this.settings.toObject(), ...newSettings }
  return this.settings
}

ProjectSchema.methods.addPackage = function(packageInfo) {
  // Remove existing package with same name
  this.packages = this.packages.filter(p => p.name !== packageInfo.name)
  
  // Add new package
  this.packages.push({
    ...packageInfo,
    installedAt: new Date()
  })
  
  return packageInfo
}

ProjectSchema.methods.removePackage = function(packageName) {
  const initialLength = this.packages.length
  this.packages = this.packages.filter(p => p.name !== packageName)
  return this.packages.length < initialLength
}

ProjectSchema.methods.hasPermission = function(userId, requiredRole = 'viewer') {
  const roleHierarchy = { viewer: 0, editor: 1, owner: 2 }
  
  // Check if user is the owner
  if (this.userId.toString() === userId.toString()) {
    return true
  }
  
  // Check collaborator permissions
  const collaborator = this.collaborators.find(c => c.userId.toString() === userId.toString())
  if (!collaborator) {
    return this.isPublic && requiredRole === 'viewer'
  }
  
  return roleHierarchy[collaborator.role] >= roleHierarchy[requiredRole]
}

// Static methods
ProjectSchema.statics.findByUser = function(userId, options = {}) {
  const query = { 
    $or: [
      { userId },
      { 'collaborators.userId': userId },
      { isPublic: true }
    ]
  }
  
  if (options.includeArchived !== true) {
    query.isArchived = { $ne: true }
  }
  
  return this.find(query).sort({ updatedAt: -1 })
}

ProjectSchema.statics.findPublic = function(options = {}) {
  const { limit = 20, skip = 0, tags = [] } = options
  
  const query = { 
    isPublic: true, 
    isArchived: { $ne: true }
  }
  
  if (tags.length > 0) {
    query['metadata.tags'] = { $in: tags }
  }
  
  return this.find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'username email')
}

// Pre-save middleware
ProjectSchema.pre('save', function(next) {
  // Update metadata before saving
  this.metadata.totalFiles = this.files.length
  this.metadata.totalSize = this.files.reduce((sum, file) => sum + file.size, 0)
  
  // Validate file types
  const invalidFiles = this.files.filter(file => {
    const allowedTypes = ['prmd', 'pdflow', 'json', 'yaml', 'md', 'txt', 'other']
    return !allowedTypes.includes(file.type)
  })
  
  if (invalidFiles.length > 0) {
    return next(new Error(`Invalid file types: ${invalidFiles.map(f => f.type).join(', ')}`))
  }
  
  next()
})

export const Project = mongoose.model('Project', ProjectSchema, 'projects')