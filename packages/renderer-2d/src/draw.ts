/** Layered Canvas artwork. Geometry and materials stay local to the 2D rig. */
import {
  channelValue, getStyle, gradeColors, mixHex, resolveBodyPose, resolveExpression,
  resolveQualityTier, shadeHex, socketForAccessory, styledProportions,
  type Accessory, type AttachmentSocket, type BodyPose, type Emotion, type Expression,
  type PetAction, type PetColors, type PetParts, type PetProportions, type PetVisualState,
  type Species, type StylePreset,
} from '@yk-pet/core'
import { eyeLids, idleMotion, naturalBlink } from './motion'
import { poseRig } from './pose'
import { compositeGlass, type DrawContext } from './glass'

interface Env {
  ctx: DrawContext
  style: StylePreset
  colors: PetColors
  proportions: PetProportions
  parts: PetParts
  species: Species
  pose: BodyPose
  expression: Expression
  emotion: Emotion
  pointer: { x: number; y: number }
  accessories: Accessory[]
  props: PetVisualState['props']
  sockets: PetVisualState['sockets']
  time: number
  outline: string
  outlineWidth: number
  action: string
  headTilt: number
  detail: boolean
  blink: number
  rig: ReturnType<typeof poseRig>
  glassPass?: 'mask' | 'markings'
}
const TAU = Math.PI * 2
type Bounds = [number, number, number, number]
const FALLBACK_COLORS: PetColors = {
  body: '#f39a52', belly: '#fff7f0', ear: '#ef8a42', innerEar: '#ffc7b8',
  eye: '#2c2428', accent: '#fffaf6', nose: '#ff8d9a', blush: '#ffb0b8',
}
const FALLBACK_PARTS: PetParts = { ears: 'pointy', tail: 'fluffy', eyes: 'round', muzzle: 'short' }
const FALLBACK_PROPORTIONS: PetProportions = {
  headScale: 1, bodyScale: 1, bodyLength: 1, earScale: 1, earScaleL: 1, earScaleR: 1,
  tailScale: 1, eyeScale: 1, snoutScale: 1, cheekScale: 1,
}

export function drawPet(
  ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number,
  state: PetVisualState, time: number, yaw = 0,
  standing = state.appearance?.pose === 'stand' ? 1 : 0,
): void {
  const style = getStyle(state.style)
  const colors = gradeColors(state.appearance?.colors ?? FALLBACK_COLORS, style.grade)
  colors.belly = mixHex(colors.belly, '#fff0d5', 0.45)
  colors.accent = mixHex(colors.accent, '#fff1dc', 0.35)
  if (style.id === 'anime') colors.body = mixHex(colors.body, colors.ear, 0.45)
  const proportions = styledProportions(state.appearance?.proportions ?? FALLBACK_PROPORTIONS, style)
  const action = state.behavior || 'idle'
  const reduced = Boolean(state.reducedMotion)
  const drag = Boolean(state.drag?.active)
  const knownAction = isAction(action) ? action : 'idle'
  const emotion = isEmotion(state.emotion) ? state.emotion : 'neutral'
  const idle = idleMotion(time, reduced)
  const pose = resolveBodyPose(knownAction, time, reduced, drag)
  if (knownAction === 'idle' && !drag) {
    Object.assign(pose, { bob: idle.bob, squashX: idle.squashX, squashY: idle.squashY,
      lean: 0, tailWag: idle.tail, tailLift: 0, earTwitch: idle.ear })
  }
  // Resolve shared facial weights without its periodic blink; this rig has an irregular one.
  const expression = resolveExpression({ action: knownAction, emotion, speaking: Boolean(state.speaking),
    time, reducedMotion: true, dragActive: drag })
  if (!reduced && knownAction !== 'sleep') {
    if (state.speaking || knownAction === 'eating') {
      expression.mouthOpen = Math.max(expression.mouthOpen, 0.2 + Math.abs(Math.sin(time * 10)) * 0.65)
    }
  }
  const tier = resolveQualityTier(state.quality, typeof navigator === 'undefined' ? {} : {
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  })
  const env: Env = {
    ctx, style, colors, proportions, parts: state.appearance?.parts ?? FALLBACK_PARTS,
    species: state.appearance?.species ?? 'fox', pose: applyChannels(pose, state.channels), expression, emotion,
    pointer: state.pointer ?? { x: 0, y: 0 }, accessories: state.appearance?.accessories ?? [],
    props: state.props, sockets: state.sockets, time: reduced ? 0 : time,
    outline: state.finish?.outlineColor ?? (style.id === 'kawaii'
      ? mixHex(shadeHex(colors.body, -0.48), '#886047', 0.55) : style.outline.color),
    // Shared presets also serve 3D. Canvas lines use this 310-unit drawing space.
    outlineWidth: ({ kawaii: 1.25, anime: 1.55, plush: 0, glass: 1.05 }[style.id]) * (state.finish?.outlineWidth ?? 1),
    action, headTilt: idle.head, detail: tier !== 'low',
    blink: drag || knownAction === 'sleep' ? 1 : naturalBlink(time, reduced),
    rig: poseRig(standing),
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  const unit = Math.min(width, height) / 310
  // Anime's larger head needs a little extra room above long ears when upright.
  const headroom = style.id === 'anime' ? env.rig.headroom * unit : 0
  ctx.translate(width / 2 - 12 * unit + yaw * 18, height * 0.64 + headroom)
  ctx.scale(unit, unit)
  drawPlatform(env)
  ctx.rotate(env.pose.lean * env.rig.stepWeight + yaw * 0.16)
  if (pose.sleep > 0) ctx.rotate(-0.2 * pose.sleep)
  // Anchor squash/stretch at the feet so breathing does not float above the shadow.
  const floor = env.rig.floor * proportions.bodyScale * proportions.bodyLength
  ctx.translate(0, floor - env.pose.bob - env.pose.jump)
  ctx.scale(env.pose.squashX, env.pose.squashY)
  ctx.translate(0, -floor)
  const seated = !['walk', 'jump', 'working', 'dragged'].includes(action)
  if (style.id === 'glass' && env.rig.stand > 0) {
    const merged = compositeGlass(ctx, mask => drawStructure({ ...env, ctx: mask, glassPass: 'mask' }, seated),
      env.rig.stand, env.outlineWidth, env.detail)
    if (merged) {
      // Fade the old material away during the same rig transition, preserving sitting exactly.
      if (env.rig.stand < 1) {
        ctx.save(); ctx.globalAlpha *= 1 - env.rig.stand
        drawStructure(env, seated); ctx.restore()
      }
      ctx.save(); ctx.globalAlpha *= env.rig.stand
      drawStructure({ ...env, glassPass: 'markings' }, seated); ctx.restore()
    } else drawStructure(env, seated)
  } else drawStructure(env, seated)
  withHead(env, () => {
    drawFace(env)
    drawAccessories(env, true)
  })
  drawAccessories(env, false)
  drawEffects(env)
  ctx.restore()
}
function withHead(env: Env, draw: () => void): void {
  const { ctx, proportions } = env
  ctx.save()
  ctx.translate(0, env.rig.headY)
  ctx.rotate(env.headTilt)
  ctx.scale(proportions.headScale, proportions.headScale)
  draw()
  ctx.restore()
}
function drawStructure(env: Env, seated: boolean): void {
  drawTail(env)
  drawHindLegs(env, seated)
  drawBody(env, seated)
  drawPaws(env, seated)
  withHead(env, () => { drawEars(env); drawHead(env) })
}
function isAction(value: string): value is PetAction {
  return ['idle', 'walk', 'sleep', 'happy', 'sad', 'thinking', 'talking', 'eating', 'dragged',
    'wave', 'jump', 'petting', 'working', 'success', 'error'].includes(value)
}
function isEmotion(value: string | undefined): value is Emotion {
  return ['neutral', 'happy', 'sad', 'excited', 'angry', 'shy', 'surprised', 'love', 'tired', 'focused'].includes(value ?? '')
}
function withAlpha(color: string, alpha: number): string {
  const normalized = mixHex(color, '#000000', 0)
  const n = Number.parseInt(normalized.replace('#', '').slice(0, 6), 16)
  return Number.isNaN(n) ? color : `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

const furTextures = new WeakMap<DrawContext, CanvasPattern>()
function getFurTexture(ctx: DrawContext): CanvasPattern | undefined {
  const cached = furTextures.get(ctx)
  if (cached) return cached
  const tile = typeof document !== 'undefined' ? document.createElement('canvas')
    : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 64) : undefined
  if (!tile) return undefined
  tile.width = tile.height = 64
  const brush = tile.getContext('2d')
  if (!brush || !('stroke' in brush)) return undefined
  for (let y = -5; y < 69; y += 4) for (let x = -5; x < 69; x += 4) {
    const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    const jitter = seed - Math.floor(seed)
    const px = x + jitter * 5
    const py = y + jitter * 4
    brush.lineWidth = 0.5
    brush.strokeStyle = 'rgba(80,42,12,0.07)'
    brush.beginPath(); brush.moveTo(px, py)
    brush.quadraticCurveTo(px + 0.6, py + 1, px + 1, py + 1.5 + jitter * 1.5)
    brush.stroke()
    brush.strokeStyle = 'rgba(255,248,225,0.18)'
    brush.beginPath(); brush.moveTo(px - 0.7, py - 0.8)
    brush.lineTo(px, py + 1 + jitter * 1.5); brush.stroke()
  }
  const pattern = ctx.createPattern(tile, 'repeat')
  if (pattern) furTextures.set(ctx, pattern)
  return pattern ?? undefined
}

/** Materials shade inside the silhouette; markings never get a heavy border. */
function paint(env: Env, trace: () => void, fill: string, outlineScale = 1,
  bounds: Bounds = [-70, -60, 140, 120]): void {
  const { ctx, style } = env
  const [x, y, w, h] = bounds
  const mode = style.material.mode
  ctx.save(); ctx.beginPath(); trace()
  if (env.glassPass) {
    if (env.glassPass === 'mask') {
      if (outlineScale >= 0.6) { ctx.fillStyle = '#fff'; ctx.fill() }
    } else if (outlineScale === 0) {
      // Surface markings tint the shared volume; they carry no internal glass rim.
      ctx.fillStyle = fill === env.colors.innerEar ? 'rgba(85,73,171,0.25)'
        : fill === env.colors.blush || fill === mixHex(env.colors.blush, '#ef9b91', 0.25) ? 'rgba(177,238,255,0.5)'
        : fill === env.colors.accent ? 'rgba(221,250,255,0.34)' : 'rgba(210,241,255,0.12)'
      ctx.fill()
    }
    ctx.restore(); return
  }
  if (mode === 'glass') {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h * 0.8)
    gradient.addColorStop(0, 'rgba(112,220,248,0.68)')
    gradient.addColorStop(0.28, 'rgba(82,151,218,0.4)')
    gradient.addColorStop(0.56, 'rgba(92,89,195,0.47)')
    gradient.addColorStop(0.82, 'rgba(169,117,227,0.56)')
    gradient.addColorStop(1, 'rgba(227,174,250,0.76)')
    ctx.fillStyle = gradient; ctx.fill()
    ctx.save(); ctx.clip()
    const depth = ctx.createRadialGradient(x + w * 0.63, y + h * 0.63, 0,
      x + w * 0.63, y + h * 0.63, w * 0.6)
    depth.addColorStop(0, 'rgba(45,47,128,0.3)')
    depth.addColorStop(0.5, 'rgba(75,72,164,0.15)')
    depth.addColorStop(1, 'rgba(75,72,164,0)')
    ctx.fillStyle = depth; ctx.fillRect(x, y, w, h)
    const glow = ctx.createRadialGradient(x + w * 0.3, y + h * 0.7, 0, x + w * 0.3, y + h * 0.7, w * 0.65)
    glow.addColorStop(0, 'rgba(159,250,255,0.42)')
    glow.addColorStop(0.4, 'rgba(115,226,250,0.14)')
    glow.addColorStop(1, 'rgba(137,247,255,0)')
    ctx.fillStyle = glow; ctx.fillRect(x, y, w, h)
    // An inset violet edge remains visible on a pale host background under the luminous rim.
    if (env.outlineWidth > 0 && outlineScale > 0) {
      ctx.strokeStyle = 'rgba(73,78,149,0.28)'; ctx.lineWidth = 2.4; ctx.stroke()
    }
    ctx.restore()
  } else if (mode === 'toon') {
    ctx.fillStyle = fill; ctx.fill()
    ctx.save(); ctx.clip(); ctx.fillStyle = shadeHex(fill, -0.18)
    ctx.beginPath(); ctx.moveTo(x + w, y + h * 0.15)
    ctx.bezierCurveTo(x + w * 0.8, y + h * 0.9, x + w * 0.45, y + h * 0.94, x, y + h * 0.78)
    ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); ctx.restore()
  } else {
    if (mode === 'fur') {
      if (env.detail) { ctx.shadowColor = fill; ctx.shadowBlur = 3 }
    }
    const gradient = ctx.createRadialGradient(x + w * 0.34, y + h * 0.23, w * 0.02,
      x + w * 0.38, y + h * 0.3, Math.max(w * 0.62, h * 0.9))
    gradient.addColorStop(0, mixHex(fill, '#fff4dd', mode === 'fur' ? 0.32 : 0.28))
    gradient.addColorStop(0.42, fill)
    gradient.addColorStop(1, mixHex(fill, '#996141', mode === 'fur' ? 0.33 : 0.24))
    ctx.fillStyle = gradient; ctx.fill(); ctx.shadowBlur = 0
    ctx.save(); ctx.clip()
    if (mode === 'fur' && env.detail) {
      const texture = getFurTexture(ctx)
      if (texture) { ctx.fillStyle = texture; ctx.fillRect(x - 2, y - 2, w + 4, h + 4) }
    } else if (mode === 'soft') {
      ctx.beginPath(); trace(); ctx.translate(0.6, 1.1)
      ctx.strokeStyle = 'rgba(255,245,218,0.6)'; ctx.lineWidth = 2.5; ctx.stroke()
    }
    ctx.restore()
  }
  if (env.outlineWidth > 0 && outlineScale > 0) {
    ctx.beginPath(); trace(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.lineWidth = env.outlineWidth * outlineScale
    if (mode === 'glass') {
      const rim = ctx.createLinearGradient(x, y, x + w, y + h)
      rim.addColorStop(0, '#b9fdff'); rim.addColorStop(0.45, '#78e5ff')
      rim.addColorStop(0.75, '#dfb6ff'); rim.addColorStop(1, '#9b8fff')
      ctx.strokeStyle = rim
      if (env.detail) { ctx.shadowBlur = 7; ctx.shadowColor = '#8adfff' }
    } else ctx.strokeStyle = env.outline
    ctx.stroke()
  }
  ctx.restore()
}
function ellipse(env: Env, x: number, y: number, rx: number, ry: number, color: string, line = 1): void {
  paint(env, () => env.ctx.ellipse(x, y, rx, ry, 0, 0, TAU), color, line, [x - rx, y - ry, rx * 2, ry * 2])
}
function drawPlatform({ ctx, style, pose, proportions, rig }: Env): void {
  ctx.save()
  const glass = style.id === 'glass'
  const floor = rig.floor * proportions.bodyScale * proportions.bodyLength
  const shadow = ctx.createRadialGradient(0, floor, 4, 0, floor, 70)
  shadow.addColorStop(0, glass ? 'rgba(104,116,244,0.23)' : 'rgba(112,69,39,0.2)')
  shadow.addColorStop(1, glass ? 'rgba(104,116,244,0)' : 'rgba(112,69,39,0)')
  ctx.translate(0, floor); ctx.scale(1 - Math.min(0.35, pose.jump / 100), 0.2); ctx.translate(0, -floor)
  ctx.fillStyle = shadow; ctx.fillRect(-72, floor - 72, 144, 144); ctx.restore()
}
function drawTail(env: Env): void {
  const { ctx, colors: c, proportions: p, pose, parts } = env
  if (parts.tail === 'none') return
  ctx.save(); ctx.translate(env.rig.tailX, env.rig.tailY)
  ctx.rotate(pose.tailWag * 0.55 + pose.tailLift * 0.16); ctx.scale(p.tailScale, p.tailScale)
  if (parts.tail === 'thin') {
    paint(env, () => {
      ctx.moveTo(0, 12); ctx.bezierCurveTo(62, 29, 79, -34, 57, -49)
      ctx.bezierCurveTo(42, -58, 40, -39, 50, -35); ctx.bezierCurveTo(63, -28, 47, 12, 0, 2); ctx.closePath()
    }, c.body, 0.8, [0, -55, 75, 85])
  } else if (parts.tail === 'puff' || parts.tail === 'bob') {
    ellipse(env, 17, 3, parts.tail === 'bob' ? 14 : 23, parts.tail === 'bob' ? 14 : 22, c.accent, 0.6)
  } else {
    const softTail = env.style.id === 'kawaii' || env.style.id === 'plush'
    const t = env.rig.stand
    const tail = () => {
      if (softTail) {
        ctx.moveTo(-8, 12)
        ctx.bezierCurveTo(29, 43, 89, 25, 91, -18)
        ctx.bezierCurveTo(92, -41, 84 + 16 * t, -54 + 11 * t, 94 + 9 * t, -60 + t)
        ctx.quadraticCurveTo(102 + 5 * t, -64 - 13 * t, 96 - 2 * t, -68 - 15 * t)
        ctx.quadraticCurveTo(86 - 3 * t, -76 - 14 * t, 75 + t, -73 - 6 * t)
        ctx.quadraticCurveTo(59 + 6 * t, -80 + 14 * t, 42, -63)
        ctx.quadraticCurveTo(37, -60, 40, -67)
        ctx.bezierCurveTo(19, -54, 18, -29, 25, -15)
        ctx.bezierCurveTo(32, 2, 14, 9, -8, 12); ctx.closePath()
        return
      }
      ctx.moveTo(-6, 12); ctx.bezierCurveTo(34, 39, 80, 17, 82, -28)
      if (t === 0) {
        ctx.quadraticCurveTo(83, -46, 94, -53); ctx.quadraticCurveTo(69, -80, 45, -61)
      } else {
        ctx.quadraticCurveTo(83 + 3 * t, -46 + 8 * t, 94 + 5 * t, -53 - 3 * t)
        ctx.quadraticCurveTo(81.5 + 28.5 * t, -66.5 - 3.5 * t, 65.75 + 25.25 * t, -68.5 - 12.5 * t)
        ctx.quadraticCurveTo(57 + 12 * t, -70.5 - 17.5 * t, 45, -61)
      }
      ctx.lineTo(48, -68); ctx.quadraticCurveTo(26, -55, 28, -24)
      ctx.bezierCurveTo(31, -3, 16, 6, -6, 12); ctx.closePath()
    }
    paint(env, tail, c.body, 1, [-8, -80 - 8 * t, 110 + 8 * t, 114 + 8 * t])
    ctx.save(); ctx.beginPath(); tail(); ctx.clip()
    paint(env, () => {
      if (softTail) {
        ctx.moveTo(15, -88); ctx.lineTo(110, -88); ctx.lineTo(110, -31)
        // Two broad, rounded S-curves let the cream blend into the fluffy plume.
        ctx.bezierCurveTo(94, -31, 81, -14, 72, -24)
        ctx.bezierCurveTo(67, -30, 72, -40, 61, -41)
        ctx.bezierCurveTo(51, -43, 49, -30, 39, -36)
        ctx.bezierCurveTo(33, -39, 34, -47, 22, -43)
        ctx.closePath()
        return
      }
      ctx.moveTo(22, -77 - 17 * t); ctx.lineTo(105 + 5 * t, -77 - 17 * t); ctx.lineTo(100, -28)
      ctx.lineTo(77, -11); ctx.lineTo(78, -31); ctx.lineTo(63, -18)
      ctx.lineTo(61, -37); ctx.lineTo(45, -28); ctx.lineTo(43, -47); ctx.lineTo(27, -39); ctx.closePath()
    }, c.accent, 0, [20, -80, 85, 64]); ctx.restore()
  }
  ctx.restore()
}
function drawBody(env: Env, seated: boolean): void {
  const { ctx, proportions: p, colors: c } = env
  ctx.save(); ctx.scale(p.bodyScale, p.bodyScale * p.bodyLength)
  ctx.translate(0, env.rig.bodyY); ctx.scale(env.rig.bodyWidth, env.rig.bodyHeight)
  paint(env, () => {
    ctx.moveTo(-25, -11); ctx.bezierCurveTo(-43, -2, -48, 29, -47, 42)
    ctx.bezierCurveTo(-49, 80, 45, 83, 46, 45); ctx.bezierCurveTo(46, 22, 38, -4, 25, -11); ctx.closePath()
  }, c.body, 1, [-48, -13, 96, 90])
  if (env.glassPass === 'markings') {
    ctx.strokeStyle = 'rgba(218,254,255,0.4)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-28, 3); ctx.bezierCurveTo(-35, 14, -37, 26, -36, 31); ctx.stroke()
  }
  paint(env, () => {
    ctx.moveTo(-24, 1); ctx.quadraticCurveTo(0, -7, 24, 1)
    ctx.lineTo(22, 12); ctx.lineTo(27, 17); ctx.lineTo(20, 16)
    ctx.bezierCurveTo(24, 34, 16, 54, 0, 62); ctx.bezierCurveTo(-19, 50, -23, 31, -20, 17)
    ctx.lineTo(-27, 19); ctx.lineTo(-22, 10); ctx.closePath()
  }, c.belly, 0, [-27, -4, 54, 68])
  // A visible neck ruff joins the chin to the chest and gives neck accessories a fabric base.
  paint(env, () => {
    ctx.moveTo(-29, -9); ctx.quadraticCurveTo(0, -17, 29, -9)
    ctx.bezierCurveTo(37, 1, 29, 10, 24, 12)
    ctx.quadraticCurveTo(31, 18, 20, 16)
    ctx.quadraticCurveTo(20, 24, 11, 21)
    ctx.quadraticCurveTo(5, 29, 0, 24)
    ctx.quadraticCurveTo(-6, 29, -12, 21)
    ctx.quadraticCurveTo(-22, 25, -22, 17)
    ctx.quadraticCurveTo(-32, 19, -26, 11)
    ctx.bezierCurveTo(-36, 6, -35, -1, -29, -9); ctx.closePath()
  }, c.belly, 0.3, [-35, -15, 70, 43])
  if (!seated) {
    ctx.globalAlpha *= 1 - env.rig.stand
    ctx.strokeStyle = withAlpha(env.outline, 0.3); ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(0, 46); ctx.lineTo(0, 61); ctx.stroke()
  }
  ctx.restore()
}
function drawEars(env: Env): void {
  const { ctx, parts, colors: c, proportions: p, pose } = env
  if (parts.ears === 'none') return
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 42, -29)
    ctx.rotate(side * (pose.earTwitch * (side < 0 ? 1 : 0.45) + env.expression.earDrop * 0.28))
    ctx.scale(side * p.earScale * (side < 0 ? p.earScaleL : p.earScaleR), p.earScale)
    if (parts.ears === 'long') {
      ctx.rotate(0.13); ellipse(env, 1, -35, 15, 48, c.body); ellipse(env, 2, -39, 8, 33, c.innerEar, 0)
    } else if (parts.ears === 'floppy') {
      ctx.rotate(-0.32); ellipse(env, 16, 4, 18, 36, c.body); ellipse(env, 18, 9, 10, 25, c.innerEar, 0)
    } else if (parts.ears === 'round') {
      ellipse(env, 0, -13, 22, 23, c.body); ellipse(env, 0, -15, 13, 14, c.innerEar, 0)
    } else {
      paint(env, () => {
        ctx.moveTo(-23, 7); ctx.quadraticCurveTo(-26, -23, 12, -60)
        ctx.quadraticCurveTo(24, -70, 25, -51); ctx.quadraticCurveTo(35, -9, 20, 20); ctx.closePath()
      }, c.body, 1, [-24, -64, 54, 85])
      if (env.style.id === 'anime') paint(env, () => {
        ctx.moveTo(-1, -46); ctx.quadraticCurveTo(26, -79, 25, -51)
        ctx.lineTo(28, -32); ctx.lineTo(21, -37); ctx.lineTo(16, -33); ctx.lineTo(14, -46); ctx.closePath()
      }, '#473027', 0, [-5, -65, 35, 35])
      paint(env, () => {
        ctx.moveTo(-14, -5); ctx.quadraticCurveTo(-9, -24, 15, -48)
        ctx.quadraticCurveTo(20, -53, 21, -39); ctx.quadraticCurveTo(25, -14, 14, 8); ctx.closePath()
      }, c.innerEar, 0, [-14, -50, 39, 58])
      paint(env, () => {
        ctx.moveTo(-14, -7); ctx.quadraticCurveTo(-19, -20, -9, -18)
        ctx.lineTo(0, -11); ctx.quadraticCurveTo(-4, -25, 4, -21)
        ctx.lineTo(15, -4); ctx.lineTo(7, 14); ctx.closePath()
      }, c.accent, 0, [-18, -23, 36, 38])
    }
    ctx.restore()
  }
}
function headPath(ctx: DrawContext, fox: boolean): void {
  ctx.moveTo(0, -58); ctx.bezierCurveTo(39, -58, 58, -35, 60, -8)
  if (fox) {
    ctx.quadraticCurveTo(61, 11, 70, 15); ctx.quadraticCurveTo(69, 20, 61, 22)
    ctx.lineTo(69, 24); ctx.quadraticCurveTo(60, 35, 53, 35); ctx.lineTo(59, 36)
  } else ctx.quadraticCurveTo(64, 20, 54, 36)
  ctx.bezierCurveTo(40, 59, -40, 59, fox ? -59 : -54, 36)
  if (fox) {
    ctx.lineTo(-53, 35); ctx.quadraticCurveTo(-65, 32, -69, 24)
    ctx.lineTo(-61, 22); ctx.quadraticCurveTo(-69, 20, -70, 15); ctx.quadraticCurveTo(-61, 11, -60, -8)
  } else ctx.quadraticCurveTo(-64, 20, -60, -8)
  ctx.bezierCurveTo(-58, -35, -39, -58, 0, -58); ctx.closePath()
}
let feltFuzz: Path2D | undefined
function drawFeltFuzz(env: Env): void {
  const { ctx, colors } = env
  if (!feltFuzz) {
    feltFuzz = new Path2D()
    for (let i = 0; i < 480; i++) {
      const a = i / 480 * TAU
      const length = 0.35 + (Math.sin(i * 123.4) + 1) * 0.3
      const tangent = Math.sin(i * 37.7) * 0.35
      const nx = Math.cos(a)
      const ny = Math.sin(a)
      feltFuzz.moveTo(nx * 63.7, -1 + ny * 54.7)
      feltFuzz.quadraticCurveTo(nx * 64.2 - ny * tangent, -1 + ny * 55.2 + nx * tangent,
        nx * (64 + length) - ny * tangent, -1 + ny * (55 + length) + nx * tangent)
    }
  }
  ctx.save(); ctx.lineWidth = 0.4; ctx.lineCap = 'round'
  ctx.strokeStyle = withAlpha(mixHex(colors.body, colors.accent, 0.25), 0.38)
  ctx.shadowColor = withAlpha(colors.body, 0.25); ctx.shadowBlur = 1.4
  ctx.stroke(feltFuzz); ctx.restore()
}
function drawHead(env: Env): void {
  const { ctx, colors: c, species, proportions: p } = env
  const fox = species === 'fox' || species === 'custom'
  const silhouette = () => env.style.id === 'plush'
    ? ctx.ellipse(0, -1, 64, 55, 0, 0, TAU) : headPath(ctx, fox)
  paint(env, silhouette, c.body, 1, [-70, -58, 140, 112])
  if (env.style.id === 'plush' && env.detail) drawFeltFuzz(env)
  ctx.save(); ctx.beginPath(); silhouette(); ctx.clip()
  paint(env, () => {
    ctx.moveTo(-73, 18); ctx.quadraticCurveTo(-54, 6, -40, 18)
    ctx.quadraticCurveTo(-26, 26, -12, 15); ctx.quadraticCurveTo(0, 8, 12, 15)
    ctx.quadraticCurveTo(26, 26, 40, 18); ctx.quadraticCurveTo(54, 6, 73, 18)
    ctx.lineTo(75, 61); ctx.lineTo(-75, 61); ctx.closePath()
  }, c.belly, 0, [-73, 8, 146, 50])
  if (env.style.id !== 'plush') for (const side of [-1, 1]) {
    ellipse(env, side * 26, 1, 17 * Math.min(1.2, p.eyeScale / 1.15), 22, c.belly, 0)
  }
  if (env.style.id === 'glass') {
    ctx.strokeStyle = 'rgba(242,255,255,0.55)'; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.ellipse(-20, -37, 23, 8, -0.4, Math.PI * 1.03, Math.PI * 1.8); ctx.stroke()
    ctx.fillStyle = '#dcfaff'
    for (let i = 0; i < 12; i++) {
      ctx.globalAlpha = 0.25 + (i % 3) * 0.15
      ctx.beginPath(); ctx.arc(Math.sin(i * 23) * 48, -43 + (i * 17 % 78), 0.55 + (i % 2) * 0.25, 0, TAU); ctx.fill()
    }
  }
  ctx.restore()
}
function drawFace(env: Env): void {
  const { ctx, colors: c, expression: e, proportions: p, emotion } = env
  for (const side of [-1, 1]) {
    const x = side * 43
    const blush = (0.22 + e.blush * 0.4) * env.style.blush
    const rx = (emotion === 'shy' ? 15 : 11) * Math.min(p.cheekScale, 1.35)
    const gradient = ctx.createRadialGradient(x, 23, 0, x, 23, rx)
    gradient.addColorStop(0, withAlpha(c.blush, blush + (emotion === 'shy' ? 0.28 : 0)))
    gradient.addColorStop(1, withAlpha(c.blush, 0))
    ctx.save(); ctx.translate(x, 23); ctx.scale(1, 0.62); ctx.translate(-x, -23)
    ctx.fillStyle = gradient; ctx.fillRect(x - rx, 23 - rx, rx * 2, rx * 2); ctx.restore()
    if (e.blush > 0.3 || emotion === 'neutral') {
      ctx.strokeStyle = withAlpha(shadeHex(c.blush, -0.15), emotion === 'shy' ? 0.8 : 0.5); ctx.lineWidth = 0.85
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * 4 - 1.5, 23); ctx.lineTo(x + i * 4 + 1, 20); ctx.stroke()
      }
    }
  }
  drawEye(env, -26, 1, -1); drawEye(env, 26, 1, 1); drawBrows(env)
  ctx.save(); ctx.scale(p.snoutScale * (env.parts.muzzle === 'long' ? 1.12 : 1), p.snoutScale)
  const nose = env.style.id === 'glass' ? '#4651a0' : mixHex(mixHex(c.nose, c.eye, 0.83), '#623f29', 0.35)
  paint(env, () => {
    ctx.moveTo(-6, 20); ctx.bezierCurveTo(-10, 13, 10, 13, 6, 20)
    ctx.quadraticCurveTo(0, 27, -6, 20); ctx.closePath()
  }, nose, 0, [-8, 14, 16, 12])
  ctx.fillStyle = 'rgba(255,246,225,0.6)'; ctx.beginPath(); ctx.ellipse(-2, 17, 2.4, 0.9, -0.2, 0, TAU); ctx.fill()
  drawMouth(env); ctx.restore()
  if (env.species === 'cat' || env.species === 'bunny') {
    ctx.save(); ctx.strokeStyle = withAlpha(env.outline, 0.65); ctx.lineWidth = 0.75
    for (const side of [-1, 1]) for (const dy of [-2, 5]) {
      ctx.beginPath(); ctx.moveTo(side * 35, 29 + dy); ctx.lineTo(side * 59, 26 + dy * 1.5); ctx.stroke()
    }
    ctx.restore()
  }
  if (emotion === 'sad') {
    ctx.save(); ctx.translate(38, 21)
    const tear = ctx.createLinearGradient(0, 0, 0, 17)
    tear.addColorStop(0, '#b5eaff'); tear.addColorStop(1, '#72bddf'); ctx.fillStyle = tear
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.bezierCurveTo(-2, 6, -7, 10, -3, 14)
    ctx.bezierCurveTo(5, 20, 8, 9, 0, -1); ctx.fill()
    ctx.fillStyle = '#f3fdff'; ctx.beginPath(); ctx.ellipse(-1.5, 10, 1.1, 2.2, 0.3, 0, TAU); ctx.fill(); ctx.restore()
  }
  if (emotion === 'angry') {
    ctx.strokeStyle = withAlpha('#d56862', 0.8); ctx.lineWidth = 1.4
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 47, 7); ctx.quadraticCurveTo(side * 54, 13, side * 49, 18); ctx.stroke()
    }
  }
}
function drawEye(env: Env, x: number, y: number, side: number): void {
  const { ctx, expression: e, emotion, colors: c, style, parts } = env
  const size = 12.1 * env.proportions.eyeScale
  const fur = style.id === 'plush'
  const glass = style.id === 'glass'
  const happy = emotion === 'happy' || (e.smile > 0.8 && emotion === 'neutral')
  ctx.save(); ctx.translate(x, y)
  const rx = size * (parts.eyes === 'dot' ? 0.52 : emotion === 'surprised' ? 1.12 : 1)
  const ry = size * (parts.eyes === 'almond' ? 0.98 : 1.12)
  if (happy || e.eyeOpen < 0.12 || env.blink < 0.12) {
    ctx.strokeStyle = glass ? '#b0f5ff' : c.eye; ctx.lineWidth = fur ? 2.2 : 2.6; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-rx * 0.78, 3)
    ctx.quadraticCurveTo(0, happy ? -ry * 0.9 : 7, rx * 0.78, 3); ctx.stroke(); ctx.restore(); return
  }
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, side * -0.055, 0, TAU)
  ctx.fillStyle = glass ? '#34457f' : fur ? '#3e2e25' : '#fffcf5'; ctx.fill()
  ctx.strokeStyle = glass ? '#a8e9ff' : mixHex(c.eye, '#794c2c', 0.3)
  ctx.lineWidth = fur ? 1 : style.id === 'anime' ? 1.8 : 0.9; ctx.stroke()
  ctx.save(); ctx.clip()
  const lookX = emotion === 'shy' ? 4 : Math.max(-1, Math.min(1, env.pointer.x)) * 2
  const lookY = Math.max(-1, Math.min(1, env.pointer.y)) * 1.4
  const irisX = lookX + side * -0.7
  const irisY = lookY + 1.1
  const iris = rx * (fur ? 0.91 : 0.87)
  if (e.heartEyes) heart(ctx, irisX, 4, rx * 1.05, '#ee6a8e')
  else {
    const gradient = ctx.createLinearGradient(0, -ry, 0, ry)
    gradient.addColorStop(0, glass ? '#19165c' : shadeHex(c.eye, -0.4))
    gradient.addColorStop(0.48, glass ? '#4237ac' : mixHex(c.eye, '#78451f', 0.45))
    gradient.addColorStop(1, glass ? '#48d7ed' : mixHex(c.eye, '#d69650', 0.72))
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(irisX, irisY, iris, ry * 0.94, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = glass ? '#171d52' : shadeHex(c.eye, -0.55)
    const pupil = iris * 0.65 * e.pupil
    ctx.beginPath(); ctx.ellipse(irisX, irisY - 3, pupil, emotion === 'surprised' ? pupil : ry * 0.68, 0, 0, TAU); ctx.fill()
    ctx.strokeStyle = glass ? 'rgba(128,244,255,0.7)' : 'rgba(238,180,108,0.45)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(irisX, irisY + 1, iris * 0.82, ry * 0.78, 0, 0.28, Math.PI - 0.28); ctx.stroke()
  }
  ctx.fillStyle = '#fffefa'
  if (emotion === 'excited') {
    star(ctx, -rx * 0.24, -ry * 0.2, rx * 0.5); star(ctx, rx * 0.37, ry * 0.34, rx * 0.25)
  } else {
    ctx.beginPath(); ctx.ellipse(-rx * 0.3, -ry * 0.4,
      rx * (style.id === 'anime' ? 0.34 : 0.27), ry * (style.id === 'anime' ? 0.29 : 0.24), 0.3, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(rx * 0.4, ry * 0.39, rx * 0.13, 0, TAU); ctx.fill()
    if (style.id === 'anime') star(ctx, rx * 0.44, -ry * 0.09, rx * 0.14)
  }
  // Eyelids descend over the iris instead of vertically shrinking the whole eyeball.
  const open = Math.min(emotion === 'focused' ? 0.84 : 1, e.eyeOpen)
  if (open < 0.99 || env.blink < 0.999) {
    const lids = eyeLids(ry, open, env.blink)
    ctx.fillStyle = glass ? '#7e9be0' : c.body
    ctx.fillRect(-rx - 2, -ry - 2, rx * 2 + 4, lids.upper + ry + 2)
    ctx.fillRect(-rx - 2, lids.lower, rx * 2 + 4, ry + 2 - lids.lower)
    ctx.strokeStyle = glass ? '#b4eaff' : env.outline; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-rx, lids.upper); ctx.quadraticCurveTo(0, lids.upper + 1, rx, lids.upper); ctx.stroke()
  }
  ctx.restore()
  if (style.id === 'anime') {
    ctx.strokeStyle = c.eye; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.91); ctx.stroke()
  }
  ctx.restore()
}
function drawBrows(env: Env): void {
  const { ctx, expression: e, emotion } = env
  ctx.save(); ctx.strokeStyle = env.style.id === 'glass' ? '#c0dcff' : mixHex(env.colors.body, env.colors.eye, 0.58)
  ctx.lineCap = 'round'; ctx.lineWidth = emotion === 'angry' || emotion === 'focused' ? 2.4 : 1.6
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 27, -28)
    const sad = emotion === 'sad' || e.brow < -0.45
    const angry = emotion === 'angry'
    ctx.beginPath()
    if (sad) { ctx.moveTo(side * -8, -4); ctx.quadraticCurveTo(0, -1, side * 8, 3) }
    else if (angry || emotion === 'focused') { ctx.moveTo(side * -8, angry ? 6 : 3); ctx.lineTo(side * 9, -2) }
    else { ctx.moveTo(-6, emotion === 'surprised' ? -5 : 0); ctx.quadraticCurveTo(0, -5 - e.brow * 4, 6, emotion === 'surprised' ? -5 : 0) }
    ctx.stroke(); ctx.restore()
  }
  ctx.restore()
}
function drawMouth(env: Env): void {
  const { ctx, emotion, expression: e } = env
  ctx.save(); ctx.strokeStyle = env.style.id === 'glass' ? '#35406e' : mixHex(env.colors.eye, '#885035', 0.3)
  ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const happy = emotion === 'happy' || emotion === 'excited' || e.smile > 0.7
  const open = happy ? Math.max(0.65, e.mouthOpen) : e.mouthOpen
  if (emotion === 'surprised') {
    ctx.fillStyle = '#674047'; ctx.beginPath(); ctx.ellipse(0, 34, 4.7, 6.3, 0, 0, TAU); ctx.fill()
  } else if (open > 0.22) {
    ctx.beginPath(); ctx.moveTo(-10, 29); ctx.quadraticCurveTo(0, 34, 10, 29)
    ctx.bezierCurveTo(9, 39 + open * 11, -9, 39 + open * 11, -10, 29)
    ctx.fillStyle = '#6f3639'; ctx.fill(); ctx.stroke()
    ctx.save(); ctx.clip(); ctx.fillStyle = '#f3979b'; ctx.beginPath(); ctx.ellipse(0, 40, 8, 5.3, 0, 0, TAU); ctx.fill(); ctx.restore()
  } else if (emotion === 'focused') {
    ctx.beginPath(); ctx.moveTo(-5, 33); ctx.quadraticCurveTo(0, 34, 5, 33); ctx.stroke()
  } else if (e.smile < -0.2) {
    ctx.beginPath(); ctx.moveTo(-7, 36); ctx.quadraticCurveTo(0, 29, 7, 36); ctx.stroke()
  } else {
    ctx.beginPath(); ctx.moveTo(0, 23); ctx.lineTo(0, 28)
    ctx.moveTo(-11, 28); ctx.bezierCurveTo(-10, 36, -2, 35, 0, 28)
    ctx.bezierCurveTo(2, 35, 10, 36, 11, 28); ctx.stroke()
  }
  if (env.species === 'bunny' && open > 0.22 && emotion !== 'surprised') {
    ctx.fillStyle = '#fff9ef'; ctx.fillRect(-3, 31, 6, 4)
  }
  ctx.restore()
}
function drawPaws(env: Env, seated: boolean): void {
  const { ctx, colors: c, proportions: p, pose } = env
  ctx.save(); ctx.scale(p.bodyScale, p.bodyScale * p.bodyLength)
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * env.rig.footX,
      env.rig.footY + (seated ? 0 : Math.sin(pose.pawPhase) * side * 5 * env.rig.stepWeight))
    ctx.rotate(side * env.rig.footAngle)
    ctx.scale(env.rig.footWidth, env.rig.footHeight)
    ellipse(env, 0, 0, 18, 21, c.body)
    if (env.rig.stand < 1) {
      ctx.save(); ctx.globalAlpha *= 1 - env.rig.stand
      ellipse(env, 0, 3, 13.5, 16, c.belly, 0)
      ellipse(env, 0, 7, 6.8, 7, mixHex(c.blush, '#ef9b91', 0.25), 0)
      for (const [x, y] of [[-7, -3], [0, -6], [7, -3]]) ellipse(env, x!, y!, 2.6, 3.2, c.blush, 0)
      ctx.restore()
    }
    if (env.rig.stand > 0 && env.glassPass !== 'mask') {
      ctx.save(); ctx.globalAlpha *= env.rig.stand
      ctx.strokeStyle = env.style.id === 'glass' ? 'rgba(195,249,255,0.75)'
        : withAlpha(env.outline, env.style.id === 'plush' ? 0.35 : 0.6)
      ctx.lineWidth = 0.9; ctx.lineCap = 'round'
      for (const x of [-5, 5]) {
        ctx.beginPath(); ctx.moveTo(x, -4); ctx.quadraticCurveTo(x - 1, 2, x, 8); ctx.stroke()
      }
      ctx.restore()
    }
    ctx.restore()
  }
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * ((seated ? 21 : 19) + env.rig.armSpread), (seated ? 25 : 14) + env.rig.armLift)
    if ((pose.wave > 0 || env.emotion === 'angry') && side < 0) {
      ctx.rotate(1.75 + Math.sin(env.time * 7) * 0.15 * pose.wave)
    } else ctx.rotate(side * (0.13 - 0.25 * env.rig.stand))
    ctx.scale(env.rig.armScale, env.rig.armScale)
    if (seated) {
      ctx.scale(side, 1)
      paint(env, () => {
        ctx.moveTo(-11, -7)
        ctx.bezierCurveTo(-19, 1, -19, 17, -11, 24)
        ctx.bezierCurveTo(-4, 34, 14, 32, 17, 20)
        ctx.bezierCurveTo(21, 7, 13, -6, 4, -8)
        ctx.quadraticCurveTo(-5, -11, -11, -7); ctx.closePath()
      }, c.body, 0.75, [-18, -10, 37, 42])
      ellipse(env, 1, 21, 12.5, 10, c.accent, 0)
      ctx.strokeStyle = withAlpha(env.outline, env.style.id === 'plush' ? 0.22 : 0.45)
      ctx.lineWidth = 0.7
      for (const x of [-3, 5]) {
        ctx.beginPath(); ctx.moveTo(x, 24); ctx.quadraticCurveTo(x - 1, 27, x, 30); ctx.stroke()
      }
      ctx.restore()
      continue
    }
    ctx.scale(1, 1 - 0.28 * env.rig.stand)
    paint(env, () => {
      ctx.moveTo(-9, 0); ctx.bezierCurveTo(-14, 13, -10, 31, -10, 41)
      ctx.bezierCurveTo(-12, 56, 12, 56, 12, 41); ctx.quadraticCurveTo(13, 16, 7, 3)
    }, c.body, 0.75, [-14, 0, 29, 55])
    paint(env, () => {
      ctx.moveTo(-10, 39); ctx.quadraticCurveTo(0, 36, 12, 40)
      ctx.bezierCurveTo(16, 58, -14, 59, -10, 39); ctx.closePath()
    }, c.accent, 0, [-13, 36, 28, 21])
    ctx.strokeStyle = withAlpha(env.outline, env.style.id === 'plush' ? 0.22 : 0.45); ctx.lineWidth = 0.7
    for (const x of [-4, 4]) { ctx.beginPath(); ctx.moveTo(x, 48); ctx.quadraticCurveTo(x - 1, 52, x + 1, 54); ctx.stroke() }
    ctx.restore()
  }
  ctx.restore()
}
/** Short weight-bearing haunches behind the belly, separate from the forward-facing feet. */
function drawHindLegs(env: Env, seated: boolean): void {
  if (env.rig.stand === 0) return
  const { ctx, proportions: p, colors: c, pose } = env
  ctx.save(); ctx.scale(p.bodyScale, p.bodyScale * p.bodyLength)
  ctx.globalAlpha *= env.rig.stand
  for (const side of [-1, 1]) {
    const step = seated ? 0 : Math.sin(pose.pawPhase) * side * 5 * env.rig.stepWeight
    ctx.save(); ctx.translate(side * env.rig.legX, step)
    paint(env, () => {
      const bottom = 69 + 9 * env.rig.stand
      ctx.moveTo(-8, 40)
      ctx.bezierCurveTo(-19, 43, -18, bottom - 14, -11, bottom - 5)
      ctx.bezierCurveTo(-9, bottom + 1, 9, bottom + 1, 11, bottom - 5)
      ctx.bezierCurveTo(18, bottom - 16, 17, 43, 8, 40)
      ctx.quadraticCurveTo(0, 37, -8, 40); ctx.closePath()
    }, c.body, 0.8, [-19, 37, 38, 33 + 9 * env.rig.stand])
    if (env.glassPass === 'markings') {
      ctx.strokeStyle = 'rgba(209,252,255,0.38)'; ctx.lineWidth = 1; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-8, 55); ctx.quadraticCurveTo(-9, 64, -7, 69); ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
}
function applyChannels(pose: BodyPose, channels: PetVisualState['channels']): BodyPose {
  const next = { ...pose }
  const wag = channelValue(channels, 'bone-tail', 'rotation.y')
  const lean = channelValue(channels, 'bone-head', 'rotation.z')
  const spark = channelValue(channels, 'sparkle', 'amount')
  if (wag !== undefined) next.tailWag += wag
  if (lean !== undefined) next.lean += lean
  if (spark !== undefined) next.sparkle = Math.max(next.sparkle, spark)
  return next
}
/** Map logical sockets onto the rig; head attachments share its tilt. */
function anchor(socket: AttachmentSocket, rig: Env['rig']): { x: number; y: number; head: boolean } {
  const positions: Record<string, [number, number, boolean]> = {
    head: [0, -58, true], 'ear-l': [-48, -52, true], 'ear-r': [48, -52, true],
    neck: [0, 9 + rig.bodyY, false], chest: [0, 30 + rig.bodyY, false], back: [0, 22 + rig.bodyY, false],
    tail: [74 + rig.tailX - 39, 43 + rig.tailY - 51, false],
    'paw-l': [-26 + rig.stand * 3, 63 + rig.stand * 5, false],
    'paw-r': [26 - rig.stand * 3, 63 + rig.stand * 5, false], muzzle: [0, 27, true], face: [0, 1, true],
  }
  const at = positions[socket.id]
  return at ? { x: at[0], y: at[1], head: at[2] }
    : { x: socket.position.x * 150, y: 68 - socket.position.y * 160, head: false }
}
function drawAccessories(env: Env, head: boolean): void {
  const { ctx } = env
  for (const item of env.accessories) {
    const at = anchor(env.sockets?.find(s => s.id === item.socket) ?? socketForAccessory(item.kind, item.socket), env.rig)
    if (at.head !== head) continue
    const color = item.color ?? '#8ed9cc'
    ctx.save(); ctx.translate(at.x, at.y)
    if (!head) ctx.scale(env.proportions.bodyScale, env.proportions.bodyScale)
    ctx.lineWidth = 0.8; ctx.strokeStyle = shadeHex(color, -0.28); ctx.lineJoin = 'round'
    if (item.kind === 'bow') {
      if (socketForAccessory(item.kind, item.socket).id === 'neck') {
        // The ribbon follows the ruff beneath the jaw and passes behind the bow's knot.
        ctx.save(); ctx.lineWidth = 1.4
        ctx.strokeStyle = withAlpha(shadeHex(color, -0.15), 0.7)
        ctx.beginPath(); ctx.moveTo(-24, -2); ctx.quadraticCurveTo(0, 6, 24, -2); ctx.stroke()
        ctx.restore()
      }
      ctx.translate(head ? 0 : -18, 0); ctx.rotate(-0.1)
      const gradient = ctx.createLinearGradient(0, -7, 0, 7)
      gradient.addColorStop(0, mixHex(color, '#fff9eb', 0.3)); gradient.addColorStop(1, shadeHex(color, -0.08))
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(0, 0)
      ctx.bezierCurveTo(-15, -12, -14, 11, 0, 3); ctx.bezierCurveTo(14, 11, 15, -12, 0, 0); ctx.fill(); ctx.stroke()
      ctx.fillStyle = shadeHex(color, -0.05); ctx.beginPath(); ctx.ellipse(0, 1, 3, 3.6, 0, 0, TAU); ctx.fill()
    } else if (item.kind === 'scarf') {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-26, -4); ctx.quadraticCurveTo(0, 5, 26, -4)
      ctx.lineTo(18, 9); ctx.lineTo(0, 19); ctx.lineTo(-22, 7); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(21, 2); ctx.quadraticCurveTo(43, 7, 33, 25); ctx.lineTo(20, 17); ctx.closePath(); ctx.fill(); ctx.stroke()
    } else if (item.kind === 'glasses') {
      ctx.strokeStyle = color; ctx.lineWidth = 1.4
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 26, 0, 18, 21, 0, 0, TAU); ctx.stroke() }
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(0, -4, 8, 0); ctx.stroke()
    } else if (item.kind === 'flower') {
      ctx.fillStyle = color
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 4, 5, a, 0, TAU); ctx.fill()
      }
      ctx.fillStyle = '#ffe5a0'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill()
    } else if (item.kind === 'hat') {
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 30, 8, 0, 0, TAU); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.roundRect(-18, -24, 36, 25, 8); ctx.fill(); ctx.stroke()
      ctx.fillStyle = shadeHex(color, -0.22); ctx.fillRect(-18, -8, 36, 4)
    }
    ctx.restore()
  }
  for (const prop of env.props ?? []) {
    const at = anchor(env.sockets?.find(s => s.id === prop.socket) ?? socketForAccessory('prop', prop.socket), env.rig)
    if (at.head === head) ellipse(env, at.x, at.y, 6, 6, prop.color ?? '#7af0ff', 0.5)
  }
}
function drawEffects(env: Env): void {
  const { ctx, pose, style, time, emotion } = env
  ctx.save()
  if (pose.zzz > 0 || emotion === 'tired') {
    ctx.fillStyle = style.id === 'glass' ? '#b5e7ff' : '#9a8baf'
    ctx.font = '600 11px sans-serif'; ctx.fillText('z', 69, -81 + Math.sin(time * 1.4) * 2)
    ctx.font = '600 16px sans-serif'; ctx.fillText('z', 81, -94 + Math.sin(time * 1.4 + 1) * 2)
    ctx.font = '600 20px sans-serif'; ctx.fillText('Z', 94, -111 + Math.sin(time * 1.4 + 2) * 2)
  }
  if (pose.think > 0) {
    ctx.fillStyle = env.outline
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.4 + (Math.sin(time * 3 - i) + 1) * 0.25
      ctx.beginPath(); ctx.arc(70 + i * 10, -91 - i * 6, 2 + i * 0.3, 0, TAU); ctx.fill()
    }
  }
  if (pose.sparkle > 0 || emotion === 'excited' || style.id === 'glass') {
    ctx.fillStyle = style.id === 'glass' ? '#c7f7ff' : '#efbf62'
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.35 + (Math.sin(time * 1.6 + i * 2) + 1) * 0.3
      star(ctx, [-89, 88, -78, 109][i]!, [-61, -108, 23, -14][i]!, 2.5 + (i % 2) * 1.8)
    }
  }
  if (emotion === 'love') {
    ctx.globalAlpha = 0.65; heart(ctx, -81, -66 + Math.sin(time) * 2, 9, '#e996ac')
    heart(ctx, 82, -88 + Math.cos(time) * 2, 6, '#e996ac')
  }
  ctx.restore()
}
function heart(ctx: DrawContext, x: number, y: number, size: number, color: string): void {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, size * 0.65)
  ctx.bezierCurveTo(-size * 1.45, -size * 0.2, -size * 0.7, -size * 1.2, 0, -size * 0.45)
  ctx.bezierCurveTo(size * 0.7, -size * 1.2, size * 1.45, -size * 0.2, 0, size * 0.65)
  ctx.fill(); ctx.restore()
}
function star(ctx: DrawContext, x: number, y: number, radius: number): void {
  ctx.save(); ctx.translate(x, y); ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * TAU - Math.PI / 2
    const r = i % 2 ? radius * 0.32 : radius
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
  }
  ctx.closePath(); ctx.fill(); ctx.restore()
}
