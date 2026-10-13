import { db, run } from './schema'

/** Per-teacher app flags. Never used for roster or session data. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await run(
    'get setting',
    db().from('settings').select('value').eq('key', key).maybeSingle<{ value: T | null }>(),
  )
  return row === null || row.value === null ? fallback : row.value
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await run(
    'set setting',
    db().from('settings').upsert({ key, value }, { onConflict: 'teacher_id,key' }),
  )
}
