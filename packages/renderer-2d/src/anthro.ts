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

/** Normalize only the style defaults; user proportions remain multiplicative. */
export function anthroHeadGain(styleHead: number, styleBody: number): number {
  return Math.max(styleBody * 1.42, Math.min(styleBody * 1.48, styleHead * 1.3)) / styleHead
}

/** Two short links with a fixed shoulder, outward elbow and cheek-side greeting. */
export function armRig(side: number, time: number, weights: GestureWeights, reducedMotion = false,
  headToBody = 1.42): ArmRig {
  const t = reducedMotion ? 0 : time
  const wave = side < 0 ? clamp(weights.wave) : 0
  const celebrate = clamp(weights.celebrate) * (1 - wave)
  const raised = wave + celebrate
  const proud = clamp(weights.proud) * (1 - raised)
  const gather = clamp(weights.gather) * (1 - raised) * (1 - proud)
  const arc = reducedMotion ? 0 : Math.sin(t * 7.5) * 0.10
  const sway = reducedMotion ? 0 : Math.sin(t * 1.85 + side * 0.5) * 0.8
  const shoulder = { x: side * 40, y: -15 - side * 0.7 }
  let x = side * 53, y = 20 + sway
  x = lerp(x, side * 47, proud); y = lerp(y, 29, proud)
  x = lerp(x, side * 16, gather); y = lerp(y, -1, gather)
  const ratio = Math.max(1, headToBody / 1.42)
  x = lerp(x, side * (65 + arc * 30) * ratio, wave); y = lerp(y, -16 + arc * 8, wave)
  x = lerp(x, side * 94 * ratio, celebrate); y = lerp(y, -87 * ratio, celebrate)
  const dx = x - shoulder.x, dy = y - shoulder.y
  const distance = Math.hypot(dx, dy)
  const reach = Math.max(1 + proud * 0.6, distance / 40 + 0.015)
  const upper = 20.5 * reach, lower = 19.5 * reach
  const d = Math.max(0.001, distance)
  const along = (upper * upper - lower * lower + d * d) / (2 * d)
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along))
  const nx = dx / d, ny = dy / d
  // Keep the same bend branch across shoulder height so gesture blends cannot flip elbows.
  const direction = -side
  const elbow = { x: shoulder.x + nx * along - ny * bend * direction,
    y: shoulder.y + ny * along + nx * bend * direction }
  return { shoulder, elbow, wrist: { x, y },
    handAngle: -side * (wave * (Math.PI - 0.25 + arc) + celebrate * (Math.PI - 0.36) - proud * 0.5),
    palm: raised }
}

/** Counter-tilt is confined to the torso; soles remain fixed on the floor. */
export function anthroRig(time: number, reducedMotion = false) {
  const shift = reducedMotion ? 0 : Math.sin(time * 0.85) * 0.85
  return {
    hipX: -2.5 + shift, hipTilt: 0.035, shoulderTilt: -0.025 - shift * 0.008,
    headY: -70, floor: 116, footY: 104,
    legs: [
      { hip: { x: -21, y: 82 }, knee: { x: -22, y: 96 }, ankle: { x: -23, y: 103 }, footX: -23 },
      { hip: { x: 21, y: 82 }, knee: { x: 23, y: 96 }, ankle: { x: 23, y: 103 }, footX: 23 },
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
