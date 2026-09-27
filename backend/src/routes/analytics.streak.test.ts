import { computeCurrentStreak, computeLongestStreak } from './analytics.routes';
import { dayKey } from '../utils/tenantTime';

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('computeCurrentStreak', () => {
  it('is 0 when there is no activity at all', () => {
    expect(computeCurrentStreak(new Set())).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const days = new Set([daysAgo(0), daysAgo(1), daysAgo(2)]);
    expect(computeCurrentStreak(days)).toBe(3);
  });

  it('still counts the streak if today has no activity yet but yesterday does', () => {
    const days = new Set([daysAgo(1), daysAgo(2), daysAgo(3)]);
    expect(computeCurrentStreak(days)).toBe(3);
  });

  it('resets to 0 once there is a gap before yesterday', () => {
    const days = new Set([daysAgo(3), daysAgo(4)]);
    expect(computeCurrentStreak(days)).toBe(0);
  });

  it('stops counting at the first gap', () => {
    const days = new Set([daysAgo(0), daysAgo(1), daysAgo(3)]); // gap at day 2
    expect(computeCurrentStreak(days)).toBe(2);
  });
});

describe('computeLongestStreak', () => {
  it('is 0 for no activity', () => {
    expect(computeLongestStreak(new Set())).toBe(0);
  });

  it('finds the longest run even if it is not the most recent one', () => {
    const days = new Set([
      daysAgo(0), // isolated day, streak of 1
      daysAgo(10), daysAgo(11), daysAgo(12), daysAgo(13), // streak of 4, further back
    ]);
    expect(computeLongestStreak(days)).toBe(4);
  });

  it('counts every day once for a single unbroken run', () => {
    const days = new Set([daysAgo(0), daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(4)]);
    expect(computeLongestStreak(days)).toBe(5);
  });
});

describe('computeCurrentStreak in the tenant time zone', () => {
  // 00:30 on 28 Sept in Paris (UTC+2) is still 27 Sept in UTC.
  const now = new Date('2026-09-27T22:30:00Z');
  const activity = [
    new Date('2026-09-27T22:10:00Z'), // 28 Sept 00:10 in Paris
    new Date('2026-09-26T10:00:00Z'),
    new Date('2026-09-25T10:00:00Z'),
  ];
  const daysIn = (tz: string) => new Set(activity.map((d) => dayKey(d, tz)));

  it('counts activity just after local midnight on the local day, not the UTC one', () => {
    // Paris: active on the 28th, 26th, 25th -> nothing on the 27th, so the run is just today.
    expect(computeCurrentStreak(daysIn('Europe/Paris'), 'Europe/Paris', now)).toBe(1);
    // UTC saw 27th, 26th, 25th and reported a 3-day streak that the learner never had.
    expect(computeCurrentStreak(daysIn('UTC'), 'UTC', now)).toBe(3);
  });

  it('falls back to UTC for an invalid time zone instead of throwing', () => {
    expect(dayKey(new Date('2026-09-27T22:30:00Z'), 'Not/AZone')).toBe('2026-09-27');
  });
});
