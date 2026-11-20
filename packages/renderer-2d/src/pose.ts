import type { PetPose } from '@yk-pet/core'

export const POSE_TRANSITION_SECONDS = 0.6

export interface PoseTransition {
  from: number
  to: number
  startedAt: number
  /** 0 = sitting, 1 = standing. */
  amount: number
}

function sample(transition: PoseTransition, time: number): number {
  const t = Math.max(0, Math.min(1, (time - transition.startedAt) / POSE_TRANSITION_SECONDS))
  const ease = t * t * (3 - 2 * t)
  return transition.from + (transition.to - transition.from) * ease
}

/** Pure, absolute-time sampling; retarget from the current silhouette even mid-transition. */
export function transitionPose(
  previous: PoseTransition | undefined, pose: PetPose | undefined, time: number, reducedMotion = false,
): PoseTransition {
  const to = pose === 'stand' || pose === 'anthro' ? 1 : 0
  if (!previous || reducedMotion) return { from: to, to, startedAt: time, amount: to }
  const amount = sample(previous, time)
  if (previous.to !== to) return { from: amount, to, startedAt: time, amount }
  return { ...previous, amount }
}

/** Local rig offsets leave the original seated paths and drawing scale intact at zero. */
export function poseRig(amount: number) {
  const t = Math.max(0, Math.min(1, amount))
  return {
    stand: t,
    headroom: 8 * t,
    headY: -53 - 16 * t,
    bodyY: -16 * t,
    bodyWidth: 1 - 0.2 * t,
    bodyHeight: 1 - 0.1 * t,
    floor: 82 + 6 * t,
    footX: 39 - 13 * t,
    legX: 37 - 13 * t,
    footY: 61 + 18.45 * t,
    footWidth: 1 - 0.08 * t,
    footHeight: 1 - 0.6 * t,
    footAngle: 0.23 - 0.13 * t,
    stepWeight: 1 - t,
    armSpread: 8 * t,
    armLift: -5 * t,
    armScale: 1 - 0.28 * t,
    tailX: 39 - 5 * t,
    tailY: 51 - 5 * t,
  }
}
