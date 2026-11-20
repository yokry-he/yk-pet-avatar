/** Pure anthro posing: planted ankles, two-bone IK and interruptible gesture envelopes. */
import type { PetAction } from '@yk-pet/core'

export type Point = readonly [number, number, number]
export interface Chain { root: Point; joint: Point; end: Point }
export const ARM_LENGTHS = [0.205, 0.195] as const
export const LEG_LENGTHS = [0.105, 0.105] as const
export const GESTURE_DURATION = 0.25
// Anthro-only landmarks, measured from the planted sole; sit/stand keep their own rig.
export const ANTHRO = { torsoY: 0.82, neckY: 1.16, shoulderY: 1.20, hipY: 0.33, ankleY: 0.155, footX: 0.22, tailY: 0.30 } as const
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
  return clamp(styleHead * 1.3, styleBody * 1.42, styleBody * 1.48) / styleHead
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
  return [Number(action === 'wave'), Number(action === 'happy'),
    Number(['thinking', 'eating', 'working', 'sleep'].includes(action)), Number(action === 'success')]
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
  const wave = clamp(gesture[0] ?? 0), proud = clamp(gesture[1] ?? 0), gather = clamp(gesture[2] ?? 0)
  const celebrate = clamp(gesture[3] ?? 0)
  const shift = -0.012 + (reduced ? 0 : Math.sin(t * 1.15) * 0.006)
  const hipRoll = -0.025, shoulderRoll = 0.025
  const breath = reduced ? 0 : Math.sin(t * 2) * 0.006
  const arms = [-1, 1].map((side) => {
    const greeting = side === -1 ? wave : 0
    const celebration = celebrate * (1 - greeting)
    const raised = greeting + celebration
    const hips = proud * (1 - raised)
    const gathered = gather * (1 - raised) * (1 - hips)
    const root: Point = [side * 0.43 + shift, ANTHRO.shoulderY + side * 0.008 + breath, 0.16]
    const idle: Point = [side * 0.58 + shift, 0.83 + breath, 0.19]
    let wrist = mix(idle, [side * 0.51 + shift, 0.86 + breath, 0.24], hips)
    wrist = mix(wrist, [side * 0.17 + shift, 1.15 + breath, 0.40], gathered)
    const arc = reduced ? 0 : Math.sin(t * 7.5) * 0.10
    // Beside the lower cheek, in front of the fur. Only a small cartoon reach is needed.
    const ratio = Math.max(1, headToBody / 1.42)
    const greetingHand: Point = [side * (0.66 + arc * 0.30) * ratio + shift, 1.40 + breath + arc * 0.08, 0.64 * ratio]
    const successHand: Point = [side * 0.99 * ratio + shift, 1.93 * ratio + breath, 0.30]
    wrist = mix(wrist, greetingHand, greeting)
    wrist = mix(wrist, successHand, celebration)
    const reach = Math.max(1 + hips * 0.23, length(sub(wrist, root)) / (ARM_LENGTHS[0] + ARM_LENGTHS[1]) + 0.015)
    const lengths = ARM_LENGTHS.map(n => n * reach) as [number, number]
    return {
      ...solveLimb(root, wrist, mix([side * 0.5, -0.1, 0.1], [side, -0.4, -0.1], Math.max(hips, raised)), ...lengths),
      handRoll: side * (greeting * (2.9 + arc) + celebration * 2.8 - hips * 0.65),
      handPitch: -hips * 0.32,
      palm: raised,
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
