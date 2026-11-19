import { describe, expect, it } from 'vitest'
import { POSE_TRANSITION_SECONDS, poseRig, transitionPose } from '../src/pose'

describe('Canvas body pose transition', () => {
  it('starts at the configured pose, defaulting to sit', () => {
    expect(transitionPose(undefined, undefined, 0).amount).toBe(0)
    expect(transitionPose(undefined, 'stand', 0).amount).toBe(1)
  })

  it('eases in both directions over 0.6 seconds without overshoot', () => {
    for (const [start, end] of [['sit', 'stand'], ['stand', 'sit']] as const) {
      const initial = transitionPose(undefined, start, 0)
      const change = transitionPose(initial, end, 1)
      expect(change.amount).toBe(initial.amount)
      expect(transitionPose(change, end, 1.3).amount).toBeCloseTo(0.5)
      const values = Array.from({ length: 61 }, (_, frame) => transitionPose(change, end, 1 + frame / 100).amount)
      expect(values.every(value => value >= 0 && value <= 1)).toBe(true)
      expect(values.every((value, index) => index === 0 || (end === 'stand'
        ? value >= values[index - 1]! : value <= values[index - 1]!))).toBe(true)
      expect(Math.abs(values[1]! - values[0]!)).toBeLessThan(0.002)
      expect(Math.abs(values[60]! - values[59]!)).toBeLessThan(0.002)
      expect(transitionPose(change, end, 1 + POSE_TRANSITION_SECONDS).amount).toBe(end === 'stand' ? 1 : 0)
      expect(transitionPose(change, end, 20).amount).toBe(end === 'stand' ? 1 : 0)
    }
  })

  it('reverses from the currently sampled shape, including between frames', () => {
    const initial = transitionPose(undefined, 'sit', 0)
    const rise = transitionPose(initial, 'stand', 1)
    const before = transitionPose(rise, 'stand', 1.22)
    const reverse = transitionPose(rise, 'sit', 1.22)
    expect(reverse.amount).toBe(before.amount)
    expect(reverse.from).toBe(before.amount)
    expect(transitionPose(reverse, 'sit', 1.52).amount).toBeCloseTo(before.amount / 2)
    expect(transitionPose(reverse, 'sit', 2).amount).toBe(0)
  })

  it('samples independently of frame rate and does not mutate previous snapshots', () => {
    const change = transitionPose(transitionPose(undefined, 'sit', 0), 'stand', 1)
    const copy = { ...change }
    let dense = change
    for (let frame = 1; frame <= 30; frame++) dense = transitionPose(dense, 'stand', 1 + frame / 60)
    expect(dense.amount).toBe(transitionPose(change, 'stand', 1.5).amount)
    expect(change).toEqual(copy)
    expect(transitionPose(change, 'stand', 0).amount).toBe(0)
  })

  it('switches instantly with reduced motion, including during a transition', () => {
    const initial = transitionPose(undefined, 'sit', 0)
    const rise = transitionPose(initial, 'stand', 1)
    expect(transitionPose(rise, 'stand', 1.1, true).amount).toBe(1)
    expect(transitionPose(rise, 'sit', 1.1, true).amount).toBe(0)
    expect(transitionPose(initial, 'stand', 1, true).amount).toBe(1)
  })

  it('preserves seated coordinates and moves the floor with the feet while standing', () => {
    expect(poseRig(0)).toMatchObject({ headY: -53, bodyY: -0, bodyWidth: 1, footX: 39, footY: 61,
      bodyHeight: 1, floor: 82, footWidth: 1, footHeight: 1, footAngle: 0.23, armScale: 1, tailX: 39, tailY: 51 })
    for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
      const rig = poseRig(amount)
      const sole = rig.footY + Math.hypot(18 * rig.footWidth * Math.sin(rig.footAngle),
        21 * rig.footHeight * Math.cos(rig.footAngle))
      expect(sole).toBeCloseTo(rig.floor, 0)
      expect(rig.footX - rig.legX).toBe(2)
      expect(rig.bodyWidth).toBeGreaterThanOrEqual(0.8)
    }
    expect(poseRig(-1)).toEqual(poseRig(0))
    expect(poseRig(2)).toEqual(poseRig(1))
  })

  it('leaves visible shins above separated, outward-facing feet and lowers the smaller front paws', () => {
    const standing = poseRig(1)
    // 74 bounds the seated hip curve; even this conservative bound must clear the foot top.
    const hip = standing.bodyY + 74 * standing.bodyHeight
    const footTop = standing.footY - 21 * standing.footHeight
    expect(footTop - hip).toBeGreaterThan(10)
    expect(standing.footX * 2 - 36 * standing.footWidth).toBeGreaterThan(20)
    expect(standing.footAngle).toBeGreaterThan(0.15)
    expect(standing.armScale).toBeLessThan(0.8)
    // The palm center rests below the upper half of the belly, rather than near the chin.
    expect(25 + standing.armLift + 21 * standing.armScale).toBeGreaterThan(30)
    expect(standing.floor).toBeGreaterThan(poseRig(0).floor)
    expect(standing.headY).toBe(-69)
  })
})
