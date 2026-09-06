import { computeCurrentStreak, computeLongestStreak } from './analytics.routes';

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
