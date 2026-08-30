import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { ErrorBanner } from '../../components/ErrorBanner'
import { Field } from '../../components/Field'
import { Modal } from '../../components/Modal'
import {
  MAX_ACTIVE_CLASSES,
  StorageError,
  createClass,
  deleteClassCascade,
  listClasses,
  updateClass,
  type Class,
} from '../../db'
import { schoolYearForDate, schoolYearLabel } from '../../domain'
import { THEMES, THEME_KEYS, type ThemeKey } from '../../themes'

interface Props {
  teacherId: string
  activeClassId: string | null
  onSelectClass: (classId: string) => void
  onChanged: () => void
}

export function ClassesPanel({ teacherId, activeClassId, onSelectClass, onChanged }: Props) {
  const [classes, setClasses] = useState<Class[]>([])
  const [error, setError] = useState<StorageError | null>(null)
  const [name, setName] = useState('')
  const [theme, setTheme] = useState<ThemeKey>(THEME_KEYS[0] ?? 'teal')
  const [editing, setEditing] = useState<Class | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<Class | null>(null)

  const schoolYear = schoolYearForDate(Date.now())

  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof StorageError ? cause : new StorageError('Could not update classes.', cause),
    )
  }, [])

  const reload = useCallback(async () => {
    try {
      const rows = await listClasses(schoolYear, { includeArchived: true, teacherId })
      setClasses(rows)
      setLimitReached(rows.filter((c) => !c.archived).length >= MAX_ACTIVE_CLASSES)
      setError(null)
    } catch (cause) {
      fail(cause)
    }
  }, [schoolYear, teacherId, fail])

  useEffect(() => {
    void reload()
  }, [reload])

  const afterWrite = useCallback(async () => {
    await reload()
    onChanged()
  }, [reload, onChanged])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    try {
      const created = await createClass(
        { teacherId, name: name.trim(), colorTheme: theme, schoolYear },
        Date.now(),
      )
      setName('')
      await afterWrite()
      onSelectClass(created.id)
    } catch (cause) {
      fail(cause)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <ErrorBanner
          message="Classes could not be updated."
          detail={error.message}
          onRetry={() => void reload()}
          onDismiss={() => setError(null)}
        />
      )}

      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Showing the {schoolYearLabel(schoolYear)}. Each class keeps its own roster and its own
        sessions, so switching classes never disturbs anyone already checked in elsewhere. Up to{' '}
        {MAX_ACTIVE_CLASSES} classes at a time; archiving one frees a slot.
      </p>

      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-3 rounded-2xl border p-4"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <Field
          label="Class name"
          value={name}
          placeholder="Period 3 Biology"
          onChange={(event) => setName(event.target.value)}
          className="min-w-56 flex-1"
        />
        <ThemePicker value={theme} onChange={setTheme} />
        <Button type="submit" variant="primary" disabled={limitReached}>
          Create class
        </Button>
        {limitReached && (
          <p className="w-full text-sm" style={{ color: 'var(--warn-text)' }}>
            That is all {MAX_ACTIVE_CLASSES} classes. Archive one you are no longer using to make
            room — archiving keeps its roster and its records.
          </p>
        )}
      </form>

      <ul className="flex flex-col gap-3">
        {classes.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
            style={{
              background: 'var(--surface-raised)',
              borderColor: item.id === activeClassId ? 'var(--accent)' : 'var(--border)',
              opacity: item.archived ? 0.6 : 1,
            }}
          >
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full"
              data-theme={item.colorTheme}
              style={{ background: 'var(--accent)' }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {THEMES[item.colorTheme as ThemeKey] ?? item.colorTheme}
                {item.archived ? ' · archived' : ''}
                {item.id === activeClassId ? ' · showing now' : ''}
              </span>
            </span>
            {item.id !== activeClassId && !item.archived && (
              <Button onClick={() => onSelectClass(item.id)}>Show this class</Button>
            )}
            <Button onClick={() => setEditing(item)}>Edit</Button>
            <Button
              onClick={async () => {
                try {
                  await updateClass(item.id, { archived: !item.archived })
                  await afterWrite()
                } catch (cause) {
                  fail(cause)
                }
              }}
            >
              {item.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingDelete(item)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>

      {editing && (
        <EditClassModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              await updateClass(editing.id, patch)
              setEditing(null)
              await afterWrite()
            } catch (cause) {
              fail(cause)
            }
          }}
        />
      )}

      {confirmingDelete && (
        <Modal
          title={`Delete ${confirmingDelete.name}?`}
          description="This removes the class, its whole roster, and every session recorded in it. This cannot be undone."
          onClose={() => setConfirmingDelete(null)}
          footer={
            <>
              <Button onClick={() => setConfirmingDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await deleteClassCascade(confirmingDelete.id)
                    setConfirmingDelete(null)
                    await afterWrite()
                  } catch (cause) {
                    fail(cause)
                  }
                }}
              >
                Delete everything
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-muted)' }}>
            To keep the records but hide the class, use <strong>Archive</strong> instead. Export
            first if you might need this data later.
          </p>
        </Modal>
      )}
    </div>
  )
}

function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeKey
  onChange: (theme: ThemeKey) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium">Color</legend>
      <div className="flex gap-2">
        {THEME_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={THEMES[key]}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            data-theme={key}
            className="size-11 rounded-xl border-2"
            style={{
              background: 'var(--accent)',
              borderColor: value === key ? 'var(--text)' : 'transparent',
            }}
          />
        ))}
      </div>
    </fieldset>
  )
}

function EditClassModal({
  item,
  onClose,
  onSave,
}: {
  item: Class
  onClose: () => void
  onSave: (patch: Partial<Class>) => void
}) {
  const [name, setName] = useState(item.name)
  const [theme, setTheme] = useState<ThemeKey>((item.colorTheme as ThemeKey) ?? 'teal')

  return (
    <Modal
      title="Edit class"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => onSave({ name: name.trim() || item.name, colorTheme: theme })}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Class name" value={name} onChange={(event) => setName(event.target.value)} />
        <ThemePicker value={theme} onChange={setTheme} />
      </div>
    </Modal>
  )
}
