import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { User } from '../models/User.js'

const REGISTRY_URL = process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'

// JWKS client for verifying Clerk JWT signatures
// Extract Clerk frontend API from secret key or use env variable
const CLERK_FRONTEND_API = process.env.CLERK_FRONTEND_API || 'decent-bird-33.clerk.accounts.dev'

console.log('[ClerkAuth] Environment check - CLERK_FRONTEND_API from env:', process.env.CLERK_FRONTEND_API)
console.log('[ClerkAuth] Using CLERK_FRONTEND_API:', CLERK_FRONTEND_API)

const client = jwksClient({
  jwksUri: `https://${CLERK_FRONTEND_API}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
})

console.log('[ClerkAuth] Using Clerk JWKS URI:', `https://${CLERK_FRONTEND_API}/.well-known/jwks.json`)

/**
 * Get signing key for JWT verification
 */
function getKey(header, callback) {
  console.log('[ClerkAuth] Looking up signing key for kid:', header.kid)
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
      console.error('[ClerkAuth] Failed to get signing key:', err.message)
      return callback(err)
    }
    const signingKey = key.publicKey || key.rsaPublicKey
    console.log('[ClerkAuth] Found signing key, length:', signingKey?.length || 0)
    callback(null, signingKey)
  })
}

/**
 * Clerk authentication middleware
 * Verifies Clerk JWT tokens and creates/updates users
 */
export const clerkAuth = async (req, res, next) => {
  try {
    const token = extractToken(req)

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'NO_TOKEN'
      })
    }

    // Verify JWT token using Clerk's public key (SECURE!)
    console.log('[ClerkAuth] Verifying token, first 50 chars:', token.substring(0, 50) + '...')

    // Debug: Decode token header to see key info
    try {
      const [headerB64] = token.split('.')
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
      console.log('[ClerkAuth] Token header:', JSON.stringify(header))
    } catch (e) {
      console.log('[ClerkAuth] Could not decode token header:', e.message)
    }

    jwt.verify(token, getKey, {}, async (err, decoded) => {
      if (err) {
        console.error('[ClerkAuth] JWT verification failed:', err.name, err.message)
        if (err.name === 'JsonWebTokenError') {
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
          })
        }
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED'
          })
        }
        console.error('JWT verification error:', err)
        return res.status(500).json({
          success: false,
          error: 'Authentication failed',
          code: 'AUTH_ERROR'
        })
      }

      if (!decoded || !decoded.sub) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token format',
          code: 'INVALID_TOKEN'
        })
      }

      // Clerk user ID is in the 'sub' claim
      const clerkUserId = decoded.sub

    // Find or create user in our database using atomic upsert to prevent race conditions
    let user = await User.findOne({ clerkUserId })
    let isNewUser = false

    if (!user) {
      // Debug: Log JWT claims to see what's available
      console.log('[ClerkAuth] Creating new user. JWT claims:', JSON.stringify({
        sub: decoded.sub,
        email: decoded.email,
        primary_email_address: decoded.primary_email_address,
        email_addresses: decoded.email_addresses,
        // Log all top-level keys to see what's available
        keys: Object.keys(decoded)
      }, null, 2))

      // Fetch user info and plan from registry
      let registryUser = null
      let registryPlan = 'free'

      try {
        // Fetch user info
        const userResponse = await fetch(`${REGISTRY_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (userResponse.ok) {
          registryUser = await userResponse.json()
        }

        // Fetch plan info
        const planResponse = await fetch(`${REGISTRY_URL}/user/plan`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (planResponse.ok) {
          const planData = await planResponse.json()
          registryPlan = planData.currentPlan?.name || 'free'
        }
      } catch (error) {
        console.warn('Failed to fetch user from registry:', error.message)
      }

      // Extract username and email
      // Clerk JWT may contain email in various claims depending on configuration
      const username = registryUser?.handle || decoded.o?.slg || `user_${clerkUserId.slice(-8)}`
      const email = registryUser?.email || decoded.email || decoded.primary_email_address || decoded.email_addresses?.[0] || `${clerkUserId}@clerk.user`
      const plan = registryPlan

      // Set features based on plan
      const features = {
        free: { maxProjects: 10, maxCollaborators: 0, privatePackages: false, prioritySupport: false },
        free_plan: { maxProjects: 10, maxCollaborators: 0, privatePackages: false, prioritySupport: false },
        pro: { maxProjects: 100, maxCollaborators: 5, privatePackages: true, prioritySupport: false },
        pro_plan: { maxProjects: 100, maxCollaborators: 5, privatePackages: true, prioritySupport: false },
        team: { maxProjects: 500, maxCollaborators: 20, privatePackages: true, prioritySupport: true },
        team_plan: { maxProjects: 500, maxCollaborators: 20, privatePackages: true, prioritySupport: true },
        enterprise: { maxProjects: 999999, maxCollaborators: 999999, privatePackages: true, prioritySupport: true },
        admin: { maxProjects: 999999, maxCollaborators: 999999, privatePackages: true, prioritySupport: true }
      }

      // Use findOneAndUpdate with upsert to atomically create user (prevents race condition)
      const result = await User.findOneAndUpdate(
        { clerkUserId },
        {
          $setOnInsert: {
            clerkUserId,
            username,
            email,
            profile: {
              firstName: registryUser?.name?.split(' ')[0] || '',
              lastName: registryUser?.name?.split(' ').slice(1).join(' ') || '',
              avatarUrl: registryUser?.avatarUrl || ''
            },
            isActive: true,
            subscription: {
              plan,
              status: 'active',
              features: features[plan] || features.free
            },
            aiFeatures: {
              generations: {
                used: 0,
                limit: 5,
                resetAt: null
              },
              executions: {
                used: 0,
                limit: 10,
                resetAt: null
              },
              llmProviders: new Map([
                ['anthropic', { hasKey: false }],
                ['openai', { hasKey: false }]
              ]),
              history: {
                totalGenerations: 0,
                totalExecutions: 0
              }
            }
          },
          $set: {
            lastActivityAt: new Date()
          }
        },
        { upsert: true, new: true }
      )
      user = result
      isNewUser = !result.lastActivityAt || (new Date() - result.createdAt < 5000) // Created within last 5 seconds
      if (isNewUser) {
        console.log('Created new user from Clerk:', clerkUserId)
      }
    } else {
      // Update last activity
      user.lastActivityAt = new Date()
      await user.save()
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is inactive',
        code: 'ACCOUNT_INACTIVE'
      })
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        error: 'Account is suspended',
        code: 'ACCOUNT_SUSPENDED'
      })
    }

      // Add full user object to request for quota middleware
      req.user = user
      req.auth = { userId: decoded.sub } // Keep for Clerk consistency

      next()
    })
  } catch (error) {
    console.error('Clerk authentication error:', error)
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    })
  }
}

/**
 * Extract token from request
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Check query parameter (for WebSocket connections)
  if (req.query.token) {
    return req.query.token
  }

  return null
}
