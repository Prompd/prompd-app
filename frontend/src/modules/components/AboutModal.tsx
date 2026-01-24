import { useState, useCallback } from 'react'
import { X, ExternalLink, Shield, Code, Package, Loader2 } from 'lucide-react'
import { APP_NAME, APP_VERSION, APP_DESCRIPTION, APP_LICENSE, APP_LINKS } from '../../constants/app'

interface LicenseInfo {
  licenses: string
  repository?: string
  publisher?: string
}

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
  theme: 'light' | 'dark'
}

export function AboutModal({ isOpen, onClose, theme }: AboutModalProps) {
  const [showLicenses, setShowLicenses] = useState(false)
  const [licenses, setLicenses] = useState<Record<string, LicenseInfo> | null>(null)
  const [licensesLoading, setLicensesLoading] = useState(false)

  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    primary: '#3b82f6',
    buttonBg: theme === 'dark' ? '#334155' : '#f1f5f9',
    buttonBorder: theme === 'dark' ? '#475569' : '#cbd5e1',
    buttonHoverBg: theme === 'dark' ? '#475569' : '#e2e8f0'
  }

  const loadLicenses = useCallback(async () => {
    if (licenses) {
      setShowLicenses(true)
      return
    }
    setLicensesLoading(true)
    try {
      const response = await fetch('/licenses.json')
      if (response.ok) {
        const data = await response.json()
        setLicenses(data)
        setShowLicenses(true)
      }
    } catch (error) {
      console.error('Failed to load licenses:', error)
    } finally {
      setLicensesLoading(false)
    }
  }, [licenses])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '16px',
          width: '90%',
          maxWidth: '420px',
          boxShadow: theme === 'dark' ? '0 25px 80px rgba(0, 0, 0, 0.6)' : '0 25px 80px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${colors.border}`
          }}
        >
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: colors.text }}>
            About Prompd
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              color: colors.textSecondary
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Logo and App Info */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <img
              src="/logo.png"
              alt="Prompd Logo"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px'
              }}
            />
            <div>
              <h3 style={{ margin: '0 0 2px 0', fontSize: '28px', fontWeight: 700, color: colors.text }}>
                {APP_NAME}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: colors.textSecondary }}>
                Version {APP_VERSION}
              </p>
            </div>
          </div>

          {/* Description */}
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: colors.textSecondary,
            lineHeight: 1.5
          }}>
            {APP_DESCRIPTION}
          </p>

          {/* License */}
          <div style={{
            padding: '16px',
            background: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            textAlign: 'center'
          }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 500, color: colors.text }}>
              {APP_LICENSE.type}
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: colors.textSecondary }}>
              {APP_LICENSE.copyright}
            </p>
          </div>

          {/* Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => {
                const electronAPI = (window as Window & { electronAPI?: { openExternal?: (url: string) => Promise<void> } }).electronAPI
                if (electronAPI?.openExternal) {
                  electronAPI.openExternal(APP_LINKS.privacy)
                } else {
                  window.open(APP_LINKS.privacy, '_blank')
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: colors.buttonBg,
                border: `1px solid ${colors.buttonBorder}`,
                borderRadius: '6px',
                color: colors.text,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = colors.buttonHoverBg
                e.currentTarget.style.borderColor = colors.primary
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = colors.buttonBg
                e.currentTarget.style.borderColor = colors.buttonBorder
              }}
            >
              <Shield size={16} style={{ color: colors.textSecondary }} />
              Privacy Policy
              <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </button>

            <button
              onClick={() => {
                const electronAPI = (window as Window & { electronAPI?: { openExternal?: (url: string) => Promise<void> } }).electronAPI
                if (electronAPI?.openExternal) {
                  electronAPI.openExternal(APP_LINKS.terms)
                } else {
                  window.open(APP_LINKS.terms, '_blank')
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: colors.buttonBg,
                border: `1px solid ${colors.buttonBorder}`,
                borderRadius: '6px',
                color: colors.text,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = colors.buttonHoverBg
                e.currentTarget.style.borderColor = colors.primary
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = colors.buttonBg
                e.currentTarget.style.borderColor = colors.buttonBorder
              }}
            >
              <Code size={16} style={{ color: colors.textSecondary }} />
              Terms of Service
              <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </button>

            <button
              onClick={loadLicenses}
              disabled={licensesLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: colors.buttonBg,
                border: `1px solid ${colors.buttonBorder}`,
                borderRadius: '6px',
                color: colors.text,
                fontSize: '13px',
                fontWeight: 500,
                cursor: licensesLoading ? 'wait' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                opacity: licensesLoading ? 0.7 : 1
              }}
              onMouseOver={(e) => {
                if (!licensesLoading) {
                  e.currentTarget.style.background = colors.buttonHoverBg
                  e.currentTarget.style.borderColor = colors.primary
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = colors.buttonBg
                e.currentTarget.style.borderColor = colors.buttonBorder
              }}
            >
              <Package size={16} style={{ color: colors.textSecondary }} />
              {licensesLoading ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Loading...
                </>
              ) : (
                'Third-Party Licenses'
              )}
            </button>
          </div>
        </div>

        {/* Licenses Modal */}
        {showLicenses && licenses && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10001
            }}
            onClick={() => setShowLicenses(false)}
          >
            <div
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '12px',
                width: '90%',
                maxWidth: '500px',
                maxHeight: '60vh',
                display: 'flex',
                flexDirection: 'column'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: colors.text }}>
                  Third-Party Licenses
                </h3>
                <button
                  onClick={() => setShowLicenses(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: colors.textSecondary
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
                <p style={{
                  margin: '0 0 12px 0',
                  fontSize: '12px',
                  color: colors.textSecondary
                }}>
                  This software uses the following open-source packages:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(licenses).map(([pkg, info]) => (
                    <div
                      key={pkg}
                      style={{
                        padding: '8px 10px',
                        background: colors.bgSecondary,
                        borderRadius: '6px',
                        fontSize: '11px'
                      }}
                    >
                      <div style={{ color: colors.text, fontWeight: 500 }}>{pkg}</div>
                      <div style={{ color: colors.textSecondary, marginTop: '2px' }}>
                        {info.licenses}
                        {info.publisher && ` - ${info.publisher}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CSS for spinner animation */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}

export default AboutModal
