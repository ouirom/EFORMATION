import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadCsv, downloadMultiSectionCsv } from './csv';

// UTF-8 BOM character (U+FEFF), spelled out as a code point instead of a
// literal character in source so eslint's no-irregular-whitespace rule doesn't flag it.
const BOM = String.fromCharCode(0xfeff);

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

// downloadCsv/downloadMultiSectionCsv build a CSV string, wrap it in a Blob, and
// trigger a browser download via an <a download> click. The download plumbing
// itself isn't worth testing, but the CSV-escaping logic (commas/quotes/newlines,
// UTF-8 BOM) is real logic with real edge cases -- so we intercept the Blob that
// would have been downloaded and assert on its text content.
async function captureDownloadedCsv(trigger: () => void): Promise<string> {
  let capturedBlob: Blob | null = null;
  const createObjectURLSpy = vi
    .spyOn(window.URL, 'createObjectURL')
    .mockImplementation((obj: Blob | MediaSource) => {
      capturedBlob = obj as Blob;
      return 'blob:mock-url';
    });
  vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});

  trigger();

  createObjectURLSpy.mockRestore();
  expect(capturedBlob).not.toBeNull();
  return await (capturedBlob as unknown as Blob).text();
}

describe('downloadCsv', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('builds a header row from column labels and one row per record', async () => {
    const text = await captureDownloadedCsv(() =>
      downloadCsv(
        'export.csv',
        [
          { key: 'name', label: 'Nom' },
          { key: 'score', label: 'Score' },
        ],
        [
          { name: 'Alice', score: 90 },
          { name: 'Bob', score: 75 },
        ]
      )
    );

    expect(stripBom(text)).toBe('Nom,Score\r\nAlice,90\r\nBob,75');
  });

  it('quotes and escapes cells containing commas, quotes, or newlines', async () => {
    const text = await captureDownloadedCsv(() =>
      downloadCsv(
        'export.csv',
        [{ key: 'note', label: 'Note' }],
        [{ note: 'Contains, a comma' }, { note: 'Has "quotes"' }, { note: 'Multi\nline' }]
      )
    );
    const withoutBom = stripBom(text);
    const lines = withoutBom.split('\r\n');

    expect(lines[0]).toBe('Note');
    expect(lines[1]).toBe('"Contains, a comma"');
    expect(lines[2]).toBe('"Has ""quotes"""');
    // The embedded newline is preserved inside the quoted cell, not treated as a row break.
    expect(withoutBom).toContain('"Multi\nline"');
  });

  it('renders null/undefined cell values as empty strings', async () => {
    const text = await captureDownloadedCsv(() =>
      downloadCsv('export.csv', [{ key: 'value', label: 'Value' }], [{ value: null }, { value: undefined }])
    );
    expect(stripBom(text)).toBe('Value\r\n\r\n');
  });

  it('triggers a single anchor click to start the download', () => {
    downloadCsv('export.csv', [{ key: 'a', label: 'A' }], [{ a: 1 }]);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe('downloadMultiSectionCsv', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('stacks multiple titled sections separated by a blank line', async () => {
    const text = await captureDownloadedCsv(() =>
      downloadMultiSectionCsv('report.csv', [
        {
          title: 'Enrollments',
          columns: [{ key: 'course', label: 'Course' }],
          rows: [{ course: 'React 101' }],
        },
        {
          title: 'Completions',
          columns: [{ key: 'course', label: 'Course' }],
          rows: [{ course: 'React 101' }],
        },
      ])
    );
    expect(stripBom(text)).toBe(
      'Enrollments\r\nCourse\r\nReact 101\r\n\r\nCompletions\r\nCourse\r\nReact 101'
    );
  });
});
