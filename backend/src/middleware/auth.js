import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { User } from '../models/User.js'

const REGISTRY_URL = process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'

// JWKS client for verifying Clerk JWT signatures
// Extract Clerk frontend API from secret key or use env variable
const CLERK_FRONTEND_API = process.env.CLERK_FRONTEND_API || 'decent-bird-33.clerk.accounts.dev'

const client = jwksClient({
  jwksUri: `https://${CLERK_FRONTEND_API}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
})

console.log('[Auth] Using Clerk JWKS URI:', `https://${CLERK_FRONTEND_API}/.well-known/jwks.json`)

/**
 * Get signing key for JWT verification
 */
function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
      return callback(err)
    }
    const signingKey = key.publicKey || key.rsaPublicKey
    callback(null, signingKey)
  })
}

/**
 * Authentication middleware for protected routes
 */
export const auth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    console.log('[Auth] Token extraction:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN')

    if (!token) {
      console.log('[Auth] ❌ No token provided')
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    console.log('[Auth] Verifying JWT token...')
    // Verify JWT token using Clerk's public key
    jwt.verify(token, getKey, {}, async (err, decoded) => {
      if (err) {
        console.error('[Auth] ❌ JWT verification failed:', err.name, err.message)
        if (err.name === 'JsonWebTokenError') {
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
          });
        }
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED'
          });
        }
        console.error('[Auth] ❌ Unhandled JWT error:', err)
        return res.status(401).json({
          success: false,
          error: 'Authentication failed',
          code: 'AUTH_ERROR'
        });
      }

      console.log('[Auth] ✅ JWT verified, user ID:', decoded?.sub)
      
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
            registryPlan = planData.currentPlan?.name || 'free'
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
    });
  } catch (error) {
    console.error('Authentication error:', error);
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
  console.log('[Auth] Authorization header:', authHeader ? `${authHeader.substring(0, 20)}...` : 'MISSING')

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

    // Attempt to verify and load user
    jwt.verify(token, getKey, {}, async (err, decoded) => {
      if (!err && decoded?.sub) {
        const user = await User.findOne({ clerkUserId: decoded.sub })
        if (user && user.isActive && !user.isSuspended) {
          req.user = user
          req.auth = { userId: decoded.sub }
        }
      }
      next()
    })
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
 * Admin authentication middleware - requires user to be admin
 */
export const requireAdmin = async (req, res, next) => {
  // First run the auth middleware
  auth(req, res, (err) => {
    if (err) {
      return next(err)
    }

    // Check if user is admin
    const isAdmin = req.user?.subscription?.plan === 'admin' ||
                    req.user?.subscription?.plan === 'enterprise' ||
                    req.user?.email?.includes('@prompd.io') ||
                    req.user?.email?.includes('@logikbug.com')

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      })
    }

    next()
  })
}
