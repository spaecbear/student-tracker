import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' },
  secondary: { background: 'var(--surface-raised)', borderColor: 'var(--border)' },
  danger: { background: 'var(--danger)', color: 'var(--on-danger)', borderColor: 'transparent' },
  ghost: { background: 'transparent', borderColor: 'transparent', color: 'var(--text-muted)' },
}

export function Button({ variant = 'secondary', className = '', style, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-11 rounded-xl border px-4 font-medium whitespace-nowrap transition-opacity disabled:opacity-50 ${className}`}
      style={{ ...VARIANT_STYLES[variant], ...style }}
    />
  )
}
