import { User } from '../models/User.js'
import { normalizePlan } from '../config/plans.js'
import { verifyClerkToken } from '../services/strictClerk.js'
import { isAdminUserId } from './adminIds.js'

const REGISTRY_URL = process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'

/* Token verification lives in services/strictClerk.js: issuer pinned to
 * CLERK_FRONTEND_API, RS256 only, azp checked against CLERK_AUTHORIZED_PARTIES.
 * Verification is awaited (not a jwt.verify callback) so a throw in the user
 * lookup below lands in this middleware's catch instead of escaping as an
 * unhandled rejection. */

/** Map a verification failure to the 401 body the clients already handle. */
function verifyFailure(err) {
  if (err?.name === 'TokenExpiredError') {
    return { success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' }
  }
  if (err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
    return { success: false, error: 'Invalid token', code: 'INVALID_TOKEN' }
  }
  return { success: false, error: 'Authentication failed', code: 'AUTH_ERROR' }
}

/**
 * Authentication middleware for protected routes
 */
export const auth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      console.log('[Auth] No token provided')
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    let decoded
    try {
      decoded = await verifyClerkToken(token)
    } catch (err) {
      console.error('[Auth] JWT verification failed:', err?.name, err?.message)
      return res.status(401).json(verifyFailure(err))
    }

    console.log('[Auth] JWT verified, user ID:', decoded.sub)
    
    // Get user from database using Clerk User ID (from 'sub' claim)
    let user = await User.findOne({ clerkUserId: decoded.sub })

    if (!user) {
      // Auto-create user from Clerk token + registry data
      let registryUser = null
      let registryPlan = 'free'

      try {
        // Fetch user info from registry
        const userResponse = await fetch(`${REGISTRY_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (userResponse.ok) {
          registryUser = await userResponse.json()
        }

        // Fetch plan info from registry
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
      const username = registryUser?.handle || decoded.o?.slg || `user_${decoded.sub.slice(-8)}`
      const email = registryUser?.email || decoded.email || decoded.primary_email_address || decoded.email_addresses?.[0] || `${decoded.sub}@clerk.user`
      const plan = registryPlan

      // Set features based on plan
      const features = {
        free: { maxProjects: 10, maxCollaborators: 0, privatePackages: false, prioritySupport: false },
        pro: { maxProjects: 100, maxCollaborators: 5, privatePackages: true, prioritySupport: false },
        team: { maxProjects: 500, maxCollaborators: 20, privatePackages: true, prioritySupport: true },
        enterprise: { maxProjects: 999999, maxCollaborators: 999999, privatePackages: true, prioritySupport: true },
        admin: { maxProjects: 999999, maxCollaborators: 999999, privatePackages: true, prioritySupport: true }
      }

      // Create new user
      user = new User({
        clerkUserId: decoded.sub,
        username,
        email,
        password: undefined, // No password for Clerk users
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
        // Initialize AI features with default quotas
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
          llmProviders: {
            anthropic: { hasKey: false },
            openai: { hasKey: false }
          },
          history: {
            totalGenerations: 0,
            totalExecutions: 0
          }
        }
      })
      await user.save()
      console.log('Created new user from Clerk:', decoded.sub)
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
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        error: 'Account is suspended',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // Add user to request object
    req.user = user; // Attach the full user object
    req.auth = { userId: decoded.sub }; // Keep req.auth for Clerk consistency

    next();
  } catch (error) {
    console.error('Authentication error:', error?.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Extract token from request
 */
function extractToken(req) {
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  if (req.query.token) {
    return req.query.token
  }
  return null
}

/**
 * Optional authentication - doesn't fail if no token present
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req)

    if (!token) {
      // No token, continue without authentication
      return next()
    }

    // Attempt to verify and load user. A token that fails strict
    // verification is treated as no token at all.
    let decoded = null
    try {
      decoded = await verifyClerkToken(token)
    } catch {
      decoded = null
    }
    if (decoded?.sub) {
      const user = await User.findOne({ clerkUserId: decoded.sub })
      if (user && user.isActive && !user.isSuspended) {
        req.user = user
        req.auth = { userId: decoded.sub }
      }
    }
    return next()
  } catch (error) {
    // On any error, just continue without authentication
    next()
  }
}

/**
 * Alias for auth middleware - requires authentication
 */
export const requireAuth = auth

/**
 * Operator-only routes. Admin is membership of ADMIN_USER_IDS, checked against
 * the VERIFIED token's sub -- not a billing plan and not an email substring.
 * The previous rule admitted every enterprise-plan customer, and anyone whose
 * email contained '@prompd.io' or '@logikbug.com', to routes that read other
 * people's error reports. An unset ADMIN_USER_IDS admits nobody.
 */
export const requireAdmin = async (req, res, next) => {
  auth(req, res, (err) => {
    if (err) {
      return next(err)
    }

    const sub = req.auth?.userId
    if (!isAdminUserId(sub)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      })
    }

    next()
  })
}
