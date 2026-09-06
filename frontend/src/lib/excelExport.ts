import ExcelJS from 'exceljs'

const NAVY = 'FF1E2761'
const HEADER_FILL = 'FFEEF1FB'
const BORDER = { style: 'thin' as const, color: { argb: 'FFE0E3F3' } }

export interface ExcelColumn {
  key: string
  label: string
  width?: number
}

export interface ExcelSection {
  sheetName: string
  title: string
  columns: ExcelColumn[]
  rows: Record<string, any>[]
  /** PNG data URL (from lib/charts.ts) placed above the data table, if any. */
  chartDataUrl?: string
  chartWidthPx?: number
  chartHeightPx?: number
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? dataUrl
}

export async function buildAnalyticsWorkbook(sections: ExcelSection[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'E-Formation'
  workbook.created = new Date()

  for (const section of sections) {
    const sheet = workbook.addWorksheet(section.sheetName.slice(0, 31))
    let row = 1

    sheet.getCell(row, 1).value = section.title
    sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: NAVY } }
    row += 2

    let chartRows = 0
    if (section.chartDataUrl) {
      const imageId = workbook.addImage({ base64: dataUrlToBase64(section.chartDataUrl), extension: 'png' })
      const wPx = section.chartWidthPx ?? 640
      const hPx = section.chartHeightPx ?? 260
      sheet.addImage(imageId, {
        tl: { col: 0, row: row - 1 },
        ext: { width: wPx, height: hPx },
      })
      chartRows = Math.ceil(hPx / 20) + 1
      row += chartRows
    }

    const headerRow = row
    section.columns.forEach((col, i) => {
      const cell = sheet.getCell(headerRow, i + 1)
      cell.value = col.label
      cell.font = { bold: true, color: { argb: NAVY } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
      sheet.getColumn(i + 1).width = col.width ?? Math.max(14, col.label.length + 4)
    })
    row += 1

    section.rows.forEach((dataRow) => {
      section.columns.forEach((col, i) => {
        const cell = sheet.getCell(row, i + 1)
        cell.value = dataRow[col.key] ?? ''
        cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
      })
      row += 1
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.parentNode?.removeChild(link)
  window.URL.revokeObjectURL(url)
}
