/**
 * 文件职责 / File responsibility
 * 宠物外观、动作、情绪与渲染器协议的共享类型。
 * Shared types for appearance, motion, emotion, and the renderer protocol.
 *
 * `PetRenderer` matches yokry-he/yk-pets `pet-runtime-adaptive` structurally,
 * so a factory from this SDK can be handed to `AdaptiveRendererController`.
 */

export const SCHEMA_VERSION = 1 as const

export const SPECIES = ['fox', 'cat', 'bunny', 'custom'] as const
export type Species = (typeof SPECIES)[number]

export const EAR_STYLES = ['pointy', 'round', 'long', 'floppy', 'none'] as const
export type EarStyle = (typeof EAR_STYLES)[number]

/** Body pose. `sit` is the v0.1 default; `stand` is upright on the hind legs; `anthro` is a bipedal chibi humanoid with arms and hands. */
export const POSES = ['sit', 'stand', 'anthro'] as const
export type PetPose = (typeof POSES)[number]

export const TAIL_STYLES = ['fluffy', 'thin', 'puff', 'bob', 'none'] as const
export type TailStyle = (typeof TAIL_STYLES)[number]

export const EYE_STYLES = ['round', 'almond', 'dot'] as const
export type EyeStyle = (typeof EYE_STYLES)[number]

export const MUZZLE_STYLES = ['short', 'long'] as const
export type MuzzleStyle = (typeof MUZZLE_STYLES)[number]

export const ACCESSORY_KINDS = ['bow', 'scarf', 'glasses', 'flower', 'hat'] as const
export type AccessoryKind = (typeof ACCESSORY_KINDS)[number]

export const PET_ACTIONS = [
  'idle',
  'walk',
  'sleep',
  'happy',
  'sad',
  'thinking',
  'talking',
  'eating',
  'dragged',
  'wave',
  'jump',
  'petting',
  'working',
  'success',
  'error',
] as const
export type PetAction = (typeof PET_ACTIONS)[number]

export const EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'excited',
  'angry',
  'shy',
  'surprised',
  'love',
  'tired',
  'focused',
] as const
export type Emotion = (typeof EMOTIONS)[number]

export const AGENT_STATES = ['idle', 'thinking', 'working', 'success', 'error'] as const
export type AgentState = (typeof AGENT_STATES)[number]

export type RendererKind = '2d' | '3d'
export type RendererPreference = 'auto' | RendererKind

export interface Accessory {
  kind: AccessoryKind
  color?: string
  /** Named socket. Defaults from the accessory kind (`neck`, `face`, `head`, …). */
  socket?: string
}

export interface PetColors {
  body: string
  belly: string
  ear: string
  innerEar: string
  eye: string
  accent: string
  nose: string
  blush: string
}

export type PetStyleId = 'kawaii' | 'anime' | 'plush' | 'glass'
export type RenderQuality = 'auto' | 'low' | 'medium' | 'high'
export type QualityTier = 'low' | 'medium' | 'high'

export interface PetProportions {
  /** Head joint scale. */
  headScale: number
  /** Torso joint scale. */
  bodyScale: number
  /** Torso length, applied on the spine/body Y axis. */
  bodyLength: number
  /** Master ear scale, multiplied with the per-ear values. */
  earScale: number
  earScaleL: number
  earScaleR: number
  tailScale: number
  eyeScale: number
  snoutScale: number
  cheekScale: number
}

/** Optional overrides on top of the active style preset. */
export interface FinishOverrides {
  /** 0 matte, 1 glossy. Mixed with the style's eye and body roughness. */
  gloss?: number
  /** Multiplier on the style outline width. */
  outlineWidth?: number
  outlineColor?: string
  furQuality?: RenderQuality
}

export interface PetParts {
  ears: EarStyle
  tail: TailStyle
  eyes: EyeStyle
  muzzle: MuzzleStyle
}

export interface SpriteAnimation {
  row: number
  frames: number
  fps?: number
}

export interface SpriteSheetConfig {
  imageUrl: string
  frameWidth: number
  frameHeight: number
  columns: number
  animations: Partial<Record<PetAction, SpriteAnimation>>
}

export interface ModelConfig {
  /** glTF / GLB url. `.vrm` is accepted but only the glTF scene is loaded in v0.1. */
  url?: string
  format?: 'auto' | 'glb' | 'gltf' | 'vrm'
  /** Maps a standard action to a clip name inside the file. */
  animations?: Partial<Record<PetAction, string>>
}

export interface PetStats {
  /** 0–100. Drives autonomous happy/sad and is exposed as `score` for yk-pets. */
  mood: number
  /** 0–100. Low energy suggests sleep. */
  energy: number
  /** 0–100. High hunger suggests eating. */
  hunger: number
}

export interface StatRates {
  /** Energy lost per second while awake. */
  energyDrain: number
  /** Energy gained per second while sleeping. */
  energyRecover: number
  /** Hunger gained per second. */
  hungerGain: number
  /** How quickly mood eases toward the stat-derived target. */
  moodDrift: number
  /** Hunger removed per second while eating. */
  eatRate: number
}

export interface BehaviorConfig {
  autonomous: boolean
  /** Seconds between casual idle/walk decisions. Urgent needs ignore this. */
  decisionInterval: number
  stats: PetStats
  rates: StatRates
}

export interface RendererConfig {
  preference: RendererPreference
  reducedMotion: boolean
  /** Fur shells, pixel ratio, and other expensive effects. */
  quality: RenderQuality
}

export interface InteractionConfig {
  /** Emit click / drag / pet. */
  pointer: boolean
  /** Follow the pointer with the eyes. */
  lookAtPointer: boolean
}

export interface PetConfig {
  schemaVersion: typeof SCHEMA_VERSION
  id?: string
  name: string
  species: Species
  appearance: {
    colors: PetColors
    proportions: PetProportions
    parts: PetParts
    accessories: Accessory[]
    finish?: FinishOverrides
    /** Body pose; omitted means `sit`. */
    pose?: PetPose
  }
  /** Visual style preset. Default is soft kawaii (`kawaii`, owner index 1). */
  style: PetStyleId
  behavior: BehaviorConfig
  renderer: RendererConfig
  interaction: InteractionConfig
  sprite?: SpriteSheetConfig
  model?: ModelConfig
  /**
   * Reserved. v0.1 keeps the field so configs round-trip, and does not play Lottie yet.
   * Pass a host-side adapter later; see README.
   */
  lottie?: { url?: string }
  secretMode?: boolean
  /**
   * Optional authored clips. Built-in actions stay procedural until a clip
   * targets them. The keyframe studio that edits these arrives in v0.2.
   */
  clips?: import('./animation').ActionClip[]
  sequences?: import('./animation').ClipSequence[]
  props?: import('./animation').PropAttachment[]
  sockets?: import('./animation').AttachmentSocket[]
}

export interface Expression {
  eyeOpen: number
  mouthOpen: number
  /** -1 frown, 0 flat, 1 smile. */
  smile: number
  /** -1 sad brow, 1 raised. */
  brow: number
  blush: number
  earDrop: number
  pupil: number
  squint: number
  heartEyes: boolean
}

export interface BodyPose {
  bob: number
  jump: number
  lean: number
  squashX: number
  squashY: number
  tailWag: number
  tailLift: number
  earTwitch: number
  pawPhase: number
  wave: number
  /** 0 standing, 1 curled up. */
  sleep: number
  zzz: number
  sparkle: number
  think: number
}

export interface SpeechVisual {
  text: string
  kind: 'say' | 'think'
  streaming: boolean
}

export interface DragVisual {
  active: boolean
  x: number
  y: number
}

/**
 * Passed to `PetRenderer.update`. The required and optional fields below are
 * the yk-pets visual state; everything else rides along in the same object.
 */
export interface PetVisualState {
  /** Fixed procedural sample time for a deterministic preview; transitions snap to target. */
  animationTime?: number
  behavior: string
  emotion?: string
  speaking?: boolean
  /** Mood, 0–100. yk-pets reads this as `score`. */
  score?: number
  pointer?: { x: number; y: number }
  secretMode?: boolean
  reducedMotion?: boolean
  speech?: SpeechVisual | null
  appearance?: PetConfig['appearance'] & { species: Species }
  stats?: PetStats
  agentState?: AgentState
  drag?: DragVisual
  sprite?: SpriteSheetConfig
  model?: ModelConfig
  style?: PetStyleId
  quality?: RenderQuality
  finish?: FinishOverrides
  /** Sampled clip tracks for this frame. Empty when the action is purely procedural. */
  channels?: import('./animation').SampledChannel[]
  sockets?: import('./animation').AttachmentSocket[]
  props?: import('./animation').PropAttachment[]
  [key: string]: unknown
}

export interface PetRendererSnapshot {
  state?: PetVisualState
  payload?: unknown
}

export interface PetRenderer {
  readonly kind: RendererKind
  mount(target: Element | ShadowRoot): void | Promise<void>
  update(state: PetVisualState): void
  resize?(width: number, height: number, devicePixelRatio: number): void
  start?(): void | Promise<void>
  stop?(): void | Promise<void>
  setVisible?(visible: boolean): void | Promise<void>
  snapshot?(): PetRendererSnapshot | undefined
  restore?(snapshot: PetRendererSnapshot): void
  dispose(): void
}

export interface PetRendererFactory {
  readonly kind: RendererKind
  create(): PetRenderer | Promise<PetRenderer>
}

export type FallbackReason =
  | 'initial-selection'
  | 'manual-2d'
  | 'manual-3d'
  | 'webgl-unsupported'
  | 'webgl-context-lost'
  | 'reduced-motion'
  | 'save-data'
  | 'low-battery'
  | 'low-memory'
  | 'low-fps'
  | 'long-tasks'
  | 'recovered'
  | 'renderer-error'

export interface CapabilityProbe {
  now?: number
  webglSupported: boolean
  webglContextLost?: boolean
  averageFps?: number
  longTaskRatio?: number
  deviceMemoryGb?: number
  saveData?: boolean
  reducedMotion?: boolean
  batteryLevel?: number
  charging?: boolean
  preference?: RendererPreference
}

export interface RuntimeEvaluation {
  target: RendererKind
  reason: FallbackReason
  hard: boolean
  healthyFor3D: boolean
  details: string[]
}

export interface SayOptions {
  /** `think` draws a thought bubble. Default `say`. */
  kind?: 'say' | 'think'
  /** Keep the bubble open until `end()` or `close()`. Friendly to streamed tokens. */
  streaming?: boolean
  /** Seconds the finished line stays up. Ignored while streaming. */
  duration?: number
}

export interface SpeechHandle {
  readonly id: string
  append(text: string): void
  replace(text: string): void
  /** Finish a stream and start the auto-close timer. */
  end(): void
  close(): void
}

export interface PetPointerEvent {
  x: number
  y: number
}

export interface PetDragEvent extends PetPointerEvent {
  dx: number
  dy: number
}

export interface PetEventMap {
  click: PetPointerEvent
  dragstart: PetPointerEvent
  drag: PetDragEvent
  dragend: PetPointerEvent
  pet: PetPointerEvent & { intensity: number }
  hover: PetPointerEvent
  action: { action: PetAction; previous: PetAction }
  emotion: { emotion: Emotion; previous: Emotion }
  state: { state: AgentState; previous: AgentState }
  speech: { text: string; kind: 'say' | 'think'; phase: 'start' | 'update' | 'end' }
  stats: PetStats
  change: { config: PetConfig }
}

export interface ValidationIssue {
  path: string
  code: 'type' | 'range' | 'enum' | 'unknown-version' | 'required' | 'invalid'
  message: string
}
