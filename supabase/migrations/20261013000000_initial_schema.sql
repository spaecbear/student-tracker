-- Student Tracker: initial schema.
-- All timestamps are epoch milliseconds (bigint), matching the app: no time zones or
-- formatted strings are ever stored.
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
  created_at   bigint not null
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
  created_at  bigint not null
);

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  class_id      uuid not null references public.classes (id) on delete cascade,
  school_year   text not null,
  check_in_at   bigint not null,
  check_out_at  bigint,
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

-- ---------------------------------------------------------------------------
-- Recovery codes
--
-- Teachers sign in with a username (stored as a synthetic email, so Supabase
-- Auth can be used) and have no real mailbox, so "forgot password" cannot be an
-- email link. Instead the app generates a one-time recovery code at sign-up.
-- Only its SHA-256 is stored, in a table no API role can read. The two functions
-- below are the only way in.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create table public.recovery_codes (
  teacher_id uuid primary key references auth.users (id) on delete cascade,
  code_hash  text not null
);
alter table public.recovery_codes enable row level security;
-- Deliberately no policies: the table is unreachable except through the functions.

create function public.normalize_recovery_code(p_code text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^0-9a-zA-Z]', '', 'g'))
$$;

-- Stores (or replaces) the signed-in teacher's recovery code.
create function public.set_recovery_code(p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.recovery_codes (teacher_id, code_hash)
  values (auth.uid(), encode(digest(public.normalize_recovery_code(p_code), 'sha256'), 'hex'))
  on conflict (teacher_id) do update set code_hash = excluded.code_hash;
end;
$$;

-- Sets a new password when the recovery code matches. Callable while signed out.
-- Returns false for an unknown user or a wrong code (and waits a second, so
-- guessing is slow). The 16-character code has 80 bits of entropy.
create function public.reset_password_with_code(p_email text, p_code text, p_new_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id   uuid;
  v_hash text;
begin
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select u.id, r.code_hash into v_id, v_hash
  from auth.users u
  join public.recovery_codes r on r.teacher_id = u.id
  where lower(u.email) = lower(p_email);

  if v_id is null
     or v_hash <> encode(digest(public.normalize_recovery_code(p_code), 'sha256'), 'hex') then
    perform pg_sleep(1);
    return false;
  end if;

  update auth.users
     set encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   where id = v_id;
  return true;
end;
$$;

revoke all on function public.set_recovery_code(text) from public, anon;
grant execute on function public.set_recovery_code(text) to authenticated;
revoke all on function public.reset_password_with_code(text, text, text) from public;
grant execute on function public.reset_password_with_code(text, text, text) to anon, authenticated;
