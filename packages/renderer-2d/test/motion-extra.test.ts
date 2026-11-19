import { describe, expect, it } from 'vitest'
import { eyeLids, idleMotion, naturalBlink } from '../src/motion'

describe('naturalBlink', () => {
  it('stays in [0,1] at 0.05s sampling over 120s', () => {
    for (let t = 0; t <= 120; t += 0.05) {
      const value = naturalBlink(t)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('always returns 1 with reduced motion', () => {
    for (let t = 0; t <= 120; t += 0.05) {
      expect(naturalBlink(t, true)).toBe(1)
    }
  })

  it('treats negative time like 0', () => {
    const atZero = naturalBlink(0)
    for (const t of [-0.001, -0.05, -1, -10, -100]) {
      expect(naturalBlink(t)).toBe(atZero)
    }
  })

  it('is fully open more than 90% of the time', () => {
    const samples: number[] = []
    for (let t = 0; t <= 120; t += 0.05) {
      samples.push(naturalBlink(t))
    }
    const fullyOpen = samples.filter((v) => v === 1).length
    expect(fullyOpen / samples.length).toBeGreaterThan(0.9)
  })

  it('has at least one blink below 0.2 in every 8s window', () => {
    const step = 0.05
    const totalSamples = Math.floor(120 / step) + 1
    const values: number[] = []
    for (let i = 0; i < totalSamples; i++) {
      values.push(naturalBlink(i * step))
    }
    for (let startIndex = 0; startIndex <= Math.floor((120 - 8) / step); startIndex++) {
      let found = false
      for (let offset = 0; offset <= 8 / step; offset++) {
        if (values[startIndex + offset] < 0.2) {
          found = true
          break
        }
      }
      expect(found).toBe(true)
    }
  })
})

describe('idleMotion', () => {
  it('returns identical output for reduced motion regardless of time', () => {
    const baseline = idleMotion(0, true)
    for (let t = 0; t <= 120; t += 0.5) {
      expect(idleMotion(t, true)).toEqual(baseline)
    }
    for (const t of [-5, -1, 200, 1000]) {
      expect(idleMotion(t, true)).toEqual(baseline)
    }
  })

  it('has finite fields across sampled times', () => {
    for (let t = 0; t <= 120; t += 0.05) {
      const motion = idleMotion(t)
      for (const value of Object.values(motion)) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })

  it('keeps bob, squash, tail, head, and ear within documented ranges', () => {
    for (let t = 0; t <= 120; t += 0.05) {
      const { bob, squashX, squashY, tail, head, ear } = idleMotion(t)
      expect(bob).toBeGreaterThanOrEqual(-0.65)
      expect(bob).toBeLessThanOrEqual(0.65)
      expect(squashX).toBeGreaterThanOrEqual(0.99)
      expect(squashX).toBeLessThanOrEqual(1.01)
      expect(squashY).toBeGreaterThanOrEqual(0.99)
      expect(squashY).toBeLessThanOrEqual(1.01)
      expect(tail).toBeGreaterThanOrEqual(-0.065)
      expect(tail).toBeLessThanOrEqual(0.065)
      expect(head).toBeGreaterThanOrEqual(-0.03)
      expect(head).toBeLessThanOrEqual(0.03)
      expect(ear).toBeGreaterThanOrEqual(-0.09)
      expect(ear).toBeLessThanOrEqual(0.09)
    }
  })

  it('is deterministic for the same time', () => {
    for (const t of [0, 0.123, 0.5, 1, 3.3, 10, 60, 100, -2]) {
      expect(idleMotion(t)).toEqual(idleMotion(t))
    }
  })
})

describe('eyeLids', () => {
  it('clamps expressionOpen to [0,1]', () => {
    for (const radius of [0, 1, 5, 18, 40]) {
      expect(eyeLids(radius, -0.5, 0)).toEqual(eyeLids(radius, 0, 0))
      expect(eyeLids(radius, -0.5, 1)).toEqual(eyeLids(radius, 0, 1))
      expect(eyeLids(radius, 1.5, 0)).toEqual(eyeLids(radius, 1, 0))
      expect(eyeLids(radius, 1.5, 1)).toEqual(eyeLids(radius, 1, 1))
    }
  })

  it('has upper lid at or below lower lid when blink=1', () => {
    for (const radius of [0, 0.5, 1, 5, 10, 18, 25, 40]) {
      for (const openness of [0, 0.1, 0.2, 0.5, 0.8, 0.9, 1]) {
        const { upper, lower } = eyeLids(radius, openness, 1)
        expect(upper).toBeLessThanOrEqual(lower)
      }
    }
  })

  it('produces finite values for radius 0..40', () => {
    for (let radius = 0; radius <= 40; radius += 0.5) {
      for (const openness of [0, 0.3, 0.7, 1]) {
        for (const blink of [0, 0.25, 0.5, 0.75, 1]) {
          const { upper, lower } = eyeLids(radius, openness, blink)
          expect(Number.isFinite(upper)).toBe(true)
          expect(Number.isFinite(lower)).toBe(true)
        }
      }
    }
  })
})
