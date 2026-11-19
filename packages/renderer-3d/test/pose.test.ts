import { describe, expect, it } from 'vitest'
import { advancePose, initialPose, interpolateRig, POSE_DURATION } from '../src/pose'

describe('pose interpolation', () => {
  it('defaults to sitting and mounts an explicit standing pose immediately', () => {
    expect(initialPose().value).toBe(0)
    expect(initialPose('stand').value).toBe(1)
  })

  it('eases to standing in 0.6 seconds independently of frame rate', () => {
    const start = initialPose()
    const early = advancePose(start, 'stand', 0.06)
    expect(early.value).toBeGreaterThan(0)
    expect(early.value).toBeLessThan(0.1)
    expect(advancePose(start, 'stand', 0.3).value).toBeCloseTo(0.5)
    for (const frames of [12, 36, 72]) {
      let pose = start
      for (let i = 0; i < frames; i++) pose = advancePose(pose, 'stand', POSE_DURATION / frames)
      expect(pose.value).toBeCloseTo(1)
    }
    expect(start).toEqual(initialPose())
  })

  it('reverses from its current position without a discontinuity', () => {
    const middle = advancePose(initialPose(), 'stand', 0.35)
    const reversed = advancePose(middle, 'sit', 0)
    expect(reversed.value).toBe(middle.value)
    expect(advancePose(reversed, 'sit', 0.1).value).toBeLessThan(middle.value)
    expect(advancePose(reversed, undefined, 0.6).value).toBe(0)
  })

  it('settles immediately under reduced motion and clamps elapsed time', () => {
    const middle = advancePose(initialPose(), 'stand', 0.3)
    expect(advancePose(middle, 'stand', 0, true).value).toBe(1)
    expect(advancePose(middle, 'sit', 0, true).value).toBe(0)
    expect(advancePose(initialPose(), 'stand', -1).value).toBe(0)
    expect(advancePose(initialPose(), 'stand', 10).value).toBe(1)
  })

  it('raises and narrows the torso while keeping the hind feet grounded', () => {
    const sit = interpolateRig(0), stand = interpolateRig(1), halfway = interpolateRig(0.5)
    expect(stand.headY).toBeGreaterThan(sit.headY)
    expect(stand.bodyWidth).toBeLessThan(sit.bodyWidth)
    expect(stand.pawY).toBeGreaterThan(sit.pawY)
    expect(stand.footPitch).toBeCloseTo(Math.PI / 2)
    expect(stand.footY - 0.15 * stand.footDepth).toBeGreaterThan(0)
    for (const key of Object.keys(sit) as (keyof typeof sit)[]) {
      if (key !== 'footY') expect(halfway[key]).toBeCloseTo((sit[key] + stand[key]) / 2)
    }
    expect(interpolateRig(-1)).toEqual(sit)
    expect(interpolateRig(2)).toEqual(stand)
  })
})
