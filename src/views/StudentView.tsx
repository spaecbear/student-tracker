import { useCallback, useMemo, useRef, useState } from 'react'
import { Clock } from '../components/Clock'
import { ConfirmDialog, type PendingAction } from '../components/ConfirmDialog'
import { ErrorBanner } from '../components/ErrorBanner'
import { StudentCard } from '../components/StudentCard'
import { buildRosterColumns, type StudentCard as CardModel } from '../domain'
import type { Classroom } from '../hooks/useClassroom'
import { useFlip } from '../hooks/useFlip'
import { playCue } from '../audio/tones'

interface Props {
  classroom: Classroom
  /** Ticks every second for the clock. */
  clockNow: number
  /** Ticks every 30 seconds for card durations. */
  durationNow: number
  showDailyTotal?: boolean
  soundEnabled?: boolean
  onOpenTeacherView: () => void
}

interface ColumnProps {
  title: string
  cards: CardModel[]
  checkedIn: boolean
  emptyLabel: string
  onTap: (card: CardModel) => void
  showDailyTotal: boolean
}

function Column({ title, cards, checkedIn, emptyLabel, onTap, showDailyTotal }: ColumnProps) {
  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex items-baseline gap-3 px-1 pb-3">
        <h2 className="text-lg font-semibold tracking-[0.14em] uppercase">{title}</h2>
        <span
          className="rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums"
          style={{
            background: checkedIn ? 'var(--accent)' : 'var(--surface-sunken)',
            color: checkedIn ? 'var(--on-accent)' : 'var(--text-muted)',
          }}
        >
          {cards.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {cards.length === 0 ? (
          <p
            className="rounded-2xl border border-dashed px-5 py-10 text-center"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            {emptyLabel}
          </p>
        ) : (
          <ul className="flex flex-col gap-3 pb-4">
            {cards.map((card) => (
              <li key={card.student.id} data-flip-id={card.student.id}>
                <StudentCard
                  card={card}
                  checkedIn={checkedIn}
                  showDailyTotal={showDailyTotal}
                  onTap={onTap}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * The view a room full of students sees. Two columns, tap a card to move
 * between them, with a confirmation step in between.
 */
export function StudentView({
  classroom,
  clockNow,
  durationNow,
  showDailyTotal = true,
  soundEnabled = false,
  onOpenTeacherView,
}: Props) {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const columnsRef = useRef<HTMLDivElement>(null)
  useFlip(columnsRef)

  const columns = useMemo(
    () => buildRosterColumns(classroom.students, classroom.sessions, durationNow),
    [classroom.students, classroom.sessions, durationNow],
  )

  const requestAction = useCallback((card: CardModel) => {
    setPending({
      student: card.student,
      action: card.openSession ? 'out' : 'in',
      at: Date.now(),
      ...(card.openSession ? { sessionId: card.openSession.id } : {}),
    })
  }, [])

  const confirm = useCallback(
    (action: PendingAction) => {
      setPending(null)
      if (soundEnabled) playCue(action.action)
      if (action.action === 'in') void classroom.checkIn(action.student.id)
      else if (action.sessionId) void classroom.checkOut(action.sessionId)
    },
    [classroom, soundEnabled],
  )

  const cancel = useCallback(() => setPending(null), [])

  return (
    <div className="flex h-dvh flex-col gap-5 px-6 py-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-xs font-semibold tracking-[0.2em] uppercase"
            style={{ color: 'var(--accent)' }}
          >
            Now tracking
          </p>
          <h1 className="truncate text-3xl font-semibold tracking-tight">
            {classroom.activeClass?.name ?? 'Classroom'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenTeacherView}
            className="min-h-11 rounded-xl border px-4 text-sm font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Teacher
          </button>
          <Clock now={clockNow} />
        </div>
      </header>

      {classroom.error && (
        <ErrorBanner
          message="Something went wrong saving to this device."
          detail={classroom.error.message}
          onRetry={classroom.refresh}
          onDismiss={classroom.dismissError}
        />
      )}

      <div
        ref={columnsRef}
        className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2"
      >
        <Column
          title="Out"
          cards={columns.out}
          checkedIn={false}
          emptyLabel="Everyone is checked in."
          onTap={requestAction}
          showDailyTotal={showDailyTotal}
        />
        <Column
          title="In"
          cards={columns.in}
          checkedIn
          emptyLabel="Tap your name to check in."
          onTap={requestAction}
          showDailyTotal={showDailyTotal}
        />
      </div>

      {pending && <ConfirmDialog pending={pending} onConfirm={confirm} onCancel={cancel} />}
    </div>
  )
}
