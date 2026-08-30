import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Generic teacher-side dialog. The student confirmation has its own component. */
export function Modal({ title, description, onClose, children, footer }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-6"
      style={{ background: 'rgb(0 0 0 / 0.5)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="my-auto w-full max-w-xl rounded-3xl border shadow-2xl"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className="border-b px-7 py-5" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {description}
            </p>
          )}
        </div>
        <div className="px-7 py-6">{children}</div>
        {footer && (
          <div
            className="flex justify-end gap-3 border-t px-7 py-5"
            style={{ borderColor: 'var(--border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
