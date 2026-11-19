/**
 * Canvas 2D renderer. Self-animates, and also accepts `update()` from yk-pets.
 */

import type { PetRenderer, PetRendererSnapshot, PetVisualState, SpriteSheetConfig } from '@yk-pet/core'
import { drawPet } from './draw'
import { spriteFrame } from './sprites'
import { transitionPose, type PoseTransition } from './pose'

export interface Canvas2DOptions {
  width?: number
  height?: number
  devicePixelRatio?: number
  transparent?: boolean
  autoStart?: boolean
  onFrame?: (dt: number) => void
  getState?: () => PetVisualState
  getYaw?: () => number
}

export class Canvas2DPetRenderer implements PetRenderer {
  readonly kind = '2d' as const
  canvas: HTMLCanvasElement | null = null
  #ctx: CanvasRenderingContext2D | null = null
  #frame = 0
  #last = 0
  #elapsed = 0
  #state: PetVisualState = { behavior: 'idle' }
  #width: number
  #height: number
  #dpr: number
  #image: HTMLImageElement | null = null
  #imageUrl = ''
  #poseTransition: PoseTransition | undefined
  #hasState = false

  constructor(private readonly options: Canvas2DOptions = {}) {
    this.#width = options.width ?? 360
    this.#height = options.height ?? 420
    this.#dpr = options.devicePixelRatio ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)
  }

  mount(target: Element | ShadowRoot): void {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'yk pet')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    canvas.style.background = this.options.transparent === false ? '#fffaf6' : 'transparent'
    canvas.style.touchAction = 'none'
    target.append(canvas)
    this.canvas = canvas
    this.#ctx = canvas.getContext('2d')
    if (!this.#ctx) throw new Error('Canvas 2D context unavailable')
    const rect = target instanceof Element ? target.getBoundingClientRect() : { width: this.#width, height: this.#height }
    this.resize(rect.width || this.#width, rect.height || this.#height, this.#dpr)
    if (this.options.autoStart !== false) this.start()
  }

  start(): void {
    if (this.#frame || typeof requestAnimationFrame !== 'function') return
    const loop = (now: number) => {
      const dt = this.#last ? Math.min(0.05, (now - this.#last) / 1000) : 0
      this.#last = now
      this.#elapsed += dt
      this.options.onFrame?.(dt)
      const next = this.options.getState?.()
      if (next) { this.#state = next; this.#hasState = true }
      this.#syncSprite(this.#state.sprite)
      this.#paint()
      this.#frame = requestAnimationFrame(loop)
    }
    this.#frame = requestAnimationFrame(loop)
  }

  stop(): void {
    if (this.#frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.#frame)
    this.#frame = 0
    this.#last = 0
  }

  setVisible(visible: boolean): void {
    if (this.canvas) this.canvas.style.visibility = visible ? 'visible' : 'hidden'
    if (visible) this.start()
    else this.stop()
  }

  update(state: PetVisualState): void {
    this.#state = state
    this.#hasState = true
    this.#syncSprite(state.sprite)
    if (!this.#frame) this.#paint()
  }

  resize(width: number, height: number, devicePixelRatio = this.#dpr): void {
    this.#width = Math.max(1, width)
    this.#height = Math.max(1, height)
    this.#dpr = Math.max(1, Math.min(2, devicePixelRatio))
    if (this.canvas) {
      this.canvas.width = Math.round(this.#width * this.#dpr)
      this.canvas.height = Math.round(this.#height * this.#dpr)
    }
    if (!this.#frame) this.#paint()
  }

  snapshot(): PetRendererSnapshot {
    return { state: { ...this.#state }, payload: { elapsed: this.#elapsed } }
  }

  restore(snapshot: PetRendererSnapshot): void {
    if (snapshot.state) { this.#state = snapshot.state; this.#hasState = true }
    this.#poseTransition = undefined
    const payload = snapshot.payload as { elapsed?: number } | undefined
    if (typeof payload?.elapsed === 'number') this.#elapsed = payload.elapsed
    this.#paint()
  }

  dispose(): void {
    this.stop()
    this.canvas?.remove()
    this.canvas = null
    this.#ctx = null
    this.#image = null
  }

  #paint(): void {
    if (!this.#ctx) return
    if (this.#drawSprite()) return
    if (this.#hasState) {
      this.#poseTransition = transitionPose(this.#poseTransition, this.#state.appearance?.pose,
        performance.now() / 1000, this.#state.reducedMotion)
    }
    drawPet(this.#ctx, this.#width, this.#height, this.#dpr, this.#state, this.#elapsed,
      this.options.getYaw?.() ?? 0, this.#poseTransition?.amount)
  }

  #syncSprite(sprite: SpriteSheetConfig | undefined): void {
    const url = sprite?.imageUrl ?? ''
    if (!url || url === this.#imageUrl) return
    this.#imageUrl = url
    if (typeof Image === 'undefined') return
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    this.#image = image
  }

  #drawSprite(): boolean {
    const sprite = this.#state.sprite
    const image = this.#image
    if (!sprite || !image || !image.complete || image.naturalWidth === 0 || !this.#ctx) return false
    const anim = sprite.animations[this.#state.behavior as keyof typeof sprite.animations] ?? sprite.animations.idle
    if (!anim) return false
    const frame = spriteFrame(this.#elapsed, anim.frames, anim.fps ?? 8)
    const col = frame % sprite.columns
    const sx = col * sprite.frameWidth
    const sy = anim.row * sprite.frameHeight
    const ctx = this.#ctx
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0)
    ctx.clearRect(0, 0, this.#width, this.#height)
    const scale = Math.min(this.#width / sprite.frameWidth, this.#height / sprite.frameHeight) * 0.86
    const dw = sprite.frameWidth * scale
    const dh = sprite.frameHeight * scale
    ctx.drawImage(image, sx, sy, sprite.frameWidth, sprite.frameHeight, (this.#width - dw) / 2, (this.#height - dh) / 2, dw, dh)
    return true
  }
}

export function createCanvas2DRendererFactory(options: Canvas2DOptions = {}) {
  return {
    kind: '2d' as const,
    create: () => new Canvas2DPetRenderer(options),
  }
}
