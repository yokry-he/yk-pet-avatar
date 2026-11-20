/** Pure anthro posing: planted ankles, two-bone IK and interruptible gesture envelopes. */
import type { PetAction } from '@yk-pet/core'

export type Point = readonly [number, number, number]
export interface Chain { root: Point; joint: Point; end: Point }
export const ARM_LENGTHS = [0.27, 0.245] as const
export const LEG_LENGTHS = [0.25, 0.25] as const
export const GESTURE_DURATION = 0.4
// Anthro-only landmarks, measured from the planted sole; sit/stand keep their own rig.
export const ANTHRO = { torsoY: 0.94, neckY: 1.28, shoulderY: 1.16, hipY: 0.64, ankleY: 0.155, footX: 0.22, tailY: 0.54 } as const
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Point, n: number): Point => [a[0] * n, a[1] * n, a[2] * n]
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a: Point) => Math.hypot(...a)
const unit = (a: Point): Point => mul(a, 1 / Math.max(1e-9, length(a)))
const mix = (a: Point, b: Point, t: number): Point => add(a, mul(sub(b, a), t))

/** Normalize the style defaults; the caller applies this gain before the user's own proportions. */
export function anthroHeadGain(styleHead: number, styleBody: number): number {
  return clamp(styleHead * 1.12, styleBody * 1.12, styleBody * 1.36) / styleHead
}

/** Pole is a direction toward the elbow/knee. Clamp unreachable targets without stretching bones. */
export function solveLimb(root: Point, target: Point, pole: Point, upper: number, lower: number): Chain {
  const delta = sub(target, root)
  const direction: Point = length(delta) < 1e-8 ? [0, -1, 0] : unit(delta)
  const distance = clamp(length(delta), Math.abs(upper - lower) + 1e-6, upper + lower - 1e-6)
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  let perpendicular = sub(pole, mul(direction, dot(pole, direction)))
  if (length(perpendicular) < 1e-8) {
    const fallback: Point = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
    perpendicular = sub(fallback, mul(direction, dot(fallback, direction)))
  }
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along))
  return {
    root,
    joint: add(add(root, mul(direction, along)), mul(unit(perpendicular), bend)),
    end: add(root, mul(direction, distance)),
  }
}

export interface GestureBlend {
  value: number[]
  from: number[]
  target: number[]
  elapsed: number
}
function gestureTarget(action: PetAction): number[] {
  return [Number(action === 'wave'), Number(action === 'success' || action === 'happy'), Number(action === 'thinking')]
}
export function initialGesture(action: PetAction = 'idle'): GestureBlend {
  const value = gestureTarget(action)
  return { value, from: [...value], target: [...value], elapsed: GESTURE_DURATION }
}
export function advanceGesture(previous: GestureBlend, action: PetAction, dt: number, reduced = false): GestureBlend {
  if (reduced) return initialGesture(action)
  const target = gestureTarget(action)
  const changed = target.some((n, i) => n !== previous.target[i])
  const from = changed ? previous.value : previous.from
  const elapsed = Math.min(GESTURE_DURATION, (changed ? 0 : previous.elapsed) + Math.max(0, dt))
  const t = elapsed / GESTURE_DURATION, ease = t * t * (3 - 2 * t)
  return { value: target.map((n, i) => from[i]! + (n - from[i]!) * ease), from, target, elapsed }
}

export function anthroPose(time: number, gesture: readonly number[], reduced = false, headToBody = 1) {
  const t = reduced ? 0 : time
  const wave = gesture[0] ?? 0, proud = gesture[1] ?? 0, think = gesture[2] ?? 0
  const shift = -0.012 + (reduced ? 0 : Math.sin(t * 1.15) * 0.006)
  const hipRoll = -0.025, shoulderRoll = 0.025
  const breath = reduced ? 0 : Math.sin(t * 2) * 0.006
  const cheekClearance = Math.max(0, headToBody - 1)
  const arms = [-1, 1].map((side) => {
    const root: Point = [side * (0.32 + (side === 1 ? wave * 0.025 : 0)) + shift, ANTHRO.shoulderY + side * 0.008 + breath + (side === 1 ? wave * 0.10 : 0), 0]
    const idle: Point = [side * 0.425 + shift, 0.755 + breath, 0.14 + Math.sin(t * 1.5 + side) * (reduced ? 0 : 0.018)]
    // Keep elbows outside the waist and palms resting on the front of each hip.
    let wrist = mix(idle, [side * 0.32 + shift, 0.84, 0.245], proud)
    if (side === 1) {
      wrist = mix(wrist, [0.69 + cheekClearance * 0.24 + Math.sin(t * 7) * (reduced ? 0 : 0.025), 1.52 - cheekClearance * 0.18, 0.16], wave)
      wrist = mix(wrist, [0.22, 1.24, 0.36], think)
    }
    return {
      ...solveLimb(root, wrist, mix([side * 0.24, -0.12, 0.65], [side, -0.12, -0.12], Math.max(proud, wave)), ...ARM_LENGTHS),
      handRoll: side === 1 ? wave * (2.75 + (reduced ? 0 : Math.sin(t * 8) * 0.24)) : 0,
      handPitch: -proud * 0.32,
    }
  })
  const legs = [-1, 1].map((side) => solveLimb(
    [side * 0.18 + shift, ANTHRO.hipY + side * Math.sin(hipRoll) * 0.18, -0.015],
    [side * ANTHRO.footX, ANTHRO.ankleY, side === 1 ? 0.025 : 0.005],
    [side * 0.12, 0, side === 1 ? 1 : 0.45],
    ...LEG_LENGTHS,
  ))
  return { arms, legs, shift, hipRoll, shoulderRoll, breath }
}
