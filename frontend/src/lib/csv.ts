// Client-side CSV export for admin tables that don't have a dedicated backend
// export endpoint (see AdminLogsPage.tsx for the backend-generated-blob pattern,
// used where the export needs data beyond what's already loaded client-side).
// Exports exactly what's currently loaded/filtered in the table.

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function triggerCsvDownload(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 (accented French labels/values) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.parentNode?.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export function downloadCsv(
  filename: string,
  columns: { key: string; label: string }[],
  rows: Record<string, any>[]
) {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
  triggerCsvDownload(filename, [header, ...lines].join('\r\n'))
}

/**
 * Stacks several independent tables (own title, own columns) into a single CSV
 * file, each section separated by a blank line -- for exports that cover more
 * than one logical table (e.g. a dashboard with several breakdowns) without
 * forcing them into one artificial flat shape.
 */
export function downloadMultiSectionCsv(
  filename: string,
  sections: { title: string; columns: { key: string; label: string }[]; rows: Record<string, any>[] }[]
) {
  const blocks = sections.map(({ title, columns, rows }) => {
    const header = columns.map((c) => escapeCsvCell(c.label)).join(',')
    const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
    return [escapeCsvCell(title), header, ...lines].join('\r\n')
  })
  triggerCsvDownload(filename, blocks.join('\r\n\r\n'))
}
