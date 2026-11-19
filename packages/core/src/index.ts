/**
 * @yk-pet/core
 * Framework-agnostic pet model and the agent API shared by every renderer.
 */

export const VERSION = '0.1.0'

export {
  ACCESSORY_KINDS,
  AGENT_STATES,
  EAR_STYLES,
  EMOTIONS,
  EYE_STYLES,
  MUZZLE_STYLES,
  PET_ACTIONS,
  SCHEMA_VERSION,
  SPECIES,
  TAIL_STYLES,
} from './types'

export type {
  Accessory,
  AccessoryKind,
  AgentState,
  BodyPose,
  CapabilityProbe,
  DragVisual,
  EarStyle,
  Emotion,
  Expression,
  EyeStyle,
  FallbackReason,
  FinishOverrides,
  QualityTier,
  RenderQuality,
  PetStyleId,
  InteractionConfig,
  ModelConfig,
  MuzzleStyle,
  PetAction,
  PetColors,
  PetConfig,
  PetEventMap,
  PetParts,
  PetPointerEvent,
  PetProportions,
  PetRenderer,
  PetRendererFactory,
  PetRendererSnapshot,
  PetStats,
  PetVisualState,
  RendererConfig,
  RendererKind,
  RendererPreference,
  RuntimeEvaluation,
  SayOptions,
  Species,
  SpeechHandle,
  SpeechVisual,
  SpriteAnimation,
  SpriteSheetConfig,
  StatRates,
  TailStyle,
  ValidationIssue,
} from './types'

export {
  APRICOT_COLORS,
  DEFAULT_PROPORTIONS,
  DEFAULT_RATES,
  DEFAULT_STATS,
  PRESET_COLORS,
  SPECIES_PART_DEFAULTS,
  assertPetConfig,
  defaultConfig,
  isAgentState,
  isEmotion,
  isPetAction,
  mergeConfig,
  parsePetConfig,
  presetConfig,
  serializePetConfig,
} from './schema'
export type { ParseResult } from './schema'

export { blinkAmount, chooseAutonomousAction, clamp, resolveBodyPose, resolveExpression, stepStats } from './motion'
export type { ExpressionInput } from './motion'

export { ACTION_CATALOG, AGENT_ACTION, PetStateMachine } from './state-machine'
export type { ActionLock, LockReason, PlayOptions } from './state-machine'

export {
  STYLE_PRESETS,
  coerceStyleId,
  getStyle,
  gradeColors,
  gradeHex,
  isMaterialMode,
  listStyles,
  mixHex,
  resolveQualityTier,
  shadeHex,
  styledProportions,
} from './styles'
export type {
  ColorGrade,
  MaterialMode,
  StyleLights,
  StyleMaterial,
  StyleOutline,
  StylePalette,
  StylePreset,
  StyleShape,
} from './styles'

export { DEFAULT_ADAPTIVE_POLICY, evaluateRenderer } from './adaptive'
export type { AdaptivePolicy } from './adaptive'

export {
  ClipPlayer,
  DEFAULT_SOCKETS,
  EASINGS,
  SOCKET_IDS,
  TRACK_KINDS,
  applyEasing,
  channelValue,
  sampleClip,
  sampleSequence,
  sampleTrack,
  socketForAccessory,
} from './animation'
export type {
  ActionClip,
  AnimTrack,
  AttachmentSocket,
  ClipSequence,
  ClipStep,
  EasingName,
  Keyframe,
  PropAttachment,
  SampledChannel,
  SocketId,
  TrackKind,
  Vec3,
} from './animation'

export { Emitter } from './events'
export { Pet } from './pet'
export type { PetOptions } from './pet'
