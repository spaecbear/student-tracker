interface Props {
  message: string
  detail?: string
  onDismiss?: () => void
  onRetry?: () => void
}

/**
 * Storage failures are the teacher's problem to know about, not something to
 * swallow. An eviction or quota error surfaces here rather than in the console.
 */
export function ErrorBanner({ message, detail, onDismiss, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4"
      style={{
        borderColor: 'var(--danger-border)',
        background: 'var(--danger-surface)',
        color: 'var(--danger-text)',
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{message}</p>
        {detail && <p className="mt-0.5 text-sm opacity-80">{detail}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl border px-4 font-medium"
          style={{ borderColor: 'var(--danger-border)' }}
        >
          Try again
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-xl px-4 font-medium underline"
        >
          Dismiss
        </button>
      )}
    </div>
  )
}
