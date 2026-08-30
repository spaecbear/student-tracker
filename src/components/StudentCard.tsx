import { formatDurationHhMm, formatTime12 } from '../domain'
import type { StudentCard as CardModel } from '../domain'

interface Props {
  card: CardModel
  onTap: (card: CardModel) => void
  /** When true this card shows in-room styling and a live duration. */
  checkedIn: boolean
  showDailyTotal: boolean
}

/**
 * One student's tap target. At least 64px tall per the spec — in practice
 * ~96px, since the device is read from a few feet away.
 */
export function StudentCard({ card, onTap, checkedIn, showDailyTotal }: Props) {
  const { student, openSession, durationMs } = card
  const label = checkedIn
    ? `Check out ${student.firstName} ${student.lastName}`
    : `Check in ${student.firstName} ${student.lastName}`

  return (
    <button
      type="button"
      onClick={() => onTap(card)}
      aria-label={label}
      className="group flex min-h-24 w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-[transform,box-shadow,background-color] duration-200 ease-out active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: checkedIn ? 'var(--accent-soft)' : 'var(--surface-raised)',
        borderColor: checkedIn ? 'var(--accent)' : 'var(--border)',
        boxShadow: checkedIn
          ? 'inset 6px 0 0 -1px var(--accent)'
          : '0 1px 2px rgb(0 0 0 / 0.05)',
        outlineColor: 'var(--accent)',
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xl leading-tight font-semibold">
          {student.lastName}, {student.firstName}
        </span>
        <span className="mt-1 block text-sm" style={{ color: 'var(--text-muted)' }}>
          {checkedIn && openSession
            ? `In at ${formatTime12(openSession.checkInAt)}`
            : `Grade ${student.grade}`}
        </span>
      </span>

      {checkedIn ? (
        <span className="shrink-0 text-right">
          <span
            className="block text-3xl font-semibold tabular-nums"
            style={{ color: 'var(--accent-strong)' }}
          >
            {formatDurationHhMm(durationMs)}
          </span>
          <span className="text-xs tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
            in room
          </span>
        </span>
      ) : (
        showDailyTotal &&
        durationMs > 0 && (
          <span className="shrink-0 text-right">
            <span className="block text-lg font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {formatDurationHhMm(durationMs)}
            </span>
            <span className="text-xs tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
              today
            </span>
          </span>
        )
      )}
    </button>
  )
}
