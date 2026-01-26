/**
 * Shared styles for workflow property editors
 * Matching DesignView.tsx input styling
 */

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: '4px',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '6px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '13px',
}

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '80px',
  resize: 'vertical' as const,
  fontFamily: 'var(--font-mono, monospace)',
}

export const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
}

export const buttonPrimaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--accent)',
  color: 'white',
  border: '1px solid var(--accent)',
}

export const sectionStyle: React.CSSProperties = {
  marginBottom: '16px',
}
