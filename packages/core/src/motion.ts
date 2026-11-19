/**
 * 文件职责 / File responsibility
 * 把动作、情绪和时间解析成 2D/3D 共用的表情权重和身体姿态。
 * Resolves action, emotion, and time into expression weights and a body pose
 * shared by the 2D and 3D renderers.
 */

import type { BodyPose, Emotion, Expression, PetAction } from './types'

export interface ExpressionInput {
  action: PetAction
  emotion: Emotion
  speaking: boolean
  time: number
  reducedMotion?: boolean
  dragActive?: boolean
}

const BASE_FACE: Expression = {
  eyeOpen: 1,
  mouthOpen: 0,
  smile: 0.08,
  brow: 0,
  blush: 0.18,
  earDrop: 0,
  pupil: 1,
  squint: 0,
  heartEyes: false,
}

const EMOTION_FACE: Record<Emotion, Partial<Expression>> = {
  neutral: { smile: 0.08, blush: 0.16 },
  happy: { smile: 0.9, brow: 0.15, blush: 0.38, squint: 0.32 },
  sad: { smile: -0.75, brow: -0.7, blush: 0.08, earDrop: 0.7, pupil: 0.9 },
  excited: { smile: 1, brow: 0.45, blush: 0.45, pupil: 1.15, eyeOpen: 1.1 },
  angry: { smile: -0.45, brow: 0.85, blush: 0.12, pupil: 0.72, squint: 0.22 },
  shy: { smile: 0.4, blush: 0.92, squint: 0.18, eyeOpen: 0.9, pupil: 1.05 },
  surprised: { smile: 0.05, brow: 0.55, eyeOpen: 1.18, mouthOpen: 0.32, pupil: 0.7 },
  love: { smile: 0.75, blush: 0.88, squint: 0.1, heartEyes: true },
  tired: { smile: -0.05, brow: -0.25, eyeOpen: 0.5, earDrop: 0.4 },
  focused: { smile: 0, brow: -0.12, pupil: 0.78, squint: 0.08 },
}

function actionFace(action: PetAction): Partial<Expression> | null {
  switch (action) {
    case 'happy':
    case 'success':
    case 'wave':
    case 'petting':
    case 'jump':
      return { smile: 0.85, squint: 0.28, blush: 0.36 }
    case 'sad':
    case 'error':
      return { smile: -0.8, brow: -0.65, earDrop: 0.72, blush: 0.06 }
    case 'sleep':
      return { eyeOpen: 0.06, smile: 0.12, earDrop: 0.45, mouthOpen: 0.08 }
    case 'thinking':
      return { brow: 0.2, smile: 0.02, pupil: 0.85 }
    case 'eating':
      return { smile: 0.25, mouthOpen: 0.45 }
    case 'dragged':
      return { eyeOpen: 1.2, mouthOpen: 0.22, brow: 0.4, pupil: 0.75 }
    default:
      return null
  }
}

/** 0 = fully shut, 1 = open. A short blink every ~4.2s. */
export function blinkAmount(time: number, reducedMotion = false): number {
  if (reducedMotion) return 1
  const cycle = ((time % 4.2) + 4.2) % 4.2
  if (cycle < 3.95) return 1
  const p = (cycle - 3.95) / 0.25
  return p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2
}

export function resolveExpression(input: ExpressionInput): Expression {
  const reduced = Boolean(input.reducedMotion)
  const face: Expression = { ...BASE_FACE, ...EMOTION_FACE[input.emotion] }
  if (input.emotion === 'neutral') {
    const implied = actionFace(input.action)
    if (implied) Object.assign(face, implied)
  }
  if (input.action === 'sleep') {
    face.eyeOpen = 0.06
    face.mouthOpen = 0.06
    face.earDrop = Math.max(face.earDrop, 0.4)
  }
  if (input.action === 'dragged' || input.dragActive) {
    face.eyeOpen = 1.2
    face.mouthOpen = Math.max(face.mouthOpen, 0.2)
    face.brow = Math.max(face.brow, 0.35)
    face.heartEyes = false
  }
  if (input.action === 'eating') {
    const chew = reduced ? 0.4 : 0.25 + Math.abs(Math.sin(input.time * 8)) * 0.7
    face.mouthOpen = Math.max(face.mouthOpen, chew)
  }
  if (input.speaking && input.action !== 'sleep') {
    const flap = reduced ? 0.45 : 0.2 + Math.abs(Math.sin(input.time * 11)) * 0.8
    face.mouthOpen = Math.max(face.mouthOpen, flap)
  }
  if (input.action !== 'sleep' && !input.dragActive && !face.heartEyes) {
    face.eyeOpen *= blinkAmount(input.time, reduced)
  }
  face.eyeOpen *= 1 - face.squint * 0.45
  face.eyeOpen = clamp(face.eyeOpen, 0.04, 1.25)
  face.mouthOpen = clamp(face.mouthOpen, 0, 1)
  face.smile = clamp(face.smile, -1, 1)
  face.blush = clamp(face.blush, 0, 1)
  face.earDrop = clamp(face.earDrop, 0, 1)
  face.pupil = clamp(face.pupil, 0.55, 1.35)
  return face
}

export function resolveBodyPose(
  action: PetAction,
  time: number,
  reducedMotion = false,
  dragActive = false,
): BodyPose {
  const t = reducedMotion ? 0 : time
  const breathe = Math.sin(t * 2.15)
  const pose: BodyPose = {
    bob: breathe * 4,
    jump: 0,
    lean: Math.sin(t * 0.65) * 0.04,
    squashX: 1 + breathe * 0.015,
    squashY: 1 - breathe * 0.015,
    tailWag: Math.sin(t * 2.5) * 0.34,
    tailLift: 0.15,
    earTwitch: Math.sin(t * 3.1) * 0.05,
    pawPhase: 0,
    wave: 0,
    sleep: 0,
    zzz: 0,
    sparkle: 0,
    think: 0,
  }

  switch (action) {
    case 'walk':
    case 'working':
      pose.bob = Math.sin(t * 8) * 5
      pose.pawPhase = t * 8
      pose.tailWag = Math.sin(t * 10) * 0.55
      pose.lean = 0.08
      pose.squashY = 1 + Math.sin(t * 8) * 0.03
      break
    case 'sleep':
      pose.sleep = 1
      pose.bob = Math.sin(t * 1.15) * 2
      pose.tailWag = Math.sin(t * 1.05) * 0.08
      pose.zzz = 1
      pose.squashX = 1.12
      pose.squashY = 0.84
      pose.earTwitch = 0
      break
    case 'happy':
    case 'success':
    case 'petting':
      pose.jump = Math.abs(Math.sin(t * 6)) * 16
      pose.sparkle = 1
      pose.tailWag = Math.sin(t * 12) * 0.7
      pose.tailLift = 0.65
      pose.earTwitch = Math.sin(t * 8) * 0.08
      break
    case 'jump': {
      const p = ((t % 0.85) + 0.85) % 0.85 / 0.85
      pose.jump = Math.sin(p * Math.PI) * 38
      pose.squashY = p < 0.18 ? 0.82 : p > 0.78 ? 0.78 : 1.06
      pose.squashX = p < 0.18 ? 1.14 : 0.96
      pose.sparkle = 0.7
      break
    }
    case 'sad':
    case 'error':
      pose.bob = Math.sin(t * 1.3) * 2
      pose.tailLift = -0.4
      pose.tailWag = Math.sin(t * 1.4) * 0.08
      pose.lean = -0.08
      pose.earTwitch = 0
      break
    case 'thinking':
      pose.think = 1
      pose.lean = -0.14
      pose.bob = Math.sin(t * 1.5) * 2
      pose.tailWag = Math.sin(t * 1.8) * 0.12
      break
    case 'talking':
      pose.bob = Math.sin(t * 3.2) * 3
      pose.tailWag = Math.sin(t * 4) * 0.28
      break
    case 'eating':
      pose.bob = Math.abs(Math.sin(t * 7)) * 3
      pose.lean = 0.2
      pose.tailWag = Math.sin(t * 3) * 0.15
      break
    case 'dragged':
      pose.squashX = 1.14
      pose.squashY = 0.86
      pose.tailWag = Math.sin(t * 14) * 0.35
      pose.bob = 0
      break
    case 'wave':
      pose.wave = 1
      pose.pawPhase = t * 12
      pose.sparkle = 0.55
      pose.tailWag = Math.sin(t * 6) * 0.4
      break
    default:
      break
  }

  if (dragActive) {
    pose.squashX = 1.14
    pose.squashY = 0.86
  }
  if (reducedMotion) {
    pose.jump = 0
    pose.tailWag *= 0.12
    pose.sparkle = 0
    pose.pawPhase = 0
    pose.bob *= 0.25
  }
  return pose
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function chooseAutonomousAction(stats: { mood: number; energy: number; hunger: number }, random: () => number): PetAction {
  if (stats.hunger >= 75) return 'eating'
  if (stats.energy <= 20) return 'sleep'
  if (stats.mood <= 25) return 'sad'
  if (stats.mood >= 85 && random() < 0.55) return 'happy'
  if (random() < 0.3) return 'walk'
  return 'idle'
}

export function stepStats(
  stats: { mood: number; energy: number; hunger: number },
  rates: { energyDrain: number; energyRecover: number; hungerGain: number; moodDrift: number; eatRate: number },
  dt: number,
  action: PetAction,
): { mood: number; energy: number; hunger: number } {
  const safeDt = clamp(dt, 0, 0.25)
  let energy = stats.energy
  let hunger = stats.hunger
  let mood = stats.mood
  if (action === 'sleep') energy += rates.energyRecover * safeDt
  else {
    const effort = action === 'walk' || action === 'working' || action === 'jump' ? 1.7 : 1
    energy -= rates.energyDrain * effort * safeDt
  }
  if (action === 'eating') {
    hunger -= rates.eatRate * safeDt
    energy += rates.eatRate * 0.25 * safeDt
    mood += 1.2 * safeDt
  } else {
    hunger += rates.hungerGain * safeDt
  }
  const target = clamp(68 + (energy - 50) * 0.28 - (hunger - 35) * 0.42, 0, 100)
  mood += (target - mood) * Math.min(1, rates.moodDrift * safeDt)
  return {
    mood: clamp(mood, 0, 100),
    energy: clamp(energy, 0, 100),
    hunger: clamp(hunger, 0, 100),
  }
}
