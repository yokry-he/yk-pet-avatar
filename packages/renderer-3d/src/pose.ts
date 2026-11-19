import type { PetPose } from '@yk-pet/core'

export const POSE_DURATION = 0.6
export interface PoseTransition {
  value: number
  from: number
  target: number
  elapsed: number
}

export function initialPose(pose?: PetPose): PoseTransition {
  const value = pose === 'stand' ? 1 : 0
  return { value, from: value, target: value, elapsed: POSE_DURATION }
}

/** Pure, time-based easing. Retarget from the current blend, including mid-transition reversals. */
export function advancePose(
  previous: PoseTransition,
  pose: PetPose | undefined,
  dt: number,
  reducedMotion = false,
): PoseTransition {
  const target = pose === 'stand' ? 1 : 0
  if (reducedMotion) return initialPose(pose)
  const changed = target !== previous.target
  const from = changed ? previous.value : previous.from
  const elapsed = Math.min(POSE_DURATION, (changed ? 0 : previous.elapsed) + Math.max(0, dt))
  const t = elapsed / POSE_DURATION
  const ease = t * t * (3 - 2 * t)
  return { value: from + (target - from) * ease, from, target, elapsed }
}

/** Shared rig coordinates; feet stay on the ground as the torso and forepaws rise. */
export function interpolateRig(standing: number) {
  const t = Math.max(0, Math.min(1, standing))
  const mix = (sit: number, stand: number) => sit + (stand - sit) * t
  const footPitch = mix(0, Math.PI / 2)
  const footRoll = mix(0.22, 0)
  const footHeight = mix(1, 1.12)
  const footDepth = mix(1, 0.67)
  // Support the rotating ellipsoid while it rolls from a raised sole onto the ground.
  const footSupport = Math.hypot(
    0.19 * Math.cos(footPitch) * Math.sin(footRoll),
    0.2 * footHeight * Math.cos(footPitch) * Math.cos(footRoll),
    0.15 * footDepth * Math.sin(footPitch),
  )
  return {
    headY: mix(1.12, 1.65),
    chestY: mix(0.49, 0.96),
    bodyWidth: mix(1, 0.88),
    bodyHeight: mix(1, 1.12),
    pawX: mix(0.175, 0.37),
    pawY: mix(0.325, 0.80),
    pawZ: mix(0.265, 0.10),
    pawRoll: mix(0, 0.13),
    footX: mix(0.32, 0.235),
    footY: Math.max(mix(0.225, 0.115), footSupport + 0.012),
    footZ: mix(0.21, 0.15),
    footRoll,
    footPitch,
    footHeight,
    footDepth,
    legScale: t,
    tailY: mix(0.24, 0.40),
    tailZ: mix(-0.2, -0.27),
    tailRoll: mix(0, -0.12),
  }
}
