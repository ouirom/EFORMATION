import { formatCell, periodLabel, presentRows, reportColumns, reportTitle } from './reportFormatting';

describe('reportFormatting', () => {
  it('labels columns in the requested language, humanizing unknown keys', () => {
    const rows = [{ display_name: 'A', avg_progress: '10', some_new_column: 1 }];
    expect(reportColumns(rows, 'fr').map((c) => c.label)).toEqual(['Nom', 'Progression moyenne', 'Some new column']);
    expect(reportColumns(rows, 'en').map((c) => c.label)).toEqual(['Name', 'Average progress', 'Some new column']);
    expect(reportColumns(rows, 'fr')[1].kind).toBe('percent');
    expect(reportColumns([], 'fr')).toEqual([]);
  });

  it('turns Postgres numeric strings into rounded numbers and translates coded values', () => {
    const [row] = presentRows([{ avg_progress: '33.3333333333', role: 'agent', badge_type: 'trophy', email: '12.5' }], 'fr');
    expect(row).toEqual({ avg_progress: 33.3, role: 'Agent', badge_type: 'Trophée', email: '12.5' });
    expect(presentRows([{ role: 'director' }], 'en')[0].role).toBe('Director');
  });

  it('formats cells per language and time zone', () => {
    expect(formatCell(33.3, 'percent', 'fr')).toBe('33,3 %');
    expect(formatCell(33.3, 'percent', 'en')).toBe('33.3%');
    expect(formatCell(1234.5, 'number', 'en')).toBe('1,234.5');
    expect(formatCell('2026-09-27T22:30:00Z', 'datetime', 'fr', 'Europe/Paris')).toBe('28/09/2026 00:30');
    expect(formatCell('2026-09-27', 'date', 'fr')).toBe('27/09/2026');
    expect(formatCell(null, 'text', 'fr')).toBe('');
  });

  it('describes the period and titles the report', () => {
    expect(periodLabel('fr', '2026-01-01', '2026-03-31')).toBe('du 01/01/2026 au 31/03/2026');
    expect(periodLabel('en')).toBe('all time');
    expect(reportTitle('course_completion', 'fr')).toBe('Complétion des cours');
  });
});
