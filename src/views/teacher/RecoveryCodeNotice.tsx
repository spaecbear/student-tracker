import { useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'

interface Props {
  code: string
  onAcknowledge: () => void
}

/**
 * Shown once, immediately after the password is set. Nothing in the app
 * can recover the password without it, so the teacher has to confirm they
 * actually wrote it down before the dialog closes.
 */
export function RecoveryCodeNotice({ code, onAcknowledge }: Props) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <Modal
      title="Write this recovery code down"
      description="It is the only way back in if you forget the password. It will not be shown again."
      onClose={() => undefined}
      footer={
        <Button variant="primary" disabled={!confirmed} onClick={onAcknowledge}>
          I have written it down
        </Button>
      }
    >
      <p
        className="rounded-2xl border px-6 py-6 text-center text-2xl font-semibold tracking-[0.12em] tabular-nums sm:text-3xl"
        style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
      >
        {code}
      </p>
      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 size-5"
        />
        <span>
          I have written this code down somewhere safe. I need it to get back in if I forget my
          password.
        </span>
      </label>
    </Modal>
  )
}
