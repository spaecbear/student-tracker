import type { ReactNode } from 'react'
import { playCue } from '../../audio/tones'
import { Button } from '../../components/Button'
import type { AppSettings } from '../../hooks/useAppSettings'
import type { ColorScheme } from '../../hooks/useColorScheme'
import type { SchemePreference } from '../../themes/scheme'
import type { TeacherAuth } from '../../hooks/useTeacherAuth'
import { DevicePanel } from './DevicePanel'
import { InstallCard } from '../../components/InstallCard'
import { RefreshAppCard } from './RefreshAppCard'

interface Props {
  colorScheme: ColorScheme
  settings: AppSettings
  auth: TeacherAuth
}

const SCHEME_OPTIONS: ReadonlyArray<{ id: SchemePreference; label: string }> = [
  { id: 'system', label: 'Follow the device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function SettingsPanel({ colorScheme, settings, auth }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Appearance"
        hint="Separate from each class's color, which is set on the Classes tab."
      >
        <div className="flex flex-wrap gap-2">
          {SCHEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={colorScheme.preference === option.id}
              onClick={() => colorScheme.setPreference(option.id)}
              className="min-h-11 rounded-xl border px-4 font-medium"
              style={
                colorScheme.preference === option.id
                  ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }
                  : { borderColor: 'var(--border)' }
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        {colorScheme.preference === 'system' && (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Currently showing the {colorScheme.resolved} theme.
          </p>
        )}
      </Section>

      <Section
        title="Sound"
        hint="A rising tone on check-in, a falling one on check-out. Thirty students arriving at once is a lot of chimes, so this starts off."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            label="Play a sound on check-in and check-out"
            checked={settings.soundEnabled}
            onChange={settings.setSoundEnabled}
          />
          {settings.soundEnabled && (
            <>
              <Button onClick={() => playCue('in')}>Hear check-in</Button>
              <Button onClick={() => playCue('out')}>Hear check-out</Button>
            </>
          )}
        </div>
      </Section>

      <Section
        title="Student cards"
        hint="Applies to the cards in the Out column, which students see all period."
      >
        <Toggle
          label="Show each student's total time for today"
          checked={settings.showDailyTotal}
          onChange={settings.setShowDailyTotal}
        />
      </Section>

      <Section
        title="Account"
        hint={`Signed in as ${auth.teacher?.username ?? ''}. The recovery code is the only way back in if you forget your password. Making a new one cancels the old one.`}
      >
        <Button onClick={() => void auth.replaceRecoveryCode()}>Make a new recovery code</Button>
        {auth.error && (
          <p role="alert" className="mt-3 text-sm font-medium" style={{ color: 'var(--danger)' }}>
            {auth.error}
          </p>
        )}
      </Section>

      <InstallCard />

      <DevicePanel />

      <RefreshAppCard />
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
    >
      <h3 className="text-sm font-semibold tracking-[0.14em] uppercase">{title}</h3>
      {hint && (
        <p className="mt-1.5 mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        className="size-5"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
