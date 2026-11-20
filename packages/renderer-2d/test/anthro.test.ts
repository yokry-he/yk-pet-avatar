import { describe, expect, it } from 'vitest'
import { anthroBlend, anthroRig, armRig, gestureTarget, limbEdges, transitionAnthro, transitionGesture } from '../src/anthro'
import { transitionPose } from '../src/pose'

describe('anthro Canvas rig', () => {
  it('confines the body crossfade to a brief squash and leaves both endpoints intact', () => {
    expect(anthroBlend(0)).toEqual({ body: 0, squashX: 1, squashY: 1 })
    expect(anthroBlend(1)).toEqual({ body: 1, squashX: 1, squashY: 1 })
    expect(anthroBlend(-1)).toEqual(anthroBlend(0))
    expect(anthroBlend(2)).toEqual(anthroBlend(1))
    expect(anthroBlend(0.25).body).toBe(0)
    expect(anthroBlend(0.75).body).toBe(1)
    expect(anthroBlend(0.5)).toEqual({ body: 0.5, squashX: 1.05, squashY: 0.9 })
  })
  it('starts in the configured silhouette and blends from either legacy pose', () => {
    expect(transitionAnthro(undefined, 'anthro', 0).amount).toBe(1)
    expect(transitionPose(undefined, 'anthro', 0).amount).toBe(1)
    for (const pose of ['sit', 'stand'] as const) {
      const start = transitionAnthro(undefined, pose, 0)
      const change = transitionAnthro(start, 'anthro', 1)
      expect(change.amount).toBe(0)
      expect(transitionAnthro(change, 'anthro', 1.3).amount).toBeCloseTo(0.5)
      expect(transitionAnthro(change, 'anthro', 1.6).amount).toBe(1)
      const reverse = transitionAnthro(change, pose, 1.2)
      expect(reverse.from).toBe(transitionAnthro(change, 'anthro', 1.2).amount)
      expect(transitionAnthro(reverse, pose, 2).amount).toBe(0)
      expect(transitionAnthro(change, pose, 1.2, true).amount).toBe(0)
    }
  })

  it('eases gestures in and out, retargeting without a snap', () => {
    const idle = transitionGesture(undefined, 'idle', 0)
    const wave = transitionGesture(idle, 'wave', 1)
    expect(wave.amount.wave).toBe(0)
    expect(transitionGesture(wave, 'wave', 1.2).amount.wave).toBeCloseTo(0.5)
    expect(transitionGesture(wave, 'wave', 1.4).amount.wave).toBeCloseTo(1)
    const interrupted = transitionGesture(wave, 'success', 1.2)
    expect(interrupted.amount).toEqual(transitionGesture(wave, 'wave', 1.2).amount)
    const proud = transitionGesture(interrupted, 'success', 1.6)
    expect(proud.amount.proud).toBeCloseTo(1)
    expect(proud.amount.wave).toBeCloseTo(0)
    const release = transitionGesture(proud, 'idle', 2)
    expect(transitionGesture(release, 'idle', 2.2).amount.proud).toBeCloseTo(0.5)
    expect(transitionGesture(release, 'idle', 2.4).amount.proud).toBeCloseTo(0)
    expect(transitionGesture(wave, 'success', 1.1, true).amount).toEqual(gestureTarget('success'))
  })

  it('keeps arm bones connected and fixed length throughout every gesture blend', () => {
    for (const side of [-1, 1]) for (const action of ['idle', 'wave', 'success', 'thinking']) {
      const target = gestureTarget(action)
      for (let frame = 0; frame <= 30; frame++) {
        const blend = frame / 30
        const arm = armRig(side, frame / 60, {
          wave: target.wave * blend, proud: target.proud * blend, gather: target.gather * blend,
        })
        expect(Math.hypot(arm.elbow.x - arm.shoulder.x, arm.elbow.y - arm.shoulder.y)).toBeCloseTo(27)
        expect(Math.hypot(arm.wrist.x - arm.elbow.x, arm.wrist.y - arm.elbow.y)).toBeCloseTo(25)
        const edges = limbEdges(arm.shoulder, arm.elbow, arm.wrist, [11, 8.5, 6.5])
        expect([...edges.left, ...edges.right].every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      }
    }
  })

  it('raises the waving hand above its shoulder and opens both elbows in the proud pose', () => {
    const wave = armRig(-1, 0, gestureTarget('wave'))
    expect(wave.wrist.y).toBeLessThan(wave.shoulder.y - 10)
    expect(wave.palm).toBe(1)
    expect(armRig(1, 0, gestureTarget('wave')).palm).toBe(0)
    for (const side of [-1, 1]) {
      const proud = armRig(side, 0, gestureTarget('success'))
      expect(Math.abs(proud.elbow.x) - Math.abs(proud.wrist.x)).toBeGreaterThan(20)
      expect(proud.wrist.y).toBeGreaterThan(0)
      expect(proud.wrist.y).toBeLessThan(35)
    }
  })

  it('plants both feet under a counter-tilted torso and freezes secondary motion when reduced', () => {
    for (const t of [0, 1, 2, 9, 100]) {
      const rig = anthroRig(t)
      expect(rig.footY + 7).toBe(rig.floor)
      expect(rig.legs[1]!.footX - rig.legs[0]!.footX).toBeGreaterThan(34)
      expect(rig.hipTilt * rig.shoulderTilt).toBeLessThan(0)
      expect(anthroRig(t, true)).toEqual(anthroRig(0, true))
      for (const action of ['idle', 'wave', 'success']) {
        expect(armRig(-1, t, gestureTarget(action), true)).toEqual(armRig(-1, 0, gestureTarget(action), true))
      }
    }
  })

  it('samples gesture transitions independently of frame rate without mutating prior state', () => {
    const change = transitionGesture(transitionGesture(undefined, 'idle', 0), 'wave', 1)
    const copy = structuredClone(change)
    let dense = change
    for (let frame = 1; frame <= 18; frame++) dense = transitionGesture(dense, 'wave', 1 + frame / 60)
    expect(dense.amount).toEqual(transitionGesture(change, 'wave', 1.3).amount)
    expect(change).toEqual(copy)
  })
})
