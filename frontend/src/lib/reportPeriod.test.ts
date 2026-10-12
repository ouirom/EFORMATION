import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERIOD,
  PERIOD_STORAGE_KEY,
  formatDayKey,
  loadPeriodSelection,
  parseDayKey,
  presetRange,
  resolvePeriod,
  savePeriodSelection,
  toDayKey,
  validateCustomRange,
} from './reportPeriod';

// Local dates (no "Z"): the logic must follow the viewer's calendar day.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('toDayKey / parseDayKey', () => {
  it('uses the local calendar day, even just before/after midnight', () => {
    expect(toDayKey(at(2026, 9, 1, 0))).toBe('2026-09-01');
    expect(toDayKey(new Date(2026, 8, 30, 23, 59, 59))).toBe('2026-09-30');
  });

  it('round-trips and rejects non-days', () => {
    expect(toDayKey(parseDayKey('2026-02-28')!)).toBe('2026-02-28');
    expect(parseDayKey('2026-02-29')).toBeNull();
    expect(parseDayKey('2028-02-29')).not.toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('2026-9-1')).toBeNull();
    expect(parseDayKey('')).toBeNull();
  });
});

describe('presetRange', () => {
  const today = at(2026, 10, 12);

  it('leaves "all" and "custom" open', () => {
    expect(presetRange('all', today)).toEqual({ start: '', end: '' });
    expect(presetRange('custom', today)).toEqual({ start: '', end: '' });
  });

  it('counts today in the last 7 / 30 days', () => {
    expect(presetRange('last7', today)).toEqual({ start: '2026-10-06', end: '2026-10-12' });
    expect(presetRange('last30', today)).toEqual({ start: '2026-09-13', end: '2026-10-12' });
  });

  it('crosses month and year boundaries', () => {
    expect(presetRange('last7', at(2026, 3, 3))).toEqual({ start: '2026-02-25', end: '2026-03-03' });
    expect(presetRange('last30', at(2026, 1, 10))).toEqual({ start: '2025-12-12', end: '2026-01-10' });
  });

  it('runs this month / quarter / year up to today', () => {
    expect(presetRange('thisMonth', today)).toEqual({ start: '2026-10-01', end: '2026-10-12' });
    expect(presetRange('thisQuarter', today)).toEqual({ start: '2026-10-01', end: '2026-10-12' });
    expect(presetRange('thisQuarter', at(2026, 6, 30))).toEqual({ start: '2026-04-01', end: '2026-06-30' });
    expect(presetRange('thisQuarter', at(2026, 2, 14))).toEqual({ start: '2026-01-01', end: '2026-02-14' });
    expect(presetRange('thisQuarter', at(2026, 9, 1))).toEqual({ start: '2026-07-01', end: '2026-09-01' });
    expect(presetRange('thisYear', today)).toEqual({ start: '2026-01-01', end: '2026-10-12' });
    expect(presetRange('thisMonth', at(2026, 1, 1))).toEqual({ start: '2026-01-01', end: '2026-01-01' });
  });

  it('gives the full previous month, including across the new year', () => {
    expect(presetRange('lastMonth', today)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(presetRange('lastMonth', at(2026, 1, 15))).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(presetRange('lastMonth', at(2026, 3, 31))).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('handles leap years', () => {
    expect(presetRange('lastMonth', at(2028, 3, 1))).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(presetRange('last7', at(2028, 3, 1))).toEqual({ start: '2028-02-24', end: '2028-03-01' });
    expect(presetRange('last30', at(2028, 3, 1))).toEqual({ start: '2028-02-01', end: '2028-03-01' });
    expect(presetRange('last30', at(2026, 3, 1))).toEqual({ start: '2026-01-31', end: '2026-03-01' });
  });
});

describe('validateCustomRange', () => {
  const today = at(2026, 10, 12);

  it('accepts a valid range, including a single day and today', () => {
    expect(validateCustomRange('2026-09-01', '2026-09-30', today)).toBeNull();
    expect(validateCustomRange('2026-10-12', '2026-10-12', today)).toBeNull();
  });

  it('requires both days', () => {
    expect(validateCustomRange('', '2026-09-30', today)).toBe('startRequired');
    expect(validateCustomRange('2026-09-01', '', today)).toBe('endRequired');
  });

  it('rejects impossible days, reversed ranges and the future', () => {
    expect(validateCustomRange('2026-02-30', '2026-03-01', today)).toBe('invalidDate');
    expect(validateCustomRange('2026-09-30', '2026-09-01', today)).toBe('endBeforeStart');
    expect(validateCustomRange('2026-10-01', '2026-10-13', today)).toBe('inFuture');
  });
});

describe('resolvePeriod', () => {
  const today = at(2026, 10, 12);

  it('resolves presets and valid custom ranges', () => {
    expect(resolvePeriod({ preset: 'lastMonth', customStart: '', customEnd: '' }, today))
      .toEqual({ range: { start: '2026-09-01', end: '2026-09-30' }, error: null });
    expect(resolvePeriod({ preset: 'custom', customStart: '2026-01-05', customEnd: '2026-02-05' }, today))
      .toEqual({ range: { start: '2026-01-05', end: '2026-02-05' }, error: null });
  });

  it('gives no range for an invalid custom range', () => {
    expect(resolvePeriod({ preset: 'custom', customStart: '2026-02-05', customEnd: '2026-01-05' }, today))
      .toEqual({ range: { start: '', end: '' }, error: 'endBeforeStart' });
  });
});

describe('formatDayKey', () => {
  it('writes the day in words for the locale', () => {
    expect(formatDayKey('2026-09-01', 'fr-FR')).toBe('1 sept. 2026');
    expect(formatDayKey('2026-09-30', 'en-US')).toBe('Sep 30, 2026');
  });
});

describe('load/savePeriodSelection', () => {
  const memory = () => {
    const data: Record<string, string> = {};
    return {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => { data[k] = v; },
      data,
    };
  };

  it('round-trips a selection', () => {
    const storage = memory();
    savePeriodSelection({ preset: 'custom', customStart: '2026-09-01', customEnd: '2026-09-30' }, storage);
    expect(loadPeriodSelection(storage)).toEqual({ preset: 'custom', customStart: '2026-09-01', customEnd: '2026-09-30' });
  });

  it('defaults to the whole period on missing, corrupt or unknown values', () => {
    const storage = memory();
    expect(loadPeriodSelection(storage)).toEqual(DEFAULT_PERIOD);
    storage.data[PERIOD_STORAGE_KEY] = '{not json';
    expect(loadPeriodSelection(storage)).toEqual(DEFAULT_PERIOD);
    storage.data[PERIOD_STORAGE_KEY] = JSON.stringify({ preset: 'lastDecade' });
    expect(loadPeriodSelection(storage)).toEqual(DEFAULT_PERIOD);
    storage.data[PERIOD_STORAGE_KEY] = JSON.stringify({ preset: 'last7', customStart: 42 });
    expect(loadPeriodSelection(storage)).toEqual({ preset: 'last7', customStart: '', customEnd: '' });
  });

  it('never throws when storage is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(loadPeriodSelection(blocked)).toEqual(DEFAULT_PERIOD);
    expect(() => savePeriodSelection(DEFAULT_PERIOD, blocked)).not.toThrow();
  });
});
