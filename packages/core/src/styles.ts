/**
 * 文件职责 / File responsibility
 * 四套可切换的视觉风格。新增风格时优先只加一份数据；
 * material.mode 仍是 soft / toon / fur / glass 时，两个渲染器不用改代码。
 * Four switchable visual styles, stored as data (palette, outline, shading).
 */

import type {
  PetColors,
  PetProportions,
  PetStyleId,
  QualityTier,
  RenderQuality,
} from './types'

export interface ColorGrade {
  lightness: number
  saturation: number
  warmth: number
}

export interface StylePalette {
  outline: string
  shadow: string
  highlight: string
  rim: string
  glow: string
}

export interface StyleShape {
  head: number
  body: number
  eye: number
  cheek: number
  /** Extra roundness applied on top of body scale. */
  chubbiness: number
}

export interface StyleOutline {
  /** Canvas px at the default pet scale, and a world-unit hint for 3D. */
  width: number
  /** 0 = crisp, 1 = soft blurred edge. */
  softness: number
  opacity: number
  color: string
  /** Tint the outline toward a darker body color so recolors stay coherent. */
  followBody: boolean
  passes: 0 | 1 | 2
}

export type MaterialMode = 'soft' | 'toon' | 'fur' | 'glass'

export interface StyleMaterial {
  mode: MaterialMode
  roughness: number
  metalness: number
  toonBands: number
  /** 0–1, how dark the shadowed toon band is. */
  toonShadow: number
  transmission: number
  thickness: number
  opacity: number
  iridescence: number
  emissive: number
  furShells: Record<QualityTier, number>
  furLength: number
  /** Eye gloss, 0 matte – 1 wet. */
  gloss: number
}

export interface StyleLights {
  ambient: number
  key: string
  keyIntensity: number
  fill: string
  fillIntensity: number
  rim: string
  rimIntensity: number
  rim2?: string
  rim2Intensity?: number
}

export interface StylePreset {
  id: PetStyleId
  /** Owner numbering. Indexes 2 and 3 are intentionally unused. */
  index: 1 | 4 | 5 | 6
  support: { d2: 'full' | 'approx'; d3: 'full' }
  shape: StyleShape
  grade: ColorGrade
  palette: StylePalette
  outline: StyleOutline
  material: StyleMaterial
  lights: StyleLights
  sparkle: number
  blush: number
  /** Ground contact. `ring` is the glass hologram platform. */
  platform: 'soft' | 'ring'
}

const MODES: readonly MaterialMode[] = ['soft', 'toon', 'fur', 'glass']

export const STYLE_PRESETS: Record<PetStyleId, StylePreset> = {
  kawaii: {
    id: 'kawaii',
    index: 1,
    support: { d2: 'full', d3: 'full' },
    shape: { head: 1.1, body: 1.08, eye: 1.32, cheek: 1.25, chubbiness: 1.14 },
    grade: { lightness: 0.06, saturation: 0.94, warmth: 0.05 },
    palette: {
      outline: '#c4846a',
      shadow: '#e7b89a',
      highlight: '#fffaf6',
      rim: '#ffd9c8',
      glow: '#ffe7d2',
    },
    outline: { width: 7, softness: 0.72, opacity: 0.92, color: '#c4846a', followBody: true, passes: 2 },
    material: {
      mode: 'soft',
      roughness: 0.62,
      metalness: 0,
      toonBands: 3,
      toonShadow: 0.72,
      transmission: 0,
      thickness: 0,
      opacity: 1,
      iridescence: 0,
      emissive: 0.04,
      furShells: { high: 0, medium: 0, low: 0 },
      furLength: 0,
      gloss: 0.62,
    },
    lights: {
      ambient: 0.72,
      key: '#fff1e4',
      keyIntensity: 1.25,
      fill: '#d7e4ff',
      fillIntensity: 0.55,
      rim: '#ffd0e2',
      rimIntensity: 0.35,
    },
    sparkle: 1,
    blush: 1,
    platform: 'soft',
  },
  anime: {
    id: 'anime',
    index: 4,
    support: { d2: 'full', d3: 'full' },
    shape: { head: 1.16, body: 0.9, eye: 1.18, cheek: 0.72, chubbiness: 0.9 },
    grade: { lightness: 0.01, saturation: 1.12, warmth: 0.02 },
    palette: {
      outline: '#1b1224',
      shadow: '#c47a4a',
      highlight: '#ffffff',
      rim: '#2a2038',
      glow: '#ffffff',
    },
    outline: { width: 3.4, softness: 0, opacity: 1, color: '#1b1224', followBody: false, passes: 1 },
    material: {
      mode: 'toon',
      roughness: 1,
      metalness: 0,
      toonBands: 2,
      toonShadow: 0.55,
      transmission: 0,
      thickness: 0,
      opacity: 1,
      iridescence: 0,
      emissive: 0,
      furShells: { high: 0, medium: 0, low: 0 },
      furLength: 0,
      gloss: 0.35,
    },
    lights: {
      ambient: 0.42,
      key: '#ffffff',
      keyIntensity: 1.45,
      fill: '#c9d4ea',
      fillIntensity: 0.18,
      rim: '#9eb0ff',
      rimIntensity: 0.22,
    },
    sparkle: 0.25,
    blush: 0.45,
    platform: 'soft',
  },
  plush: {
    id: 'plush',
    index: 5,
    support: { d2: 'approx', d3: 'full' },
    shape: { head: 1.04, body: 1.12, eye: 0.92, cheek: 1.05, chubbiness: 1.18 },
    grade: { lightness: 0.04, saturation: 0.72, warmth: 0.055 },
    palette: {
      outline: '#c9a28a',
      shadow: '#e4c2a4',
      highlight: '#fff8f2',
      rim: '#ffd8bf',
      glow: '#ffe8d4',
    },
    outline: { width: 0, softness: 1, opacity: 0, color: '#c9a28a', followBody: true, passes: 0 },
    material: {
      mode: 'fur',
      roughness: 0.96,
      metalness: 0,
      toonBands: 1,
      toonShadow: 0.8,
      transmission: 0,
      thickness: 0,
      opacity: 1,
      iridescence: 0,
      emissive: 0.08,
      furShells: { high: 9, medium: 4, low: 1 },
      furLength: 0.055,
      gloss: 0.84,
    },
    lights: {
      ambient: 0.66,
      key: '#fff0e2',
      keyIntensity: 1.05,
      fill: '#eeebff',
      fillIntensity: 0.58,
      rim: '#ffe9df',
      rimIntensity: 0.52,
    },
    sparkle: 0.15,
    blush: 0.55,
    platform: 'soft',
  },
  glass: {
    id: 'glass',
    index: 6,
    support: { d2: 'approx', d3: 'full' },
    shape: { head: 1.06, body: 0.98, eye: 1.12, cheek: 0.35, chubbiness: 1 },
    grade: { lightness: 0.14, saturation: 0.72, warmth: -0.04 },
    palette: {
      outline: '#9af6ff',
      shadow: '#6d5cff',
      highlight: '#f4fdff',
      rim: '#c9a6ff',
      glow: '#7af0ff',
    },
    outline: { width: 2.2, softness: 0.85, opacity: 0.85, color: '#9af6ff', followBody: false, passes: 1 },
    material: {
      mode: 'glass',
      roughness: 0.16,
      metalness: 0.04,
      toonBands: 1,
      toonShadow: 1,
      transmission: 0.88,
      thickness: 0.85,
      opacity: 0.62,
      iridescence: 0.9,
      emissive: 0.32,
      furShells: { high: 0, medium: 0, low: 0 },
      furLength: 0,
      gloss: 0.95,
    },
    lights: {
      ambient: 0.35,
      key: '#eef7ff',
      keyIntensity: 0.85,
      fill: '#7a6cff',
      fillIntensity: 0.45,
      rim: '#7af0ff',
      rimIntensity: 1.15,
      rim2: '#c084fc',
      rim2Intensity: 0.9,
    },
    sparkle: 0.8,
    blush: 0.15,
    platform: 'ring',
  },
}

const ALIASES: Record<string, PetStyleId> = {
  '1': 'kawaii',
  kawaii: 'kawaii',
  soft: 'kawaii',
  'soft-kawaii': 'kawaii',
  '4': 'anime',
  anime: 'anime',
  'anime-cel': 'anime',
  cel: 'anime',
  '5': 'plush',
  plush: 'plush',
  fur: 'plush',
  '6': 'glass',
  glass: 'glass',
  glassmorphism: 'glass',
}

export function listStyles(): StylePreset[] {
  return [STYLE_PRESETS.kawaii, STYLE_PRESETS.anime, STYLE_PRESETS.plush, STYLE_PRESETS.glass]
}

export function getStyle(id: PetStyleId | undefined): StylePreset {
  return STYLE_PRESETS[id && id in STYLE_PRESETS ? id : 'kawaii']
}

export function coerceStyleId(value: unknown): PetStyleId | null {
  if (typeof value === 'number' && Number.isFinite(value)) return ALIASES[String(value)] ?? null
  if (typeof value !== 'string') return null
  return ALIASES[value.trim().toLowerCase()] ?? null
}

export function isMaterialMode(value: string): value is MaterialMode {
  return (MODES as readonly string[]).includes(value)
}

export function resolveQualityTier(
  quality: RenderQuality | undefined,
  probe: { deviceMemoryGb?: number; hardwareConcurrency?: number } = {},
): QualityTier {
  if (quality && quality !== 'auto') return quality
  const mem = probe.deviceMemoryGb
  const cores = probe.hardwareConcurrency
  if ((typeof mem === 'number' && mem > 0 && mem < 4) || (typeof cores === 'number' && cores > 0 && cores <= 4)) {
    return 'low'
  }
  if ((typeof mem === 'number' && mem < 8) || (typeof cores === 'number' && cores > 0 && cores <= 6)) {
    return 'medium'
  }
  return 'high'
}

export function styledProportions(proportions: PetProportions, style: StylePreset): PetProportions {
  const chubby = 1 + (style.shape.chubbiness - 1) * 0.35
  return {
    ...proportions,
    headScale: proportions.headScale * style.shape.head,
    bodyScale: proportions.bodyScale * style.shape.body * chubby,
    eyeScale: proportions.eyeScale * style.shape.eye,
    cheekScale: proportions.cheekScale * style.shape.cheek,
  }
}

export function gradeHex(input: string, grade: ColorGrade): string {
  const rgb = parseColor(input)
  if (!rgb) return input
  let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b)
  s = clamp01(s * grade.saturation)
  l = clamp01(l + grade.lightness)
  const next = hslToRgb(h, s, l)
  next.r = clamp01(next.r + grade.warmth * 0.18)
  next.b = clamp01(next.b - grade.warmth * 0.12)
  return rgbToHex(next.r, next.g, next.b)
}

export function gradeColors(colors: PetColors, grade: ColorGrade): PetColors {
  return {
    body: gradeHex(colors.body, grade),
    belly: gradeHex(colors.belly, grade),
    ear: gradeHex(colors.ear, grade),
    innerEar: gradeHex(colors.innerEar, grade),
    eye: colors.eye,
    accent: gradeHex(colors.accent, grade),
    nose: gradeHex(colors.nose, grade),
    blush: gradeHex(colors.blush, grade),
  }
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return a
  const k = clamp01(t)
  return rgbToHex(
    ca.r + (cb.r - ca.r) * k,
    ca.g + (cb.g - ca.g) * k,
    ca.b + (cb.b - ca.b) * k,
  )
}

export function shadeHex(input: string, amount: number): string {
  const rgb = parseColor(input)
  if (!rgb) return input
  const k = amount < 0 ? 0 : 1
  const t = Math.min(1, Math.abs(amount))
  return rgbToHex(
    rgb.r + (k - rgb.r) * t,
    rgb.g + (k - rgb.g) * t,
    rgb.b + (k - rgb.b) * t,
  )
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function parseColor(input: string): { r: number; g: number; b: number } | null {
  const value = input.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)
  if (hex) {
    let body = hex[1]!
    if (body.length === 3) body = body.split('').map(ch => ch + ch).join('')
    if (body.length === 8) body = body.slice(0, 6)
    const n = Number.parseInt(body, 16)
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value)
  if (!rgb) return null
  return { r: Number(rgb[1]) / 255, g: Number(rgb[2]) / 255, b: Number(rgb[3]) / 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h / 6, s, l }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return { r: hue(h + 1 / 3), g: hue(h), b: hue(h - 1 / 3) }
}
