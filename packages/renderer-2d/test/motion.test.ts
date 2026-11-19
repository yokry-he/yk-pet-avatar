import { describe, expect, it } from 'vitest'
import { eyeLids, idleMotion, naturalBlink } from '../src/motion'

describe('Canvas idle animation', () => {
  it('closes both lids to a common line, including from a tired half-lidded face', () => {
    expect(eyeLids(18, 1, 1)).toEqual({ upper: -18, lower: 18 })
    expect(eyeLids(18, 0.5, 1)).toEqual({ upper: 0, lower: 18 })
    for (const openness of [0.5, 0.8, 1, 1.2]) {
      expect(eyeLids(18, openness, 0)).toEqual({ upper: 2, lower: 2 })
      const midway = eyeLids(18, openness, 0.5)
      expect(midway.lower - midway.upper).toBeGreaterThan(0)
    }
  })
  it('has irregular blinks, including occasional double blinks, without a startup blink', () => {
    expect(naturalBlink(0)).toBe(1)
    const starts: number[] = []
    let closed = false
    for (let frame = 0; frame < 60 * 120; frame++) {
      const time = frame / 60
      const value = naturalBlink(time)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
      if (value < 0.2 && !closed) starts.push(time)
      closed = value < 0.2
    }
    const intervals = starts.slice(1).map((start, i) => start - starts[i]!)
    expect(intervals.some(interval => interval > 4)).toBe(true)
    expect(intervals.some(interval => interval < 0.4)).toBe(true)
    expect(new Set(intervals.filter(interval => interval > 1).map(interval => Math.round(interval * 10))).size).toBeGreaterThan(4)
  })

  it('moves continuously at frame and scheduling boundaries', () => {
    for (let frame = 1; frame <= 60 * 30; frame++) {
      const current = idleMotion(frame / 60)
      const previous = idleMotion((frame - 1) / 60)
      expect(Math.abs(current.head - previous.head)).toBeLessThan(0.001)
      expect(Math.abs(current.ear - previous.ear)).toBeLessThan(0.04)
      expect(Math.abs(current.squashY - 1)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(naturalBlink(frame / 60) - naturalBlink((frame - 1) / 60))).toBeLessThan(0.27)
    }
  })

  it('freezes all idle motion and blinking with reduced motion', () => {
    for (const time of [-4, 0, 3.1, 8.5, 1000]) {
      expect(naturalBlink(time, true)).toBe(1)
      expect(idleMotion(time, true)).toEqual(idleMotion(0, true))
    }
    expect(naturalBlink(-1)).toBe(1)
    expect(idleMotion(-1)).toEqual(idleMotion(0))
  })
})
