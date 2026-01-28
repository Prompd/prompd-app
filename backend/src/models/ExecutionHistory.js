import mongoose from 'mongoose'

const ExecutionHistorySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },

  // Execution type
  type: {
    type: String,
    enum: ['generation', 'execution', 'conversation'],
    required: true
  },

  // For generation: the description input
  // For execution: the compiled prompd markdown
  prompt: {
    type: String,
    required: true
  },

  // LLM Provider details
  provider: {
    type: String,
    enum: ['anthropic', 'openai', 'google', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'deepseek', 'ollama', 'custom'],
    required: true
  },

  model: {
    type: String,
    required: true
  },

  // Response from LLM
  response: {
    type: String,
    required: true
  },

  // Metadata
  metadata: {
    // For generation
    generatedFileName: String,
    complexity: String,
    includeExamples: Boolean,

    // For execution
    prompdhFile: String,
    parameters: mongoose.Schema.Types.Mixed,

    // Cost tracking
    tokensUsed: {
      prompt: Number,
      completion: Number,
      total: Number
    },
    estimatedCost: Number,

    // Enhanced pricing tracking (links to ModelPricing collection)
    pricingRef: {
      pricingId: String,        // Reference to ModelPricing record
      effectiveFrom: Date,      // Snapshot of when pricing was active
      inputRate: Number,        // $/1M input at execution time
      outputRate: Number        // $/1M output at execution time
    },

    // Detailed cost breakdown
    cost: {
      inputCost: Number,
      outputCost: Number,
      totalCost: Number,
      currency: {
        type: String,
        default: 'USD'
      }
    },

    // Performance
    durationMs: Number,

    // API key source
    usedOwnApiKey: Boolean
  },

  // Error tracking
  error: {
    occurred: {
      type: Boolean,
      default: false
    },
    message: String,
    code: String
  },

  // Timestamps
  executedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
})

// Indexes for efficient queries
ExecutionHistorySchema.index({ userId: 1, executedAt: -1 })
ExecutionHistorySchema.index({ userId: 1, type: 1, executedAt: -1 })
ExecutionHistorySchema.index({ provider: 1, executedAt: -1 })

// TTL index - auto-delete after 90 days for GDPR compliance
ExecutionHistorySchema.index({ executedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 })

export const ExecutionHistory = mongoose.model('ExecutionHistory', ExecutionHistorySchema, 'executionHistory')
