import { formatTime12 } from '../domain'

interface Props {
  now: number
}

/** Header clock. `now` ticks once a second from the shared useNow hook. */
export function Clock({ now }: Props) {
  const date = new Date(now).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  return (
    <div className="text-right">
      <div className="text-4xl leading-none font-semibold tabular-nums">
        {formatTime12(now)}
      </div>
      <div className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
        {date}
      </div>
    </div>
  )
}
