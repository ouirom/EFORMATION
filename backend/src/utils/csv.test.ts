import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses a simple CSV with header', () => {
    const rows = parseCsv('email,displayName,role\nfoo@example.com,Foo Bar,agent\n');
    expect(rows).toEqual([{ email: 'foo@example.com', displayName: 'Foo Bar', role: 'agent' }]);
  });

  it('handles multiple data rows', () => {
    const rows = parseCsv(
      'email,role\na@example.com,agent\nb@example.com,manager\n'
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ email: 'b@example.com', role: 'manager' });
  });

  it('supports quoted fields containing commas', () => {
    const rows = parseCsv('email,displayName\na@example.com,"Doe, John"\n');
    expect(rows[0].displayName).toBe('Doe, John');
  });

  it('supports escaped double quotes inside quoted fields', () => {
    const rows = parseCsv('email,displayName\na@example.com,"He said ""hi"""\n');
    expect(rows[0].displayName).toBe('He said "hi"');
  });

  it('skips blank rows', () => {
    const rows = parseCsv('email,role\na@example.com,agent\n\n\nb@example.com,manager\n');
    expect(rows).toHaveLength(2);
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv('email,role\r\na@example.com,agent\r\n');
    expect(rows).toEqual([{ email: 'a@example.com', role: 'agent' }]);
  });

  it('returns an empty array for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('returns an empty array for header-only input', () => {
    expect(parseCsv('email,role\n')).toEqual([]);
  });

  it('fills missing trailing columns with empty strings', () => {
    const rows = parseCsv('email,displayName,role\na@example.com,Foo\n');
    expect(rows[0]).toEqual({ email: 'a@example.com', displayName: 'Foo', role: '' });
  });
});
