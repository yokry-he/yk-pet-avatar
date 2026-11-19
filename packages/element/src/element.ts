/**
 * <yk-pet>：同一套 Agent API，自适应 2D / 3D，隐藏时暂停。
 * One agent API, adaptive 2D/3D, paused while hidden.
 */

import {
  Pet,
  evaluateRenderer,
  type AgentState,
  type Emotion,
  type PetAction,
  type PetConfig,
  type PetEventMap,
  type PetRenderer,
  type RendererPreference,
  type SayOptions,
  type SpeechHandle,
} from '@yk-pet/core'
import { createCanvas2DRendererFactory } from '@yk-pet/2d'

type Factory3D = {
  createThreeRendererFactory: (options: Record<string, unknown>) => { create: () => PetRenderer | Promise<PetRenderer> }
}

const STYLE = `
:host { display: block; position: relative; width: 100%; height: 100%; min-height: 180px; }
.stage { position: absolute; inset: 0; }
.bubble {
  position: absolute; left: 50%; top: 6%; transform: translateX(-50%);
  max-width: min(240px, 78%);
  padding: 8px 12px; border-radius: 16px;
  background: #fffaf4; color: #3d2c28;
  font: 600 14px/1.4 "PingFang SC", "Noto Sans SC", sans-serif;
  box-shadow: 0 8px 20px rgba(80, 50, 30, 0.12);
  pointer-events: none; z-index: 2;
}
.bubble[data-kind="think"] { border-radius: 18px; background: #f4f7ff; border: 1px dashed #b9c4e6; }
.bubble[data-streaming="true"]::after { content: " ▍"; opacity: 0.7; }
`

export class YkPetElement extends HTMLElement {
  readonly pet: Pet
  viewYaw = 0
  #stage: HTMLElement
  #bubble: HTMLElement
  #renderer: PetRenderer | null = null
  #preference: RendererPreference = 'auto'
  #mounting: Promise<void> = Promise.resolve()
  #reduced = false
  #dragging = false
  #moved = false
  #last = { x: 0, y: 0 }
  #reversals = 0
  #strokeAt = 0
  #direction = 0
  #observer: IntersectionObserver | null = null
  #resize: ResizeObserver | null = null
  #onVisibility = () => { void this.#syncVisibility() }

  constructor() {
    super()
    this.pet = new Pet()
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>${STYLE}</style><div class="stage"></div><div class="bubble" hidden></div>`
    this.#stage = root.querySelector('.stage') as HTMLElement
    this.#bubble = root.querySelector('.bubble') as HTMLElement
    this.#bindPointer()
  }

  get config(): PetConfig { return this.pet.getConfig() }
  getConfig(): PetConfig { return this.pet.getConfig() }
  setConfig(value: unknown): void { this.config = value }
  set config(value: unknown) {
    this.pet.setConfig(value)
    const preference = this.pet.getConfig().renderer.preference
    if (preference !== this.#preference) {
      this.#preference = preference
      void this.#choose(true)
    }
  }

  get preference(): RendererPreference { return this.#preference }
  set preference(value: RendererPreference) {
    this.#preference = value
    this.pet.setConfig({ renderer: { preference: value } })
    void this.#choose(true)
  }

  connectedCallback(): void {
    this.#reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (this.hasAttribute('preference')) {
      const value = this.getAttribute('preference')
      if (value === '2d' || value === '3d' || value === 'auto') this.#preference = value
    }
    this.#observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting) && !document.hidden
      void this.#renderer?.setVisible?.(visible)
    })
    this.#observer.observe(this)
    this.#resize = new ResizeObserver(() => {
      const rect = this.#stage.getBoundingClientRect()
      this.#renderer?.resize?.(rect.width, rect.height, window.devicePixelRatio || 1)
    })
    this.#resize.observe(this.#stage)
    document.addEventListener('visibilitychange', this.#onVisibility)
    void this.#choose(true)
    this.dispatchEvent(new CustomEvent('yk-ready', { detail: { pet: this.pet }, bubbles: true }))
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect()
    this.#resize?.disconnect()
    document.removeEventListener('visibilitychange', this.#onVisibility)
    this.#renderer?.dispose()
    this.#renderer = null
  }

  say(text: string, opts?: SayOptions): SpeechHandle { return this.pet.say(text, opts) }
  play(action: PetAction | string): boolean { return this.pet.play(action) }
  setEmotion(emotion: Emotion | string): void { this.pet.setEmotion(emotion) }
  lookAt(x: number, y: number): void { this.pet.lookAt(x, y) }
  setState(state: AgentState | string): boolean { return this.pet.setState(state) }
  on<K extends keyof PetEventMap>(type: K, listener: (event: PetEventMap[K]) => void): () => void {
    return this.pet.on(type, listener)
  }
  exportConfig(): string { return this.pet.exportConfig() }
  importConfig(json: string) { return this.pet.importConfig(json) }

  async #choose(force: boolean): Promise<void> {
    const run = async () => {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      const lose = gl?.getExtension('WEBGL_lose_context')
      const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
      const decision = evaluateRenderer({
        webglSupported: Boolean(gl),
        deviceMemoryGb: nav.deviceMemory,
        saveData: Boolean(nav.connection?.saveData),
        reducedMotion: this.#reduced,
        preference: this.#preference,
      })
      lose?.loseContext()
      const kind = force || this.#renderer?.kind !== decision.target ? decision.target : this.#renderer.kind
      if (this.#renderer?.kind === kind && !force) return
      await this.#switch(kind, decision.reason)
    }
    this.#mounting = this.#mounting.then(run, run)
    return this.#mounting
  }

  async #switch(kind: '2d' | '3d', reason: string): Promise<void> {
    const options = {
      onFrame: () => {
        this.pet.tick()
        this.#paintBubble()
      },
      getState: () => {
        const state = this.pet.getVisualState()
        if (this.#reduced) state.reducedMotion = true
        return state
      },
      getYaw: () => this.viewYaw,
      onFallback: (fallback: string) => {
        if (this.#preference === '3d') return
        void this.#switch('2d', fallback)
      },
    }
    try {
      const factory = kind === '3d'
        ? (await loadThree()).createThreeRendererFactory(options)
        : createCanvas2DRendererFactory(options)
      const next = await factory.create()
      await next.mount(this.#stage)
      next.update(this.pet.getVisualState())
      this.#renderer?.dispose()
      this.#renderer = next
      this.dispatchEvent(new CustomEvent('yk-renderer', { detail: { kind, reason }, bubbles: true }))
    } catch (error) {
      if (kind === '3d') {
        await this.#switch('2d', 'renderer-error')
        return
      }
      throw error
    }
  }

  #paintBubble(): void {
    const speech = this.pet.getVisualState().speech
    if (!speech?.text) {
      this.#bubble.hidden = true
      return
    }
    this.#bubble.hidden = false
    this.#bubble.dataset.kind = speech.kind
    this.#bubble.dataset.streaming = speech.streaming ? 'true' : 'false'
    this.#bubble.textContent = speech.text
  }

  async #syncVisibility(): Promise<void> {
    const visible = !document.hidden
    await this.#renderer?.setVisible?.(visible)
  }

  #bindPointer(): void {
    const local = (event: PointerEvent) => {
      const rect = this.#stage.getBoundingClientRect()
      return {
        x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1,
      }
    }
    this.#stage.addEventListener('pointerdown', (event) => {
      if (!this.pet.getConfig().interaction.pointer) return
      this.#stage.setPointerCapture(event.pointerId)
      const point = local(event)
      this.#dragging = true
      this.#moved = false
      this.#last = point
      this.#reversals = 0
      this.#direction = 0
      this.#strokeAt = performance.now()
    })
    this.#stage.addEventListener('pointermove', (event) => {
      const point = local(event)
      if (this.pet.getConfig().interaction.lookAtPointer) this.pet.notifyHover(point.x, point.y)
      if (!this.#dragging) return
      const dx = point.x - this.#last.x
      const dy = point.y - this.#last.y
      if (Math.hypot(dx, dy) > 0.03) this.#moved = true
      if (!this.#moved) return
      if (!this.pet.action || this.pet.getVisualState().behavior !== 'dragged') this.pet.beginDrag(point.x, point.y)
      this.pet.updateDrag(point.x, point.y, dx, dy)
      const dir = Math.sign(dx)
      if (dir && this.#direction && dir !== this.#direction && performance.now() - this.#strokeAt < 800) this.#reversals += 1
      if (dir) this.#direction = dir
      this.#last = point
      if (this.#reversals >= 3) {
        this.pet.notifyPet(point.x, point.y, 1)
        this.#reversals = 0
        this.dispatchEvent(new CustomEvent('yk-pet', { detail: { x: point.x, y: point.y }, bubbles: true }))
      }
    })
    const end = (event: PointerEvent) => {
      if (!this.#dragging) return
      this.#dragging = false
      const point = local(event)
      if (this.#moved) {
        this.pet.endDrag(point.x, point.y)
        this.dispatchEvent(new CustomEvent('yk-drag', { detail: point, bubbles: true }))
      } else {
        this.pet.notifyClick(point.x, point.y)
        this.dispatchEvent(new CustomEvent('yk-click', { detail: point, bubbles: true }))
      }
    }
    this.#stage.addEventListener('pointerup', end)
    this.#stage.addEventListener('pointercancel', end)
  }
}

declare const __YK_PET_UMD__: boolean

async function loadThree(): Promise<Factory3D> {
  const host = globalThis as { YkPet3D?: Factory3D }
  if (host.YkPet3D?.createThreeRendererFactory) return host.YkPet3D
  // The IIFE build sets this flag so esbuild drops the import and 2D CDN users
  // do not download Three.js. ESM and the playground keep the real dynamic import.
  if (__YK_PET_UMD__) {
    throw new Error('Load the YkPet3D script before <yk-pet> to use the 3D renderer.')
  }
  return import('@yk-pet/3d') as Promise<Factory3D>
}

export function defineYkPet(tag = 'yk-pet'): void {
  if (typeof customElements === 'undefined') return
  if (!customElements.get(tag)) customElements.define(tag, YkPetElement)
}

if (typeof customElements !== 'undefined') defineYkPet()
