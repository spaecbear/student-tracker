import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRecoveryCode } from '../auth/password'
import { setSupabaseForTests } from '../lib/supabase'

/**
 * An in-memory stand-in for the slice of Supabase the app uses, so the real
 * data layer and hooks run under test without a network. It mirrors what the
 * production schema does that the app relies on: per-teacher row ownership
 * (row level security), cascading deletes, the one-open-session-per-student
 * unique index, and the recovery-code functions.
 *
 * It is not a Postgres emulator. Add behavior here only when the app starts
 * to depend on it.
 */

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string; code?: string } | null }

export interface FakeUser {
  id: string
  email: string
  password: string
  displayName: string
}

const MAX_ROWS = 1000

const TABLES = ['classes', 'students', 'sessions', 'settings'] as const
type Table = (typeof TABLES)[number]

export class FakeSupabase {
  readonly tables: Record<Table, Row[]> = { classes: [], students: [], sessions: [], settings: [] }
  readonly users: FakeUser[] = []
  readonly recoveryHashes = new Map<string, string>()
  /** The signed-in user, i.e. the persisted device session. */
  currentUser: FakeUser | null = null
  /** When set, every request fails with this message (simulates being offline). */
  failWith: string | null = null
  private listeners = new Set<(event: string) => void>()
  private nextId = 1

  /** Registers a teacher directly, as if they signed up earlier. Does not sign in. */
  addUser(input: { username: string; password: string; displayName?: string }): FakeUser {
    const user: FakeUser = {
      id: `user-${this.nextId++}`,
      email: `${input.username}@student-tracker.app`,
      password: input.password,
      displayName: input.displayName ?? input.username,
    }
    this.users.push(user)
    return user
  }

  signInAs(user: FakeUser | null): void {
    this.currentUser = user
  }

  client(): SupabaseClient {
    return this.asClient()
  }

  private asClient(): SupabaseClient {
    return {
      from: (table: string) => new Query(this, table as Table),
      rpc: (name: string, args: Record<string, string>) => this.rpc(name, args),
      auth: {
        getSession: async () => ({
          data: { session: this.currentUser ? { user: this.authUser(this.currentUser) } : null },
          error: null,
        }),
        signUp: async (credentials: {
          email: string
          password: string
          options?: { data?: { display_name?: string } }
        }) => {
          if (this.failWith) return { data: { user: null, session: null }, error: { message: this.failWith } }
          if (this.users.some((u) => u.email === credentials.email.toLowerCase())) {
            return { data: { user: null, session: null }, error: { message: 'User already registered' } }
          }
          const user: FakeUser = {
            id: `user-${this.nextId++}`,
            email: credentials.email.toLowerCase(),
            password: credentials.password,
            displayName: credentials.options?.data?.display_name ?? '',
          }
          this.users.push(user)
          this.currentUser = user
          this.emit('SIGNED_IN')
          return { data: { user: this.authUser(user), session: { user: this.authUser(user) } }, error: null }
        },
        signInWithPassword: async (credentials: { email: string; password: string }) => {
          if (this.failWith) return { data: { user: null, session: null }, error: { message: this.failWith } }
          const user = this.users.find(
            (u) => u.email === credentials.email.toLowerCase() && u.password === credentials.password,
          )
          if (!user) {
            return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }
          }
          this.currentUser = user
          this.emit('SIGNED_IN')
          return { data: { user: this.authUser(user), session: { user: this.authUser(user) } }, error: null }
        },
        signOut: async () => {
          this.currentUser = null
          this.emit('SIGNED_OUT')
          return { error: null }
        },
        onAuthStateChange: (callback: (event: string) => void) => {
          this.listeners.add(callback)
          return { data: { subscription: { unsubscribe: () => this.listeners.delete(callback) } } }
        },
      },
    } as unknown as SupabaseClient
  }

  private authUser(user: FakeUser) {
    return { id: user.id, email: user.email, user_metadata: { display_name: user.displayName } }
  }

  private emit(event: string): void {
    for (const listener of this.listeners) listener(event)
  }

  private async rpc(name: string, args: Record<string, string>): Promise<Result> {
    if (this.failWith) return { data: null, error: { message: this.failWith } }
    if (name === 'set_recovery_code') {
      if (!this.currentUser) return { data: null, error: { message: 'Not signed in' } }
      this.recoveryHashes.set(this.currentUser.id, normalizeRecoveryCode(args['p_code'] ?? ''))
      return { data: null, error: null }
    }
    if (name === 'reset_password_with_code') {
      const user = this.users.find((u) => u.email === (args['p_email'] ?? '').toLowerCase())
      const stored = user ? this.recoveryHashes.get(user.id) : undefined
      if (!user || stored === undefined || stored !== normalizeRecoveryCode(args['p_code'] ?? '')) {
        return { data: false, error: null }
      }
      user.password = args['p_new_password'] ?? user.password
      return { data: true, error: null }
    }
    return { data: null, error: { message: `Unknown function ${name}` } }
  }

  /** Row-level security: a signed-in teacher sees only their own rows. */
  visible(table: Table): Row[] {
    const me = this.currentUser
    if (!me) return []
    return this.tables[table].filter((row) => row['teacher_id'] === me.id)
  }

  newRowId(): string {
    return `row-${this.nextId++}`
  }
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private payload: Row | Row[] = []
  private onConflict: string[] = []
  private filters: Array<(row: Row) => boolean> = []
  private orders: string[] = []
  private window: [number, number] | null = null
  private returning = true
  private single: 'maybe' | null = null

  private readonly fake: FakeSupabase
  private readonly table: Table

  constructor(fake: FakeSupabase, table: Table) {
    this.fake = fake
    this.table = table
  }

  select(_columns?: string): this {
    // After a write, select() asks for the written rows back; otherwise it is the read itself.
    if (this.op !== 'select') this.returning = true
    return this
  }
  insert(rows: Row | Row[]): this {
    this.op = 'insert'
    this.payload = rows
    this.returning = false
    return this
  }
  update(patch: Row): this {
    this.op = 'update'
    this.payload = patch
    this.returning = false
    return this
  }
  upsert(row: Row, options?: { onConflict?: string }): this {
    this.op = 'upsert'
    this.payload = row
    this.onConflict = (options?.onConflict ?? '').split(',').filter(Boolean)
    this.returning = false
    return this
  }
  delete(): this {
    this.op = 'delete'
    this.returning = false
    return this
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value)
    return this
  }
  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }
  is(column: string, value: null): this {
    this.filters.push((row) => (row[column] ?? null) === value)
    return this
  }
  gte(column: string, value: number): this {
    this.filters.push((row) => Number(row[column]) >= value)
    return this
  }
  lte(column: string, value: number): this {
    this.filters.push((row) => Number(row[column]) <= value)
    return this
  }
  order(column: string): this {
    this.orders.push(column)
    return this
  }
  range(from: number, to: number): this {
    this.window = [from, to]
    return this
  }
  returns<T>(): this & PromiseLike<{ data: T | null; error: { message: string } | null }> {
    return this as never
  }
  maybeSingle<T>(): PromiseLike<{ data: T | null; error: { message: string } | null }> {
    this.single = 'maybe'
    return this as never
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private fail(message: string, code?: string): Result {
    return { data: null, error: code ? { message, code } : { message } }
  }

  private matching(): Row[] {
    return this.fake.visible(this.table).filter((row) => this.filters.every((f) => f(row)))
  }

  private execute(): Result {
    const fake = this.fake
    if (fake.failWith) return this.fail(fake.failWith)
    const me = fake.currentUser
    const store = fake.tables[this.table]

    if (this.op !== 'select' && !me) return this.fail('permission denied')

    if (this.op === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        ...row,
        teacher_id: row['teacher_id'] ?? me?.id,
      }))
      const snapshot = [...store]
      store.push(...rows)
      const violation = this.violatesOpenIndex()
      if (violation) {
        store.splice(0, store.length, ...snapshot)
        return violation
      }
      return { data: this.returning ? rows : null, error: null }
    }

    if (this.op === 'upsert') {
      const incoming = this.payload as Row
      const row: Row = { ...incoming, teacher_id: incoming['teacher_id'] ?? me?.id }
      const keys = this.onConflict.length ? this.onConflict : ['id']
      const existing = store.find((r) => keys.every((k) => r[k] === row[k]))
      if (existing) Object.assign(existing, row)
      else store.push(row)
      return { data: null, error: null }
    }

    const hits = this.matching()

    if (this.op === 'update') {
      const before = hits.map((row) => ({ ...row }))
      for (const row of hits) Object.assign(row, this.payload)
      const violation = this.violatesOpenIndex()
      if (violation) {
        hits.forEach((row, i) => {
          for (const key of Object.keys(row)) delete row[key]
          Object.assign(row, before[i])
        })
        return violation
      }
      return { data: this.returning ? hits : null, error: null }
    }

    if (this.op === 'delete') {
      this.cascade(this.table, hits)
      return { data: this.returning ? hits : null, error: null }
    }

    // select
    let rows = [...hits]
    for (const column of [...this.orders].reverse()) {
      rows.sort((a, b) => {
        const left = a[column] as string | number
        const right = b[column] as string | number
        return left < right ? -1 : left > right ? 1 : 0
      })
    }
    // PostgREST returns at most 1,000 rows per request, however many match.
    const [start, end] = this.window ?? [0, MAX_ROWS - 1]
    rows = rows.slice(start, Math.min(end + 1, start + MAX_ROWS))
    if (this.single === 'maybe') {
      if (rows.length > 1) return this.fail('Multiple rows returned', 'PGRST116')
      return { data: rows[0] ?? null, error: null }
    }
    return { data: rows, error: null }
  }

  /** The sessions_one_open_per_student unique index. */
  private violatesOpenIndex(): Result | null {
    if (this.table !== 'sessions') return null
    const seen = new Set<unknown>()
    for (const row of this.fake.tables.sessions) {
      if ((row['check_out_at'] ?? null) !== null || row['needs_review'] === true) continue
      if (seen.has(row['student_id'])) {
        return this.fail('duplicate key value violates unique constraint "sessions_one_open_per_student"', '23505')
      }
      seen.add(row['student_id'])
    }
    return null
  }

  private cascade(table: Table, rows: Row[]): void {
    const ids = new Set(rows.map((r) => r['id']))
    const drop = (target: Table, keep: (row: Row) => boolean) => {
      const list = this.fake.tables[target]
      const kept = list.filter(keep)
      list.splice(0, list.length, ...kept)
    }
    if (table === 'settings') {
      const gone = new Set(rows)
      drop('settings', (row) => !gone.has(row))
      return
    }
    drop(table, (row) => !ids.has(row['id']))
    if (table === 'classes') {
      const studentIds = new Set(
        this.fake.tables.students.filter((s) => ids.has(s['class_id'])).map((s) => s['id']),
      )
      drop('students', (row) => !ids.has(row['class_id']))
      drop('sessions', (row) => !ids.has(row['class_id']) && !studentIds.has(row['student_id']))
    }
    if (table === 'students') {
      drop('sessions', (row) => !ids.has(row['student_id']))
    }
  }
}

let current: FakeSupabase | null = null

/** Installs a fresh empty fake as the app's Supabase client and returns it. */
export function installFakeSupabase(): FakeSupabase {
  current = new FakeSupabase()
  setSupabaseForTests(current.client())
  return current
}

export function fakeSupabase(): FakeSupabase {
  if (!current) throw new Error('installFakeSupabase() has not run')
  return current
}
