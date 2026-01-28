import mongoose from 'mongoose'
import crypto from 'crypto'

const { Schema } = mongoose

// Encryption key from environment
const ENCRYPTION_KEY = process.env.PROVIDER_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
const ALGORITHM = 'aes-256-gcm'

// Utility functions for encrypting/decrypting API keys
function encryptApiKey(apiKey) {
  if (!apiKey) return null
  
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY)
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  }
}

function decryptApiKey(encryptedData) {
  if (!encryptedData || !encryptedData.encrypted) return null
  
  try {
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY)
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'))
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    console.error('Failed to decrypt API key:', error)
    return null
  }
}

const providerSchema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  providerId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true
  },
  encryptedApiKey: {
    encrypted: String,
    iv: String,
    authTag: String
  },
  baseUrl: {
    type: String,
    default: 'https://api.openai.com/v1'
  },
  models: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: new Map()
  }
}, {
  timestamps: true
})

// Compound index to ensure one provider per user per providerId
providerSchema.index({ userId: 1, providerId: 1 }, { unique: true })

// Virtual for decrypted API key (not stored in DB)
providerSchema.virtual('apiKey').get(function() {
  return decryptApiKey(this.encryptedApiKey)
})

// Method to set API key (encrypts before saving)
providerSchema.methods.setApiKey = function(apiKey) {
  if (apiKey) {
    this.encryptedApiKey = encryptApiKey(apiKey)
  } else {
    this.encryptedApiKey = null
  }
}

// Static method to find user's providers
providerSchema.statics.findByUserId = function(userId) {
  return this.find({ userId }).select('-encryptedApiKey')
}

// Static method to get user's provider with decrypted key (for execution)
providerSchema.statics.findUserProviderWithKey = async function(userId, providerId) {
  const provider = await this.findOne({ userId, providerId })
  if (provider) {
    return {
      ...provider.toObject(),
      apiKey: provider.apiKey // This uses the virtual getter
    }
  }
  return null
}

// Transform function to exclude sensitive data in JSON responses
providerSchema.methods.toJSON = function() {
  const obj = this.toObject()
  delete obj.encryptedApiKey
  return obj
}

const Provider = mongoose.model('Provider', providerSchema, 'providers')

export default Provider