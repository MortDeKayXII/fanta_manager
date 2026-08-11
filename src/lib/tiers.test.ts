import { describe, expect, it } from 'vitest'

import { findTier, tierLabel, tierRank } from './tiers'

describe('tier helpers', () => {
  it('handles missing tiers arrays without crashing', () => {
    expect(findTier(undefined as any, 'tit')).toBeUndefined()
    expect(tierLabel(undefined as any, 'tit')).toBe('tit')
    expect(tierRank(undefined as any, 'tit')).toBe(0)
  })

  it('resolves a known tier from the configured list', () => {
    const tiers = [{ id: 'tit', label: 'Titolare', color: 'amber' as const }]

    expect(findTier(tiers, 'tit')?.label).toBe('Titolare')
    expect(tierLabel(tiers, 'tit')).toBe('Titolare')
    expect(tierRank(tiers, 'tit')).toBe(0)
  })
})
