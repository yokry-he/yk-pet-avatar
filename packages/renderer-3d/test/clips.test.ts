import { describe, expect, it } from 'vitest'
import { resolveClipName } from '../src/clips'

describe('glTF clip mapping', () => {
  const names = ['Idle_Breath', 'Walk_Cycle', 'Sleeping', 'Wave']

  it('prefers an explicit map and otherwise fuzzy-matches', () => {
    expect(resolveClipName(names, 'walk', { walk: 'Wave' })).toBe('Wave')
    expect(resolveClipName(names, 'walk')).toBe('Walk_Cycle')
    expect(resolveClipName(names, 'sleep')).toBe('Sleeping')
    expect(resolveClipName(names, 'eating')).toBeNull()
  })
})
