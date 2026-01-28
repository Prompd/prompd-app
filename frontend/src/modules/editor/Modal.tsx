import { useEffect } from 'react'

export default function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; title?: string; children: any }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {title ? <div className="modal-header"><strong>{title}</strong><button className="btn" onClick={onClose}>✕</button></div> : null}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

