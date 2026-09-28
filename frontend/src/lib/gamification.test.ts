import { describe, expect, it } from 'vitest'
import { levelFromXp } from './gamification'

describe('levelFromXp', () => {
  it('starts at level 1 and follows the organization scale', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0, nextLevelAt: 250, percent: 0 })
    expect(levelFromXp(260)).toMatchObject({ level: 2, xpIntoLevel: 10, nextLevelAt: 500, percent: 4 })
    expect(levelFromXp(260, 100)).toMatchObject({ level: 3, xpIntoLevel: 60, nextLevelAt: 300, percent: 60 })
  })

  it('survives bad input', () => {
    expect(levelFromXp(-5, 0).level).toBe(1)
    expect(levelFromXp(NaN, 250).level).toBe(1)
  })
})
