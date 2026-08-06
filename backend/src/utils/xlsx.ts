import ExcelJS from 'exceljs';
import { parseCsv } from './csv';

/**
 * Parses the first worksheet of an .xlsx file into one object per data row,
 * keyed by the (trimmed) header row — mirrors parseCsv's shape so import
 * routes can treat both formats identically.
 */
export async function parseXlsx(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;

    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const cell = row.getCell(colNumber);
      const value = cellToString(cell.value);
      record[header] = value;
      if (value !== '') hasValue = true;
    });

    if (hasValue) rows.push(record);
  }

  return rows;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in (value as any)) return String((value as any).text ?? '').trim();
  if (typeof value === 'object' && 'result' in (value as any)) return String((value as any).result ?? '').trim();
  return String(value).trim();
}

/**
 * Parses an uploaded spreadsheet (xlsx/xls) or CSV file into row objects,
 * dispatching on the original filename's extension.
 */
export async function parseSpreadsheet(file: Express.Multer.File): Promise<Record<string, string>[]> {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsx(file.buffer);
  }
  return parseCsv(file.buffer.toString('utf-8'));
}

export interface TemplateColumn {
  header: string;
  width?: number;
}

/**
 * Builds a downloadable .xlsx import template: a styled header row, optional
 * example rows beneath it, and an "Instructions" sheet explaining the columns.
 */
export async function buildXlsxTemplate(
  sheetTitle: string,
  columns: TemplateColumn[],
  exampleRows: (string | number)[][] = [],
  instructions: string[] = []
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetTitle);

  sheet.columns = columns.map((c) => ({ header: c.header, key: c.header, width: c.width || 24 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  exampleRows.forEach((row) => sheet.addRow(row));

  if (instructions.length > 0) {
    const infoSheet = workbook.addWorksheet('Instructions');
    infoSheet.columns = [{ header: 'Instructions', key: 'text', width: 110 }];
    infoSheet.getRow(1).font = { bold: true };
    instructions.forEach((line) => infoSheet.addRow([line]));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
