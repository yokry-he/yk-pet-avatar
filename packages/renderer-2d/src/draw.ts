/**
 * 文件职责 / File responsibility
 * 分层矢量宠物。风格预设决定描边、上色和眼睛，部件决定耳朵、尾巴和脸型。
 * Layered vector pet. Style presets drive outline, shading, and eyes.
 */

import {
  channelValue,
  getStyle,
  gradeColors,
  mixHex,
  resolveBodyPose,
  resolveExpression,
  shadeHex,
  socketForAccessory,
  styledProportions,
  type AttachmentSocket,
  type Accessory,
  type BodyPose,
  type Emotion,
  type Expression,
  type PetAction,
  type PetColors,
  type PetParts,
  type PetProportions,
  type PetStyleId,
  type PetVisualState,
  type Species,
  type StylePreset,
} from '@yk-pet/core'

interface Env {
  ctx: CanvasRenderingContext2D
  style: StylePreset
  colors: PetColors
  proportions: PetProportions
  parts: PetParts
  species: Species
  pose: BodyPose
  expression: Expression
  pointer: { x: number; y: number }
  accessories: Accessory[]
  props: PetVisualState['props']
  time: number
  outline: string
  outlineWidth: number
  action: string
}

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
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  state: PetVisualState,
  time: number,
  yaw = 0,
): void {
  const style = getStyle(state.style as PetStyleId | undefined)
  const colors = gradeColors(state.appearance?.colors ?? FALLBACK_COLORS, style.grade)
  const proportions = styledProportions(state.appearance?.proportions ?? FALLBACK_PROPORTIONS, style)
  const action = state.behavior || 'idle'
  const reduced = Boolean(state.reducedMotion)
  const drag = Boolean(state.drag && state.drag.active)
  const knownAction = (isAction(action) ? action : 'idle')
  const emotion = (isEmotion(state.emotion) ? state.emotion : 'neutral')
  const outline = state.finish?.outlineColor
    ?? (style.outline.followBody ? mixHex(shadeHex(colors.body, -0.42), style.outline.color, 0.4) : style.outline.color)
  const env: Env = {
    ctx,
    style,
    colors,
    proportions,
    parts: state.appearance?.parts ?? FALLBACK_PARTS,
    species: state.appearance?.species ?? 'fox',
    pose: applyChannels(resolveBodyPose(knownAction, time, reduced, drag), state.channels),
    expression: resolveExpression({
      action: knownAction,
      emotion,
      speaking: Boolean(state.speaking),
      time,
      reducedMotion: reduced,
      dragActive: drag,
    }),
    pointer: state.pointer ?? { x: 0, y: 0 },
    accessories: state.appearance?.accessories ?? [],
    props: state.props,
    time,
    outline,
    outlineWidth: style.outline.width * (state.finish?.outlineWidth ?? 1),
    action,
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  const unit = Math.min(width, height) / 300
  ctx.translate(width / 2 + yaw * 18, height * 0.64)
  ctx.scale(unit, unit)
  ctx.rotate(env.pose.lean + yaw * 0.25)
  if (env.pose.sleep > 0) ctx.rotate(-0.5 * env.pose.sleep)
  ctx.translate(0, -env.pose.bob - env.pose.jump)
  ctx.scale(env.pose.squashX, env.pose.squashY)
  drawPlatform(env)
  const seated = !['walk', 'jump', 'working', 'dragged'].includes(action)
  drawTail(env, seated)
  drawBody(env, seated)
  drawEars(env)
  drawHead(env)
  drawPaws(env, seated)
  drawAccessories(env)
  drawEffects(env)
  ctx.restore()
}

function isAction(value: string | undefined): value is PetAction {
  return value === 'idle' || value === 'walk' || value === 'sleep' || value === 'happy' || value === 'sad'
    || value === 'thinking' || value === 'talking' || value === 'eating' || value === 'dragged' || value === 'wave'
    || value === 'jump' || value === 'petting' || value === 'working' || value === 'success' || value === 'error'
}

function isEmotion(value: string | undefined): value is Emotion {
  return value === 'neutral' || value === 'happy' || value === 'sad' || value === 'excited' || value === 'angry'
    || value === 'shy' || value === 'surprised' || value === 'love' || value === 'tired' || value === 'focused'
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function paint(env: Env, trace: () => void, fill: string, outlineScale = 1): void {
  const { ctx, style } = env
  ctx.save()
  ctx.beginPath()
  trace()
  if (style.material.mode === 'glass') {
    const gradient = ctx.createLinearGradient(-50, -90, 50, 90)
    gradient.addColorStop(0, withAlpha(style.palette.highlight, 0.75))
    gradient.addColorStop(0.45, withAlpha(fill, Math.max(0.4, style.material.opacity)))
    gradient.addColorStop(1, withAlpha(style.palette.rim, 0.45))
    ctx.fillStyle = gradient
    ctx.shadowBlur = 16
    ctx.shadowColor = style.palette.glow
    ctx.fill()
  } else if (style.material.mode === 'fur') {
    ctx.save()
    ctx.fillStyle = withAlpha(fill, 0.2)
    ctx.shadowBlur = 18
    ctx.shadowColor = fill
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    trace()
    const gradient = ctx.createRadialGradient(-16, -20, 4, 0, 8, 70)
    gradient.addColorStop(0, mixHex(fill, '#fffaf4', 0.3))
    gradient.addColorStop(1, fill)
    ctx.fillStyle = gradient
    ctx.shadowBlur = 0
    ctx.fill()
  } else if (style.material.mode === 'toon') {
    ctx.fillStyle = fill
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = shadeHex(fill, -0.2)
    ctx.fillRect(-320, 2, 640, 320)
    ctx.restore()
  } else {
    const gradient = ctx.createRadialGradient(-22, -30, 6, 0, 0, 86)
    gradient.addColorStop(0, mixHex(fill, '#ffffff', 0.42))
    gradient.addColorStop(0.58, fill)
    gradient.addColorStop(1, shadeHex(fill, -0.1))
    ctx.fillStyle = gradient
    ctx.fill()
  }
  ctx.restore()

  if (env.outlineWidth > 0 && style.outline.passes > 0) {
    ctx.save()
    ctx.beginPath()
    trace()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = env.outline
    ctx.globalAlpha = style.outline.opacity
    ctx.lineWidth = Math.max(0.6, env.outlineWidth * outlineScale)
    if (style.outline.softness > 0) {
      ctx.shadowBlur = 12 * style.outline.softness
      ctx.shadowColor = env.outline
    }
    ctx.stroke()
    if (style.outline.passes === 2) {
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.5
      ctx.lineWidth *= 0.42
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawPlatform(env: Env): void {
  const { ctx, style } = env
  ctx.save()
  if (style.platform === 'ring') {
    ctx.shadowBlur = 18
    ctx.shadowColor = style.palette.glow
    ctx.strokeStyle = style.palette.glow
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(0, 86, 86, 18, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = style.palette.rim
    ctx.beginPath()
    ctx.ellipse(0, 86, 52, 10, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.fillStyle = style.material.mode === 'toon' ? 'rgba(40, 24, 32, 0.18)' : 'rgba(90, 60, 40, 0.16)'
    ctx.beginPath()
    ctx.ellipse(0, 84, style.material.mode === 'fur' ? 78 : 68, 14, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawTail(env: Env, seated: boolean): void {
  const { ctx, colors, proportions, pose, parts } = env
  if (parts.tail === 'none') return
  ctx.save()
  ctx.translate(seated ? 48 : 42, seated ? 16 : 26)
  ctx.rotate(-0.75 + pose.tailWag + pose.tailLift)
  ctx.scale(proportions.tailScale, proportions.tailScale)
  if (parts.tail === 'thin') {
    ctx.strokeStyle = colors.body
    ctx.lineCap = 'round'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(30, -10, 58, -36)
    ctx.stroke()
    ctx.strokeStyle = colors.accent
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(46, -24)
    ctx.quadraticCurveTo(54, -32, 58, -36)
    ctx.stroke()
  } else if (parts.tail === 'puff' || parts.tail === 'bob') {
    const radius = parts.tail === 'bob' ? 12 : 22
    paint(env, () => ctx.arc(12, 6, radius, 0, Math.PI * 2), colors.body, 0.55)
    paint(env, () => ctx.arc(16, 2, radius * 0.42, 0, Math.PI * 2), colors.accent, 0.35)
  } else {
    const puffs: Array<[number, number, number]> = [[8, 6, 18], [28, -2, 20], [48, -16, 18], [64, -34, 16]]
    puffs.forEach(([x, y, radius], index) => {
      paint(env, () => ctx.arc(x, y, radius, 0, Math.PI * 2), index === puffs.length - 1 ? colors.accent : colors.body, 0.45)
    })
  }
  ctx.restore()
}

function drawBody(env: Env, seated: boolean): void {
  const { ctx, colors, proportions, species } = env
  const rx = 62 * proportions.bodyScale
  const ry = (seated ? 48 : 56) * proportions.bodyScale * Math.max(0.75, proportions.bodyLength)
  paint(env, () => ctx.ellipse(0, seated ? 16 : 8, rx, ry, 0, 0, Math.PI * 2), colors.body)
  paint(env, () => ctx.ellipse(0, seated ? 30 : 22, rx * 0.58, ry * 0.5, 0, 0, Math.PI * 2), colors.belly, 0.35)
  if (env.style.material.mode === 'fur') {
    ctx.save()
    ctx.strokeStyle = withAlpha(shadeHex(colors.body, -0.25), 0.5)
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(0, seated ? 32 : 24, rx * 0.34, ry * 0.26, 0, 0.15, Math.PI - 0.15)
    ctx.stroke()
    ctx.restore()
  }
  if (species === 'fox') {
    paint(env, () => {
      ctx.moveTo(-44, 6)
      ctx.quadraticCurveTo(-64, 22, -40, 34)
      ctx.quadraticCurveTo(-28, 16, -32, 4)
      ctx.closePath()
    }, colors.accent, 0.35)
    paint(env, () => {
      ctx.moveTo(44, 6)
      ctx.quadraticCurveTo(64, 22, 40, 34)
      ctx.quadraticCurveTo(28, 16, 32, 4)
      ctx.closePath()
    }, colors.accent, 0.35)
  }
}

function drawEars(env: Env): void {
  const { proportions, parts, colors } = env
  if (parts.ears === 'none') return
  const headY = -58 * proportions.headScale
  const spread = 32 * proportions.headScale
  drawEar(env, -spread, headY - 6, -1, proportions.earScale * proportions.earScaleL, colors)
  drawEar(env, spread, headY - 6, 1, proportions.earScale * proportions.earScaleR, colors)
}

function drawEar(env: Env, x: number, y: number, side: number, scale: number, colors: PetColors): void {
  const { ctx, parts } = env
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(side * scale, scale)
  if (parts.ears === 'long') {
    paint(env, () => roundRect(ctx, -11, -78, 22, 78, 12), colors.ear, 0.65)
    paint(env, () => roundRect(ctx, -6, -68, 12, 56, 8), colors.innerEar, 0.35)
  } else if (parts.ears === 'floppy') {
    ctx.rotate(0.75)
    paint(env, () => ctx.ellipse(18, 12, 14, 28, 0.3, 0, Math.PI * 2), colors.ear, 0.55)
    paint(env, () => ctx.ellipse(18, 16, 7, 16, 0.3, 0, Math.PI * 2), colors.innerEar, 0.3)
  } else if (parts.ears === 'round') {
    paint(env, () => ctx.ellipse(0, -6, 16, 18, 0, 0, Math.PI * 2), colors.ear, 0.5)
    paint(env, () => ctx.ellipse(0, -4, 8, 10, 0, 0, Math.PI * 2), colors.innerEar, 0.3)
  } else {
    paint(env, () => {
      ctx.moveTo(-16, 10)
      ctx.quadraticCurveTo(-6, -58, 0, -66)
      ctx.quadraticCurveTo(8, -36, 18, 12)
      ctx.closePath()
    }, colors.ear, 0.6)
    paint(env, () => {
      ctx.moveTo(-8, 6)
      ctx.quadraticCurveTo(-2, -36, 0, -42)
      ctx.quadraticCurveTo(4, -24, 9, 8)
      ctx.closePath()
    }, colors.innerEar, 0.3)
  }
  ctx.restore()
}

function drawHead(env: Env): void {
  const { ctx, colors, proportions, expression, species, parts } = env
  const radius = 50 * proportions.headScale
  const y = -56 * Math.max(0.85, proportions.headScale)
  paint(env, () => ctx.ellipse(0, y, radius * 1.02, radius * 0.96, 0, 0, Math.PI * 2), colors.body)
  const snout = proportions.snoutScale * (parts.muzzle === 'long' || species === 'fox' ? 1.12 : 0.82)
  paint(env, () => ctx.ellipse(0, y + radius * 0.42, 18 * snout, 13 * snout, 0, 0, Math.PI * 2), colors.belly, 0.35)
  const blush = expression.blush * env.style.blush * proportions.cheekScale
  if (blush > 0.04) {
    ctx.save()
    ctx.fillStyle = withAlpha(colors.blush, 0.25 + blush * 0.4)
    ctx.beginPath()
    ctx.ellipse(-radius * 0.46, y + 12, 12 * proportions.cheekScale, 7, 0, 0, Math.PI * 2)
    ctx.ellipse(radius * 0.46, y + 12, 12 * proportions.cheekScale, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  drawEye(env, -16 * proportions.headScale, y - 2)
  drawEye(env, 16 * proportions.headScale, y - 2)
  paint(env, () => ctx.ellipse(0, y + radius * 0.4, 5.2, 4, 0, 0, Math.PI * 2), colors.nose, 0.4)
  drawMouth(env, y + radius * 0.55)
  if (species === 'cat' || species === 'bunny') drawWhiskers(env, y + radius * 0.42)
  if (species === 'bunny') {
    ctx.fillStyle = '#fffdf8'
    ctx.fillRect(-4, y + radius * 0.5, 3, 5)
    ctx.fillRect(1, y + radius * 0.5, 3, 5)
  }
}

function drawEye(env: Env, x: number, y: number): void {
  const { ctx, colors, expression, style, pointer, parts } = env
  const size = 15.5 * env.proportions.eyeScale
  const lookX = pointer.x * 3.2
  const lookY = pointer.y * 2.2
  ctx.save()
  ctx.translate(x, y)
  if (parts.eyes === 'almond' || style.material.mode === 'toon') ctx.scale(1.12, 0.8)
  if (parts.eyes === 'dot') ctx.scale(0.6, 0.6)
  ctx.scale(1, Math.max(0.07, expression.eyeOpen))
  ctx.fillStyle = style.material.mode === 'glass' ? withAlpha('#f7fdff', 0.88) : '#fffdfb'
  ctx.beginPath()
  ctx.ellipse(0, 0, size, size * 1.08, 0, 0, Math.PI * 2)
  ctx.fill()
  if (style.material.mode === 'toon') {
    ctx.strokeStyle = env.outline
    ctx.lineWidth = 2.2
    ctx.stroke()
  }
  const iris = size * (style.id === 'kawaii' ? 0.78 : 0.66)
  if (style.material.mode === 'fur') {
    const gradient = ctx.createRadialGradient(-2, -3, 1, 0, 0, iris)
    gradient.addColorStop(0, mixHex(colors.eye, '#ffffff', 0.55))
    gradient.addColorStop(0.5, colors.eye)
    gradient.addColorStop(1, shadeHex(colors.eye, -0.35))
    ctx.fillStyle = gradient
  } else if (style.material.mode === 'glass') {
    ctx.fillStyle = withAlpha(style.palette.glow, 0.92)
  } else {
    ctx.fillStyle = expression.heartEyes ? '#ff5d8f' : colors.eye
  }
  ctx.beginPath()
  ctx.arc(lookX * 0.22, lookY * 0.18, iris, 0, Math.PI * 2)
  ctx.fill()
  if (expression.heartEyes) heart(ctx, lookX, 0, size * 0.5, '#ff3d78')
  else {
    ctx.fillStyle = '#1c1420'
    ctx.beginPath()
    ctx.arc(lookX, 1 + lookY, iris * expression.pupil * 0.48, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(-size * 0.28, -size * 0.32, size * (0.16 + style.material.gloss * 0.12), 0, Math.PI * 2)
  ctx.fill()
  if (style.sparkle > 0.4) {
    ctx.beginPath()
    ctx.arc(size * 0.32, size * 0.26, size * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }
  if (style.id === 'kawaii') star(ctx, 0, -size * 0.9, size * 0.2)
  if (style.material.mode === 'glass') {
    ctx.strokeStyle = style.palette.glow
    ctx.lineWidth = 1.6
    ctx.shadowBlur = 8
    ctx.shadowColor = style.palette.glow
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.95, size, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawMouth(env: Env, y: number): void {
  const { ctx, expression } = env
  ctx.save()
  ctx.translate(0, y)
  ctx.lineCap = 'round'
  ctx.lineWidth = env.style.material.mode === 'toon' ? 2.4 : 2
  ctx.strokeStyle = shadeHex(env.colors.eye, 0.15)
  if (expression.mouthOpen > 0.22) {
    ctx.fillStyle = '#6a3044'
    ctx.beginPath()
    ctx.ellipse(0, 2, 7 + expression.smile * 2, 2.4 + expression.mouthOpen * 7, 0, 0, Math.PI * 2)
    ctx.fill()
    if (expression.mouthOpen > 0.45) {
      ctx.fillStyle = '#ff8ea3'
      ctx.beginPath()
      ctx.ellipse(0, 5, 4, 2.2, 0, 0, Math.PI)
      ctx.fill()
    }
  } else {
    ctx.beginPath()
    ctx.moveTo(-9, 0)
    ctx.quadraticCurveTo(0, expression.smile * 12, 9, 0)
    ctx.stroke()
  }
  ctx.restore()
}

function drawWhiskers(env: Env, y: number): void {
  const { ctx, style } = env
  ctx.save()
  ctx.strokeStyle = withAlpha(style.material.mode === 'glass' ? '#e8fbff' : '#6d5a52', 0.75)
  ctx.lineWidth = 1.2
  for (const side of [-1, 1]) {
    for (const dy of [-4, 2, 8]) {
      ctx.beginPath()
      ctx.moveTo(side * 14, y + dy)
      ctx.lineTo(side * 40, y + dy + side * 1.5)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawPaws(env: Env, seated: boolean): void {
  const { ctx, colors, pose, time } = env
  const lift = Math.sin(pose.pawPhase)
  if (pose.wave > 0) {
    ctx.save()
    ctx.translate(44, 4)
    ctx.rotate(-1.05 + Math.sin(time * 12) * 0.45)
    paint(env, () => ctx.ellipse(0, 16, 12, 16, 0, 0, Math.PI * 2), colors.body, 0.4)
    paint(env, () => ctx.ellipse(0, 26, 10, 7, 0, 0, Math.PI * 2), colors.belly, 0.25)
    ctx.restore()
  }
  const spots: Array<[number, number]> = seated
    ? [[-24, 54], [22, 56]]
    : [[-26, 60 + lift * 6], [24, 60 - lift * 6]]
  for (const [x, y] of spots) {
    paint(env, () => ctx.ellipse(x, y, 16, seated ? 12 : 18, 0, 0, Math.PI * 2), colors.body, 0.4)
    paint(env, () => ctx.ellipse(x, y + (seated ? 4 : 10), 11, 7, 0, 0, Math.PI * 2), colors.belly, 0.25)
  }
}

function anchor(socket: AttachmentSocket): { x: number; y: number } {
  return { x: socket.position.x * 150, y: 36 - socket.position.y * 110 }
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

function drawAccessories(env: Env): void {
  const { ctx, accessories, proportions } = env
  for (const item of accessories) {
    const color = item.color ?? '#8ed9cc'
    const at = anchor(socketForAccessory(item.kind, item.socket))
    if (item.kind === 'bow') bow(ctx, at.x, at.y, color)
    else if (item.kind === 'scarf') {
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(0, 0, 28, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(8, 0, 10, 28)
      ctx.restore()
    } else if (item.kind === 'glasses') {
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.ellipse(at.x - 16 * proportions.headScale, at.y, 13, 11, 0, 0, Math.PI * 2)
      ctx.ellipse(at.x + 16 * proportions.headScale, at.y, 13, 11, 0, 0, Math.PI * 2)
      ctx.moveTo(at.x - 4, at.y)
      ctx.lineTo(at.x + 4, at.y)
      ctx.stroke()
      ctx.restore()
    } else if (item.kind === 'flower') {
      flower(ctx, at.x, at.y, color)
    } else if (item.kind === 'hat') {
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(0, 0, 30, 11, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(0, -12, 16, 14, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  for (const prop of env.props ?? []) {
    const at = anchor(socketForAccessory('prop', prop.socket))
    ctx.save()
    ctx.fillStyle = prop.color ?? '#7af0ff'
    ctx.beginPath()
    ctx.arc(at.x, at.y, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawEffects(env: Env): void {
  const { ctx, pose, style, time } = env
  if (pose.zzz > 0) {
    ctx.save()
    ctx.fillStyle = style.material.mode === 'glass' ? style.palette.glow : '#7f93bd'
    ctx.globalAlpha = 0.9
    ctx.font = '700 16px "PingFang SC", sans-serif'
    ctx.fillText('z', 48, -98 + Math.sin(time * 2) * 4)
    ctx.font = '700 22px "PingFang SC", sans-serif'
    ctx.fillText('Z', 64, -116 + Math.sin(time * 2 + 1) * 5)
    ctx.restore()
  }
  if (pose.think > 0) {
    ctx.fillStyle = style.material.mode === 'toon' ? '#1b1224' : 'rgba(70, 60, 80, 0.75)'
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = 0.45 + ((Math.floor(time * 3) + i) % 3) * 0.18
      ctx.beginPath()
      ctx.arc(38 + i * 14, -110 - i * 8, 2.4 + i * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  if (pose.sparkle > 0 && style.sparkle > 0.2) {
    ctx.fillStyle = style.material.mode === 'glass' ? style.palette.glow : '#ffe29a'
    for (let i = 0; i < 4; i += 1) {
      const angle = time * 1.6 + i * 1.4
      star(ctx, Math.cos(angle) * (72 + i * 6), -30 + Math.sin(angle) * 34, 3.5 + (i % 2))
    }
  }
}

function bow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(-12, 0, 13, 8, -0.4, 0, Math.PI * 2)
  ctx.ellipse(12, 0, 13, 8, 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = shadeHex(color, -0.18)
  ctx.beginPath()
  ctx.arc(0, 0, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2
    ctx.beginPath()
    ctx.ellipse(Math.cos(angle) * 7, Math.sin(angle) * 7, 5, 7, angle, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffe08a'
  ctx.beginPath()
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, size * 0.32)
  ctx.bezierCurveTo(-size, -size * 0.15, -size * 0.35, -size * 0.75, 0, -size * 0.22)
  ctx.bezierCurveTo(size * 0.35, -size * 0.75, size, -size * 0.15, 0, size * 0.32)
  ctx.fill()
  ctx.restore()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 - Math.PI / 2
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    const inner = angle + Math.PI / 4
    ctx.lineTo(Math.cos(inner) * radius * 0.38, Math.sin(inner) * radius * 0.38)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
