import { describe, it, expect } from 'vitest'
import { POSES, parsePetConfig, defaultConfig, mergeConfig, serializePetConfig } from '../src/index'

describe('appearance.pose', () => {
  it('exposes the supported poses', () => {
    expect(POSES).toEqual(['sit', 'stand', 'anthro'])
  })

  it('parses config without pose as undefined and without a pose issue', () => {
    const { config, issues } = parsePetConfig({})
    expect(config.appearance.pose).toBeUndefined()
    expect(issues.some(issue => issue.path === 'appearance.pose')).toBe(false)
  })

  it.each(['sit', 'stand'] as const)('round-trips pose %s', pose => {
    const { config } = parsePetConfig({ appearance: { pose } })
    expect(config.appearance.pose).toBe(pose)

    const reparsed = parsePetConfig(JSON.parse(serializePetConfig(config)))
    expect(reparsed.config.appearance.pose).toBe(pose)
  })

  it.each(['fly', 3])('falls back to sit for invalid pose %j', pose => {
    const { config, issues } = parsePetConfig({ appearance: { pose } })
    expect(config.appearance.pose).toBe('sit')
    expect(issues.some(issue => issue.path === 'appearance.pose')).toBe(true)
  })

  it('preserves pose and default colors through mergeConfig', () => {
    const merged = mergeConfig(defaultConfig(), { appearance: { pose: 'stand' } })
    const { config } = parsePetConfig(merged)

    expect(config.appearance.pose).toBe('stand')
    expect(config.appearance.colors).toEqual(defaultConfig().appearance.colors)
  })
})
