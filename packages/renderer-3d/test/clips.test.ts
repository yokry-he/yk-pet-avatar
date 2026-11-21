import { describe, expect, it } from 'vitest'
import { clipSampleTime, resolveClipName } from '../src/clips'

describe('glTF clip mapping', () => {
  const names = ['Idle_Breath', 'Walk_Cycle', 'Sleeping', 'Wave']

  it('prefers an explicit map and otherwise fuzzy-matches', () => {
    expect(resolveClipName(names, 'walk', { walk: 'Wave' })).toBe('Wave')
    expect(resolveClipName(names, 'walk')).toBe('Walk_Cycle')
    expect(resolveClipName(names, 'sleep')).toBe('Sleeping')
    expect(resolveClipName(names, 'eating')).toBe('Idle_Breath')
  })

  it('maps the felt fox clips and falls back to idle for every unsupported action', () => {
    const fox = ['idle', 'wave', 'happy', 'success']
    for (const action of fox) expect(resolveClipName(fox, action)).toBe(action)
    for (const action of ['walk', 'sleep', 'thinking', 'unknown']) {
      expect(resolveClipName(fox, action)).toBe('idle')
    }
    expect(resolveClipName([], 'wave')).toBeNull()
    expect(resolveClipName(['custom'], 'wave', { idle: 'custom' })).toBe('custom')
    expect(resolveClipName(fox, 'wave', { wave: 'missing' })).toBe('wave')
  })

  it('samples held clips deterministically, including looping and invalid times', () => {
    expect(clipSampleTime(3, .6)).toBe(.6)
    expect(clipSampleTime(3, 3.6)).toBeCloseTo(.6)
    expect(clipSampleTime(3, -1)).toBe(0)
    expect(clipSampleTime(0, .6)).toBe(0)
    expect(clipSampleTime(3, NaN)).toBe(0)
  })
})
