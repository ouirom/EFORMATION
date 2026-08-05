/**
 * Minimal CSV parser (comma-separated, double-quote escaping) — no external
 * dependency needed for the small admin-uploaded files this handles.
 * First row is treated as the header; returns one object per data row.
 */
export function parseCsv(content: string): Record<string, string>[] {
  const rows = splitCsvRows(content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, i) => {
        record[key] = (row[i] ?? '').trim();
      });
      return record;
    });
}

function splitCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
