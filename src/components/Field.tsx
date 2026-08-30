import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
}

export function Field({ label, hint, className = '', id, ...rest }: Props) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <label className={`block ${className}`} htmlFor={inputId}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        id={inputId}
        // Explicit, so a hint rendered inside the label does not become part
        // of the field's accessible name.
        aria-label={label}
        {...rest}
        className="min-h-11 w-full rounded-xl border px-3.5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      />
      {hint && (
        <span className="mt-1.5 block text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}
