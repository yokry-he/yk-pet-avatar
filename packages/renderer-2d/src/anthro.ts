/** Pure Canvas anthro rig. Coordinates are in the renderer's 310-unit art space. */
import type { PetPose } from '@yk-pet/core'
import { POSE_TRANSITION_SECONDS, type PoseTransition } from './pose'

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Independent of sit/stand: interrupted transitions retain both current weights. */
export function transitionAnthro(previous: PoseTransition | undefined, pose: PetPose | undefined,
  time: number, reducedMotion = false): PoseTransition {
  const to = pose === 'anthro' ? 1 : 0
  if (!previous || reducedMotion) return { from: to, to, amount: to, startedAt: time }
  const amount = lerp(previous.from, previous.to, ease((time - previous.startedAt) / POSE_TRANSITION_SECONDS))
  return previous.to === to ? { ...previous, amount } : { from: amount, to, amount, startedAt: time }
}

/** Concentrate the body crossfade around a small squash, rather than ghosting for the whole rise. */
export function anthroBlend(amount: number) {
  const t = clamp(amount)
  const squash = Math.sin(t * Math.PI) ** 8
  return { body: ease((t - 0.3) / 0.4), squashX: 1 + squash * 0.05, squashY: 1 - squash * 0.1 }
}

export interface GestureWeights { wave: number; proud: number; gather: number; celebrate: number }
export interface GestureTransition {
  from: GestureWeights
  to: GestureWeights
  amount: GestureWeights
  startedAt: number
}
export const GESTURE_TRANSITION_SECONDS = 0.25

export function gestureTarget(action: string): GestureWeights {
  return {
    wave: action === 'wave' ? 1 : 0,
    proud: action === 'happy' ? 1 : 0,
    celebrate: action === 'success' ? 1 : 0,
    gather: ['thinking', 'eating', 'working', 'sleep'].includes(action) ? 1 : 0,
  }
}

/** Absolute-time easing also handles interrupted gestures and actions returning to idle. */
export function transitionGesture(previous: GestureTransition | undefined, action: string,
  time: number, reducedMotion = false): GestureTransition {
  const to = gestureTarget(action)
  if (!previous || reducedMotion) return { from: to, to, amount: to, startedAt: time }
  const t = ease((time - previous.startedAt) / GESTURE_TRANSITION_SECONDS)
  const amount = {
    wave: lerp(previous.from.wave, previous.to.wave, t),
    proud: lerp(previous.from.proud, previous.to.proud, t),
    gather: lerp(previous.from.gather, previous.to.gather, t),
    celebrate: lerp(previous.from.celebrate, previous.to.celebrate, t),
  }
  const changed = (Object.keys(to) as (keyof GestureWeights)[]).some(key => to[key] !== previous.to[key])
  return changed ? { from: amount, to, amount, startedAt: time } : { ...previous, amount }
}

export interface Point { x: number; y: number }
export interface ArmRig { shoulder: Point; elbow: Point; wrist: Point; handAngle: number; palm: number }

/** Raised gestures use cartoon reach to clear the chibi head; the shoulder stays fixed. */
export function armRig(side: number, time: number, weights: GestureWeights, reducedMotion = false,
  headToBody = 1): ArmRig {
  const t = reducedMotion ? 0 : time
  const wave = side > 0 ? clamp(weights.wave) : 0
  const celebrate = clamp(weights.celebrate) * (1 - wave)
  const raised = wave + celebrate
  const proud = clamp(weights.proud) * (1 - raised)
  const gather = clamp(weights.gather) * (1 - raised) * (1 - proud)
  const sway = reducedMotion ? 0 : Math.sin(t * 1.85 + side * 0.5) * 0.035
  const arc = reducedMotion ? 0 : Math.sin(t * 7.5) * 0.32
  let upper = 0.16 + sway
  let lower = -0.10 + sway * 0.5
  upper = lerp(upper, 1.55, proud)
  lower = lerp(lower, -0.75, proud)
  upper = lerp(upper, 0.30, gather)
  lower = lerp(lower, -2.35, gather)
  upper = lerp(upper, 2.30, celebrate)
  lower = lerp(lower, 2.78, celebrate)
  upper = lerp(upper, 2.35, wave)
  lower = lerp(lower, 3.02 + arc, wave)
  const reach = lerp(1, Math.max(2.75, 2.5 * headToBody), raised) + proud * 0.5
  const shoulder = { x: side * 28, y: -17 - side * 1.2 }
  const elbow = { x: shoulder.x + side * Math.sin(upper) * 27 * reach, y: shoulder.y + Math.cos(upper) * 27 * reach }
  const wrist = { x: elbow.x + side * Math.sin(lower) * 25 * reach, y: elbow.y + Math.cos(lower) * 25 * reach }
  return { shoulder, elbow, wrist,
    handAngle: lerp(-side * lower, -side * (Math.PI - 0.36), celebrate), palm: raised }
}

/** Counter-tilt is confined to the torso; soles remain fixed on the floor. */
export function anthroRig(time: number, reducedMotion = false) {
  const shift = reducedMotion ? 0 : Math.sin(time * 0.85) * 0.85
  return {
    hipX: -2.5 + shift, hipTilt: 0.035, shoulderTilt: -0.025 - shift * 0.008,
    headY: -89, floor: 96, footY: 89,
    legs: [
      { hip: { x: -17, y: 37 }, knee: { x: -20, y: 65 }, ankle: { x: -20, y: 85 }, footX: -22 },
      { hip: { x: 16, y: 38 }, knee: { x: 25, y: 63 }, ankle: { x: 23, y: 85 }, footX: 25 },
    ],
  }
}

/** Offsets for a tapered, smoothly joined two-link limb; no circular elbow joint. */
export function limbEdges(start: Point, joint: Point, end: Point, widths: readonly [number, number, number]) {
  const normal = (a: Point, b: Point) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  }
  const n1 = normal(start, joint), n2 = normal(joint, end)
  const length = Math.hypot(n1.x + n2.x, n1.y + n2.y) || 1
  const middle = { x: (n1.x + n2.x) / length, y: (n1.y + n2.y) / length }
  const offset = (p: Point, n: Point, width: number, side: number) => ({ x: p.x + n.x * width * side, y: p.y + n.y * width * side })
  return {
    left: [offset(start, n1, widths[0], 1), offset(joint, middle, widths[1], 1), offset(end, n2, widths[2], 1)],
    right: [offset(start, n1, widths[0], -1), offset(joint, middle, widths[1], -1), offset(end, n2, widths[2], -1)],
  }
}
