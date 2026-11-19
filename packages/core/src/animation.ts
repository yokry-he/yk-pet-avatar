/**
 * 文件职责 / File responsibility
 * v0.1 的动作数据模型和采样器。关键帧工坊留到 v0.2，这里只把轨道、缓动、
 * 逐帧、片段混合和骨骼挂点定义成可播放的数据。
 * Action clips are data: tracks, easing, frame snapping, and sequenced blends.
 * The keyframe studio UI is intentionally not part of v0.1.
 */

import type { PetAction } from './types'

export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'step'] as const
export type EasingName = (typeof EASINGS)[number]

export const TRACK_KINDS = ['bone', 'part', 'effect', 'prop', 'frame'] as const
export type TrackKind = (typeof TRACK_KINDS)[number]

export const SOCKET_IDS = [
  'head', 'ear-l', 'ear-r', 'neck', 'chest', 'back', 'tail', 'paw-l', 'paw-r', 'muzzle', 'face',
] as const
export type SocketId = (typeof SOCKET_IDS)[number]

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** One sample on a track. `value` is the scalar channel; x/y/z are optional vector channels. */
export interface Keyframe {
  time: number
  value?: number
  x?: number
  y?: number
  z?: number
  easing?: EasingName
}

export interface AnimTrack {
  id: string
  kind: TrackKind
  /** Bone name (`bone-head`), part, socket, or effect id. */
  target: string
  /** Channel, e.g. `rotation.z`, `opacity`, `spriteFrame`. */
  property: string
  keyframes: Keyframe[]
}

export interface ActionClip {
  id: string
  /** When set, `pet.play(action)` plays this clip on top of the procedural pose. */
  action?: PetAction
  duration: number
  loop?: boolean
  /** Frame-by-frame mode snaps sample time to `fps` and ignores in-betweens. */
  mode?: 'smooth' | 'frame'
  fps?: number
  tracks: AnimTrack[]
}

export interface ClipStep {
  clipId: string
  /** Seconds of crossfade into the following step. */
  blend?: number
}

export interface ClipSequence {
  id: string
  steps: ClipStep[]
}

export interface PropAttachment {
  id: string
  socket: SocketId | string
  color?: string
}

export interface AttachmentSocket {
  id: SocketId | string
  /** Object3D / draw name a v0.2 studio can bind to. */
  bone: string
  position: Vec3
}

export interface SampledChannel {
  target: string
  property: string
  kind: TrackKind
  value: number
  x?: number
  y?: number
  z?: number
}

/** Logical pet space, y up. Both renderers map these onto their own rigs. */
export const DEFAULT_SOCKETS: AttachmentSocket[] = [
  { id: 'head', bone: 'bone-head', position: { x: 0, y: 0.95, z: 0.05 } },
  { id: 'ear-l', bone: 'bone-ear-l', position: { x: -0.22, y: 1.2, z: 0 } },
  { id: 'ear-r', bone: 'bone-ear-r', position: { x: 0.22, y: 1.2, z: 0 } },
  { id: 'neck', bone: 'bone-neck', position: { x: 0, y: 0.48, z: 0.12 } },
  { id: 'chest', bone: 'bone-chest', position: { x: 0, y: 0.28, z: 0.22 } },
  { id: 'back', bone: 'bone-hips', position: { x: 0, y: 0.36, z: -0.2 } },
  { id: 'tail', bone: 'bone-tail', position: { x: 0.05, y: 0.22, z: -0.42 } },
  { id: 'paw-l', bone: 'bone-paw-l', position: { x: -0.2, y: 0.08, z: 0.22 } },
  { id: 'paw-r', bone: 'bone-paw-r', position: { x: 0.2, y: 0.08, z: 0.22 } },
  { id: 'muzzle', bone: 'bone-head', position: { x: 0, y: 0.7, z: 0.32 } },
  { id: 'face', bone: 'bone-head', position: { x: 0, y: 0.82, z: 0.28 } },
]

const ACCESSORY_SOCKET: Record<string, SocketId> = {
  bow: 'neck',
  scarf: 'neck',
  glasses: 'face',
  flower: 'ear-l',
  hat: 'head',
}

export function socketForAccessory(kind: string, explicit?: string): AttachmentSocket {
  const id = explicit || ACCESSORY_SOCKET[kind] || 'chest'
  return DEFAULT_SOCKETS.find(socket => socket.id === id) ?? DEFAULT_SOCKETS[3]!
}

export function applyEasing(t: number, easing: EasingName = 'linear'): number {
  const u = clamp01(t)
  switch (easing) {
    case 'easeIn': return u * u
    case 'easeOut': return 1 - (1 - u) * (1 - u)
    case 'easeInOut': return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2
    case 'step': return u >= 1 ? 1 : 0
    default: return u
  }
}

export function sampleTrack(track: AnimTrack, time: number): SampledChannel | null {
  const frames = [...track.keyframes].sort((a, b) => a.time - b.time)
  if (!frames.length) return null
  const first = frames[0]!
  if (time <= first.time) return channel(track, first)
  const last = frames[frames.length - 1]!
  if (time >= last.time) return channel(track, last)
  let index = 0
  while (index < frames.length - 1 && frames[index + 1]!.time < time) index += 1
  const from = frames[index]!
  const to = frames[index + 1]!
  const span = Math.max(1e-6, to.time - from.time)
  const eased = applyEasing((time - from.time) / span, to.easing ?? 'linear')
  return {
    target: track.target,
    property: track.property,
    kind: track.kind,
    value: lerp(from.value ?? 0, to.value ?? 0, eased),
    x: lerpOpt(from.x, to.x, eased),
    y: lerpOpt(from.y, to.y, eased),
    z: lerpOpt(from.z, to.z, eased),
  }
}

export function sampleClip(clip: ActionClip, time: number): SampledChannel[] {
  const duration = Math.max(0.001, clip.duration)
  let local = clip.loop ? ((time % duration) + duration) % duration : Math.min(time, duration)
  if (clip.mode === 'frame') {
    const fps = clip.fps && clip.fps > 0 ? clip.fps : 12
    local = Math.floor(local * fps) / fps
  }
  return clip.tracks
    .map(track => sampleTrack(clip.mode === 'frame' ? stepTrack(track) : track, local))
    .filter((sample): sample is SampledChannel => Boolean(sample))
}

/** Crossfade adjacent steps by `blend` seconds. Later clips replace unmatched channels. */
export function sampleSequence(clips: readonly ActionClip[], sequence: ClipSequence, time: number): SampledChannel[] {
  const placed = placeSteps(clips, sequence)
  if (!placed.length) return []
  const active = placed.filter(step => time >= step.start - step.blend && time <= step.end)
  const weights = new Map<string, { sample: SampledChannel; weight: number }>()
  for (const step of active) {
    const into = step.blend > 0 ? clamp01((time - (step.start - step.blend)) / step.blend) : 1
    const outStart = step.end - step.blendOut
    const out = step.blendOut > 0 && time > outStart ? 1 - clamp01((time - outStart) / step.blendOut) : 1
    const weight = Math.min(into, out)
    if (weight <= 0) continue
    for (const sample of sampleClip(step.clip, time - step.start)) {
      const key = `${sample.kind}:${sample.target}:${sample.property}`
      const prev = weights.get(key)
      if (!prev) weights.set(key, { sample, weight })
      else {
        const total = prev.weight + weight
        prev.sample = {
          ...sample,
          value: (prev.sample.value * prev.weight + sample.value * weight) / total,
        }
        prev.weight = total
      }
    }
  }
  return [...weights.values()].map(entry => entry.sample)
}

export function channelValue(channels: readonly SampledChannel[] | undefined, target: string, property: string): number | undefined {
  return channels?.find(channel => channel.target === target && channel.property === property)?.value
}

export class ClipPlayer {
  #clips: ActionClip[] = []
  #sequences: ClipSequence[] = []
  #mode: 'clip' | 'sequence' | null = null
  #id = ''
  #started = 0

  replace(clips: ActionClip[] = [], sequences: ClipSequence[] = []): void {
    this.#clips = clips
    this.#sequences = sequences
  }

  playClip(id: string, now: number): boolean {
    if (!this.#clips.some(clip => clip.id === id)) return false
    this.#mode = 'clip'
    this.#id = id
    this.#started = now
    return true
  }

  playAction(action: PetAction, now: number): boolean {
    const clip = this.#clips.find(item => item.action === action || item.id === action)
    if (!clip) {
      this.stop()
      return false
    }
    return this.playClip(clip.id, now)
  }

  playSequence(id: string, now: number): boolean {
    if (!this.#sequences.some(sequence => sequence.id === id)) return false
    this.#mode = 'sequence'
    this.#id = id
    this.#started = now
    return true
  }

  stop(): void {
    this.#mode = null
    this.#id = ''
  }

  sample(now: number): SampledChannel[] {
    const elapsed = Math.max(0, now - this.#started)
    if (this.#mode === 'clip') {
      const clip = this.#clips.find(item => item.id === this.#id)
      return clip ? sampleClip(clip, elapsed) : []
    }
    if (this.#mode === 'sequence') {
      const sequence = this.#sequences.find(item => item.id === this.#id)
      return sequence ? sampleSequence(this.#clips, sequence, elapsed) : []
    }
    return []
  }
}

function placeSteps(clips: readonly ActionClip[], sequence: ClipSequence) {
  let cursor = 0
  const placed: Array<{ clip: ActionClip; start: number; end: number; blend: number; blendOut: number }> = []
  sequence.steps.forEach((step, index) => {
    const clip = clips.find(item => item.id === step.clipId)
    if (!clip) return
    const blend = Math.max(0, step.blend ?? 0)
    const start = Math.max(0, cursor - blend)
    const end = start + clip.duration
    const nextBlend = Math.max(0, sequence.steps[index + 1]?.blend ?? 0)
    placed.push({ clip, start, end, blend, blendOut: nextBlend })
    cursor = end
  })
  return placed
}

function stepTrack(track: AnimTrack): AnimTrack {
  return { ...track, keyframes: track.keyframes.map(frame => ({ ...frame, easing: 'step' as const })) }
}

function channel(track: AnimTrack, frame: Keyframe): SampledChannel {
  return {
    target: track.target,
    property: track.property,
    kind: track.kind,
    value: frame.value ?? 0,
    x: frame.x,
    y: frame.y,
    z: frame.z,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpOpt(a: number | undefined, b: number | undefined, t: number): number | undefined {
  if (a === undefined && b === undefined) return undefined
  return lerp(a ?? 0, b ?? 0, t)
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
