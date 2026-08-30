# Classroom Time Tracker

A single-device app where students check themselves in and out of a classroom by tapping their
name. It records timestamps, computes durations, and exports attendance as CSV. Everything lives
on the device — no server, no accounts, no network calls.

Built as an installable PWA so it runs on a Chromebook, which cannot run a downloaded executable
without developer mode.

## Running it locally

```bash
npm install
npm run dev
```

In a dev build, the empty state offers a **Load demo class** button: 30 students with a few weeks
of plausible sessions, generated from a fixed seed so a reload reproduces the same data.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Full test suite |
| `npm run typecheck` | `tsc -b`, strict |
| `npm run build` | Typecheck, bundle, and generate the service worker |
| `npm run preview` | Serve the production build (the only way to exercise the service worker) |
| `node scripts/generate-icons.mjs` | Regenerate the PWA icons |

## Deploying

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which
typechecks, tests, builds, and publishes to GitHub Pages. Enable Pages once under
**Settings → Pages → Source: GitHub Actions**.

The base path follows the repository name automatically (`BASE_PATH=/<repo>/`). For a custom
domain, set `BASE_PATH=/` in the workflow's build step.

## Installing on the classroom Chromebook

1. Open the Pages URL in Chrome.
2. Install from the address bar or the ⋮ menu → **Cast, save, and share → Install page as app**.
3. Launch it from the shelf. It opens in its own window with no address bar and works offline.
4. Open the teacher view and check the **Device** tab: it reports whether Chrome granted
   persistent storage. Installing the app is usually what earns that grant, and without it Chrome
   may clear a year of attendance to reclaim space.

## Layout

```
src/
  db/         IndexedDB schema, migrations, typed queries — the only place `idb` is imported
  domain/     pure functions: durations, school-year math, CSV, roster parsing
  auth/       PBKDF2 password and recovery-code handling
  export/     assembling and downloading CSVs
  pwa/        storage persistence
  components/ presentational components
  views/      StudentView, and teacher/ for the password-gated side
  hooks/
  themes/
  dev/        seed data, dev builds only
```

`domain/` imports no React and no IndexedDB — it is plain functions over plain data, which is why
it carries most of the test suite. Components never call `idb` directly.

## Things worth knowing

- **Timestamps are epoch milliseconds.** Durations are always `now - checkInAt`, never a counter,
  so a backgrounded tab or a sleeping Chromebook cannot make them drift.
- **Removing a student is a soft delete.** Their card disappears; their sessions stay, so past
  exports keep matching. Permanent deletion is a separate, explicitly confirmed action.
- **Sessions left open overnight** are auto-closed at 16:00 on their own check-in date and flagged
  `Auto Closed` in the CSV.
- **Light and dark are independent of the class color.** Both are set in the teacher view under
  Settings; the scheme follows the device by default and is applied before first paint, so a dark
  room never gets a white flash.
- **Check-in sounds are off by default** and toggled under Settings. Card movement honors
  `prefers-reduced-motion` by cross-fading instead of sliding.
- **The teacher password is a classroom lock, not security.** PBKDF2 via Web Crypto stops a
  curious student from editing the roster; it is not defense against someone with the device and
  time. The recovery code shown at setup is the only way back in.

## Design document

[`student-tracker-design-doc.md`](student-tracker-design-doc.md) is the spec this was built from.
