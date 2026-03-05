/**
 * JWT input component for jwt-type parameters
 * Accepts a JWT string and displays decoded header, payload, and signature
 * with color-coded sections matching jwt.io styling conventions
 */

import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, AlertTriangle, Shield } from 'lucide-react'
import type { ParameterInputProps } from '../utils/types'

interface JwtInputProps extends ParameterInputProps<string | undefined> {
  /** Whether to show decoded sections expanded by default */
  defaultExpanded?: boolean
}

interface DecodedJwt {
  header: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  signature: string
  headerRaw: string
  payloadRaw: string
  isValid: boolean
  error?: string
}

/** Base64url decode (JWT uses URL-safe base64 without padding) */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  // Convert base64url to standard base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return atob(base64)
  } catch {
    return ''
  }
}

/** Parse a JWT string into its decoded parts */
function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return {
      header: null,
      payload: null,
      signature: '',
      headerRaw: '',
      payloadRaw: '',
      isValid: false,
      error: `Invalid JWT structure: expected 3 parts, got ${parts.length}`,
    }
  }

  const [headerB64, payloadB64, signature] = parts

  let header: Record<string, unknown> | null = null
  let payload: Record<string, unknown> | null = null
  let error: string | undefined

  try {
    const headerJson = base64UrlDecode(headerB64)
    header = JSON.parse(headerJson)
  } catch {
    error = 'Failed to decode JWT header'
  }

  try {
    const payloadJson = base64UrlDecode(payloadB64)
    payload = JSON.parse(payloadJson)
  } catch {
    if (!error) error = 'Failed to decode JWT payload'
  }

  return {
    header,
    payload,
    signature,
    headerRaw: headerB64,
    payloadRaw: payloadB64,
    isValid: !error,
    error,
  }
}

/** Format a JWT claim value for display */
function formatClaimValue(key: string, value: unknown): string {
  // Timestamp claims - show human-readable date
  if ((key === 'exp' || key === 'iat' || key === 'nbf') && typeof value === 'number') {
    const date = new Date(value * 1000)
    const now = Date.now()
    const isExpired = key === 'exp' && value * 1000 < now
    const formatted = date.toLocaleString()
    if (key === 'exp') return `${formatted}${isExpired ? ' (EXPIRED)' : ''}`
    return formatted
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return String(value)
}

/** Standard JWT claim labels */
const CLAIM_LABELS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expiration',
  nbf: 'Not Before',
  iat: 'Issued At',
  jti: 'JWT ID',
  typ: 'Type',
  alg: 'Algorithm',
  kid: 'Key ID',
}

export function JwtInput({
  value,
  onChange,
  disabled = false,
  error: externalError,
  className,
  defaultExpanded = true,
}: JwtInputProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const decoded = useMemo<DecodedJwt | null>(() => {
    if (!value?.trim()) return null
    return decodeJwt(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue || undefined)
  }

  // Check if token is expired
  const isExpired = useMemo(() => {
    if (!decoded?.payload) return false
    const exp = decoded.payload.exp
    if (typeof exp === 'number') {
      return exp * 1000 < Date.now()
    }
    return false
  }, [decoded])

  const error = externalError || decoded?.error

  return (
    <div className={clsx('prompd-jwt-input', className)}>
      {/* Raw JWT input - color-coded segments */}
      <div className="mb-2">
        {value?.trim() && decoded?.isValid ? (
          /* Color-coded JWT display */
          <div
            onClick={() => !disabled && document.getElementById('jwt-raw-input')?.focus()}
            className={clsx(
              'px-3 py-2 rounded-md border font-mono text-xs break-all cursor-text',
              'bg-white dark:bg-slate-900',
              error
                ? 'border-red-500'
                : 'border-slate-300 dark:border-slate-600'
            )}
          >
            <span style={{ color: '#fb015b' }}>{decoded.headerRaw}</span>
            <span className="text-slate-400">.</span>
            <span style={{ color: '#d63aff' }}>{decoded.payloadRaw}</span>
            <span className="text-slate-400">.</span>
            <span style={{ color: '#00b9f1' }}>{decoded.signature}</span>
          </div>
        ) : (
          /* Plain textarea when empty or invalid */
          <textarea
            id="jwt-raw-input"
            value={value ?? ''}
            onChange={handleChange}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
            disabled={disabled}
            rows={3}
            spellCheck={false}
            className={clsx(
              'w-full px-3 py-2 text-xs rounded-md transition-colors resize-y',
              'bg-white dark:bg-slate-900',
              'border',
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400',
              'text-slate-800 dark:text-slate-200',
              'placeholder:text-slate-400 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-opacity-50',
              'font-mono break-all',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />
        )}

        {/* Edit button for color-coded display */}
        {value?.trim() && decoded?.isValid && !disabled && (
          <textarea
            id="jwt-raw-input"
            value={value ?? ''}
            onChange={handleChange}
            rows={2}
            spellCheck={false}
            className={clsx(
              'w-full mt-1 px-3 py-1.5 text-[10px] rounded-md',
              'bg-slate-50 dark:bg-slate-950',
              'border border-slate-200 dark:border-slate-700',
              'text-slate-600 dark:text-slate-400',
              'focus:outline-none focus:ring-1 focus:ring-blue-500',
              'font-mono break-all resize-y'
            )}
          />
        )}
      </div>

      {error && !decoded?.isValid && (
        <p className="mb-2 text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle size={12} />
          {error}
        </p>
      )}

      {/* Decoded sections */}
      {decoded?.isValid && (
        <div className="space-y-2">
          {/* Toggle header */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={clsx(
              'w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors',
              'text-slate-600 dark:text-slate-400',
              'hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="font-medium">Decoded</span>
            {isExpired && (
              <span className={clsx(
                'ml-auto text-[10px] px-1.5 py-0.5 rounded',
                'bg-red-100 dark:bg-red-900/30',
                'text-red-700 dark:text-red-400',
                'flex items-center gap-1'
              )}>
                <AlertTriangle size={10} />
                Expired
              </span>
            )}
            {!isExpired && decoded.payload?.exp != null && (
              <span className={clsx(
                'ml-auto text-[10px] px-1.5 py-0.5 rounded',
                'bg-green-100 dark:bg-green-900/30',
                'text-green-700 dark:text-green-400',
                'flex items-center gap-1'
              )}>
                <Shield size={10} />
                Valid
              </span>
            )}
          </button>

          {isExpanded && (
            <div className="space-y-2">
              {/* Header */}
              {decoded.header && (
                <JwtSection
                  title="HEADER"
                  color="#fb015b"
                  data={decoded.header}
                />
              )}

              {/* Payload */}
              {decoded.payload && (
                <JwtSection
                  title="PAYLOAD"
                  color="#d63aff"
                  data={decoded.payload}
                  isExpired={isExpired}
                />
              )}

              {/* Signature */}
              <div className={clsx(
                'rounded-md border overflow-hidden',
                'border-slate-200 dark:border-slate-700'
              )}>
                <div
                  className="px-2 py-1 text-[10px] font-semibold tracking-wider"
                  style={{ color: '#00b9f1', background: 'rgba(0, 185, 241, 0.08)' }}
                >
                  SIGNATURE
                </div>
                <div className="px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-400 break-all bg-slate-50 dark:bg-slate-800/50">
                  {decoded.signature}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Render a decoded JWT section (header or payload) */
function JwtSection({
  title,
  color,
  data,
  isExpired = false,
}: {
  title: string
  color: string
  data: Record<string, unknown>
  isExpired?: boolean
}) {
  return (
    <div className={clsx(
      'rounded-md border overflow-hidden',
      'border-slate-200 dark:border-slate-700'
    )}>
      <div
        className="px-2 py-1 text-[10px] font-semibold tracking-wider"
        style={{ color, background: `${color}12` }}
      >
        {title}
      </div>
      <div className="bg-slate-50 dark:bg-slate-800/50">
        {Object.entries(data).map(([key, val]) => {
          const label = CLAIM_LABELS[key]
          const isTimestamp = (key === 'exp' || key === 'iat' || key === 'nbf') && typeof val === 'number'
          const isExpiredClaim = key === 'exp' && isExpired

          return (
            <div
              key={key}
              className={clsx(
                'flex items-start gap-2 px-3 py-1.5 text-xs',
                'border-b border-slate-100 dark:border-slate-700/50 last:border-b-0'
              )}
            >
              <div className="flex-shrink-0 min-w-[80px]">
                <span className="font-medium text-slate-700 dark:text-slate-300">{key}</span>
                {label && (
                  <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                    ({label})
                  </span>
                )}
              </div>
              <div className={clsx(
                'flex-1 font-mono break-all',
                isExpiredClaim
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-600 dark:text-slate-400'
              )}>
                {isTimestamp ? (
                  <span title={String(val)}>
                    {formatClaimValue(key, val)}
                  </span>
                ) : (
                  formatClaimValue(key, val)
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
