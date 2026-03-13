import { useUIStore, selectToasts } from '../../stores/uiStore'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Download } from 'lucide-react'

/**
 * Toast notification container - renders all active toasts
 * Positioned fixed at bottom-right of viewport
 */
export function ToastContainer() {
  const toasts = useUIStore(selectToasts)
  const removeToast = useUIStore(state => state.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' && <CheckCircle size={16} />}
            {toast.type === 'error' && <AlertCircle size={16} />}
            {toast.type === 'warning' && <AlertTriangle size={16} />}
            {toast.type === 'info' && <Info size={16} />}
            {toast.type === 'update' && <Download size={16} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action!.onClick()
                removeToast(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            className="toast-close"
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
