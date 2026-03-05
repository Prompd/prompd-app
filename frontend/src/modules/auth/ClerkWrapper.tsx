import { ClerkProvider, SignedIn, SignedOut, SignInButton, useUser, useAuth } from '@clerk/clerk-react'
import { ReactNode, useEffect, useCallback, useState, createContext, useContext, useRef } from 'react'
import { syncUserOnSignIn, resetUserSyncState } from '../services/apiConfig'
import { localProjectStorage } from '../services/localProjectStorage'

// Import images using Vite's URL import for proper resolution in Electron
import logoImage from '/logo.png?url'
import prompdhubLogoImage from '/prompdhub-logo.png?url'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Detect if running in Electron
export const isElectron = typeof window !== 'undefined' && !!(window as { electronAPI?: unknown }).electronAPI

// Get the electron API if available
function getElectronAPI() {
  if (isElectron) {
    return window.electronAPI!
  }
  return null
}

// Expected Clerk issuer - must match the backend CLERK_FRONTEND_API
// Uses VITE_CLERK_FRONTEND_API (same value as CLERK_FRONTEND_API but Vite-accessible)
const EXPECTED_ISSUER = import.meta.env.VITE_CLERK_FRONTEND_API || 'https://decent-bird-33.clerk.accounts.dev'

// Decode JWT payload without verification (for extracting claims like email)
// SECURITY NOTE: This is only for client-side UX (display, expiration check).
// The backend MUST verify tokens via JWKS - never trust client-side token validation for authorization.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    // Base64url decode
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

// Validate token has expected issuer (defense in depth - backend also validates)
function isTokenFromExpectedIssuer(token: string): boolean {
  const claims = decodeJwtPayload(token)
  if (!claims || typeof claims.iss !== 'string') {
    return false
  }
  return claims.iss === EXPECTED_ISSUER
}

// Check if a JWT token is expired (with buffer time)
function isTokenExpired(token: string, bufferSeconds: number = 60): boolean {
  const claims = decodeJwtPayload(token)
  if (!claims || typeof claims.exp !== 'number') {
    return true // Treat as expired if we can't decode
  }
  const now = Math.floor(Date.now() / 1000)
  return claims.exp < (now + bufferSeconds)
}

// Get token expiration time
function getTokenExpiration(token: string): number | null {
  const claims = decodeJwtPayload(token)
  if (!claims || typeof claims.exp !== 'number') {
    return null
  }
  return claims.exp
}

interface ClerkWrapperProps {
  children: ReactNode
}

interface AuthWrapperProps {
  children: ReactNode
}

// Electron auth context for when Clerk can't be used directly
interface ElectronAuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: { email: string; name?: string } | null
  tokens: { access_token?: string; id_token?: string } | null
  signIn: () => Promise<void>
  signOut: () => void
}

const ElectronAuthContext = createContext<ElectronAuthState | null>(null)

// Hook to use Electron auth
export function useElectronAuth() {
  const context = useContext(ElectronAuthContext)
  return context
}

// Electron-specific auth wrapper
function ElectronAuthWrapper({ children }: AuthWrapperProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null)
  const [tokens, setTokens] = useState<{ access_token?: string; id_token?: string } | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Track if menu has been shown to prevent double calls in React StrictMode
  const menuShownRef = useRef(false)
  // Track processed OAuth codes to prevent double-processing
  const processedCodesRef = useRef<Set<string>>(new Set())

  const electronAPI = getElectronAPI()

  // Handle OAuth callback from protocol URL
  useEffect(() => {
    if (!electronAPI) return

    const handleProtocolUrl = async (url: string) => {
      console.log('[ElectronAuth] Protocol URL received:', url)

      // Check if this is an OAuth callback
      if (url.startsWith('prompd://oauth/callback')) {
        const urlObj = new URL(url)
        const code = urlObj.searchParams.get('code')
        const error = urlObj.searchParams.get('error')

        if (error) {
          console.error('[ElectronAuth] OAuth error:', error)
          setAuthError(error)
          setIsLoading(false)
          return
        }

        if (code) {
          // Prevent double-processing of the same code
          if (processedCodesRef.current.has(code)) {
            console.log('[ElectronAuth] Code already processed, skipping')
            return
          }
          processedCodesRef.current.add(code)

          console.log('[ElectronAuth] Exchanging authorization code...')
          const result = await electronAPI.auth.exchangeCode(code)

          if (result.success && result.tokens) {
            console.log('[ElectronAuth] Token exchange successful')
            const tokenData = result.tokens as { access_token?: string; id_token?: string; userinfo?: { email?: string; name?: string } }

            // SECURITY: Validate token is from expected issuer
            if (tokenData.id_token && !isTokenFromExpectedIssuer(tokenData.id_token)) {
              console.error('[ElectronAuth] SECURITY: Token issuer mismatch - rejecting token')
              setAuthError('Authentication failed: Invalid token source')
              setIsLoading(false)
              return
            }

            // SECURITY: Validate token is not expired
            if (tokenData.id_token && isTokenExpired(tokenData.id_token, 0)) {
              console.error('[ElectronAuth] Token already expired at receipt')
              setAuthError('Authentication failed: Token expired')
              setIsLoading(false)
              return
            }

            setTokens(tokenData)
            setIsAuthenticated(true)
            setSessionExpired(false)

            // Extract user info - try userinfo first, then decode id_token JWT
            let email = tokenData.userinfo?.email
            let name = tokenData.userinfo?.name

            if (!email && tokenData.id_token) {
              const claims = decodeJwtPayload(tokenData.id_token)
              if (claims) {
                console.log('[ElectronAuth] Decoded id_token claims:', Object.keys(claims))
                email = (claims.email as string) || (claims.primary_email_address as string)
                name = name || (claims.name as string)
              }
            }

            if (email) {
              setUser({ email, name })
              console.log('[ElectronAuth] User email extracted:', email)
            } else {
              console.warn('[ElectronAuth] Could not extract email from tokens')
            }

            // Store tokens in localStorage for persistence
            localStorage.setItem('prompd_auth_tokens', JSON.stringify(tokenData))

            // Set user ID for user-scoped localStorage (projects, etc.)
            // Use 'sub' claim from id_token as unique user identifier
            const userId = tokenData.id_token ? (decodeJwtPayload(tokenData.id_token)?.sub as string) : null
            if (userId) {
              localProjectStorage.setCurrentUser(userId)
              console.log('[ElectronAuth] Set user ID for project storage:', userId.slice(0, 8) + '...')
            }

            // Sync user with backend before any other API calls
            // This ensures the user exists in the database
            syncUserOnSignIn(async () => tokenData.id_token || tokenData.access_token || null)

            // Show the application menu now that user is authenticated
            // Use ref to prevent double calls in React StrictMode
            if (!menuShownRef.current) {
              menuShownRef.current = true
              electronAPI.showMenu?.()
            }
          } else {
            console.error('[ElectronAuth] Token exchange failed:', result.error)
            setAuthError(result.error || 'Token exchange failed')
          }
        }

        // Clear the safety-net timeout — callback arrived
        if (oauthTimeoutRef.current) {
          clearTimeout(oauthTimeoutRef.current)
          oauthTimeoutRef.current = null
        }
        setIsLoading(false)
      }
    }

    // Listen for protocol URLs
    electronAPI.onProtocolUrl(handleProtocolUrl)

    // Check for pending protocol URL (if app was opened via deep link)
    electronAPI.getPendingProtocolUrl().then(url => {
      if (url) {
        handleProtocolUrl(url)
      }
    })

    // Check for stored tokens
    const storedTokens = localStorage.getItem('prompd_auth_tokens')
    if (storedTokens) {
      try {
        const parsed = JSON.parse(storedTokens)
        // Require id_token for API authentication - if missing, force re-auth
        // This handles tokens from before we added the 'openid' scope
        if (!parsed.id_token) {
          console.log('[ElectronAuth] Stored tokens missing id_token, clearing for re-auth')
          localStorage.removeItem('prompd_auth_tokens')
        } else if (!isTokenFromExpectedIssuer(parsed.id_token)) {
          // SECURITY: Token from unexpected issuer - clear it
          console.warn('[ElectronAuth] SECURITY: Stored token has unexpected issuer, clearing')
          localStorage.removeItem('prompd_auth_tokens')
        } else if (isTokenExpired(parsed.id_token)) {
          // Token is expired - show session expired screen
          const exp = getTokenExpiration(parsed.id_token)
          console.log('[ElectronAuth] Stored id_token is expired (exp:', exp ? new Date(exp * 1000).toISOString() : 'unknown', ')')

          // Extract user info for display on expired screen
          let email = parsed.userinfo?.email
          if (!email && parsed.id_token) {
            const claims = decodeJwtPayload(parsed.id_token)
            if (claims) {
              email = (claims.email as string) || (claims.primary_email_address as string)
            }
          }
          if (email) {
            setUser({ email })
          }

          setSessionExpired(true)
          localStorage.removeItem('prompd_auth_tokens')
        } else {
          setTokens(parsed)
          setIsAuthenticated(true)
          setSessionExpired(false)

          // Extract user info - try userinfo first, then decode id_token JWT
          let email = parsed.userinfo?.email
          let name = parsed.userinfo?.name

          if (!email && parsed.id_token) {
            const claims = decodeJwtPayload(parsed.id_token)
            if (claims) {
              console.log('[ElectronAuth] Decoded stored id_token claims:', Object.keys(claims))
              email = (claims.email as string) || (claims.primary_email_address as string)
              name = name || (claims.name as string)
            }
          }

          if (email) {
            setUser({ email, name })
            console.log('[ElectronAuth] User email restored:', email)
          }

          // Log token expiration time for debugging
          const exp = getTokenExpiration(parsed.id_token)
          if (exp) {
            const expiresIn = exp - Math.floor(Date.now() / 1000)
            console.log(`[ElectronAuth] Token expires in ${Math.round(expiresIn / 60)} minutes`)
          }

          // Set user ID for user-scoped localStorage (projects, etc.)
          const userId = parsed.id_token ? (decodeJwtPayload(parsed.id_token)?.sub as string) : null
          if (userId) {
            localProjectStorage.setCurrentUser(userId)
            console.log('[ElectronAuth] Restored user ID for project storage:', userId.slice(0, 8) + '...')
          }

          // Sync user with backend (for restored session)
          syncUserOnSignIn(async () => parsed.id_token || parsed.access_token || null)

          // Show the application menu now that user is authenticated
          // Use ref to prevent double calls in React StrictMode
          if (!menuShownRef.current) {
            menuShownRef.current = true
            electronAPI.showMenu?.()
          }
        }
      } catch {
        localStorage.removeItem('prompd_auth_tokens')
      }
    }

    setIsLoading(false)
  }, [electronAPI])

  // Check token expiration periodically and on window focus
  useEffect(() => {
    if (!isAuthenticated || !tokens?.id_token) return

    const checkTokenExpiration = () => {
      if (tokens.id_token && isTokenExpired(tokens.id_token)) {
        console.log('[ElectronAuth] Token expired during session, showing re-auth screen')
        setSessionExpired(true)
        setIsAuthenticated(false)
        localStorage.removeItem('prompd_auth_tokens')
      }
    }

    // Check every minute
    const intervalId = setInterval(checkTokenExpiration, 60 * 1000)

    // Also check on window focus (in case user was away)
    const handleFocus = () => {
      console.log('[ElectronAuth] Window focused, checking token...')
      checkTokenExpiration()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isAuthenticated, tokens])

  const oauthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelOAuth = useCallback(() => {
    if (oauthTimeoutRef.current) {
      clearTimeout(oauthTimeoutRef.current)
      oauthTimeoutRef.current = null
    }
    setIsLoading(false)
    setAuthError(null)
  }, [])

  const signIn = useCallback(async () => {
    if (!electronAPI) return

    setIsLoading(true)
    setAuthError(null)
    setSessionExpired(false) // Clear expired state when re-authenticating

    // Safety-net timeout — 5 minutes should cover account creation
    if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current)
    oauthTimeoutRef.current = setTimeout(() => {
      oauthTimeoutRef.current = null
      setIsLoading(false)
      setAuthError('Authentication timed out. Please try again.')
    }, 5 * 60 * 1000)

    const result = await electronAPI.auth.startOAuth()
    if (!result.success) {
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current)
        oauthTimeoutRef.current = null
      }
      setAuthError(result.error || 'Failed to start OAuth')
      setIsLoading(false)
    }
    // OAuth flow continues in browser, we wait for protocol callback
  }, [electronAPI])

  const signOut = useCallback(() => {
    console.log('[ElectronAuth] signOut called')

    // Notify main process (for logging/cleanup if needed)
    if (electronAPI?.auth?.signOut) {
      electronAPI.auth.signOut(tokens?.id_token)
    }

    // Clear all user-specific state
    setIsAuthenticated(false)
    setUser(null)
    setTokens(null)
    localStorage.removeItem('prompd_auth_tokens')
    resetUserSyncState() // Reset sync state so next sign-in triggers sync

    // Clear user ID from project storage (projects persist, just not accessible until user signs back in)
    localProjectStorage.setCurrentUser(null)
    console.log('[ElectronAuth] Cleared current user from project storage')

    // Clear non-user-scoped localStorage keys (editor state, etc.)
    const keysToRemove = [
      'prompd.editor.text',
      'prompd.params',
      'prompd.registry.cache'
    ]
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key)
      } catch (e) {
        // Ignore
      }
    })
    console.log('[ElectronAuth] Cleared session data')
  }, [electronAPI, tokens])

  const authState: ElectronAuthState = {
    isAuthenticated,
    isLoading,
    user,
    tokens,
    signIn,
    signOut
  }

  // Show loading state - use hardcoded dark colors to prevent flash
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        color: '#ffffff',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #334155',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{ fontSize: '14px', color: '#94a3b8' }}>
          Waiting for authentication...
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Complete sign-in in your browser to continue
        </div>
        <button
          onClick={cancelOAuth}
          style={{
            marginTop: '8px',
            padding: '6px 20px',
            background: 'transparent',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#94a3b8',
            fontSize: '13px',
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#475569'
            e.currentTarget.style.color = '#cbd5e1'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#334155'
            e.currentTarget.style.color = '#94a3b8'
          }}
        >
          Cancel
        </button>
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `
        }} />
      </div>
    )
  }

  // Show session expired screen
  if (sessionExpired && !isAuthenticated) {
    return (
      <ElectronAuthContext.Provider value={authState}>
        <LoginScreen
          title="Session Expired"
          subtitle={user?.email ? (
            <>Your session for <strong style={{ color: '#ffffff' }}>{user.email}</strong> has expired.</>
          ) : (
            'Your session has expired.'
          )}
          buttonText="Sign In Again"
          onSignIn={signIn}
          authError={authError}
          showFeatures={false}
        />
      </ElectronAuthContext.Provider>
    )
  }

  // Show sign-in screen if not authenticated
  if (!isAuthenticated) {
    return (
      <ElectronAuthContext.Provider value={authState}>
        <LoginScreen
          title="Welcome to Prompd"
          subtitle="A professional desktop IDE for building AI workflows. Create composable prompts, design visual workflows, and execute them locally with full Monaco editor support."
          buttonText="Sign In to Get Started"
          onSignIn={signIn}
          authError={authError}
          showFeatures={true}
        />
      </ElectronAuthContext.Provider>
    )
  }

  // Authenticated - render children with auth context
  return (
    <ElectronAuthContext.Provider value={authState}>
      {children}
    </ElectronAuthContext.Provider>
  )
}

// Simple auth wrapper that shows sign-in when not authenticated (for web)
function WebAuthWrapper({ children }: AuthWrapperProps) {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { user } = useUser()

  // Sync user with backend when signed in
  useEffect(() => {
    if (isSignedIn && user) {
      console.log('User authenticated:', user.emailAddresses[0]?.emailAddress)

      // Set user ID for user-scoped localStorage (projects, etc.)
      // Use Clerk user ID as unique identifier
      if (user.id) {
        localProjectStorage.setCurrentUser(user.id)
        console.log('[WebAuth] Set user ID for project storage:', user.id.slice(0, 8) + '...')
      }

      // Sync user with backend
      syncUserOnSignIn(async () => {
        try {
          return await getToken()
        } catch {
          return null
        }
      })
    } else if (!isSignedIn && isLoaded) {
      // User signed out
      resetUserSyncState()
      localProjectStorage.setCurrentUser(null)
      console.log('[WebAuth] Cleared current user from project storage')
    }
  }, [isSignedIn, isLoaded, user, getToken])

  // Show loading state while checking authentication - use hardcoded dark colors to prevent flash
  if (!isLoaded) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        color: '#ffffff',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #334155',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{ fontSize: '14px', color: '#94a3b8' }}>
          Loading...
        </div>
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `
        }} />
      </div>
    )
  }

  return (
    <>
      <SignedIn>
        {children}
      </SignedIn>
      <SignedOut>
        <LoginScreen
          title="Welcome to Prompd"
          subtitle="A professional desktop IDE for building AI workflows. Create composable prompts, design visual workflows, and execute them locally with full Monaco editor support."
          buttonText="Sign In to Get Started"
          showFeatures={true}
        >
          <SignInButton mode="modal">
            <button
              style={{
                padding: '14px 40px',
                fontSize: '15px',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #0294fe 0%, #0066cc 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(2, 148, 254, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(2, 148, 254, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(2, 148, 254, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Sign In to Get Started
            </button>
          </SignInButton>
        </LoginScreen>
      </SignedOut>
    </>
  )
}

// Prompd Logo component - uses logo.png from public folder
function PrompdLogo({ size = 64, showText = false }: { size?: number; showText?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: size * 0.25
    }}>
      <img
        src={logoImage}
        alt="Prompd"
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
      />
      {showText && (
        <span style={{
          fontSize: size * 0.5,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Prompd
        </span>
      )}
    </div>
  )
}

// Feature icons as SVG components
function WorkflowIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M10 6.5h4"/>
      <path d="M10 17.5h4"/>
      <path d="M17.5 10v4"/>
      <path d="M6.5 10v4"/>
    </svg>
  )
}

function EditorIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
      <path d="m15 5 3 3"/>
    </svg>
  )
}

function RegistryIcon() {
  // PrompdHub logo - use the actual logo image
  return (
    <img
      src={prompdhubLogoImage}
      alt="PrompdHub"
      width={24}
      height={24}
      style={{ objectFit: 'contain' }}
    />
  )
}

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  gradient: string
}

function FeatureCard({ icon, title, description, gradient }: FeatureCardProps) {
  return (
    <div style={{
      padding: '20px',
      background: 'rgba(255, 255, 255, 0.03)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      textAlign: 'center',
      transition: 'all 0.3s ease',
      cursor: 'default'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
      e.currentTarget.style.borderColor = 'rgba(2, 148, 254, 0.3)'
      e.currentTarget.style.transform = 'translateY(-2px)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
      e.currentTarget.style.transform = 'translateY(0)'
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        margin: '0 auto 12px',
        background: gradient,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
      }}>{icon}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: '#ffffff' }}>
        {title}
      </div>
      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.5' }}>
        {description}
      </div>
    </div>
  )
}

// Shared Login Screen component used by both Electron and Web auth
interface LoginScreenProps {
  title: string
  subtitle: React.ReactNode
  buttonText: string
  onSignIn?: () => void
  authError?: string | null
  showFeatures?: boolean
  children?: React.ReactNode // For custom button (SignInButton wrapper)
}

function LoginScreen({ title, subtitle, buttonText, onSignIn, authError, showFeatures = true, children }: LoginScreenProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#ffffff',
      padding: '40px 24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute',
        top: '-20%',
        right: '-10%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(2, 148, 254, 0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-30%',
        left: '-15%',
        width: '800px',
        height: '800px',
        background: 'radial-gradient(circle, rgba(2, 148, 254, 0.05) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />

      {/* Main content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '32px',
        maxWidth: '480px',
        width: '100%',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Logo */}
        <PrompdLogo size={80} showText />

        {/* Title and subtitle */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            margin: '0 0 16px 0',
            fontSize: '32px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {title}
          </h1>
          <p style={{
            margin: 0,
            fontSize: '15px',
            lineHeight: '1.7',
            color: 'rgba(255, 255, 255, 0.7)',
            maxWidth: '400px'
          }}>
            {subtitle}
          </p>
        </div>

        {/* Error message */}
        {authError && (
          <div style={{
            padding: '14px 20px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            color: '#f87171',
            fontSize: '13px',
            width: '100%',
            textAlign: 'center'
          }}>
            {authError}
          </div>
        )}

        {/* Sign in button */}
        {children || (
          <button
            onClick={onSignIn}
            style={{
              padding: '14px 40px',
              fontSize: '15px',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #0294fe 0%, #0066cc 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(2, 148, 254, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(2, 148, 254, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(2, 148, 254, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            {buttonText}
          </button>
        )}
        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '-16px' }}>
          Secure authentication via browser
        </p>

        {/* Features section */}
        {showFeatures && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            width: '100%',
            marginTop: '16px'
          }}>
            <FeatureCard
              icon={<WorkflowIcon />}
              title="Visual Workflows"
              description="Build complex AI workflows with 20+ node types and drag-and-drop"
              gradient="linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
            />
            <FeatureCard
              icon={<EditorIcon />}
              title="Monaco Editor"
              description="Professional code editor with IntelliSense and live preview"
              gradient="linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
            />
            <FeatureCard
              icon={<RegistryIcon />}
              title="PrompdHub"
              description="Discover and share community prompts and workflows"
              gradient="linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
            />
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.4)',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          gap: '16px'
        }}>
          <a
            href="https://prompd.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'rgba(255, 255, 255, 0.5)',
              textDecoration: 'none',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'}
          >
            prompd.io
          </a>
          <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>|</span>
          <a
            href="https://prompdhub.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'rgba(255, 255, 255, 0.5)',
              textDecoration: 'none',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'}
          >
            prompdhub.ai
          </a>
        </div>
      </div>

      {/* CSS animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `
      }} />
    </div>
  )
}

export default function ClerkWrapper({ children }: ClerkWrapperProps) {
  // In Electron, use custom OAuth flow
  if (isElectron) {
    console.log('[ClerkWrapper] Running in Electron mode - using OAuth flow')
    return <ElectronAuthWrapper>{children}</ElectronAuthWrapper>
  }

  // In web browser, use standard Clerk
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--error)',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h1>Configuration Error</h1>
        <p>Missing VITE_CLERK_PUBLISHABLE_KEY environment variable</p>
        <p style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', maxWidth: '400px' }}>
          Please add your Clerk publishable key to .env file:
          <br />
          <code style={{ background: 'var(--panel)', padding: '4px 8px', borderRadius: '4px', marginTop: '8px', display: 'inline-block' }}>
            VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
          </code>
        </p>
      </div>
    )
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={{
        variables: {
          colorPrimary: '#667eea',
          colorBackground: '#1e1e1e',
          colorInputBackground: '#252526',
          colorText: '#cccccc',
          colorTextSecondary: '#858585',
        },
        elements: {
          rootBox: {
            fontFamily: 'Inter, system-ui, Arial, sans-serif'
          },
          card: {
            background: '#1e1e1e',
            borderColor: '#3e3e42'
          }
        }
      }}
    >
      <WebAuthWrapper>
        {children}
      </WebAuthWrapper>
    </ClerkProvider>
  )
}

// Hook for Clerk-based auth (web only)
function useClerkAuth() {
  const { user, isLoaded } = useUser()
  const { getToken: clerkGetToken } = useAuth()

  const getToken = useCallback(async () => {
    try {
      const token = await clerkGetToken()
      console.log('[ClerkWrapper] getToken called, token available:', !!token)
      return token
    } catch (error) {
      console.error('[ClerkWrapper] Failed to get token from Clerk:', error)
      return null
    }
  }, [clerkGetToken])

  return {
    user,
    isLoaded,
    isAuthenticated: !!user,
    email: user?.emailAddresses[0]?.emailAddress,
    getToken
  }
}

// Export hook for getting auth state in components
// IMPORTANT: This must be used differently in Electron vs Web
export function useAuthenticatedUser() {
  const electronAuth = useElectronAuth()

  // In Electron mode, we MUST use electron auth context
  // Clerk hooks are not available
  if (isElectron) {
    if (!electronAuth) {
      // This shouldn't happen if used within ElectronAuthWrapper
      console.warn('[useAuthenticatedUser] Electron auth context not available')
      return {
        user: null,
        isLoaded: false,
        isAuthenticated: false,
        email: undefined,
        getToken: async () => null
      }
    }
    return {
      user: electronAuth.user ? { emailAddresses: [{ emailAddress: electronAuth.user.email }] } : null,
      isLoaded: !electronAuth.isLoading,
      isAuthenticated: electronAuth.isAuthenticated,
      email: electronAuth.user?.email,
      // Use id_token for API authentication - it's a proper Clerk JWT that can be verified via JWKS
      // The access_token from OAuth is NOT the same format as Clerk session JWTs
      getToken: async () => electronAuth.tokens?.id_token || electronAuth.tokens?.access_token || null
    }
  }

  // Web mode - use Clerk hooks (this is safe because we're inside ClerkProvider)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkAuth()
}
