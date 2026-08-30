/**
 * File download. Kept out of `domain/` because it touches the DOM, and out of
 * the components because they should not be building object URLs.
 */

/**
 * Excel on Windows reads a BOM-less UTF-8 CSV as the system codepage, which
 * mangles any name with an accent. The BOM costs three bytes and fixes it;
 * Sheets and Numbers ignore it.
 */
const UTF8_BOM = '﻿'

export interface DownloadResult {
  fileName: string
  bytes: number
}

/**
 * Hands the browser a CSV to save. The browser will not tell us where the file
 * landed or whether the save completed — which is exactly why the year-end
 * purge asks the teacher to confirm rather than trusting this call.
 */
export function downloadCsv(fileName: string, csv: string): DownloadResult {
  const blob = new Blob([UTF8_BOM, csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke on the next frame; revoking synchronously can cancel the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { fileName, bytes: blob.size }
}
