# Classroom Time Tracker — Design Document

**Version:** 0.1 (draft)
**Author:** Joseph
**Stakeholder:** Amanda (teacher / primary user)
**Status:** For review

---

## 1. Overview

A single-device application that lets students check themselves in and out of a classroom by tapping their name card. The app records timestamps, calculates session durations, and lets the teacher export attendance data as a CSV.

The app runs on one shared Chromebook at the front of the room. Students interact with it directly. The teacher has a separate, password-protected view for roster management and exports.

### Goals

- Students can check in or out in one or two taps, with no login.
- Teacher can see at a glance who is currently in the room.
- Teacher can export per-session attendance for any date range.
- All data lives on the device. No server, no accounts, no network dependency.
- Data for a school year is retained 8/1 through 6/1, then auto-exported and purged.

### Non-goals

- Multi-device sync or cloud backup.
- Student-facing accounts or passwords.
- Grading, behavior tracking, or SIS integration.
- Attendance reporting to the district in any official format.

---

## 2. Platform decision

The notes call for "an executable stored on GitHub." That works for Windows or Mac but not for a Chromebook, which can't run a standard `.exe` or `.app` without developer mode and a Linux container. Three options:

| Option | How it installs | Offline | Chromebook | Effort |
|---|---|---|---|---|
| **Installable PWA (recommended)** | Open a GitHub Pages URL, click "Install" | Yes, via service worker | Native support | Low |
| Chrome extension | Load unpacked or Chrome Web Store | Yes | Native support | Medium |
| Electron / Tauri desktop app | Download binary from GitHub Releases | Yes | Requires Linux container | Medium-high |

**Recommendation: build it as a PWA.** It installs to the Chromebook shelf, opens in its own window with no browser chrome, works fully offline after first load, and updates automatically when you push to the repo. If the classroom device ever changes to a Windows laptop, the same codebase can be wrapped in Tauri later with minimal changes.

The GitHub repo still serves the same purpose the notes intended: it hosts the app and gives Amanda a stable link to install from.

---

## 3. Architecture

### Stack

- **Frontend:** React + TypeScript, Vite build
- **Styling:** Tailwind CSS with CSS custom properties for per-class color themes
- **Storage:** IndexedDB (via a thin wrapper such as `idb`)
- **Install/offline:** Web app manifest + service worker (`vite-plugin-pwa`)
- **Hosting:** GitHub Pages, deployed by GitHub Actions on push to `main`

### Why IndexedDB over localStorage

localStorage caps out around 5 MB, stores strings only, and is synchronous, which can stutter the UI. IndexedDB handles structured records, indexes on timestamps for fast date-range queries, and scales past a full year of sessions without concern. A class of 30 students checking in twice a day for 180 days is about 11,000 session records, which is trivial for IndexedDB and awkward for localStorage.

### Data flow

```
Student view                Teacher view
     |                            |
     |  tap card                  |  add/edit/remove students
     v                            v
        Application state (React)
                  |
                  v
        Storage layer (IndexedDB)
                  |
        +---------+---------+
        |                   |
   sessions store      classes/students stores
```

---

## 4. Data model

All records are namespaced by `schoolYear` (e.g. `"2026-2027"`) so year-end cleanup is a single indexed delete.

### Teacher

```ts
{
  id: string;
  displayName: string;
  passwordHash: string;   // PBKDF2 or Argon2 via Web Crypto
  salt: string;
  createdAt: number;
}
```

### Class

```ts
{
  id: string;
  teacherId: string;
  name: string;              // "Period 3 Biology"
  colorTheme: string;        // theme key, e.g. "teal"
  schoolYear: string;        // "2026-2027"
  createdAt: number;
  archived: boolean;
}
```

### Student

```ts
{
  id: string;
  classId: string;
  firstName: string;
  lastName: string;
  grade: string;             // "9", "10", "K", etc.
  studentId?: string;        // optional school-assigned ID
  active: boolean;           // soft delete preserves history
  createdAt: number;
}
```

### Session

```ts
{
  id: string;
  studentId: string;
  classId: string;
  schoolYear: string;
  checkInAt: number;         // epoch ms
  checkOutAt: number | null; // null while student is checked in
  durationMs: number | null; // computed on checkout, stored for fast export
  autoClosed: boolean;       // true if closed by the stale-session rule
}
```

**Indexes:**
- `sessions` by `[classId, checkInAt]` for date-range export
- `sessions` by `[studentId, checkOutAt]` to find an open session fast
- `students` by `classId`

### A note on soft deletes

When a teacher removes a student mid-year, the record is marked `active: false` rather than deleted. The card disappears from the student view, but existing sessions stay intact so past exports don't develop holes. A "permanently delete" option in the teacher view can hard-delete the student and their sessions if Amanda actually wants them gone.

---

## 5. Student view

The default view. No authentication.

### Layout

- **Header:** class name, current time (updating every second), current date.
- **Two columns:**
  - Left: **Out** — students not currently checked in.
  - Right: **In** — students currently checked in.
- Cards move between columns on tap.

Cards are sorted alphabetically by last name within each column. On a narrow screen the columns stack, but the target device is a Chromebook in landscape, so two columns is the primary layout.

### Card contents

**Out column:**
- Student name (large)
- Grade (small, secondary)
- Optionally: total time in class today

**In column:**
- Student name (large)
- Check-in time ("In at 9:14 AM")
- Live duration ("1:23"), recalculated every 30 seconds

Showing both check-in time and live duration answers the open question in the notes. The check-in time is the useful fact for a student verifying they tapped in correctly; the running duration is the satisfying one. Both fit on a card without crowding.

### Interaction

1. Student taps their card.
2. A confirmation appears: name, action, and time. This prevents accidental taps from silently corrupting the record.
3. Student confirms, or the dialog dismisses itself after ~5 seconds.
4. Card animates to the other column. Optional sound plays.

The confirmation step is worth keeping even though it adds a tap. Without it, a student brushing the screen on the way past creates a phantom session that Amanda has to fix later.

### Live duration accuracy

Durations are always computed as `now - checkInAt` rather than incremented on a counter. A tick every 30 seconds is plenty for `hh:mm` display and avoids a per-second re-render across 30 cards.

---

## 6. Teacher view

Reached from the sidebar. Requires the teacher password every time it's opened, and it auto-locks after a period of inactivity (default 5 minutes) or when the app is backgrounded.

### Password handling

The password is hashed with PBKDF2 via the Web Crypto API and stored alongside a random salt. This is not defense against a determined attacker with physical access to the Chromebook, and shouldn't be presented as such. It's a lock that stops a curious ninth-grader from editing the roster, which is the actual threat model here.

There should be a recovery path, since there's no server to email a reset link from. Options: a recovery code generated at setup that Amanda writes down, or a "reset app" action that wipes local data after an export. Recommend the recovery code.

### Capabilities

**Roster management**
- Add, edit, remove students (name, grade, optional student ID)
- Bulk-add students by pasting a list or importing a CSV
- Reactivate a soft-deleted student

**Class management**
- Create, rename, archive classes
- Pick a color theme per class
- Switch between classes

**Session correction**
- View today's sessions in a table
- Edit a check-in or check-out time
- Manually close an open session
- Delete an erroneous session

This isn't in the original notes but it's the first thing Amanda will need. Students will forget to check out, tap the wrong card, or check in twice. Without an edit path, every mistake becomes permanent and the CSV becomes untrustworthy.

**Export**
- Choose a class and a date range
- Preview row count
- Download CSV

### CSV format

One row per session:

```csv
Last Name,First Name,Grade,Student ID,Date,Check In,Check Out,Duration
Alvarez,Maya,10,10442,2026-09-15,09:14,10:47,01:33
Brooks,Dev,10,10118,2026-09-15,09:16,10:47,01:31
```

Duration is `hh:mm`, zero-padded, hours uncapped. Times are local, 24-hour in the CSV for sortability even though the UI displays 12-hour.

A second export mode is worth adding: a per-student summary with total time across the range, since that's the number most likely to be needed for a report.

---

## 7. School year lifecycle

### Year boundaries

A school year runs 8/1 through 6/1. The app derives the current `schoolYear` string from the current date: any date from 8/1 onward belongs to `"{thisYear}-{nextYear}"`, and any date before 6/1 belongs to `"{lastYear}-{thisYear}"`. June and July fall in a gap where the prior year is still the active one for purposes of viewing and exporting.

### Automatic cleanup

On app launch, the app checks whether any stored `schoolYear` is older than the current one. If so:

1. Generate a full CSV export of every class in that year.
2. Trigger a download, and simultaneously write the file into the browser's Origin Private File System as a backup.
3. Require the teacher to confirm the export succeeded.
4. Only then delete the year's records.

**The confirmation gate matters.** Deleting a year of data on the strength of a download the app can't verify is a real risk. Browsers don't reliably report whether a download completed or where it went. If the export is silently skipped or lands somewhere Amanda never looks, the data is gone with no recovery.

The safer sequence: on the first launch after 6/1, show a blocking screen that exports the year and asks Amanda to confirm she has the file. If she dismisses it, the data stays and the prompt returns on next launch. Purge only after explicit confirmation, or after a grace period (say 30 days past 6/1) with the OPFS backup still in place.

### Storage persistence

Call `navigator.storage.persist()` on first run. Without it, Chrome can evict IndexedDB under storage pressure, which would silently destroy the year's data. This is a one-line call and a significant safeguard. The teacher view should surface whether persistence was granted.

---

## 8. UI and theming

### Visual direction

Card-based layout, generous tap targets (minimum 64px tall for student cards), high contrast for a device viewed from a few feet away. Sidebar menu holds: view mode toggle, class picker, teacher login, settings.

### Color themes

Each class picks a theme that recolors accents, the "in" column, and the header. Implement as CSS custom properties swapped on a root data attribute, not as separate stylesheets:

```css
[data-theme="teal"] {
  --accent: #14b8a6;
  --accent-soft: #ccfbf1;
}
```

### Light and dark mode

Independent of class theme. Default follows the system preference, with a manual override stored locally. All theme colors need both a light and dark variant defined.

### Animation and sound

- Card transition between columns: a spring-eased position animation, roughly 300ms.
- Check-in: a short rising tone. Check-out: a short falling tone.
- Sound is off by default and toggled in settings. A classroom of 30 students checking in over five minutes is a lot of chimes, and Amanda should decide, not discover.
- Honor `prefers-reduced-motion` by skipping the movement animation and cross-fading instead.

---

## 9. Edge cases

| Case | Handling |
|---|---|
| Student never checks out | On next launch, or at a configured end-of-day time, auto-close open sessions from prior days with `autoClosed: true`. Flag these rows in the CSV so Amanda can spot them. |
| Student checks in twice | Impossible by design. A checked-in student's card lives in the In column, where tapping means check out. |
| Chromebook clock is wrong | Durations are derived from stored epoch timestamps, so a clock correction doesn't retroactively corrupt anything, but a session spanning the correction will be wrong. Low priority; note it in the teacher view help text. |
| Session crosses midnight | Store as one session with its real duration. Export it on the check-in date. |
| App closed mid-session | Nothing is lost. Open sessions have `checkOutAt: null` in IndexedDB and resume on relaunch. |
| Daylight saving transition | Epoch timestamps handle this correctly. Duration will reflect actual elapsed time. |
| Two classes back to back | Each class has its own roster and its own sessions. Switching classes in the sidebar doesn't affect open sessions in the other class. |

---

## 10. Build phases

**Phase 1 — Core loop**
Single class, hardcoded roster, check in/out, durations, IndexedDB persistence. Proves the data model.

**Phase 2 — Teacher view**
Password gate, roster CRUD, class creation and theming, session correction table.

**Phase 3 — Export**
Date-range CSV export, per-student summary export.

**Phase 4 — PWA and deployment**
Manifest, service worker, storage persistence, GitHub Pages + Actions deploy.

**Phase 5 — Year lifecycle**
School-year namespacing, end-of-year export gate, purge with confirmation.

**Phase 6 — Polish**
Light/dark mode, animations, sound, multi-class switching, reduced-motion support.

Phases 1 through 4 constitute a usable product. Amanda could run a real class on it at the end of phase 4.

---

## 11. Open questions for Amanda

1. Does she need student IDs, or are name and grade enough? Optional field either way, but it affects the CSV columns.
2. Should the app enforce a school day window, refusing check-ins before 7 AM or after 5 PM? Prevents stray weekend taps.
3. How many classes realistically? If it's two or three, the sidebar picker is fine. If it's six, the class switcher deserves more design attention.
4. Does she want a daily total on the out-column cards, or is that clutter?
5. Who else touches the Chromebook? If a sub or an aide uses it, a second teacher account may be worth supporting.
6. What does she actually do with the CSV? If it feeds a specific spreadsheet, the column format should match it exactly rather than making her reshape it every time.
