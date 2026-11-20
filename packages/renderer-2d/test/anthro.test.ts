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
    expect(transitionGesture(wave, 'wave', 1.125).amount.wave).toBeCloseTo(0.5)
    expect(transitionGesture(wave, 'wave', 1.25).amount.wave).toBeCloseTo(1)
    const interrupted = transitionGesture(wave, 'success', 1.125)
    expect(interrupted.amount).toEqual(transitionGesture(wave, 'wave', 1.125).amount)
    const success = transitionGesture(interrupted, 'success', 1.6)
    expect(success.amount.celebrate).toBeCloseTo(1)
    expect(success.amount.wave).toBeCloseTo(0)
    const release = transitionGesture(success, 'idle', 2)
    expect(transitionGesture(release, 'idle', 2.125).amount.celebrate).toBeCloseTo(0.5)
    expect(transitionGesture(release, 'idle', 2.25).amount.celebrate).toBeCloseTo(0)
    expect(transitionGesture(wave, 'success', 1.1, true).amount).toEqual(gestureTarget('success'))
  })

  it('keeps connected, proportionate links and fixed shoulders throughout every gesture blend', () => {
    for (const side of [-1, 1]) for (const action of ['idle', 'wave', 'success', 'happy', 'thinking', 'eating', 'working', 'sleep']) {
      const target = gestureTarget(action)
      for (let frame = 0; frame <= 30; frame++) {
        const blend = frame / 30
        const arm = armRig(side, frame / 60, {
          wave: target.wave * blend, proud: target.proud * blend, gather: target.gather * blend,
          celebrate: target.celebrate * blend,
        })
        const upper = Math.hypot(arm.elbow.x - arm.shoulder.x, arm.elbow.y - arm.shoulder.y)
        const lower = Math.hypot(arm.wrist.x - arm.elbow.x, arm.wrist.y - arm.elbow.y)
        expect(upper / lower).toBeCloseTo(27 / 25)
        expect(upper).toBeGreaterThanOrEqual(27 - 1e-8)
        expect(upper).toBeLessThan(80)
        expect(arm.shoulder).toEqual(armRig(side, 0, gestureTarget('idle')).shoulder)
        const edges = limbEdges(arm.shoulder, arm.elbow, arm.wrist, [11, 8.5, 6.5])
        expect([...edges.left, ...edges.right].every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      }
    }
  })

  it('holds a high open wave with a visible forearm arc and a separate two-arm celebration', () => {
    for (const time of [0, Math.PI / 15, Math.PI / 5]) {
      const wave = armRig(1, time, gestureTarget('wave'))
      expect(wave.elbow.y).toBeLessThan(wave.shoulder.y - 45)
      expect(wave.wrist.y).toBeLessThan(-125)
      expect(wave.palm).toBe(1)
      expect(armRig(-1, time, gestureTarget('wave')).palm).toBe(0)
      for (const side of [-1, 1]) {
        const success = armRig(side, time, gestureTarget('success'))
        expect(success.wrist.y).toBeLessThan(-125)
        expect(Math.abs(success.wrist.x)).toBeGreaterThan(95)
        expect(success.palm).toBe(1)
      }
    }
    const a = armRig(1, Math.PI / 15, gestureTarget('wave'))
    const b = armRig(1, Math.PI / 5, gestureTarget('wave'))
    expect(Math.abs(a.wrist.x - b.wrist.x)).toBeGreaterThan(40)
  })

  it('keeps happy hands at the waist with clear elbow gaps and gathers quiet actions', () => {
    for (const side of [-1, 1]) {
      const happy = armRig(side, 0, gestureTarget('happy'))
      expect(Math.abs(happy.elbow.x) - Math.abs(happy.wrist.x)).toBeGreaterThan(20)
      expect(happy.wrist.y).toBeGreaterThan(-10)
      expect(happy.wrist.y).toBeLessThan(15)
      expect(happy.palm).toBe(0)
      for (const action of ['thinking', 'eating', 'working', 'sleep']) {
        const gathered = armRig(side, 0, gestureTarget(action))
        expect(Math.abs(gathered.wrist.x)).toBeLessThan(20)
        expect(gathered.palm).toBe(0)
      }
    }
  })

  it('plants both feet under a counter-tilted torso and freezes secondary motion when reduced', () => {
    for (const t of [0, 1, 2, 9, 100]) {
      const rig = anthroRig(t)
      expect(rig.footY + 7).toBe(rig.floor)
      expect(rig.legs[1]!.footX - rig.legs[0]!.footX).toBeGreaterThan(34)
      expect(rig.hipTilt * rig.shoulderTilt).toBeLessThan(0)
      expect(anthroRig(t, true)).toEqual(anthroRig(0, true))
      for (const action of ['idle', 'wave', 'success', 'happy', 'thinking', 'eating', 'working', 'sleep']) {
        for (const side of [-1, 1]) expect(armRig(side, t, gestureTarget(action), true)).toEqual(armRig(side, 0, gestureTarget(action), true))
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
