/**
 * 文件职责 / File responsibility
 * v1 配置的默认值、预设、校验与稳定序列化。
 * Defaults, presets, validation, and stable serialization for config schema v1.
 */

import { EASINGS, SOCKET_IDS, TRACK_KINDS, type ActionClip, type AnimTrack, type ClipSequence, type PropAttachment } from './animation'
import { coerceStyleId } from './styles'
import {
  ACCESSORY_KINDS,
  AGENT_STATES,
  EAR_STYLES,
  EMOTIONS,
  EYE_STYLES,
  MUZZLE_STYLES,
  PET_ACTIONS,
  SCHEMA_VERSION,
  SPECIES,
  POSES,
  TAIL_STYLES,
  type Accessory,
  type AccessoryKind,
  type BehaviorConfig,
  type ModelConfig,
  type PetAction,
  type PetColors,
  type PetConfig,
  type PetParts,
  type PetPose,
  type PetProportions,
  type PetStats,
  type FinishOverrides,
  type RenderQuality,
  type RendererPreference,
  type Species,
  type SpriteSheetConfig,
  type StatRates,
  type ValidationIssue,
} from './types'

export interface ParseResult {
  config: PetConfig
  issues: ValidationIssue[]
}

const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]{1,80}\)|hsla?\([^)]{1,80}\))$/

export const APRICOT_COLORS: PetColors = {
  body: '#f39a52',
  belly: '#fff7f0',
  ear: '#ef8a42',
  innerEar: '#ffc7b8',
  eye: '#2c2428',
  accent: '#fffaf6',
  nose: '#ff8d9a',
  blush: '#ffb0b8',
}

export const PRESET_COLORS: Record<string, { species: Species; colors: PetColors; parts?: Partial<PetParts> }> = {
  apricot: { species: 'fox', colors: APRICOT_COLORS },
  /** Cream fox with lavender ears, tail tip and paw pads (matches the anthro plush reference). */
  lavender: {
    species: 'fox',
    colors: {
      body: '#f7efdf',
      belly: '#fcf7ec',
      ear: '#f4ead8',
      innerEar: '#c8b2e4',
      eye: '#4b2f60',
      accent: '#c6aee6',
      nose: '#9b7cbb',
      blush: '#f8b9b0',
    },
  },
  cloud: {
    species: 'fox',
    colors: {
      body: '#9aa6e8',
      belly: '#eef1ff',
      ear: '#7d86d8',
      innerEar: '#d5dbff',
      eye: '#2a2750',
      accent: '#ffffff',
      nose: '#8d86ff',
      blush: '#c9b6ff',
    },
  },
  night: {
    species: 'cat',
    colors: {
      body: '#3c4258',
      belly: '#e4e7f2',
      ear: '#2e3348',
      innerEar: '#ffb7c8',
      eye: '#f2c14e',
      accent: '#d7dced',
      nose: '#f2a3b5',
      blush: '#e8a0b4',
    },
    parts: { ears: 'pointy', tail: 'thin', eyes: 'almond', muzzle: 'short' },
  },
  snow: {
    species: 'bunny',
    colors: {
      body: '#f7f7fb',
      belly: '#ffffff',
      ear: '#f4f4f8',
      innerEar: '#ffd0dc',
      eye: '#5b4636',
      accent: '#ffe1ea',
      nose: '#ff9eb0',
      blush: '#ffc0d0',
    },
    parts: { ears: 'long', tail: 'puff', eyes: 'round', muzzle: 'short' },
  },
  matcha: {
    species: 'fox',
    colors: {
      body: '#b7d3a8',
      belly: '#f4f8ef',
      ear: '#9ec492',
      innerEar: '#f6c9d4',
      eye: '#3d4a38',
      accent: '#fffaf2',
      nose: '#e9897a',
      blush: '#f3b7c4',
    },
  },
}

export const DEFAULT_PROPORTIONS: PetProportions = {
  headScale: 1,
  bodyScale: 1,
  bodyLength: 1,
  earScale: 1,
  earScaleL: 1,
  earScaleR: 1,
  tailScale: 1,
  eyeScale: 1,
  snoutScale: 1,
  cheekScale: 1,
}

export const DEFAULT_PARTS: PetParts = {
  ears: 'pointy',
  tail: 'fluffy',
  eyes: 'round',
  muzzle: 'short',
}

export const DEFAULT_STATS: PetStats = { mood: 72, energy: 80, hunger: 18 }

export const DEFAULT_RATES: StatRates = {
  energyDrain: 0.35,
  energyRecover: 2.4,
  hungerGain: 0.45,
  moodDrift: 0.12,
  eatRate: 8,
}

export function defaultConfig(): PetConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: '小云',
    species: 'fox',
    appearance: {
      colors: { ...APRICOT_COLORS },
      proportions: { ...DEFAULT_PROPORTIONS },
      parts: { ...DEFAULT_PARTS },
      accessories: [{ kind: 'bow', color: '#8ed9cc' }],
    },
    style: 'kawaii',
    behavior: {
      autonomous: true,
      decisionInterval: 4,
      stats: { ...DEFAULT_STATS },
      rates: { ...DEFAULT_RATES },
    },
    renderer: { preference: 'auto', reducedMotion: false, quality: 'auto' },
    interaction: { pointer: true, lookAtPointer: true },
    secretMode: false,
  }
}

export function presetConfig(name: keyof typeof PRESET_COLORS | string): PetConfig {
  const preset = PRESET_COLORS[name] ?? PRESET_COLORS.apricot!
  const config = defaultConfig()
  config.species = preset.species
  config.appearance.colors = { ...preset.colors }
  if (preset.parts) config.appearance.parts = { ...config.appearance.parts, ...preset.parts }
  if (name === 'lavender') config.appearance.accessories = []
  if (preset.species === 'cat') config.appearance.accessories = [{ kind: 'scarf', color: '#f2c14e' }]
  if (preset.species === 'bunny') config.appearance.accessories = [{ kind: 'flower', color: '#ff8fab' }]
  return config
}

function issue(issues: ValidationIssue[], path: string, code: ValidationIssue['code'], message: string) {
  issues.push({ path, code, message })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function readNumber(
  issues: ValidationIssue[],
  source: Record<string, unknown> | undefined,
  key: string,
  path: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!source || source[key] === undefined) return fallback
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issue(issues, path, 'type', `${path} must be a finite number`)
    return fallback
  }
  if (value < min || value > max) {
    issue(issues, path, 'range', `${path} clamped to ${min}–${max}`)
    return clamp(value, min, max)
  }
  return value
}

function readColor(
  issues: ValidationIssue[],
  source: Record<string, unknown> | undefined,
  key: keyof PetColors,
  fallback: string,
): string {
  if (!source || source[key] === undefined) return fallback
  const value = source[key]
  if (typeof value !== 'string' || !COLOR.test(value.trim())) {
    issue(issues, `appearance.colors.${key}`, 'invalid', `Invalid color for ${key}`)
    return fallback
  }
  return value.trim()
}

function readEnum<T extends string>(
  issues: ValidationIssue[],
  value: unknown,
  allowed: readonly T[],
  path: string,
  fallback: T,
): T {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issue(issues, path, 'enum', `${path} must be one of ${allowed.join(', ')}`)
    return fallback
  }
  return value as T
}

function readColors(issues: ValidationIssue[], input: unknown, fallback: PetColors): PetColors {
  const source = isRecord(input) ? input : undefined
  if (input !== undefined && !source) issue(issues, 'appearance.colors', 'type', 'colors must be an object')
  return {
    body: readColor(issues, source, 'body', fallback.body),
    belly: readColor(issues, source, 'belly', fallback.belly),
    ear: readColor(issues, source, 'ear', fallback.ear),
    innerEar: readColor(issues, source, 'innerEar', fallback.innerEar),
    eye: readColor(issues, source, 'eye', fallback.eye),
    accent: readColor(issues, source, 'accent', fallback.accent),
    nose: readColor(issues, source, 'nose', fallback.nose),
    blush: readColor(issues, source, 'blush', fallback.blush),
  }
}

function readProportions(issues: ValidationIssue[], input: unknown, fallback: PetProportions): PetProportions {
  const source = isRecord(input) ? input : undefined
  if (input !== undefined && !source) issue(issues, 'appearance.proportions', 'type', 'proportions must be an object')
  const keys: (keyof PetProportions)[] = [
    'headScale', 'bodyScale', 'bodyLength', 'earScale', 'earScaleL', 'earScaleR',
    'tailScale', 'eyeScale', 'snoutScale', 'cheekScale',
  ]
  const next = { ...fallback }
  for (const key of keys) {
    const max = key === 'bodyLength' ? 1.8 : 1.8
    next[key] = readNumber(issues, source, key, `appearance.proportions.${key}`, fallback[key], 0.35, max)
  }
  return next
}

function readParts(issues: ValidationIssue[], input: unknown, fallback: PetParts): PetParts {
  const source = isRecord(input) ? input : undefined
  if (input !== undefined && !source) issue(issues, 'appearance.parts', 'type', 'parts must be an object')
  return {
    ears: readEnum(issues, source?.ears, EAR_STYLES, 'appearance.parts.ears', fallback.ears),
    tail: readEnum(issues, source?.tail, TAIL_STYLES, 'appearance.parts.tail', fallback.tail),
    eyes: readEnum(issues, source?.eyes, EYE_STYLES, 'appearance.parts.eyes', fallback.eyes),
    muzzle: readEnum(issues, source?.muzzle, MUZZLE_STYLES, 'appearance.parts.muzzle', fallback.muzzle),
  }
}

function readAccessories(issues: ValidationIssue[], input: unknown, fallback: Accessory[]): Accessory[] {
  if (input === undefined) return fallback.map(item => ({ ...item }))
  if (!Array.isArray(input)) {
    issue(issues, 'appearance.accessories', 'type', 'accessories must be an array')
    return fallback.map(item => ({ ...item }))
  }
  const next: Accessory[] = []
  input.slice(0, 8).forEach((item, index) => {
    if (!isRecord(item)) {
      issue(issues, `appearance.accessories.${index}`, 'type', 'accessory must be an object')
      return
    }
    const kind = readEnum(issues, item.kind, ACCESSORY_KINDS, `appearance.accessories.${index}.kind`, 'bow')
    const color = typeof item.color === 'string' && COLOR.test(item.color.trim()) ? item.color.trim() : undefined
    if (item.color !== undefined && !color) {
      issue(issues, `appearance.accessories.${index}.color`, 'invalid', 'Invalid accessory color')
    }
    const socket = typeof item.socket === 'string' && item.socket.trim() ? item.socket.trim().slice(0, 32) : undefined
    const accessory: Accessory = { kind: kind as AccessoryKind }
    if (color) accessory.color = color
    if (socket) accessory.socket = socket
    next.push(accessory)
  })
  return next
}

function readStats(issues: ValidationIssue[], input: unknown, fallback: PetStats): PetStats {
  const source = isRecord(input) ? input : undefined
  if (input !== undefined && !source) issue(issues, 'behavior.stats', 'type', 'stats must be an object')
  return {
    mood: readNumber(issues, source, 'mood', 'behavior.stats.mood', fallback.mood, 0, 100),
    energy: readNumber(issues, source, 'energy', 'behavior.stats.energy', fallback.energy, 0, 100),
    hunger: readNumber(issues, source, 'hunger', 'behavior.stats.hunger', fallback.hunger, 0, 100),
  }
}

function readRates(issues: ValidationIssue[], input: unknown, fallback: StatRates): StatRates {
  const source = isRecord(input) ? input : undefined
  if (input !== undefined && !source) issue(issues, 'behavior.rates', 'type', 'rates must be an object')
  return {
    energyDrain: readNumber(issues, source, 'energyDrain', 'behavior.rates.energyDrain', fallback.energyDrain, 0, 40),
    energyRecover: readNumber(issues, source, 'energyRecover', 'behavior.rates.energyRecover', fallback.energyRecover, 0, 40),
    hungerGain: readNumber(issues, source, 'hungerGain', 'behavior.rates.hungerGain', fallback.hungerGain, 0, 40),
    moodDrift: readNumber(issues, source, 'moodDrift', 'behavior.rates.moodDrift', fallback.moodDrift, 0, 10),
    eatRate: readNumber(issues, source, 'eatRate', 'behavior.rates.eatRate', fallback.eatRate, 0, 80),
  }
}

function readBehavior(issues: ValidationIssue[], input: unknown, fallback: BehaviorConfig): BehaviorConfig {
  const source = isRecord(input) ? input : undefined
  if (input !== undefined && !source) issue(issues, 'behavior', 'type', 'behavior must be an object')
  return {
    autonomous: typeof source?.autonomous === 'boolean' ? source.autonomous : fallback.autonomous,
    decisionInterval: readNumber(
      issues,
      source,
      'decisionInterval',
      'behavior.decisionInterval',
      fallback.decisionInterval,
      0.4,
      60,
    ),
    stats: readStats(issues, source?.stats, fallback.stats),
    rates: readRates(issues, source?.rates, fallback.rates),
  }
}

function readUrl(issues: ValidationIssue[], value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > 2000) {
    issue(issues, path, 'invalid', `${path} must be a string up to 2000 characters`)
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!/^(https?:|blob:|data:|\/|\.\/|\.\.\/)/.test(trimmed)) {
    issue(issues, path, 'invalid', `${path} must be an http(s), data, blob, or relative URL`)
    return undefined
  }
  return trimmed
}

function readSprite(issues: ValidationIssue[], input: unknown): SpriteSheetConfig | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) {
    issue(issues, 'sprite', 'type', 'sprite must be an object')
    return undefined
  }
  const imageUrl = readUrl(issues, input.imageUrl, 'sprite.imageUrl')
  if (!imageUrl) return undefined
  const frameWidth = readNumber(issues, input, 'frameWidth', 'sprite.frameWidth', 0, 1, 4096)
  const frameHeight = readNumber(issues, input, 'frameHeight', 'sprite.frameHeight', 0, 1, 4096)
  const columns = Math.round(readNumber(issues, input, 'columns', 'sprite.columns', 1, 1, 64))
  if (!frameWidth || !frameHeight) return undefined
  const animations: SpriteSheetConfig['animations'] = {}
  if (input.animations !== undefined && !isRecord(input.animations)) {
    issue(issues, 'sprite.animations', 'type', 'sprite.animations must be an object')
  } else if (isRecord(input.animations)) {
    for (const action of PET_ACTIONS) {
      const raw = input.animations[action]
      if (raw === undefined) continue
      if (!isRecord(raw)) {
        issue(issues, `sprite.animations.${action}`, 'type', 'animation must be an object')
        continue
      }
      animations[action] = {
        row: Math.round(readNumber(issues, raw, 'row', `sprite.animations.${action}.row`, 0, 0, 64)),
        frames: Math.round(readNumber(issues, raw, 'frames', `sprite.animations.${action}.frames`, 1, 1, 64)),
        fps: readNumber(issues, raw, 'fps', `sprite.animations.${action}.fps`, 8, 1, 60),
      }
    }
  }
  return { imageUrl, frameWidth, frameHeight, columns, animations }
}

function readModel(issues: ValidationIssue[], input: unknown): ModelConfig | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) {
    issue(issues, 'model', 'type', 'model must be an object')
    return undefined
  }
  const url = readUrl(issues, input.url, 'model.url')
  const format = readEnum(issues, input.format, ['auto', 'glb', 'gltf', 'vrm'] as const, 'model.format', 'auto')
  const animations: ModelConfig['animations'] = {}
  if (isRecord(input.animations)) {
    for (const action of PET_ACTIONS) {
      const clip = input.animations[action]
      if (clip === undefined) continue
      if (typeof clip !== 'string' || !clip.trim() || clip.length > 120) {
        issue(issues, `model.animations.${action}`, 'invalid', 'clip name must be a short string')
        continue
      }
      animations[action] = clip.trim()
    }
  }
  if (!url && Object.keys(animations).length === 0 && format === 'auto') return undefined
  return { url, format, animations }
}

function readStyle(issues: ValidationIssue[], value: unknown, fallback: PetConfig['style']): PetConfig['style'] {
  if (value === undefined) return fallback
  const coerced = coerceStyleId(value)
  if (!coerced) {
    issue(issues, 'style', 'enum', 'style must be kawaii, anime, plush, glass (or 1, 4, 5, 6)')
    return fallback
  }
  return coerced
}

function readQuality(issues: ValidationIssue[], value: unknown, fallback: RenderQuality): RenderQuality {
  return readEnum(issues, value, ['auto', 'low', 'medium', 'high'] as const, 'renderer.quality', fallback)
}

function readFinish(issues: ValidationIssue[], input: unknown): FinishOverrides | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) {
    issue(issues, 'appearance.finish', 'type', 'finish must be an object')
    return undefined
  }
  const finish: FinishOverrides = {}
  if (input.gloss !== undefined) finish.gloss = readNumber(issues, input, 'gloss', 'appearance.finish.gloss', 0.5, 0, 1)
  if (input.outlineWidth !== undefined) {
    finish.outlineWidth = readNumber(issues, input, 'outlineWidth', 'appearance.finish.outlineWidth', 1, 0, 4)
  }
  if (input.outlineColor !== undefined) {
    const color = typeof input.outlineColor === 'string' && COLOR.test(input.outlineColor.trim())
      ? input.outlineColor.trim()
      : undefined
    if (!color) issue(issues, 'appearance.finish.outlineColor', 'invalid', 'Invalid outline color')
    else finish.outlineColor = color
  }
  if (input.furQuality !== undefined) {
    finish.furQuality = readEnum(
      issues,
      input.furQuality,
      ['auto', 'low', 'medium', 'high'] as const,
      'appearance.finish.furQuality',
      'auto',
    )
  }
  return finish
}

export function mergeConfig(base: PetConfig, patch: unknown): unknown {
  if (!isRecord(patch)) return base
  const appearance = isRecord(patch.appearance) ? patch.appearance : {}
  const baseAppearance = base.appearance
  return {
    ...base,
    ...patch,
    appearance: {
      ...baseAppearance,
      ...appearance,
      colors: { ...baseAppearance.colors, ...(isRecord(appearance.colors) ? appearance.colors : {}) },
      proportions: { ...baseAppearance.proportions, ...(isRecord(appearance.proportions) ? appearance.proportions : {}) },
      parts: { ...baseAppearance.parts, ...(isRecord(appearance.parts) ? appearance.parts : {}) },
      accessories: appearance.accessories ?? baseAppearance.accessories,
    },
    behavior: isRecord(patch.behavior)
      ? {
          ...base.behavior,
          ...patch.behavior,
          stats: { ...base.behavior.stats, ...(isRecord(patch.behavior.stats) ? patch.behavior.stats : {}) },
          rates: { ...base.behavior.rates, ...(isRecord(patch.behavior.rates) ? patch.behavior.rates : {}) },
        }
      : base.behavior,
    renderer: { ...base.renderer, ...(isRecord(patch.renderer) ? patch.renderer : {}) },
    interaction: { ...base.interaction, ...(isRecord(patch.interaction) ? patch.interaction : {}) },
  }
}

export function parsePetConfig(input: unknown = {}): ParseResult {
  const issues: ValidationIssue[] = []
  const fallback = defaultConfig()
  const source = isRecord(input) ? input : {}
  if (input !== undefined && input !== null && !isRecord(input)) {
    issue(issues, '', 'type', 'Config must be an object')
  }

  if (source.schemaVersion !== undefined && source.schemaVersion !== SCHEMA_VERSION) {
    issue(
      issues,
      'schemaVersion',
      'unknown-version',
      `Unsupported schemaVersion ${String(source.schemaVersion)}; reading as v${SCHEMA_VERSION}`,
    )
  }

  const appearanceIn = isRecord(source.appearance) ? source.appearance : undefined
  const species = readEnum(issues, source.species, SPECIES, 'species', fallback.species)
  const name = typeof source.name === 'string' && source.name.trim()
    ? source.name.trim().slice(0, 32)
    : fallback.name
  if (typeof source.name === 'string' && source.name.trim().length > 32) {
    issue(issues, 'name', 'range', 'name truncated to 32 characters')
  }

  const preference = readEnum(
    issues,
    isRecord(source.renderer) ? source.renderer.preference : undefined,
    ['auto', '2d', '3d'] as const,
    'renderer.preference',
    fallback.renderer.preference,
  ) as RendererPreference

  const rendererSource = isRecord(source.renderer) ? source.renderer : undefined
  const interactionSource = isRecord(source.interaction) ? source.interaction : undefined

  const config: PetConfig = {
    schemaVersion: SCHEMA_VERSION,
    name,
    species: species as Species,
    appearance: {
      colors: readColors(issues, appearanceIn?.colors, fallback.appearance.colors),
      proportions: readProportions(issues, appearanceIn?.proportions, fallback.appearance.proportions),
      parts: readParts(issues, appearanceIn?.parts, fallback.appearance.parts),
      accessories: readAccessories(issues, appearanceIn?.accessories, fallback.appearance.accessories),
      finish: readFinish(issues, appearanceIn?.finish),
      ...(appearanceIn?.pose !== undefined || fallback.appearance.pose
        ? { pose: readEnum(issues, appearanceIn?.pose, POSES, 'appearance.pose', fallback.appearance.pose ?? 'sit') as PetPose }
        : {}),
    },
    behavior: readBehavior(issues, source.behavior, fallback.behavior),
    style: readStyle(issues, source.style, fallback.style),
    renderer: {
      preference,
      reducedMotion: typeof rendererSource?.reducedMotion === 'boolean'
        ? rendererSource.reducedMotion
        : fallback.renderer.reducedMotion,
      quality: readQuality(issues, rendererSource?.quality, fallback.renderer.quality),
    },
    interaction: {
      pointer: typeof interactionSource?.pointer === 'boolean' ? interactionSource.pointer : fallback.interaction.pointer,
      lookAtPointer: typeof interactionSource?.lookAtPointer === 'boolean'
        ? interactionSource.lookAtPointer
        : fallback.interaction.lookAtPointer,
    },
    secretMode: typeof source.secretMode === 'boolean' ? source.secretMode : false,
  }

  if (typeof source.id === 'string' && source.id.trim()) config.id = source.id.trim().slice(0, 64)
  const sprite = readSprite(issues, source.sprite)
  if (sprite) config.sprite = sprite
  const model = readModel(issues, source.model)
  if (model) config.model = model
  if (isRecord(source.lottie)) {
    const url = readUrl(issues, source.lottie.url, 'lottie.url')
    if (url) config.lottie = { url }
  }
  const clips = readClips(issues, source.clips)
  if (clips) config.clips = clips
  const sequences = readSequences(issues, source.sequences)
  if (sequences) config.sequences = sequences
  const props = readProps(issues, source.props)
  if (props) config.props = props

  return { config, issues }
}

function readClips(issues: ValidationIssue[], input: unknown): ActionClip[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input)) {
    issue(issues, 'clips', 'type', 'clips must be an array')
    return undefined
  }
  const clips: ActionClip[] = []
  input.slice(0, 32).forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) {
      issue(issues, `clips.${index}`, 'required', 'clip id is required')
      return
    }
    const tracks = readTracks(issues, item.tracks, `clips.${index}`)
    const duration = readNumber(issues, item, 'duration', `clips.${index}.duration`, 1, 0.05, 120)
    const clip: ActionClip = {
      id: item.id.trim().slice(0, 64),
      duration,
      tracks,
      loop: item.loop === true,
    }
    if (typeof item.action === 'string' && isPetAction(item.action)) clip.action = item.action
    if (item.mode === 'frame' || item.mode === 'smooth') clip.mode = item.mode
    if (item.fps !== undefined) clip.fps = readNumber(issues, item, 'fps', `clips.${index}.fps`, 12, 1, 60)
    clips.push(clip)
  })
  return clips
}

function readTracks(issues: ValidationIssue[], input: unknown, path: string): AnimTrack[] {
  if (!Array.isArray(input)) return []
  const tracks: AnimTrack[] = []
  input.slice(0, 24).forEach((item, index) => {
    if (!isRecord(item)) return
    const kind = readEnum(issues, item.kind, TRACK_KINDS, `${path}.tracks.${index}.kind`, 'bone')
    const keyframes = Array.isArray(item.keyframes) ? item.keyframes.slice(0, 64).flatMap(frame => {
      if (!isRecord(frame) || typeof frame.time !== 'number') return []
      const easing = readEnum(issues, frame.easing, EASINGS, `${path}.easing`, 'linear')
      return [{
        time: frame.time,
        value: typeof frame.value === 'number' ? frame.value : undefined,
        x: typeof frame.x === 'number' ? frame.x : undefined,
        y: typeof frame.y === 'number' ? frame.y : undefined,
        z: typeof frame.z === 'number' ? frame.z : undefined,
        easing,
      }]
    }) : []
    tracks.push({
      id: typeof item.id === 'string' ? item.id.slice(0, 64) : `track-${index}`,
      kind,
      target: typeof item.target === 'string' ? item.target.slice(0, 64) : 'bone-head',
      property: typeof item.property === 'string' ? item.property.slice(0, 64) : 'rotation.z',
      keyframes,
    })
  })
  return tracks
}

function readSequences(issues: ValidationIssue[], input: unknown): ClipSequence[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input)) {
    issue(issues, 'sequences', 'type', 'sequences must be an array')
    return undefined
  }
  return input.slice(0, 16).flatMap((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !Array.isArray(item.steps)) {
      issue(issues, `sequences.${index}`, 'required', 'sequence needs an id and steps')
      return []
    }
    const steps = item.steps.slice(0, 16).flatMap(step => {
      if (!isRecord(step) || typeof step.clipId !== 'string') return []
      return [{ clipId: step.clipId.slice(0, 64), blend: typeof step.blend === 'number' ? Math.max(0, step.blend) : 0 }]
    })
    return [{ id: item.id.slice(0, 64), steps }]
  })
}

function readProps(issues: ValidationIssue[], input: unknown): PropAttachment[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input)) {
    issue(issues, 'props', 'type', 'props must be an array')
    return undefined
  }
  return input.slice(0, 12).flatMap((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.socket !== 'string') {
      issue(issues, `props.${index}`, 'required', 'prop needs an id and a socket')
      return []
    }
    if (!(SOCKET_IDS as readonly string[]).includes(item.socket) && item.socket.length > 32) {
      issue(issues, `props.${index}.socket`, 'invalid', 'unknown socket')
      return []
    }
    const color = typeof item.color === 'string' && COLOR.test(item.color.trim()) ? item.color.trim() : undefined
    return [{ id: item.id.slice(0, 64), socket: item.socket.slice(0, 32), color }]
  })
}

export function assertPetConfig(input: unknown): PetConfig {
  const parsed = parsePetConfig(input)
  const blocking = parsed.issues.filter(item => item.code === 'unknown-version' || item.code === 'type')
  if (blocking.length) {
    throw new Error(blocking.map(item => item.message).join('; '))
  }
  return parsed.config
}

export function serializePetConfig(config: PetConfig): string {
  return JSON.stringify(parsePetConfig(config).config, null, 2)
}

export function isPetAction(value: string): value is PetAction {
  return (PET_ACTIONS as readonly string[]).includes(value)
}

export function isEmotion(value: string): value is import('./types').Emotion {
  return (EMOTIONS as readonly string[]).includes(value)
}

export function isAgentState(value: string): value is import('./types').AgentState {
  return (AGENT_STATES as readonly string[]).includes(value)
}

export const SPECIES_PART_DEFAULTS: Record<Species, PetParts> = {
  fox: { ears: 'pointy', tail: 'fluffy', eyes: 'round', muzzle: 'long' },
  cat: { ears: 'pointy', tail: 'thin', eyes: 'almond', muzzle: 'short' },
  bunny: { ears: 'long', tail: 'puff', eyes: 'round', muzzle: 'short' },
  custom: { ears: 'pointy', tail: 'fluffy', eyes: 'round', muzzle: 'short' },
}
