import express from 'express'
import Provider from '../models/Provider.js'
import { validateRequest, validateProvider } from '../middleware/validation.js'
import { auth as authenticate } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'

const router = express.Router()

// Rate limiting for provider operations
const providerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many provider requests, please try again later.'
})

// Apply auth and rate limiting to all provider routes
router.use(authenticate)
router.use(providerLimiter)

// Default providers configuration
const DEFAULT_PROVIDERS = [
  {
    providerId: 'openai',
    name: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  {
    providerId: 'anthropic',
    name: 'anthropic', 
    displayName: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
  },
  {
    providerId: 'groq',
    name: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
  },
  {
    providerId: 'ollama',
    name: 'ollama',
    displayName: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'qwen2.5', 'codellama', 'mistral']
  }
]

// GET /api/v1/providers - Get user's providers
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId
    
    // Get existing providers for user
    const existingProviders = await Provider.findByUserId(userId)
    const existingProviderIds = new Set(existingProviders.map(p => p.providerId))
    
    // Initialize default providers if they don't exist
    const missingDefaults = DEFAULT_PROVIDERS.filter(dp => !existingProviderIds.has(dp.providerId))
    
    if (missingDefaults.length > 0) {
      const defaultProviders = missingDefaults.map(dp => ({
        userId,
        ...dp,
        isActive: false
      }))
      
      await Provider.insertMany(defaultProviders)
      
      // Get all providers again
      const allProviders = await Provider.findByUserId(userId)
      return res.json({ success: true, providers: allProviders })
    }
    
    res.json({ success: true, providers: existingProviders })
  } catch (error) {
    console.error('Error fetching providers:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch providers',
      message: error.message 
    })
  }
})

// GET /api/v1/providers/active - Get user's active provider
router.get('/active', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId
    
    const activeProvider = await Provider.findOne({ userId, isActive: true })
    if (!activeProvider) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active provider found' 
      })
    }
    
    res.json({ success: true, provider: activeProvider })
  } catch (error) {
    console.error('Error fetching active provider:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch active provider' 
    })
  }
})

// POST /api/v1/providers - Create or update a provider
router.post('/', validateProvider, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId
    const { 
      providerId, 
      name, 
      displayName, 
      apiKey, 
      baseUrl, 
      models, 
      isActive,
      metadata 
    } = req.body
    
    // Find existing provider or create new one
    let provider = await Provider.findOne({ userId, providerId })
    
    if (provider) {
      // Update existing provider
      provider.name = name || provider.name
      provider.displayName = displayName || provider.displayName
      provider.baseUrl = baseUrl || provider.baseUrl
      provider.models = models || provider.models
      provider.metadata = metadata || provider.metadata
      
      if (apiKey) {
        provider.setApiKey(apiKey)
      }
      
      // Handle active status change
      if (isActive !== undefined) {
        if (isActive) {
          // Deactivate other providers first
          await Provider.updateMany({ userId }, { isActive: false })
        }
        provider.isActive = isActive
      }
    } else {
      // Create new provider
      provider = new Provider({
        userId,
        providerId,
        name,
        displayName,
        baseUrl,
        models: models || [],
        isActive: isActive || false,
        metadata: metadata || {}
      })
      
      if (apiKey) {
        provider.setApiKey(apiKey)
      }
      
      if (isActive) {
        // Deactivate other providers first
        await Provider.updateMany({ userId }, { isActive: false })
      }
    }
    
    await provider.save()
    
    res.json({ 
      success: true, 
      provider: provider.toJSON(),
      message: provider.isModified ? 'Provider updated' : 'Provider created'
    })
  } catch (error) {
    console.error('Error saving provider:', error)
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Provider with this ID already exists for user' 
      })
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save provider',
      message: error.message 
    })
  }
})

// PUT /api/v1/providers/:providerId/activate - Set provider as active
router.put('/:providerId/activate', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId
    const { providerId } = req.params
    
    // Deactivate all providers for user
    await Provider.updateMany({ userId }, { isActive: false })
    
    // Activate the specified provider
    const provider = await Provider.findOneAndUpdate(
      { userId, providerId },
      { isActive: true },
      { new: true }
    )
    
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        error: 'Provider not found' 
      })
    }
    
    res.json({ 
      success: true, 
      provider: provider.toJSON(),
      message: 'Provider activated'
    })
  } catch (error) {
    console.error('Error activating provider:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Failed to activate provider' 
    })
  }
})

// DELETE /api/v1/providers/:providerId - Delete a provider
router.delete('/:providerId', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId
    const { providerId } = req.params
    
    const provider = await Provider.findOneAndDelete({ userId, providerId })
    
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        error: 'Provider not found' 
      })
    }
    
    res.json({ 
      success: true, 
      message: 'Provider deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting provider:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete provider' 
    })
  }
})

// POST /api/v1/providers/:providerId/test - Test provider connection
router.post('/:providerId/test', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId
    const { providerId } = req.params
    
    const provider = await Provider.findUserProviderWithKey(userId, providerId)
    
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        error: 'Provider not found' 
      })
    }
    
    if (!provider.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'No API key configured for provider' 
      })
    }
    
    // Test the API connection
    try {
      const testResponse = await fetch(`${provider.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      })
      
      const isValid = testResponse.ok
      
      res.json({ 
        success: true, 
        valid: isValid,
        statusCode: testResponse.status,
        message: isValid ? 'Provider connection successful' : 'Provider connection failed'
      })
    } catch (testError) {
      res.json({ 
        success: true, 
        valid: false,
        message: 'Provider connection failed',
        error: testError.message
      })
    }
  } catch (error) {
    console.error('Error testing provider:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test provider connection' 
    })
  }
})

// GET /api/v1/providers/:providerId/key - Get provider's API key for execution (internal use)
router.get('/:providerId/key', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId
    const { providerId } = req.params
    
    const provider = await Provider.findUserProviderWithKey(userId, providerId)
    
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        error: 'Provider not found' 
      })
    }
    
    // Only return key for execution purposes - should be limited to server-side calls
    res.json({ 
      success: true, 
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      models: provider.models
    })
  } catch (error) {
    console.error('Error fetching provider key:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch provider key' 
    })
  }
})

export default router