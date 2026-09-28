import { User } from '../models/User.js'
import { normalizePlan, PLANS } from '../config/plans.js'
import { verifyClerkToken } from '../services/strictClerk.js'

const REGISTRY_URL = process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'

/* Token verification lives in services/strictClerk.js (issuer, RS256, azp).
 * It is awaited so a throw in the user lookup below reaches this middleware's
 * catch and answers 500, instead of escaping a jwt.verify callback as an
 * unhandled rejection. */

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

    let decoded
    try {
      decoded = await verifyClerkToken(token)
    } catch (err) {
      console.error('[ClerkAuth] JWT verification failed:', err?.name, err?.message)
      if (err?.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        })
      }
      if (err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        })
      }
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
          // The registry returns a plan ID (free_plan / team_plan / ...); normalize
          // it at this boundary so no raw id ever reaches the quota layer.
          registryPlan = normalizePlan(planData.currentPlan?.name)
        }
      } catch (error) {
        console.warn('Failed to fetch user from registry:', error.message)
      }

      // Extract username and email
      // Clerk JWT may contain email in various claims depending on configuration
      const username = registryUser?.handle || decoded.o?.slg || `user_${clerkUserId.slice(-8)}`
      const email = registryUser?.email || decoded.email || decoded.primary_email_address || decoded.email_addresses?.[0] || `${clerkUserId}@clerk.user`
      const plan = registryPlan

      // Set features based on plan. Keyed by CANONICAL name only -- `plan` came
      // through normalizePlan above, so the old duplicate `*_plan` keys (which
      // existed to paper over the registry-id mismatch) are no longer needed.
      const features = {
        [PLANS.FREE]: { maxProjects: 10, maxCollaborators: 0, privatePackages: false, prioritySupport: false },
        [PLANS.PRO]: { maxProjects: 100, maxCollaborators: 5, privatePackages: true, prioritySupport: false },
        [PLANS.TEAM]: { maxProjects: 500, maxCollaborators: 20, privatePackages: true, prioritySupport: true },
        [PLANS.ENTERPRISE]: { maxProjects: 999999, maxCollaborators: 999999, privatePackages: true, prioritySupport: true },
        [PLANS.ADMIN]: { maxProjects: 999999, maxCollaborators: 999999, privatePackages: true, prioritySupport: true }
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
  } catch (error) {
    console.error('Clerk authentication error:', error?.message)
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
