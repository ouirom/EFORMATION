import { describe, it, expect } from 'vitest';
import { idleLimitForLessonDuration } from './idleLimit';

describe('idleLimitForLessonDuration', () => {
  it('returns null for zero duration', () => {
    expect(idleLimitForLessonDuration(0)).toBeNull();
  });

  it('returns null for negative duration', () => {
    expect(idleLimitForLessonDuration(-5)).toBeNull();
  });

  it('returns null for null/undefined duration', () => {
    expect(idleLimitForLessonDuration(null)).toBeNull();
    expect(idleLimitForLessonDuration(undefined)).toBeNull();
  });

  it('clamps very short lessons to the 10-minute floor', () => {
    // 2 * 1.5 = 3 minutes, below the 10-minute floor
    expect(idleLimitForLessonDuration(2)).toBe(10 * 60 * 1000);
  });

  it('scales proportionally within the floor/ceiling range', () => {
    // 20 * 1.5 = 30 minutes, within [10, 60]
    expect(idleLimitForLessonDuration(20)).toBe(30 * 60 * 1000);
  });

  it('clamps long lessons to the 60-minute ceiling', () => {
    // 100 * 1.5 = 150 minutes, above the 60-minute ceiling
    expect(idleLimitForLessonDuration(100)).toBe(60 * 60 * 1000);
  });

  it('is exact at the floor boundary (durationMin that yields exactly 10min)', () => {
    // 10 / 1.5 ≈ 6.667 -> 6.667 * 1.5 = 10
    expect(idleLimitForLessonDuration(10 / 1.5)).toBe(10 * 60 * 1000);
  });
});
