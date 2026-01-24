import { useState, useEffect } from 'react'
import { hotkeyManager, formatHotkey } from '../services/hotkeyManager'
import { HotkeyConfig } from '../types/hotkeys'
import type { HotkeyAction } from '../types/hotkeys'

interface HotkeySettingsProps {
  theme: 'light' | 'dark'
  onClose: () => void
  inline?: boolean  // When true, renders without modal wrapper
}

export default function HotkeySettings({ theme, onClose, inline = false }: HotkeySettingsProps) {
  console.log('HotkeySettings theme:', theme)
  const [hotkeys, setHotkeys] = useState<Record<string, HotkeyAction>>(() => hotkeyManager.getHotkeys())
  const [editingAction, setEditingAction] = useState<string | null>(null)
  const [recordedKeys, setRecordedKeys] = useState<HotkeyConfig | null>(null)

  // Subscribe to hotkey changes from the manager
  useEffect(() => {
    const unsubscribe = hotkeyManager.subscribe((newHotkeys) => {
      setHotkeys(newHotkeys)
    })
    return unsubscribe
  }, [])

  // Wrapper functions to call hotkeyManager methods
  const updateHotkey = (actionId: string, config: HotkeyConfig) => {
    hotkeyManager.updateHotkey(actionId, config)
  }

  const resetHotkey = (actionId: string) => {
    hotkeyManager.resetHotkey(actionId)
  }

  const resetAllHotkeys = () => {
    hotkeyManager.resetAllHotkeys()
  }

  const startRecording = (actionId: string) => {
    setEditingAction(actionId)
    setRecordedKeys(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!editingAction) return

    e.preventDefault()
    e.stopPropagation()

    // Ignore modifier-only keys
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

    const config: HotkeyConfig = {
      key: e.key.toLowerCase(),
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
      alt: e.altKey
    }

    setRecordedKeys(config)
  }

  const applyHotkey = () => {
    if (editingAction && recordedKeys) {
      updateHotkey(editingAction, recordedKeys)
      setEditingAction(null)
      setRecordedKeys(null)
    }
  }

  const cancelRecording = () => {
    setEditingAction(null)
    setRecordedKeys(null)
  }

  const modalStyle = inline ? {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '0',
    padding: '0',
    width: '100%',
    maxHeight: 'none' as const,
    overflow: 'visible' as const,
    color: theme === 'light' ? '#0f172a' : '#ffffff'
  } : {
    position: 'fixed' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: theme === 'light' ? '#ffffff' : '#1e293b',
    border: theme === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(71, 85, 105, 0.3)',
    borderRadius: '8px',
    padding: '24px',
    width: '600px',
    maxHeight: '80vh',
    overflow: 'auto' as const,
    zIndex: 1000,
    boxShadow: theme === 'light' ? '0 4px 16px rgba(0, 0, 0, 0.15)' : '0 4px 16px rgba(0, 0, 0, 0.5)',
    color: theme === 'light' ? '#0f172a' : '#ffffff'
  }

  const content = (
    <div style={modalStyle}>
      {/* Header - only show in modal mode */}
      {!inline && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Keyboard Shortcuts</h2>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: theme === 'light' ? '#64748b' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '20px',
            padding: '4px 8px'
          }}>✕</button>
        </div>
      )}

      {/* Hotkey list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Object.values(hotkeys).map(action => {
          const isEditing = editingAction === action.id
          const displayKey = isEditing && recordedKeys
            ? formatHotkey(recordedKeys)
            : formatHotkey(action.config)

          return (
            <div key={action.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: theme === 'light' ? '#f8fafc' : '#0f172a',
              borderRadius: '6px',
              border: isEditing
                ? '1px solid #3b82f6'
                : theme === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(71, 85, 105, 0.3)'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>{action.name}</div>
                <div style={{ fontSize: '12px', color: theme === 'light' ? '#64748b' : '#94a3b8' }}>{action.description}</div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={displayKey}
                      readOnly
                      onKeyDown={handleKeyDown}
                      autoFocus
                      placeholder="Press keys..."
                      style={{
                        width: '120px',
                        padding: '6px 12px',
                        background: theme === 'light' ? '#ffffff' : '#0f172a',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        color: theme === 'light' ? '#0f172a' : '#ffffff',
                        outline: 'none',
                        fontFamily: 'monospace',
                        textAlign: 'center'
                      }}
                    />
                    <button onClick={applyHotkey} disabled={!recordedKeys} style={{
                      padding: '6px 12px',
                      background: recordedKeys ? '#3b82f6' : theme === 'light' ? '#cbd5e1' : '#475569',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: recordedKeys ? 'pointer' : 'not-allowed',
                      fontSize: '12px'
                    }}>Save</button>
                    <button onClick={cancelRecording} style={{
                      padding: '6px 12px',
                      background: theme === 'light' ? '#ffffff' : '#1e293b',
                      color: theme === 'light' ? '#0f172a' : '#ffffff',
                      border: theme === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(71, 85, 105, 0.3)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <kbd style={{
                      padding: '4px 8px',
                      background: theme === 'light' ? '#ffffff' : '#0f172a',
                      border: theme === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(71, 85, 105, 0.3)',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      color: '#3b82f6'
                    }}>{displayKey}</kbd>
                    <button onClick={() => startRecording(action.id)} style={{
                      padding: '4px 8px',
                      background: 'none',
                      color: '#3b82f6',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}>Edit</button>
                    <button onClick={() => resetHotkey(action.id)} style={{
                      padding: '4px 8px',
                      background: 'none',
                      color: theme === 'light' ? '#64748b' : '#94a3b8',
                      border: theme === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(71, 85, 105, 0.3)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}>Reset</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer - only show in modal mode */}
      {!inline && (
        <div style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: theme === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(71, 85, 105, 0.3)',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <button onClick={resetAllHotkeys} style={{
            padding: '8px 16px',
            background: 'none',
            color: '#ef4444',
            border: '1px solid #ef4444',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}>Reset All to Defaults</button>
          <button onClick={onClose} style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}>Close</button>
        </div>
      )}
    </div>
  )

  // In inline mode, just return content. In modal mode, include backdrop
  if (inline) {
    return content
  }

  return (
    <>
      {content}
      {/* Backdrop - only in modal mode */}
      <div onClick={onClose} style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: -1
      }} />
    </>
  )
}
