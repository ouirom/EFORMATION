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

export function downloadCsv(
  filename: string,
  columns: { key: string; label: string }[],
  rows: Record<string, any>[]
) {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
  // BOM so Excel opens UTF-8 (accented French labels/values) correctly.
  const csv = '﻿' + [header, ...lines].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.parentNode?.removeChild(link)
  window.URL.revokeObjectURL(url)
}
