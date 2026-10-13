-- Student Tracker: initial schema.
-- Teachers are Supabase Auth users (auth.users); there is no teachers table.
-- Every row is owned by a teacher and protected by row level security, so the
-- public anon key shipped in the browser can only ever see its own teacher's data.

create table public.classes (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  color_theme  text not null default 'teal',
  school_year  text not null,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  class_id    uuid not null references public.classes (id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  grade       text not null default '',
  student_id  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  class_id      uuid not null references public.classes (id) on delete cascade,
  school_year   text not null,
  check_in_at   timestamptz not null,
  check_out_at  timestamptz,
  duration_ms   bigint,
  needs_review  boolean not null default false
);

create table public.settings (
  teacher_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null,
  value       jsonb,
  primary key (teacher_id, key)
);

create index students_by_class on public.students (class_id);
create index classes_by_year on public.classes (teacher_id, school_year);
create index sessions_by_class_checkin on public.sessions (class_id, check_in_at);
create index sessions_by_year on public.sessions (teacher_id, school_year);
-- Replaces the client-side openMarker: at most one open session per student,
-- enforced by the database so two devices cannot double check-in.
create unique index sessions_one_open_per_student
  on public.sessions (student_id) where check_out_at is null and needs_review = false;

alter table public.classes  enable row level security;
alter table public.students enable row level security;
alter table public.sessions enable row level security;
alter table public.settings enable row level security;

create policy "own classes"  on public.classes  for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "own students" on public.students for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "own sessions" on public.sessions for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "own settings" on public.settings for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
