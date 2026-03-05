import mongoose from 'mongoose'

const PackageVersionSchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
    match: /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/ // Semantic versioning
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  author: {
    name: String,
    email: String,
    url: String
  },
  keywords: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  exports: {
    type: Map,
    of: String,
    default: () => new Map()
  },
  parameters: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      required: true,
      enum: ['string', 'number', 'boolean', 'object', 'array', 'file']
    },
    required: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      trim: true
    },
    default: mongoose.Schema.Types.Mixed,
    enum: [String],
    validation: {
      min: Number,
      max: Number,
      pattern: String,
      maxLength: Number
    }
  }],
  dependencies: [{
    name: {
      type: String,
      required: true
    },
    version: {
      type: String,
      required: true
    },
    optional: {
      type: Boolean,
      default: false
    }
  }],
  files: [{
    path: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    },
    checksum: {
      type: String,
      required: true
    }
  }],
  manifest: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  downloadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  publishedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

const PackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/ // npm package naming
  },
  displayName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  homepage: {
    type: String,
    trim: true
  },
  repository: {
    type: {
      type: String,
      enum: ['git', 'svn', 'hg']
    },
    url: String,
    directory: String
  },
  license: {
    type: String,
    default: 'MIT'
  },
  versions: [PackageVersionSchema],
  tags: {
    latest: {
      type: String,
      required: true
    },
    beta: String,
    alpha: String
  },
  maintainers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    email: String,
    role: {
      type: String,
      enum: ['owner', 'maintainer'],
      default: 'maintainer'
    }
  }],
  statistics: {
    totalDownloads: {
      type: Number,
      default: 0,
      min: 0
    },
    weeklyDownloads: {
      type: Number,
      default: 0,
      min: 0
    },
    monthlyDownloads: {
      type: Number,
      default: 0,
      min: 0
    },
    stars: {
      type: Number,
      default: 0,
      min: 0
    },
    forks: {
      type: Number,
      default: 0,
      min: 0
    },
    issues: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  category: {
    type: String,
    enum: ['ai-tools', 'templates', 'utilities', 'integrations', 'examples', 'other'],
    default: 'other'
  },
  type: {
    type: String,
    enum: ['package', 'workflow', 'node-template', 'skill'],
    default: 'package'
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  isDeprecated: {
    type: Boolean,
    default: false
  },
  deprecationMessage: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// Indexes for efficient queries
PackageSchema.index({ name: 1 }, { unique: true })
PackageSchema.index({ name: 'text', description: 'text', displayName: 'text' })
PackageSchema.index({ category: 1, isPrivate: 1 })
PackageSchema.index({ type: 1, isPrivate: 1 })
PackageSchema.index({ 'statistics.totalDownloads': -1 })
PackageSchema.index({ 'statistics.stars': -1 })
PackageSchema.index({ updatedAt: -1 })
PackageSchema.index({ 'maintainers.userId': 1 })

// Virtual properties
PackageSchema.virtual('latestVersion').get(function() {
  return this.versions.find(v => v.version === this.tags.latest)
})

PackageSchema.virtual('versionCount').get(function() {
  return this.versions.length
})

PackageSchema.virtual('averageRating').get(function() {
  // This would be calculated from user ratings if implemented
  return 0
})

// Instance methods
PackageSchema.methods.addVersion = function(versionData) {
  // Check if version already exists
  const existingVersion = this.versions.find(v => v.version === versionData.version)
  if (existingVersion) {
    throw new Error(`Version ${versionData.version} already exists`)
  }
  
  // Validate semantic versioning
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/
  if (!semverRegex.test(versionData.version)) {
    throw new Error('Invalid semantic version format')
  }
  
  // Add new version
  this.versions.push(versionData)
  
  // Update latest tag if this is the highest version
  const versions = this.versions.map(v => v.version).sort(this.compareVersions)
  if (versions[versions.length - 1] === versionData.version) {
    this.tags.latest = versionData.version
  }
  
  return versionData
}

PackageSchema.methods.removeVersion = function(version) {
  const initialLength = this.versions.length
  this.versions = this.versions.filter(v => v.version !== version)
  
  if (this.versions.length < initialLength) {
    // Update latest tag if we removed the latest version
    if (this.tags.latest === version) {
      const remainingVersions = this.versions.map(v => v.version).sort(this.compareVersions)
      this.tags.latest = remainingVersions[remainingVersions.length - 1] || null
    }
    return true
  }
  return false
}

PackageSchema.methods.getVersion = function(version) {
  if (version === 'latest') {
    return this.latestVersion
  }
  return this.versions.find(v => v.version === version)
}

PackageSchema.methods.compareVersions = function(a, b) {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  
  for (let i = 0; i < 3; i++) {
    if (aParts[i] > bParts[i]) return 1
    if (aParts[i] < bParts[i]) return -1
  }
  return 0
}

PackageSchema.methods.incrementDownloads = function(version = 'latest') {
  const versionObj = this.getVersion(version)
  if (versionObj) {
    versionObj.downloadCount += 1
    this.statistics.totalDownloads += 1
    this.statistics.weeklyDownloads += 1
    this.statistics.monthlyDownloads += 1
  }
}

PackageSchema.methods.canUserModify = function(userId) {
  return this.maintainers.some(m => 
    m.userId.toString() === userId.toString() && 
    ['owner', 'maintainer'].includes(m.role)
  )
}

// Static methods
PackageSchema.statics.search = function(query, options = {}) {
  const {
    limit = 20,
    skip = 0,
    category = null,
    type = null,
    sortBy = 'relevance',
    includePrivate = false
  } = options

  const searchQuery = {
    ...(category && { category }),
    ...(type && { type }),
    ...(includePrivate === false && { isPrivate: false }),
    isDeprecated: false
  }
  
  if (query && query.trim()) {
    searchQuery.$text = { $search: query }
  }
  
  let sortOptions = {}
  switch (sortBy) {
    case 'downloads':
      sortOptions = { 'statistics.totalDownloads': -1 }
      break
    case 'updated':
      sortOptions = { updatedAt: -1 }
      break
    case 'created':
      sortOptions = { createdAt: -1 }
      break
    case 'name':
      sortOptions = { name: 1 }
      break
    default: // relevance
      sortOptions = query ? { score: { $meta: 'textScore' } } : { 'statistics.totalDownloads': -1 }
  }
  
  return this.find(searchQuery, query ? { score: { $meta: 'textScore' } } : {})
    .sort(sortOptions)
    .limit(limit)
    .skip(skip)
    .populate('maintainers.userId', 'username email')
}

PackageSchema.statics.findByCategory = function(category, options = {}) {
  const { limit = 20, skip = 0 } = options
  
  return this.find({ 
    category, 
    isPrivate: false, 
    isDeprecated: false 
  })
    .sort({ 'statistics.totalDownloads': -1 })
    .limit(limit)
    .skip(skip)
}

PackageSchema.statics.findPopular = function(options = {}) {
  const { limit = 10, timeframe = 'total' } = options
  
  const sortField = timeframe === 'week' ? 'statistics.weeklyDownloads' : 
                   timeframe === 'month' ? 'statistics.monthlyDownloads' : 
                   'statistics.totalDownloads'
  
  return this.find({ 
    isPrivate: false, 
    isDeprecated: false 
  })
    .sort({ [sortField]: -1 })
    .limit(limit)
}

// Pre-save middleware
PackageSchema.pre('save', function(next) {
  // Ensure displayName defaults to name
  if (!this.displayName) {
    this.displayName = this.name
  }
  
  // Validate that latest tag points to existing version
  if (this.tags.latest && !this.versions.find(v => v.version === this.tags.latest)) {
    return next(new Error('Latest tag must point to an existing version'))
  }
  
  next()
})

// Local package installation tracking
const LocalPackageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  packageName: {
    type: String,
    required: true
  },
  version: {
    type: String,
    required: true
  },
  source: {
    type: String,
    enum: ['registry', 'local', 'git'],
    default: 'registry'
  },
  localPath: {
    type: String
  },
  configuration: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
})

// Compound index for efficient lookups
LocalPackageSchema.index({ userId: 1, packageName: 1, version: 1 }, { unique: true })
LocalPackageSchema.index({ projectId: 1, packageName: 1 })

export const Package = mongoose.model('Package', PackageSchema, 'packages')
export const LocalPackage = mongoose.model('LocalPackage', LocalPackageSchema, 'localPackages')