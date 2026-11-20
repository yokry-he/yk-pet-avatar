import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { APRICOT_COLORS, DEFAULT_PROPORTIONS, SPECIES_PART_DEFAULTS, type PetVisualState } from '@yk-pet/core'
import { ANTHRO, advanceGesture, anthroHeadGain, anthroPose, ARM_LENGTHS, GESTURE_DURATION, initialGesture, LEG_LENGTHS, solveLimb, type Point } from '../src/anthro'
import { anthroForm, limbSleeve, visualBounds } from '../src/sculpt'
import { createProceduralPet } from '../src/procedural'
import { gestureTarget, transitionGesture } from '../../renderer-2d/src/anthro'

const distance = (a: Point, b: Point) => Math.hypot(...a.map((n, i) => n - b[i]!))
const state = (style: PetVisualState['style'] = 'kawaii'): PetVisualState => ({
  style, behavior: 'idle', reducedMotion: true,
  appearance: { species: 'fox', pose: 'anthro', colors: APRICOT_COLORS, proportions: DEFAULT_PROPORTIONS, parts: SPECIES_PART_DEFAULTS.fox, accessories: [] },
})

describe('anthro gesture envelopes', () => {
  it('matches Canvas action channels and keeps the peak through the rest of the action', () => {
    for (const action of ['idle', 'wave', 'success', 'happy', 'thinking', 'eating', 'working', 'sleep'] as const) {
      const target = gestureTarget(action)
      expect(initialGesture(action).value).toEqual([target.wave, target.proud, target.gather, target.celebrate])
      const start = transitionGesture(transitionGesture(undefined, 'idle', 0), action, 1)
      for (const elapsed of [0.125, 0.25, 0.6, 1.5]) {
        const canvas = transitionGesture(start, action, 1 + elapsed).amount
        const model = advanceGesture(initialGesture(), action, elapsed).value
        expect(model).toEqual([canvas.wave, canvas.proud, canvas.gather, canvas.celebrate])
      }
    }
  })

  it('blends in and out over 0.25 seconds independently of frame rate', () => {
    for (const frames of [12, 24, 60]) {
      let gesture = initialGesture()
      for (let i = 0; i < frames; i++) gesture = advanceGesture(gesture, 'wave', GESTURE_DURATION / frames)
      expect(gesture.value).toEqual([1, 0, 0, 0])
      for (let i = 0; i < frames; i++) gesture = advanceGesture(gesture, 'idle', GESTURE_DURATION / frames)
      expect(gesture.value[0]).toBeCloseTo(0)
    }
    expect(advanceGesture(initialGesture(), 'wave', 0.125).value).toEqual([0.5, 0, 0, 0])
  })
  it('retargets from the current blend, with static reduced-motion gestures', () => {
    const middle = advanceGesture(initialGesture(), 'wave', 0.125)
    expect(advanceGesture(middle, 'success', 0).value).toEqual(middle.value)
    expect(advanceGesture(middle, 'success', 0.125).value).toEqual([0.25, 0, 0, 0.5])
    expect(advanceGesture(middle, 'success', 0, true).value).toEqual([0, 0, 0, 1])
    expect(advanceGesture(initialGesture(), 'wave', -1).value).toEqual([0, 0, 0, 0])
    expect(anthroPose(0, [1, 0, 0], true)).toEqual(anthroPose(100, [1, 0, 0], true))
    const idle = anthroPose(0, [0, 0, 0], true)
    const proud = anthroPose(0, [0, 1, 0], true)
    proud.arms.forEach((arm, i) => expect(Math.abs(arm.joint[0] - proud.shift)).toBeGreaterThan(Math.abs(idle.arms[i]!.joint[0] - idle.shift) + 0.05))
  })
  it('waves gently beside the cheek with a forward palm, and lifts both arms for success', () => {
    for (const ratio of [1.42, 1.45, 1.48]) for (const time of [0, Math.PI / 15, Math.PI / 5]) {
      const wave = anthroPose(time, initialGesture('wave').value, false, ratio)
      const hand = wave.arms[0]!
      expect(hand.end[1]).toBeGreaterThan(ANTHRO.shoulderY + 0.15)
      expect(hand.end[1]).toBeLessThan(ANTHRO.neckY + ratio * 0.4)
      expect(hand.end[0]).toBeLessThan(-0.60)
      expect(hand.end[2]).toBeGreaterThan(0.6)
      expect(hand.palm).toBe(1)
      expect(wave.arms[1]!.palm).toBe(0)
      const success = anthroPose(time, initialGesture('success').value, false, ratio)
      success.arms.forEach(arm => {
        expect(arm.end[1]).toBeGreaterThan(ANTHRO.shoulderY + 0.6)
        expect(Math.abs(arm.end[0] - success.shift)).toBeGreaterThan(0.9)
        expect(arm.palm).toBe(1)
      })
    }
    const a = anthroPose(Math.PI / 15, initialGesture('wave').value).arms[0]!
    const b = anthroPose(Math.PI / 5, initialGesture('wave').value).arms[0]!
    expect(Math.abs(a.handRoll - b.handRoll)).toBeGreaterThan(0.19)
    expect(distance(a.end, b.end)).toBeLessThan(0.1)
  })

  it('keeps happy elbows outside the waist and both quiet-action hands gathered', () => {
    const happy = anthroPose(0, initialGesture('happy').value, true)
    happy.arms.forEach(arm => {
      expect(Math.abs(arm.joint[0] - arm.end[0])).toBeGreaterThan(0.06)
      expect(arm.end[1]).toBeLessThan(ANTHRO.shoulderY)
      expect(arm.palm).toBe(0)
    })
    for (const action of ['thinking', 'eating', 'working', 'sleep'] as const) {
      const pose = anthroPose(0, initialGesture(action).value, true)
      pose.arms.forEach(arm => expect(Math.abs(arm.end[0] - pose.shift)).toBeLessThan(0.18))
    }
    for (const action of ['wave', 'success', 'happy', 'thinking', 'eating', 'working', 'sleep'] as const) {
      expect(anthroPose(0, initialGesture(action).value, true)).toEqual(anthroPose(99, initialGesture(action).value, true))
    }
  })
})

describe('anthro anatomy and planted contacts', () => {
  it('keeps style defaults in a compact chibi range', () => {
    for (const [head, body] of [[1.10, 1.133], [1.16, 0.869], [1.04, 1.191], [1.06, 0.98]]) {
      const gain = anthroHeadGain(head!, body!)
      const ratio = head! * gain / body!
      expect(ratio).toBeGreaterThanOrEqual(1.42 - 1e-10)
      expect(ratio).toBeLessThanOrEqual(1.48 + 1e-10)
    }
  })

  it('preserves bone lengths, including unreachable and singular IK targets', () => {
    for (const target of [[0, 0, 0], [0, -0.4, 0], [8, 9, 2]] as Point[]) {
      const chain = solveLimb([0, 0, 0], target, [0, -1, 0], ...ARM_LENGTHS)
      expect(distance(chain.root, chain.joint)).toBeCloseTo(ARM_LENGTHS[0])
      expect(distance(chain.joint, chain.end)).toBeCloseTo(ARM_LENGTHS[1])
      expect([...chain.root, ...chain.joint, ...chain.end].every(Number.isFinite)).toBe(true)
    }
  })
  it('keeps ankles fixed during breathing and every gesture; elbows clear the hips', () => {
    for (const weights of [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0.5, 0.5, 0, 0], [0.5, 0, 0, 0.5]]) {
      for (const time of [0, 0.25, 1.8, 5]) {
        const pose = anthroPose(time, weights)
        for (const arm of pose.arms) {
          const upper = distance(arm.root, arm.joint), lower = distance(arm.joint, arm.end)
          expect(upper / lower).toBeCloseTo(ARM_LENGTHS[0] / ARM_LENGTHS[1])
          expect(upper).toBeGreaterThanOrEqual(ARM_LENGTHS[0] - 1e-8)
          expect(upper).toBeLessThan(0.9)
          const idle = anthroPose(time, [0, 0, 0, 0])
          expect(arm.root).toEqual(idle.arms[pose.arms.indexOf(arm)]!.root)
        }
        pose.legs.forEach((leg, i) => {
          expect(distance(leg.root, leg.joint)).toBeCloseTo(LEG_LENGTHS[0])
          expect(distance(leg.joint, leg.end)).toBeCloseTo(LEG_LENGTHS[1])
          expect(leg.end[1]).toBeCloseTo(ANTHRO.ankleY)
          expect(leg.end[0]).toBeCloseTo(i === 0 ? -ANTHRO.footX : ANTHRO.footX)
        })
        if (weights[1] === 1) pose.arms.forEach((arm) => {
          expect(Math.abs(arm.joint[0] - pose.shift)).toBeGreaterThan(0.55)
          expect(arm.end[2]).toBeCloseTo(0.24)
        })
        if (weights[0] === 1) expect(pose.arms[0]!.end[1]).toBeGreaterThan(pose.arms[0]!.root[1])
      }
    }
  })
  it('builds closed, finite tapered surfaces with volume and outward normals', () => {
    const geometries = [limbSleeve(...ARM_LENGTHS, 0.108, 0.087, 0.067), ...(['torso', 'hand', 'boot', 'ruff'] as const).map((kind) => anthroForm(kind))]
    for (const geometry of geometries) {
      for (const attribute of ['position', 'normal', 'uv']) expect([...geometry.getAttribute(attribute).array].every(Number.isFinite)).toBe(true)
      geometry.computeBoundingBox()
      expect(geometry.boundingBox!.getSize(new THREE.Vector3()).toArray().every((n) => n > 0.1)).toBe(true)
      geometry.dispose()
    }
    const sleeve = limbSleeve(...ARM_LENGTHS, 0.108, 0.087, 0.067)
    const p = sleeve.getAttribute('position'), n = sleeve.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < -0.05 && p.getY(i) > -0.23)
        expect(p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i)).toBeGreaterThan(0)
    }
    sleeve.dispose()
  })
})

describe('styled anthro integration', () => {
  it('allocates the extra anatomy only when anthro is first requested', () => {
    const next = state('glass')
    const sit = { ...next, appearance: { ...next.appearance!, pose: 'sit' as const } }
    const pet = createProceduralPet(sit, 'low')
    expect(pet.group.getObjectByName('anthro-body')).toBeUndefined()
    pet.update(next, 1)
    const body = pet.group.getObjectByName('anthro-body')!
    expect(body.visible).toBe(true)
    pet.update(sit, 2)
    pet.update(next, 3)
    expect(pet.group.getObjectByName('anthro-body')).toBe(body)
    pet.dispose()
  })

  it.each(['kawaii', 'anime', 'plush', 'glass'] as const)('preserves the %s head and covers articulated surfaces with the style finish', (style) => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 })
    try {
      const next = state(style), pet = createProceduralPet(next, 'high')
      expect(pet.anthroBlend).toBe(1)
      const head = pet.group.getObjectByName('mesh-head')!
      const sleeve = pet.group.getObjectByName('mesh-anthro-arm')!
      const headHeight = visualBounds(head).getSize(new THREE.Vector3()).y
      const totalHeight = visualBounds(pet.group).max.y
      expect(totalHeight / headHeight).toBeGreaterThan(1.8)
      expect(totalHeight / headHeight).toBeLessThan(2.25)
      const bodyScale = pet.group.getObjectByName('anthro-body')!.scale.y
      expect(ANTHRO.hipY * bodyScale / headHeight).toBeLessThan(0.62)
      expect(pet.group.getObjectByName('mesh-body')!.parent!.visible).toBe(false)
      expect(pet.group.getObjectByName('anthro-body')!.visible).toBe(true)
      if (style === 'anime') expect(sleeve.getObjectByName('outline')).toBeDefined()
      if (style === 'plush') expect(sleeve.getObjectByName('fur-shell-2')).toBeDefined()
      if (style === 'glass') expect(sleeve.getObjectByName('glass-halo')).toBeDefined()
      for (const layer of sleeve.children) expect((layer as THREE.Mesh).geometry).toBe((sleeve as THREE.Mesh).geometry)
      pet.update({ ...next, behavior: 'wave' }, 1)
      pet.group.updateMatrixWorld(true)
      const shoulder = pet.group.getObjectByName('anthro-shoulder-l')!
      const hand = pet.group.getObjectByName('anthro-hand-l')!
      for (const key of ['position', 'normal']) expect([...(sleeve as THREE.Mesh).geometry.getAttribute(key).array].every(Number.isFinite)).toBe(true)
      expect(hand.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(shoulder.getWorldPosition(new THREE.Vector3()).y)
      for (const side of ['l', 'r']) {
        const foot = pet.group.getObjectByName(`anthro-foot-${side}`)!
        const bounds = visualBounds(foot)
        expect(bounds.min.y).toBeGreaterThan(0)
        expect(bounds.min.y).toBeLessThan(0.035)
        expect(new THREE.Vector3(0, 1, 0).transformDirection(foot.matrixWorld).y).toBeCloseTo(1)
      }
      for (const action of ['wave', 'success', 'happy', 'thinking', 'eating', 'working', 'sleep'] as const) {
        pet.update({ ...next, behavior: action }, 2)
        pet.group.updateMatrixWorld(true)
        for (const side of ['l', 'r']) {
          const root = pet.group.getObjectByName(`anthro-shoulder-${side}`)!
          const mesh = root.getObjectByName('mesh-anthro-arm') as THREE.Mesh
          const hand = pet.group.getObjectByName(`anthro-hand-${side}`)!
          for (const key of ['position', 'normal']) expect([...mesh.geometry.getAttribute(key).array].every(Number.isFinite)).toBe(true)
          for (const layer of mesh.children) expect((layer as THREE.Mesh).geometry).toBe(mesh.geometry)
          if (action === 'success' || (action === 'wave' && side === 'l')) {
            expect(visualBounds(hand).max.y).toBeGreaterThan(ANTHRO.shoulderY * bodyScale)
            expect(hand.getObjectByName('anthro-palm-pads')!.visible).toBe(true)
          }
        }
      }
      for (const emotion of ['neutral', 'happy', 'sad', 'excited', 'angry', 'shy', 'surprised', 'love', 'tired', 'focused']) {
        pet.update({ ...next, emotion }, 2)
        expect(pet.group.getObjectByName('mesh-head')).toBe(head)
      }
      pet.update({ ...next, emotion: 'happy' }, 3)
      expect(pet.group.getObjectByName('eye-happy-arc')!.visible).toBe(true)
      pet.dispose()
    } finally { vi.unstubAllGlobals() }
  })
  it('squashes through anatomy swaps, retargets smoothly, and restores the old rig', () => {
    const next = { ...state(), reducedMotion: false }
    const sit = { ...next, appearance: { ...next.appearance!, pose: 'sit' as const } }
    const pet = createProceduralPet(sit, 'low')
    const head = pet.group.getObjectByName('mesh-head')!
    pet.update(next, 0.3)
    expect(pet.anthroBlend).toBeCloseTo(0.5)
    expect(pet.group.getObjectByName('bone-hips')!.scale.y).toBeCloseTo(0.16)
    pet.update(sit, 0.3)
    expect(pet.anthroBlend).toBeCloseTo(0.5)
    pet.update(sit, 0.9)
    expect(pet.anthroBlend).toBe(0)
    expect(pet.group.getObjectByName('anthro-body')!.visible).toBe(false)
    expect(pet.group.getObjectByName('mesh-body')!.parent!.visible).toBe(true)
    expect(pet.group.getObjectByName('bone-head')!.position.x).toBe(0)
    expect(pet.group.getObjectByName('mesh-head')).toBe(head)
    pet.update({ ...next, reducedMotion: true }, 1)
    expect(pet.anthroBlend).toBe(1)
    pet.dispose()
  })
  it('moves configured neck/head/hand sockets with the new rig and suppresses the default scarf', () => {
    const next = state()
    next.appearance!.accessories = [{ kind: 'scarf' }, { kind: 'hat' }, { kind: 'bow', socket: 'paw-l' }]
    const pet = createProceduralPet(next, 'low')
    expect(pet.group.getObjectByName('anthro-collar')!.visible).toBe(false)
    expect(pet.group.getObjectByName('socket-neck')!.position.y).toBeCloseTo((ANTHRO.neckY - 0.02) * pet.group.getObjectByName('anthro-body')!.scale.y)
    expect(pet.group.getObjectByName('socket-head')!.position.y).toBeGreaterThan(pet.group.getObjectByName('bone-head')!.position.y)
    pet.update({ ...next, behavior: 'wave' }, 1)
    expect(pet.group.getObjectByName('socket-paw-l')!.position.y).toBeGreaterThan(ANTHRO.shoulderY)
    pet.dispose()
  })
  it('drops expensive glass layers on weak devices for the new limbs too', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 2, deviceMemory: 2 })
    try {
      const pet = createProceduralPet(state('glass'), 'high')
      expect(pet.group.getObjectByName('glass-halo')).toBeUndefined()
      expect(pet.group.getObjectByName('mesh-anthro-arm')).toBeDefined()
      pet.dispose()
    } finally { vi.unstubAllGlobals() }
  })
})
