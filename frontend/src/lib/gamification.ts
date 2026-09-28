/**
 * Level for an XP total under the organization's scale (Administration >
 * Organisation > XP par niveau). Same formula as the server's levelFromXp
 * (tenant-settings.service.ts): levels start at 1, so the dashboard and the
 * profile always show the same level.
 */
export function levelFromXp(xp: number, xpPerLevel = 250) {
  const perLevel = Math.max(1, Math.trunc(xpPerLevel) || 250)
  const safeXp = Math.max(0, Math.trunc(xp || 0))
  const level = Math.floor(safeXp / perLevel) + 1
  const xpIntoLevel = safeXp % perLevel
  return {
    level,
    xpIntoLevel,
    xpPerLevel: perLevel,
    /** XP total at which the next level starts. */
    nextLevelAt: level * perLevel,
    /** 0-100, progress inside the current level. */
    percent: Math.round((xpIntoLevel / perLevel) * 100),
  }
}
