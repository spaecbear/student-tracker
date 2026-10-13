/** Plain-language notes on where the data lives and what happens offline. */
export function DevicePanel() {
  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
    >
      <h3 className="text-sm font-semibold tracking-[0.14em] uppercase">Good to know</h3>
      <ul
        className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        <li>
          Attendance is saved to your account on the server the moment a student taps, so it
          survives a cleared browser or a replaced Chromebook. Sign in on any device to see it.
        </li>
        <li>
          The app needs an internet connection to check students in and out. If the connection
          drops, taps fail with an error rather than being saved on the device — wait for the
          connection to return and tap again.
        </li>
        <li>
          Durations come from the times recorded at each tap, so correcting the Chromebook’s
          clock will not rewrite past sessions. A session running <em>across</em> a clock change
          will be wrong; fix it on the Sessions tab.
        </li>
      </ul>
    </section>
  )
}
