import { useCallback, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorBanner } from '../../components/ErrorBanner'
import type { Classroom } from '../../hooks/useClassroom'
import type { TeacherAuth } from '../../hooks/useTeacherAuth'
import type { AppSettings } from '../../hooks/useAppSettings'
import type { ColorScheme } from '../../hooks/useColorScheme'
import { useOwnClasses } from '../../hooks/useOwnClasses'
import { ClassesPanel } from './ClassesPanel'
import { ExportPanel } from './ExportPanel'
import { SettingsPanel } from './SettingsPanel'
import { PasswordGate } from './PasswordGate'
import { RecoveryCodeNotice } from './RecoveryCodeNotice'
import { RosterPanel } from './RosterPanel'
import { SessionsPanel } from './SessionsPanel'

interface Props {
  auth: TeacherAuth
  classroom: Classroom
  colorScheme: ColorScheme
  settings: AppSettings
  onExit: () => void
}

const TABS = [
  { id: 'roster', label: 'Roster' },
  { id: 'classes', label: 'Classes' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'export', label: 'Export' },
  { id: 'settings', label: 'Settings' },
] as const

type TabId = (typeof TABS)[number]['id']

export function TeacherView({ auth, classroom, colorScheme, settings, onExit }: Props) {
  const [tab, setTab] = useState<TabId>('roster')
  const own = useOwnClasses(auth.teacher?.id)

  /**
   * The class this teacher is working on. It follows the device's active class
   * only when they own it; otherwise it falls back to one of their own, so the
   * class showing on the card wall never leaks another teacher's roster here.
   */
  const workingClassId = useMemo(() => {
    const active = classroom.activeClass?.id
    if (active && own.classes.some((c) => c.id === active)) return active
    return own.classes.find((c) => !c.archived)?.id ?? null
  }, [classroom.activeClass, own.classes])

  const handleChanged = useCallback(() => {
    own.reload()
    classroom.refresh()
  }, [own, classroom])

  if (auth.state === 'checking') {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    )
  }

  if (auth.state === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
        <ErrorBanner
          message="The teacher account could not be read."
          detail={auth.error ?? undefined}
          onDismiss={onExit}
        />
      </main>
    )
  }

  if (auth.state !== 'unlocked') {
    return <PasswordGate auth={auth} onCancel={onExit} />
  }

  const workingClass = own.classes.find((c) => c.id === workingClassId) ?? null

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="text-xs font-semibold tracking-[0.2em] uppercase"
            style={{ color: 'var(--accent)' }}
          >
            Teacher view
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {workingClass?.name ?? 'No class selected'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Signed in as {auth.teacher?.displayName ?? 'Teacher'}. Locks itself after five minutes
            without activity, and whenever you go back to the class view.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={auth.lock}>Lock</Button>
          <Button variant="primary" onClick={onExit}>
            Back to class
          </Button>
        </div>
      </header>

      <nav
        className="flex gap-1 rounded-2xl border p-1"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
        aria-label="Teacher sections"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
            className="min-h-11 flex-1 rounded-xl px-4 font-medium"
            style={
              tab === item.id
                ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                : { color: 'var(--text-muted)' }
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'settings' ? (
        <SettingsPanel colorScheme={colorScheme} settings={settings} />
      ) : tab === 'classes' ? (
        <ClassesPanel
          teacherId={auth.teacher?.id ?? ''}
          activeClassId={classroom.activeClass?.id ?? null}
          onSelectClass={classroom.selectClass}
          onChanged={handleChanged}
        />
      ) : workingClassId === null ? (
        <p
          className="rounded-2xl border border-dashed px-5 py-10 text-center"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          {own.loaded && own.classes.length > 0
            ? 'All of your classes are archived. Unarchive one on the Classes tab.'
            : 'Create a class first — the Classes tab is where to start.'}
        </p>
      ) : tab === 'roster' ? (
        <RosterPanel classId={workingClassId} onChanged={handleChanged} />
      ) : tab === 'sessions' ? (
        <SessionsPanel classId={workingClassId} onChanged={handleChanged} />
      ) : (
        <ExportPanel teacherId={auth.teacher?.id ?? ''} activeClassId={workingClassId} />
      )}

      {auth.recoveryCode && (
        <RecoveryCodeNotice code={auth.recoveryCode} onAcknowledge={auth.acknowledgeRecoveryCode} />
      )}
    </div>
  )
}
