import express from 'express'
import { clerkAuth } from '../middleware/clerkAuth.js'

const router = express.Router()

/**
 * POST /api/auth/sync
 * Sync user on sign-in - ensures user exists before other authenticated requests
 * This should be called ONCE when the user signs in, before any other API calls
 * The clerkAuth middleware handles user creation via atomic upsert
 */
router.post('/sync', clerkAuth, async (req, res) => {
  try {
    // clerkAuth middleware already created/updated the user
    // Just return success with basic user info
    res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
        plan: req.user.subscription?.plan || 'free'
      }
    })
  } catch (error) {
    console.error('User sync error:', error)
    res.status(500).json({ error: 'Sync failed', message: error.message })
  }
})

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', clerkAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
        plan: req.user.subscription?.plan || 'free',
        profile: req.user.profile
      }
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to get user', message: error.message })
  }
})

/**
 * POST /api/auth/signout
 * Revoke user's Clerk session(s) using Backend API
 * This provides proper Single Log-Out (SLO) for OAuth-based auth
 */
router.post('/signout', clerkAuth, async (req, res) => {
  console.log('[Auth] Signout endpoint called for user:', req.user?.email)

  try {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY
    if (!clerkSecretKey) {
      console.warn('[Auth] CLERK_SECRET_KEY not configured, skipping session revocation')
      return res.json({ success: true, message: 'Local signout only (no secret key)' })
    }

    const clerkUserId = req.user.clerkUserId
    console.log('[Auth] Clerk user ID:', clerkUserId)

    if (!clerkUserId) {
      return res.json({ success: true, message: 'No Clerk user ID' })
    }

    // Fetch active sessions for this user from Clerk Backend API
    console.log('[Auth] Fetching active sessions from Clerk API...')
    const sessionsResponse = await fetch(
      `https://api.clerk.com/v1/sessions?user_id=${clerkUserId}&status=active`,
      {
        headers: {
          'Authorization': `Bearer ${clerkSecretKey}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!sessionsResponse.ok) {
      const errorText = await sessionsResponse.text()
      console.warn('[Auth] Failed to fetch sessions:', sessionsResponse.status, errorText)
      return res.json({ success: true, message: 'Could not fetch sessions' })
    }

    const sessions = await sessionsResponse.json()
    console.log(`[Auth] Found ${sessions.data?.length || 0} active sessions for user ${clerkUserId}`)

    // Revoke all active sessions
    const revokePromises = (sessions.data || []).map(async (session) => {
      try {
        const revokeResponse = await fetch(
          `https://api.clerk.com/v1/sessions/${session.id}/revoke`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${clerkSecretKey}`,
              'Content-Type': 'application/json'
            }
          }
        )
        if (revokeResponse.ok) {
          console.log(`[Auth] Revoked session ${session.id}`)
        } else {
          console.warn(`[Auth] Failed to revoke session ${session.id}:`, revokeResponse.status)
        }
      } catch (err) {
        console.warn(`[Auth] Error revoking session ${session.id}:`, err.message)
      }
    })

    await Promise.all(revokePromises)

    res.json({
      success: true,
      message: `Revoked ${sessions.data?.length || 0} sessions`
    })
  } catch (error) {
    console.error('[Auth] Sign-out error:', error)
    // Still return success - local session clear happens regardless
    res.json({ success: true, message: 'Signout completed with errors' })
  }
})

export default router
