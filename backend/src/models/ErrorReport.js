import mongoose from 'mongoose'

const errorReportSchema = new mongoose.Schema({
  // Error details
  level: {
    type: String,
    enum: ['error', 'warn'],
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true
  },
  errorName: String,
  errorMessage: String,
  stack: String,

  // Context
  userId: {
    type: String,
    index: true
  },
  sessionId: String,
  appVersion: String,
  platform: {
    type: String,
    enum: ['electron', 'web'],
    index: true
  },
  url: String,
  userAgent: String,
  extra: mongoose.Schema.Types.Mixed,

  // Timestamps
  clientTimestamp: Date,

  // Aggregation helpers
  fingerprint: {
    type: String,
    index: true
  },
  occurrences: {
    type: Number,
    default: 1
  },
  firstSeen: Date,
  lastSeen: Date,

  // Status
  status: {
    type: String,
    enum: ['new', 'seen', 'resolved', 'ignored'],
    default: 'new',
    index: true
  },
  resolvedAt: Date,
  resolvedBy: String,
  notes: String
}, {
  timestamps: true
})

// Create fingerprint from error signature for deduplication
errorReportSchema.statics.createFingerprint = function(message, errorName, stack) {
  const crypto = require('crypto')
  // Use first line of stack trace + error name + message prefix
  const stackFirstLine = stack?.split('\n')[1]?.trim() || ''
  const msgPrefix = message?.substring(0, 100) || ''
  const input = `${errorName || ''}:${msgPrefix}:${stackFirstLine}`
  return crypto.createHash('md5').update(input).digest('hex')
}

// Index for efficient querying
errorReportSchema.index({ createdAt: -1 })
errorReportSchema.index({ fingerprint: 1, createdAt: -1 })
errorReportSchema.index({ status: 1, level: 1, createdAt: -1 })

export const ErrorReport = mongoose.model('ErrorReport', errorReportSchema)
