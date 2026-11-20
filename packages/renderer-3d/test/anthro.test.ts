import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { APRICOT_COLORS, DEFAULT_PROPORTIONS, SPECIES_PART_DEFAULTS, type PetVisualState } from '@yk-pet/core'
import { advanceGesture, anthroPose, ARM_LENGTHS, GESTURE_DURATION, initialGesture, LEG_LENGTHS, solveLimb, type Point } from '../src/anthro'
import { anthroForm, limbSleeve, visualBounds } from '../src/sculpt'
import { createProceduralPet } from '../src/procedural'

const distance = (a: Point, b: Point) => Math.hypot(...a.map((n, i) => n - b[i]!))
const state = (style: PetVisualState['style'] = 'kawaii'): PetVisualState => ({
  style, behavior: 'idle', reducedMotion: true,
  appearance: { species: 'fox', pose: 'anthro', colors: APRICOT_COLORS, proportions: DEFAULT_PROPORTIONS, parts: SPECIES_PART_DEFAULTS.fox, accessories: [] },
})

describe('anthro gesture envelopes', () => {
  it('blends in and out over 0.4 seconds independently of frame rate', () => {
    for (const frames of [12, 24, 60]) {
      let gesture = initialGesture()
      for (let i = 0; i < frames; i++) gesture = advanceGesture(gesture, 'wave', GESTURE_DURATION / frames)
      expect(gesture.value).toEqual([1, 0, 0])
      for (let i = 0; i < frames; i++) gesture = advanceGesture(gesture, 'idle', GESTURE_DURATION / frames)
      expect(gesture.value[0]).toBeCloseTo(0)
    }
    expect(advanceGesture(initialGesture(), 'wave', 0.2).value).toEqual([0.5, 0, 0])
  })
  it('retargets from the current blend, with static reduced-motion gestures', () => {
    const middle = advanceGesture(initialGesture(), 'wave', 0.2)
    expect(advanceGesture(middle, 'success', 0).value).toEqual(middle.value)
    expect(advanceGesture(middle, 'success', 0.2).value).toEqual([0.25, 0.5, 0])
    expect(advanceGesture(middle, 'success', 0, true).value).toEqual([0, 1, 0])
    expect(advanceGesture(initialGesture(), 'wave', -1).value).toEqual([0, 0, 0])
    expect(anthroPose(0, [1, 0, 0], true)).toEqual(anthroPose(100, [1, 0, 0], true))
  })
})

describe('anthro anatomy and planted contacts', () => {
  it('preserves bone lengths, including unreachable and singular IK targets', () => {
    for (const target of [[0, 0, 0], [0, -0.4, 0], [8, 9, 2]] as Point[]) {
      const chain = solveLimb([0, 0, 0], target, [0, -1, 0], ...ARM_LENGTHS)
      expect(distance(chain.root, chain.joint)).toBeCloseTo(ARM_LENGTHS[0])
      expect(distance(chain.joint, chain.end)).toBeCloseTo(ARM_LENGTHS[1])
      expect([...chain.root, ...chain.joint, ...chain.end].every(Number.isFinite)).toBe(true)
    }
  })
  it('keeps ankles fixed during breathing and every gesture; elbows clear the hips', () => {
    for (const weights of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0]]) {
      for (const time of [0, 0.25, 1.8, 5]) {
        const pose = anthroPose(time, weights)
        for (const arm of pose.arms) {
          expect(distance(arm.root, arm.joint)).toBeCloseTo(ARM_LENGTHS[0])
          expect(distance(arm.joint, arm.end)).toBeCloseTo(ARM_LENGTHS[1])
        }
        pose.legs.forEach((leg, i) => {
          expect(distance(leg.root, leg.joint)).toBeCloseTo(LEG_LENGTHS[0])
          expect(distance(leg.joint, leg.end)).toBeCloseTo(LEG_LENGTHS[1])
          expect(leg.end[1]).toBeCloseTo(0.145)
          expect(leg.end[0]).toBeCloseTo(i === 0 ? -0.192 : 0.192)
        })
        if (weights[1] === 1) pose.arms.forEach((arm) => {
          expect(Math.abs(arm.joint[0] - pose.shift)).toBeGreaterThan(0.4)
          expect(arm.end[2]).toBeCloseTo(0.245)
        })
        if (weights[0] === 1) expect(pose.arms[1]!.end[1]).toBeGreaterThan(pose.arms[1]!.root[1])
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
      expect(pet.group.getObjectByName('mesh-body')!.parent!.visible).toBe(false)
      expect(pet.group.getObjectByName('anthro-body')!.visible).toBe(true)
      if (style === 'anime') expect(sleeve.getObjectByName('outline')).toBeDefined()
      if (style === 'plush') expect(sleeve.getObjectByName('fur-shell-2')).toBeDefined()
      if (style === 'glass') expect(sleeve.getObjectByName('glass-halo')).toBeDefined()
      for (const layer of sleeve.children) expect((layer as THREE.Mesh).geometry).toBe((sleeve as THREE.Mesh).geometry)
      pet.update({ ...next, behavior: 'wave' }, 1)
      pet.group.updateMatrixWorld(true)
      const shoulder = pet.group.getObjectByName('anthro-shoulder-r')!
      const hand = pet.group.getObjectByName('anthro-hand-r')!
      for (const key of ['position', 'normal']) expect([...(sleeve as THREE.Mesh).geometry.getAttribute(key).array].every(Number.isFinite)).toBe(true)
      expect(hand.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(shoulder.getWorldPosition(new THREE.Vector3()).y)
      for (const side of ['l', 'r']) {
        const foot = pet.group.getObjectByName(`anthro-foot-${side}`)!
        const bounds = visualBounds(foot)
        expect(bounds.min.y).toBeGreaterThan(0)
        expect(bounds.min.y).toBeLessThan(0.035)
        expect(new THREE.Vector3(0, 1, 0).transformDirection(foot.matrixWorld).y).toBeCloseTo(1)
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
    next.appearance!.accessories = [{ kind: 'scarf' }, { kind: 'hat' }, { kind: 'bow', socket: 'paw-r' }]
    const pet = createProceduralPet(next, 'low')
    expect(pet.group.getObjectByName('anthro-collar')!.visible).toBe(false)
    expect(pet.group.getObjectByName('socket-neck')!.position.y).toBeCloseTo(1.57 * pet.group.getObjectByName('anthro-body')!.scale.y)
    expect(pet.group.getObjectByName('socket-head')!.position.y).toBeGreaterThan(pet.group.getObjectByName('bone-head')!.position.y)
    pet.update({ ...next, behavior: 'wave' }, 1)
    expect(pet.group.getObjectByName('socket-paw-r')!.position.y).toBeGreaterThan(1.7)
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
