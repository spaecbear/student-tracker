# Classroom Time Tracker

A single-device app where students check themselves in and out of a classroom by tapping their
name. It records timestamps, computes durations, and exports attendance as CSV.

**Everything stays on the device.** No server, no student accounts, no network calls, nothing sent
anywhere. After the first load it works with the Wi-Fi off.

**Live app: <https://spaecbear.github.io/student-tracker/>**

Built as an installable PWA because the target device is a Chromebook, which cannot run a
downloaded executable without developer mode.

---

## Installing it on the classroom Chromebook

The link above *is* the application — there is nothing to download, no dependencies to install,
and no repository to clone. Chrome fetches about 350 KB of static files and caches them.

1. Open <https://spaecbear.github.io/student-tracker/> in Chrome on the Chromebook.
2. Open the teacher view and press **Install app** in Settings — or use Chrome's
   ⋮ menu → **Cast, save and share** → **Install page as app**.
3. It appears in the **launcher** as "Time Tracker". Right-click it → **Pin to shelf** to keep it
   on the shelf. It opens in its own window with no address bar.
4. Set the teacher password when prompted, and **write down the recovery code it shows you.**
   There is no server that can reset it.
5. Check **Settings → Device**. It reports whether Chrome granted persistent storage; see below.

Once installed, the app never needs the network again. Updates arrive on their own when the device
is online (checked at launch and hourly), and the page reloads itself onto the new version.

### If the school network blocks it

`github.io` is blocked by a fair number of school districts, because it is a popular host for
proxies and games. Two things to know:

- **It only has to be reachable once.** Install it on any other network — home Wi-Fi, a phone
  hotspot for two minutes — and it works at school from then on, just without receiving updates.
- **Ask IT rather than working around the filter.** The blocks are often device policy that
  follows the Chromebook off-network anyway. A district admin can allowlist the URL, or better,
  force-install the web app by URL through the Google Admin console so it arrives on the shelf
  with no install step.

If they will not allowlist `github.io`, the same files can be served from a custom domain or a
different host (Cloudflare Pages, Netlify) without any code change — only `BASE_PATH` moves.

### Ask IT one more question

Find out whether the Chromebooks run in **ephemeral mode** or clear browsing data at sign-out.
Managed devices often do, and that would wipe the attendance records — the app's entire premise is
that a year of data lives on the device. If that is how they are configured, the answer is a
dedicated non-managed device, or exporting far more often.

Test both before anyone depends on it: can the device reach the URL, and does data survive a
sign-out and a reboot?

### Persistent storage

Chrome can evict a site's data when the device runs low on space. The app asks for protection at
startup and again the moment it is installed, and the **Device** section reports the answer.

Chrome decides on its own signals and often says no at first, granting it after the app has been
used for a few days. The **Ask again** button is there for that. It is a safeguard, not a
guarantee, which is why the year-end export gate exists and why regular exports are worth the
habit.

---

## Using it

### The student view

The default screen, with no login. Two columns — **Out** on the left, **In** on the right — with a
card per student, sorted by last name. Tapping a card asks for confirmation (name, action, time),
which dismisses itself after five seconds so a brushed screen records nothing. Confirming moves
the card to the other column.

In-cards show the check-in time and a live duration that ticks every 30 seconds.

### The teacher view

Reached by the **Teacher** button, behind a password. It locks itself after five minutes without
activity, when the app is backgrounded, whenever you go back to the class view, and on every
relaunch — so a student cannot walk up to an unattended Chromebook and find it open.

| Tab | What it does |
|---|---|
| **Roster** | Add, edit, remove and restore students. Bulk-add by pasting a list or a spreadsheet column. |
| **Classes** | Create, rename, archive and switch classes; pick a color theme. Up to 7 active classes per teacher per year. |
| **Sessions** | Any day's sessions in a table. Fix a wrong time, close an open session, add a session by hand, delete a mistake. |
| **Export** | Pick a class and a date range, preview the row count, download the CSV. |
| **Settings** | Light/dark, check-in sounds, storage status, install, and a fresh-copy button. |

### Missed check-ins and check-outs

Students forget. The app never guesses a time to cover for it.

- A session left open past its own day is taken off the card wall and put on a **review list** at
  the top of the Sessions tab, still unclosed. The student can check in again the next morning as
  normal.
- **Set check-out** on that row enters the real time.
- **Add a session** records a visit the card wall never saw at all — a student who forgot to tap
  in to begin with.
- Anything still unresolved exports with a blank check-out and a blank duration, so a gap is
  visible in the spreadsheet rather than hidden inside a made-up number.

### More than one teacher on a device

A room shared across periods can hold several accounts. Each teacher signs in with their own
password and sees **only their own classes, rosters and sessions** — including when the card wall
happens to be showing someone else's class.

Adding an account requires an existing teacher's password or recovery code, so the sign-in screen
cannot be used to walk around the lock. On a brand-new device the first screen is "Set a teacher
password" and there is no add-another option, because there is nothing yet to prove access with.

### Exporting

Two formats, both scoped to a class and a date range:

```csv
Last Name,First Name,Grade,Student ID,Date,Check In,Check Out,Duration
Alvarez,Maya,10,10442,2026-09-15,09:14,10:47,01:33
Brooks,Dev,10,10118,2026-09-15,09:16,,
```

- **One row per session** — every check-in and check-out with its duration.
- **One row per student** — total time and session count across the range.

Times are local and 24-hour so they sort as text; durations are `hh:mm`, zero-padded, hours
uncapped. A session that crosses midnight exports on its check-in date with its real duration.
A session still waiting on a check-out — the second row above — leaves both fields blank rather
than being assigned a guess. The file carries a UTF-8 BOM so Excel on Windows does not mangle
accented names.

### End of the school year

A school year runs 8/1 to 6/1, and every record is namespaced by it. On the first launch after a
year has ended, a blocking screen appears with three steps: export the year, confirm you actually
have the file, then delete it.

**Nothing is deleted until that confirmation.** Dismissing the prompt keeps everything and asks
again next launch. The export also writes a backup copy into the browser's private file system,
because a browser cannot tell the app whether a download succeeded or where it landed.

---

## Development

```bash
npm install
npm run dev
```

In a dev build the empty state offers a **Load demo class** button: 30 students with a few weeks of
plausible sessions, from a fixed seed so a reload reproduces the same data.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Full test suite (257 tests) |
| `npm run typecheck` | `tsc -b`, strict |
| `npm run build` | Typecheck, bundle, generate the service worker |
| `npm run preview` | Serve the production build — the only way to exercise the service worker |
| `node scripts/generate-icons.mjs` | Regenerate the PWA icons |

Service workers only run on HTTPS or localhost, so `npm run dev` has none. Use `npm run preview`
to test installation and offline behavior.

### Deploying

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): typecheck,
test, build, publish to GitHub Pages. **A failing test fails the deploy**, so a broken build cannot
reach the classroom.

The base path follows the repository name automatically (`BASE_PATH=/<repo>/`). For a custom
domain, set `BASE_PATH=/` in the workflow's build step and add a `CNAME` file.

### Layout

```
src/
  db/         IndexedDB schema, migrations, typed queries — the only place `idb` is imported
  domain/     pure functions: durations, school-year math, CSV, roster parsing
  auth/       PBKDF2 password and recovery-code handling
  export/     assembling and downloading CSVs
  pwa/        storage persistence, install prompt, update checks, OPFS backups
  components/ presentational components
  views/      StudentView, and teacher/ for the password-gated side
  hooks/
  themes/
  dev/        seed data, dev builds only
```

`domain/` imports no React and no IndexedDB — plain functions over plain data, which is why it
carries most of the test suite. Components never call `idb` directly.

---

## Things worth knowing

- **Timestamps are epoch milliseconds.** Durations are always `now - checkInAt`, never a counter,
  so a sleeping Chromebook or a backgrounded tab cannot make them drift. Correcting the device
  clock does not rewrite past sessions.
- **The app never invents a time.** A session with no check-out stays unclosed and visible on the
  review list until a teacher enters the real one.
- **Removing a student is a soft delete.** Their card disappears; their sessions stay, so past
  exports keep matching. Permanent deletion is a separate, explicitly confirmed action that also
  removes their sessions.
- **Checking in twice is impossible by design.** A checked-in student's card lives in the In
  column, where tapping means check out.
- **The teacher password is a classroom lock, not security.** PBKDF2 via Web Crypto stops a
  curious student from editing the roster; it is not defense against someone with the device and
  time. The recovery code shown at setup is the only way back in.
- **Light and dark are independent of the class color.** The scheme follows the device by default
  and is applied before first paint, so a dark room never gets a white flash.
- **Check-in sounds are off by default.** Thirty students arriving at once is a lot of chimes.
  Card movement honors `prefers-reduced-motion` by cross-fading instead of sliding.
- **The end-of-year purge never runs unattended**, and no grace-period auto-delete exists.

## Design document

[`student-tracker-design-doc.md`](student-tracker-design-doc.md) is the spec this was built from.
Where the app diverges, it is noted above — most notably the abandoned-session handling, which the
spec had auto-closing at a guessed end-of-day time.
