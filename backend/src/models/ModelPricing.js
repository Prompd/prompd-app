import mongoose from 'mongoose'
import crypto from 'crypto'

const ModelPricingSchema = new mongoose.Schema({
  // Unique identifier for this pricing record
  pricingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Provider identifier (e.g., 'openai', 'anthropic', 'groq')
  provider: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },

  // Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet')
  model: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  // Human-readable display name
  displayName: {
    type: String,
    trim: true
  },

  // Pricing per 1M tokens (in USD)
  pricing: {
    inputTokens: {
      type: Number,
      required: true,
      min: 0
    },
    outputTokens: {
      type: Number,
      required: true,
      min: 0
    },
    // Optional pricing tiers
    cachedInputTokens: {
      type: Number,
      min: 0
    },
    batchInputTokens: {
      type: Number,
      min: 0
    },
    batchOutputTokens: {
      type: Number,
      min: 0
    }
  },

  // Model capabilities
  capabilities: {
    contextWindow: {
      type: Number,
      default: 4096
    },
    maxOutputTokens: {
      type: Number,
      default: 4096
    },
    supportsVision: {
      type: Boolean,
      default: false
    },
    supportsTools: {
      type: Boolean,
      default: false
    },
    supportsStreaming: {
      type: Boolean,
      default: true
    }
  },

  // IMMUTABLE TIME WINDOW
  // When this pricing became active
  effectiveFrom: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  // When this pricing was replaced (null = currently active)
  expiredAt: {
    type: Date,
    default: null,
    index: true
  },

  // Source of the pricing data
  source: {
    type: String,
    enum: ['api', 'manual', 'seed'],
    default: 'seed'
  },

  // Who created this record
  createdBy: {
    type: String,
    default: 'system'
  },

  // Optional notes about this pricing
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
})

// Compound indexes for efficient queries
ModelPricingSchema.index({ provider: 1, model: 1, effectiveFrom: -1 })
ModelPricingSchema.index({ provider: 1, model: 1, expiredAt: 1 })
ModelPricingSchema.index({ provider: 1, expiredAt: 1 })

// Generate unique pricing ID before validation
ModelPricingSchema.pre('validate', function(next) {
  if (!this.pricingId) {
    const timestamp = Date.now().toString(36)
    const random = crypto.randomBytes(4).toString('hex')
    this.pricingId = `price_${this.provider}_${timestamp}_${random}`
  }
  next()
})

// IMMUTABILITY ENFORCEMENT
// Track original values for immutability check
ModelPricingSchema.pre('save', function(next) {
  if (!this.isNew) {
    // Only allow modification of expiredAt after creation
    const immutableFields = ['provider', 'model', 'pricing', 'effectiveFrom', 'source', 'pricingId']

    for (const field of immutableFields) {
      if (this.isModified(field)) {
        const error = new Error(`Cannot modify immutable field: ${field}. Create a new pricing record instead.`)
        error.name = 'ImmutabilityError'
        return next(error)
      }
    }
  }
  next()
})

// Static method: Get current active pricing for a provider/model
ModelPricingSchema.statics.getCurrentPricing = function(provider, model) {
  return this.findOne({
    provider: provider.toLowerCase(),
    model: model,
    expiredAt: null
  }).sort({ effectiveFrom: -1 })
}

// Static method: Get pricing at a specific point in time
ModelPricingSchema.statics.getPricingAtTime = function(provider, model, timestamp) {
  const date = new Date(timestamp)
  return this.findOne({
    provider: provider.toLowerCase(),
    model: model,
    effectiveFrom: { $lte: date },
    $or: [
      { expiredAt: null },
      { expiredAt: { $gt: date } }
    ]
  }).sort({ effectiveFrom: -1 })
}

// Static method: Get all current pricing for a provider
ModelPricingSchema.statics.getProviderPricing = function(provider) {
  return this.find({
    provider: provider.toLowerCase(),
    expiredAt: null
  }).sort({ model: 1 })
}

// Static method: Get all current pricing
ModelPricingSchema.statics.getAllCurrentPricing = function() {
  return this.find({
    expiredAt: null
  }).sort({ provider: 1, model: 1 })
}

// Static method: Get pricing history for a model
ModelPricingSchema.statics.getPricingHistory = function(provider, model, limit = 10) {
  return this.find({
    provider: provider.toLowerCase(),
    model: model
  })
    .sort({ effectiveFrom: -1 })
    .limit(limit)
}

// Instance method: Mark this pricing as expired
ModelPricingSchema.methods.expire = function(date = new Date()) {
  if (this.expiredAt) {
    throw new Error('This pricing record is already expired')
  }
  this.expiredAt = date
  return this.save()
}

// Static method: Create new pricing (expires existing if present)
ModelPricingSchema.statics.createPricing = async function(data) {
  const { provider, model } = data

  // Find and expire current pricing
  const currentPricing = await this.getCurrentPricing(provider, model)
  if (currentPricing) {
    await currentPricing.expire()
  }

  // Create new pricing record
  return this.create({
    ...data,
    effectiveFrom: new Date()
  })
}

export const ModelPricing = mongoose.model('ModelPricing', ModelPricingSchema, 'modelPricing')
