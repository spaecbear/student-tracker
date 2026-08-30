import { useCallback, useState } from 'react'
import { ErrorBanner } from './components/ErrorBanner'
import { useClassroom } from './hooks/useClassroom'
import { useNow } from './hooks/useNow'
import { useAppSettings } from './hooks/useAppSettings'
import { useColorScheme } from './hooks/useColorScheme'
import { useTeacherAuth } from './hooks/useTeacherAuth'
import { useTheme } from './hooks/useTheme'
import { useYearEnd } from './hooks/useYearEnd'
import { YearEndGate } from './views/YearEndGate'
import { TeacherView } from './views/teacher/TeacherView'
import { EmptyState } from './views/EmptyState'
import { StudentView } from './views/StudentView'

const CLOCK_INTERVAL_MS = 1000
/** hh:mm needs no finer tick, and 30 cards re-rendering every second is waste. */
const DURATION_INTERVAL_MS = 30_000

export default function App() {
  const classroom = useClassroom()
  const auth = useTeacherAuth()
  const colorScheme = useColorScheme()
  const settings = useAppSettings()
  const yearEnd = useYearEnd()
  const [view, setView] = useState<'student' | 'teacher'>('student')
  const clockNow = useNow(CLOCK_INTERVAL_MS)
  const durationNow = useNow(DURATION_INTERVAL_MS)
  useTheme(classroom.activeClass?.colorTheme)

  /**
   * Every route back to the student view locks the teacher view behind it.
   * The Chromebook sits unattended in a room full of students, so "still
   * signed in from earlier" must never be a way in — returning to the cards is
   * the same as signing out.
   */
  const showStudentView = useCallback(() => {
    auth.lock()
    setView('student')
  }, [auth])

  const showTeacherView = useCallback(() => setView('teacher'), [])

  const seed = useCallback(async () => {
    const { seedDemoData } = await import('./dev/seed')
    await seedDemoData()
    classroom.refresh()
  }, [classroom])

  // The year-end gate stands in front of everything, including the teacher
  // view: last year's data must be dealt with before this year starts.
  if (yearEnd.stage !== 'idle') {
    return <YearEndGate yearEnd={yearEnd} onFinished={classroom.refresh} />
  }

  if (classroom.status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    )
  }

  if (classroom.status === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
        <ErrorBanner
          message="This device's local storage could not be opened."
          detail={
            classroom.error?.message ??
            'Attendance cannot be recorded until this is resolved.'
          }
          onRetry={classroom.refresh}
        />
      </main>
    )
  }

  if (view === 'teacher') {
    return (
      <TeacherView
        auth={auth}
        classroom={classroom}
        colorScheme={colorScheme}
        settings={settings}
        onExit={showStudentView}
      />
    )
  }

  if (classroom.status === 'empty') {
    return (
      <EmptyState
        onOpenTeacherView={showTeacherView}
        {...(import.meta.env.DEV ? { onSeed: seed } : {})}
      />
    )
  }

  return (
    <StudentView
      classroom={classroom}
      clockNow={clockNow}
      durationNow={durationNow}
      showDailyTotal={settings.showDailyTotal}
      soundEnabled={settings.soundEnabled}
      onOpenTeacherView={showTeacherView}
    />
  )
}
