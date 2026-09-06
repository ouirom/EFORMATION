import { describe, it, expect } from 'vitest';
import {
  cn,
  dateLocale,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatDuration,
  formatFileSize,
  getInitials,
  slugify,
  truncate,
  calculateProgress,
  hexToHslTriplet,
} from './utils';

// The app defaults to French (fallbackLng: 'fr' in src/i18n/index.ts, and jsdom's
// localStorage is empty in tests), so dateLocale()/formatDate() etc. resolve to
// the French locale/strings unless a test explicitly changes i18n.language.
describe('dateLocale', () => {
  it('defaults to fr-FR', () => {
    expect(dateLocale()).toBe('fr-FR');
  });
});

describe('formatDate', () => {
  it('formats a date in long French form', () => {
    expect(formatDate('2024-01-15T00:00:00Z')).toBe('15 janvier 2024');
  });

  it('accepts a Date instance', () => {
    expect(formatDate(new Date(2023, 11, 25))).toBe('25 décembre 2023');
  });
});

describe('formatDateTime', () => {
  it('formats a date with short month and time', () => {
    const result = formatDateTime('2024-01-15T14:30:00');
    expect(result).toContain('2024');
    expect(result).toMatch(/14[:h]30/);
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for a timestamp seconds ago', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe("À l'instant");
  });

  it('returns minutes-ago for a timestamp under an hour old', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinAgo)).toBe('Il y a 5 min');
  });

  it('returns hours-ago for a timestamp under a day old', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeHoursAgo)).toBe('Il y a 3h');
  });

  it('falls back to formatDate for timestamps a week or older', () => {
    const longAgo = new Date('2024-01-15T00:00:00Z');
    expect(formatRelativeTime(longAgo)).toBe(formatDate(longAgo));
  });
});

describe('formatDuration', () => {
  it('renders sub-hour durations in minutes', () => {
    expect(formatDuration(45)).toBe('45 min');
  });

  it('renders exact-hour durations without minutes', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('renders mixed hour+minute durations', () => {
    expect(formatDuration(125)).toBe('2h 5min');
  });
});

describe('formatFileSize', () => {
  it('handles zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes, KB, MB, GB', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('getInitials', () => {
  it('builds initials from a two-word name', () => {
    expect(getInitials('Jean Dupont')).toBe('JD');
  });

  it('caps at two characters for longer names', () => {
    expect(getInitials('Jean Marie Dupont')).toBe('JM');
  });

  it('handles a single-word name', () => {
    expect(getInitials('Cher')).toBe('C');
  });
});

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips accents', () => {
    expect(slugify('Éducation Générale')).toBe('education-generale');
  });

  it('trims leading/trailing dashes from punctuation', () => {
    expect(slugify('  --Formation!!--  ')).toBe('formation');
  });
});

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates and appends an ellipsis when too long', () => {
    expect(truncate('this is a long string', 7)).toBe('this is...');
  });
});

describe('calculateProgress', () => {
  it('returns 0 when total is 0 (avoids divide-by-zero)', () => {
    expect(calculateProgress(3, 0)).toBe(0);
  });

  it('rounds to the nearest percent', () => {
    expect(calculateProgress(1, 3)).toBe(33);
  });

  it('returns 100 when completed equals total', () => {
    expect(calculateProgress(5, 5)).toBe(100);
  });
});

describe('hexToHslTriplet', () => {
  it('converts pure red', () => {
    expect(hexToHslTriplet('#ff0000')).toBe('0.0 100.0% 50.0%');
  });

  it('converts white', () => {
    expect(hexToHslTriplet('#ffffff')).toBe('0.0 0.0% 100.0%');
  });

  it('accepts hex without a leading #', () => {
    expect(hexToHslTriplet('00ff00')).toBe('120.0 100.0% 50.0%');
  });

  it('returns null for invalid input', () => {
    expect(hexToHslTriplet('not-a-color')).toBeNull();
    expect(hexToHslTriplet('#fff')).toBeNull();
  });
});

describe('cn', () => {
  it('merges class names and dedupes conflicting Tailwind utilities', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
