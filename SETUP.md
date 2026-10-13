# Hosted setup: Supabase + Netlify

This branch stores data in Supabase (Postgres) and serves the app from Netlify. Follow the steps
in order; the whole thing takes about 20 minutes. Everything here is free-tier.

## How sign-in works

* Teachers create an account **inside the app** with a username and password. They never visit
  Supabase.
* Supabase Auth wants an email, so the app stores each username as `username@student-tracker.app`
  behind the scenes. No email is ever sent.
* Creating an account shows a **recovery code** (e.g. `K7QM-3F9T-XR2W-8HND`). It is the only way a
  teacher can reset a forgotten password without an email. Only a hash of it is stored.
* The Chromebook stays signed in so students can tap their names. The teacher view asks for the
  password again, and re-locks after 5 minutes or when you go back to the class.
* Anyone with the link can create an account (by design for now). Each account only ever sees its
  own data (row-level security in the database).

## 1. Supabase

An existing Supabase or Netlify account is fine: just add a new project / new site (or a
separate organization / team) for this app.

1. Sign up at <https://supabase.com> (or sign in) and create a **New project**. Pick a region near the school
   and save the database password somewhere safe (you will rarely need it).
2. **SQL Editor → New query**, paste the whole of
   `supabase/migrations/20261013000000_initial_schema.sql`, and press **Run**. It should finish
   with "Success".
3. **Authentication → Sign In / Providers → Email**: keep Email enabled and **turn off "Confirm
   email"**. This is required: usernames have no real mailbox, so a confirmation email could never
   be answered.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
   *Never* put the `service_role` key in the app or in Netlify.

## 2. Netlify

1. Sign up at <https://netlify.com> → **Add new site → Import an existing project → GitHub**,
   choose this repository, and set the **branch to deploy** to `supabase-netlify`.
   Build settings come from `netlify.toml` (`npm run build`, publish `dist`).
2. **Site configuration → Environment variables**, add:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | the Project URL from step 1.4 |
   | `VITE_SUPABASE_ANON_KEY` | the anon public key from step 1.4 |

3. **Deploys → Trigger deploy → Deploy site** (variables are baked in at build time, so deploy
   again after changing them).
4. Optional: **Domain management** lets you rename `something.netlify.app` to something friendlier.

Back in Supabase, set **Authentication → URL Configuration → Site URL** to the Netlify address.

## 3. First run

1. Open the Netlify address, press **Create a teacher account**, make an account, and write down
   the recovery code.
2. In another browser (or after signing out) check that **Sign in** works and that **I forgot my
   password** accepts the recovery code.
3. Create a class, add a student, tap their card. The row appears in **Supabase → Table Editor →
   sessions**.

### If sign-up says the username/email is invalid

Supabase checks the domain of the synthetic email. If it rejects `student-tracker.app`, set a
`VITE_AUTH_EMAIL_DOMAIN` variable in Netlify to a domain you control (any real domain with working
DNS) and redeploy. Pick it **before** teachers sign up: changing it later orphans existing accounts.

## Local development

```sh
cp .env.example .env.local   # then fill in the two values
npm install
npm run dev
```

`npm test` needs no Supabase project: it runs against an in-memory stand-in
(`src/test/fakeSupabase.ts`).

## Things to know

* **The app needs a connection** to check students in and out. Taps made offline fail with an
  error and must be repeated; nothing is queued on the device.
* **Forgotten password and lost recovery code:** you, as project owner, can set a new password in
  Supabase → Authentication → Users → the user's menu → *Update user*. The teacher can then make a
  new recovery code under Settings → Account.
* **Backups:** Supabase free projects pause after a week of no activity and have limited backups.
  The CSV export is still the real archive; keep exporting.
* **Not yet exercised against a live project.** The SQL has been syntax-checked and the app tested
  against a stand-in, but the first run on real Supabase is the real test. Report anything odd.
