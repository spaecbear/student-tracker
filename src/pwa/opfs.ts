/**
 * Origin Private File System backups.
 *
 * A browser download cannot be verified: we are told neither whether it
 * completed nor where it landed. Writing the same bytes into OPFS gives the
 * year-end purge something durable to point at — a copy that survives even if
 * the download silently failed or was saved somewhere Amanda never looks.
 *
 * OPFS is not a substitute for the downloaded file. It lives inside the same
 * origin storage that eviction would take, which is why the gate still asks
 * her to confirm she has the real file.
 */

const BACKUP_DIRECTORY = 'year-end-backups'

export interface BackupFile {
  name: string
  sizeBytes: number
}

function supportsOpfs(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
}

async function backupDirectory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsOpfs()) return null
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(BACKUP_DIRECTORY, { create })
  } catch {
    return null
  }
}

/**
 * Writes one CSV into the backup directory. Returns the bytes written, or null
 * if this browser has no OPFS — a missing backup is reported to the teacher
 * rather than swallowed.
 */
export async function writeBackup(fileName: string, contents: string): Promise<number | null> {
  const directory = await backupDirectory(true)
  if (!directory) return null
  try {
    const file = await directory.getFileHandle(fileName, { create: true })
    const writable = await file.createWritable()
    await writable.write(contents)
    await writable.close()
    return new Blob([contents]).size
  } catch {
    return null
  }
}

export async function listBackups(): Promise<BackupFile[]> {
  const directory = await backupDirectory(false)
  if (!directory) return []
  const files: BackupFile[] = []
  try {
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== 'file') continue
      const file = await handle.getFile()
      files.push({ name, sizeBytes: file.size })
    }
  } catch {
    return files
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

/** Reads a backup back out, so the teacher can re-download it later. */
export async function readBackup(fileName: string): Promise<string | null> {
  const directory = await backupDirectory(false)
  if (!directory) return null
  try {
    const handle = await directory.getFileHandle(fileName)
    return await (await handle.getFile()).text()
  } catch {
    return null
  }
}

export async function deleteBackup(fileName: string): Promise<boolean> {
  const directory = await backupDirectory(false)
  if (!directory) return false
  try {
    await directory.removeEntry(fileName)
    return true
  } catch {
    return false
  }
}
