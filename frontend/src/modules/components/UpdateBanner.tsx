import { useState, useEffect, useCallback } from 'react'
import { Download, X, RefreshCw } from 'lucide-react'

type UpdateState = 'available' | 'downloaded' | null

export function UpdateBanner() {
  const [updateState, setUpdateState] = useState<UpdateState>(null)
  const [version, setVersion] = useState<string>('')
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.isElectron) return

    const cleanups: (() => void)[] = []

    cleanups.push(api.onUpdateAvailable((info) => {
      setVersion(info.version)
      setUpdateState('available')
      setDismissed(false)
    }))

    cleanups.push(api.onUpdateDownloaded((info) => {
      setVersion(info.version)
      setUpdateState('downloaded')
      setDismissed(false)
    }))

    return () => cleanups.forEach(fn => fn())
  }, [])

  const handleInstall = useCallback(() => {
    const api = window.electronAPI
    if (api) {
      setInstalling(true)
      api.installUpdate()
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  if (!updateState || dismissed) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '6px 16px',
      background: updateState === 'downloaded'
        ? 'linear-gradient(90deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.08))'
        : 'linear-gradient(90deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.08))',
      borderBottom: `1px solid ${updateState === 'downloaded' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
      fontSize: '12px',
      color: 'var(--text)',
      zIndex: 100,
      flexShrink: 0,
    }}>
      {updateState === 'available' ? (
        <>
          <Download size={14} style={{ opacity: 0.8 }} />
          <span>Version <strong>{version}</strong> is available and downloading...</span>
        </>
      ) : (
        <>
          <RefreshCw size={14} style={{ opacity: 0.8 }} />
          <span>Version <strong>{version}</strong> is ready to install</span>
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              padding: '2px 10px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              background: 'rgba(34, 197, 94, 0.2)',
              color: 'var(--text)',
              cursor: installing ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {installing ? 'Restarting...' : 'Restart & Update'}
          </button>
        </>
      )}
      <button
        onClick={handleDismiss}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '2px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          marginLeft: '4px',
          opacity: 0.6,
        }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
