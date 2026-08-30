import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteBackup, listBackups, readBackup, writeBackup } from './opfs'

/** Minimal in-memory stand-in for OPFS; jsdom provides none. */
function fakeOpfs() {
  const files = new Map<string, string>()
  const directories = new Map<string, unknown>()

  const makeFileHandle = (name: string) => ({
    kind: 'file' as const,
    getFile: async () => ({
      size: new Blob([files.get(name) ?? '']).size,
      text: async () => files.get(name) ?? '',
    }),
    createWritable: async () => ({
      write: async (contents: string) => {
        files.set(name, contents)
      },
      close: async () => undefined,
    }),
  })

  const directory = {
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name)) {
        if (!options?.create) throw new Error('NotFoundError')
        files.set(name, '')
      }
      return makeFileHandle(name)
    },
    removeEntry: async (name: string) => {
      if (!files.delete(name)) throw new Error('NotFoundError')
    },
    entries: async function* () {
      for (const name of files.keys()) yield [name, makeFileHandle(name)] as const
    },
  }

  return {
    files,
    manager: {
      getDirectory: async () => ({
        getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
          if (!directories.has(name)) {
            if (!options?.create) throw new Error('NotFoundError')
            directories.set(name, directory)
          }
          return directory
        },
      }),
    },
  }
}

function withStorageManager(manager: unknown) {
  Object.defineProperty(navigator, 'storage', { value: manager, configurable: true })
}

let opfs: ReturnType<typeof fakeOpfs>

beforeEach(() => {
  opfs = fakeOpfs()
  withStorageManager(opfs.manager)
})

afterEach(() => {
  withStorageManager(undefined)
  vi.restoreAllMocks()
})

describe('OPFS backups', () => {
  it('writes a backup and reports its size', async () => {
    const size = await writeBackup('2025-2026_all-sessions.csv', 'Class,Last Name\r\nA,B')
    expect(size).toBe(20)
    expect(opfs.files.get('2025-2026_all-sessions.csv')).toContain('Class,Last Name')
  })

  it('reads a backup back out', async () => {
    await writeBackup('year.csv', 'hello')
    expect(await readBackup('year.csv')).toBe('hello')
    expect(await readBackup('missing.csv')).toBeNull()
  })

  it('lists backups by name', async () => {
    await writeBackup('b.csv', 'two')
    await writeBackup('a.csv', 'one')
    expect((await listBackups()).map((file) => file.name)).toEqual(['a.csv', 'b.csv'])
  })

  it('deletes a backup and reports a missing one', async () => {
    await writeBackup('year.csv', 'hello')
    expect(await deleteBackup('year.csv')).toBe(true)
    expect(await deleteBackup('year.csv')).toBe(false)
  })

  it('reports a missing backup capability instead of throwing', async () => {
    withStorageManager(undefined)
    expect(await writeBackup('year.csv', 'hello')).toBeNull()
    expect(await listBackups()).toEqual([])
    expect(await readBackup('year.csv')).toBeNull()
    expect(await deleteBackup('year.csv')).toBe(false)
  })

  it('reports a write failure as a missing backup rather than crashing the gate', async () => {
    withStorageManager({
      getDirectory: async () => ({
        getDirectoryHandle: async () => ({
          getFileHandle: async () => {
            throw new Error('quota')
          },
        }),
      }),
    })
    expect(await writeBackup('year.csv', 'hello')).toBeNull()
  })
})
