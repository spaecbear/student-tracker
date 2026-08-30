import { withDB } from './schema'

/** App-level flags. Never used for roster or session data. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await withDB('get setting', (db) => db.get('settings', key))
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await withDB('set setting', (db) => db.put('settings', { key, value }))
}
