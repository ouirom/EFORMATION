import { describe, it, expect } from 'vitest';
import { EMPTY_CHOICE, MAX_CHOICES, cellMatches, choicesFor, parseNumberFilter } from './reportFilters';

describe('parseNumberFilter', () => {
  const test = (expr: string, value: number) => {
    const predicate = parseNumberFilter(expr);
    if (!predicate) throw new Error(`"${expr}" did not parse`);
    return predicate(value);
  };

  it('handles comparisons, equality and ranges', () => {
    expect(test('>50', 51)).toBe(true);
    expect(test('>50', 50)).toBe(false);
    expect(test('>= 50', 50)).toBe(true);
    expect(test('<10', 9.9)).toBe(true);
    expect(test('<=10', 10)).toBe(true);
    expect(test('=5', 5)).toBe(true);
    expect(test('5', 6)).toBe(false);
    expect(test('10-20', 15)).toBe(true);
    expect(test('10..20', 21)).toBe(false);
    expect(test('20-10', 15)).toBe(true); // reversed bounds
  });

  it('accepts French decimals and a percent sign', () => {
    expect(test('>32,5', 32.8)).toBe(true);
    expect(test('<= 50 %', 50)).toBe(true);
  });

  it('distinguishes an empty expression from an invalid one', () => {
    expect(parseNumberFilter('  ')).toBeUndefined();
    expect(parseNumberFilter('abc')).toBeNull();
    expect(parseNumberFilter('>')).toBeNull();
  });
});

describe('cellMatches', () => {
  it('matches text accent- and case-insensitively on the displayed value', () => {
    expect(cellMatches('text', 'crepin', 'Djizo Crépin', 'Djizo Crépin')).toBe(true);
    expect(cellMatches('text', '27/09', '2026-09-27T10:00:00Z', '27/09/2026 12:00')).toBe(true);
    expect(cellMatches('text', 'zzz', 'abc', 'abc')).toBe(false);
  });

  it('filters numbers on the raw value and rejects invalid expressions or empty cells', () => {
    expect(cellMatches('number', '>40', 44, '44 %')).toBe(true);
    expect(cellMatches('number', '>40', null, '—')).toBe(false);
    expect(cellMatches('number', 'abc', 44, '44')).toBe(false);
  });

  it('matches a chosen value exactly, or empty cells with the empty choice', () => {
    expect(cellMatches('choice', 'Agent', 'agent', 'Agent')).toBe(true);
    expect(cellMatches('choice', 'Agent', 'Agent Demo', 'Agent Demo')).toBe(false);
    expect(cellMatches('choice', EMPTY_CHOICE, null, '—')).toBe(true);
    expect(cellMatches('choice', EMPTY_CHOICE, 'x', 'x')).toBe(false);
  });

  it('lets everything through when the filter is empty', () => {
    expect(cellMatches('number', '', null, '—')).toBe(true);
  });
});

describe('choicesFor', () => {
  it('lists sorted distinct values when there are few, ignoring empties', () => {
    expect(choicesFor(['Manager', 'Agent', '', 'Agent', 'Cours 10', 'Cours 2'])).toEqual(['Agent', 'Cours 2', 'Cours 10', 'Manager']);
  });

  it('falls back to free text when there are too many values', () => {
    expect(choicesFor(Array.from({ length: MAX_CHOICES + 1 }, (_, i) => `v${i}`))).toBeNull();
    expect(choicesFor(['', ''])).toBeNull();
  });
});
