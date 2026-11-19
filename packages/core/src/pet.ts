/**
 * 文件职责 / File responsibility
 * Agent 面对的宠物。渲染器只消费 `getVisualState()`，不关心是谁在驱动。
 * The agent-facing pet. Renderers only consume `getVisualState()`.
 */

import { ClipPlayer, DEFAULT_SOCKETS } from './animation'
import { Emitter } from './events'
import { chooseAutonomousAction, clamp, resolveBodyPose, resolveExpression, stepStats } from './motion'
import { mergeConfig, parsePetConfig, serializePetConfig } from './schema'
import { PetStateMachine } from './state-machine'
import type {
  AgentState,
  Emotion,
  PetAction,
  PetConfig,
  PetEventMap,
  PetStats,
  PetVisualState,
  SayOptions,
  SpeechHandle,
  ValidationIssue,
} from './types'
import { isAgentState, isEmotion, isPetAction } from './schema'

export interface PetOptions {
  /** Clock in seconds. Tests inject a manual clock. */
  now?: () => number
  random?: () => number
}

interface SpeechState {
  id: number
  text: string
  kind: 'say' | 'think'
  streaming: boolean
  closeAt: number | null
}

function defaultNow(): number {
  return Date.now() / 1000
}

export class Pet {
  #config: PetConfig
  #issues: ValidationIssue[]
  #machine = new PetStateMachine()
  #stats: PetStats
  #events = new Emitter<PetEventMap>()
  #now: () => number
  #random: () => number
  #lastTick = 0
  #started = false
  #nextDecision = 0
  #speech: SpeechState | null = null
  #speechSeq = 0
  #pointer = { x: 0, y: 0 }
  #drag: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false }
  #secretMode: boolean
  #player = new ClipPlayer()
  #clipAction: PetAction | null = null

  constructor(input?: unknown, options: PetOptions = {}) {
    const parsed = parsePetConfig(input ?? {})
    this.#config = parsed.config
    this.#issues = parsed.issues
    this.#stats = { ...parsed.config.behavior.stats }
    this.#now = options.now ?? defaultNow
    this.#random = options.random ?? Math.random
    this.#secretMode = parsed.config.secretMode ?? false
    this.#player.replace(parsed.config.clips ?? [], parsed.config.sequences ?? [])
    this.#lastTick = this.#now()
  }

  get issues(): readonly ValidationIssue[] {
    return this.#issues
  }

  get action(): PetAction {
    return this.#machine.action
  }

  get emotion(): Emotion {
    return this.#machine.emotion
  }

  get agentState(): AgentState {
    return this.#machine.agentState
  }

  get stats(): PetStats {
    return { ...this.#stats }
  }

  on<K extends keyof PetEventMap>(type: K, listener: (event: PetEventMap[K]) => void): () => void {
    return this.#events.on(type, listener)
  }

  getConfig(): PetConfig {
    return structuredClone(this.#config)
  }

  setConfig(patch: unknown): ValidationIssue[] {
    const merged = mergeConfig(this.#config, patch)
    const parsed = parsePetConfig(merged)
    const previousStats = this.#stats
    this.#config = parsed.config
    this.#issues = parsed.issues
    this.#secretMode = parsed.config.secretMode ?? false
    this.#player.replace(parsed.config.clips ?? [], parsed.config.sequences ?? [])
    if (isRecord(patch) && isRecord(patch.behavior) && patch.behavior.stats) {
      this.#stats = { ...parsed.config.behavior.stats }
    } else {
      this.#stats = previousStats
      this.#config.behavior.stats = { ...previousStats }
    }
    this.#events.emit('change', { config: this.getConfig() })
    return parsed.issues
  }

  /** Replace stats without marking them as a config edit from the outside. */
  setStats(partial: Partial<PetStats>): PetStats {
    this.#stats = {
      mood: clamp(partial.mood ?? this.#stats.mood, 0, 100),
      energy: clamp(partial.energy ?? this.#stats.energy, 0, 100),
      hunger: clamp(partial.hunger ?? this.#stats.hunger, 0, 100),
    }
    this.#config.behavior.stats = { ...this.#stats }
    this.#events.emit('stats', this.stats)
    return this.stats
  }

  exportConfig(): string {
    this.#config.behavior.stats = { ...this.#stats }
    this.#config.secretMode = this.#secretMode
    return serializePetConfig(this.#config)
  }

  importConfig(json: string): ValidationIssue[] {
    const parsed = JSON.parse(json) as unknown
    const result = parsePetConfig(parsed)
    this.#config = result.config
    this.#issues = result.issues
    this.#stats = { ...result.config.behavior.stats }
    this.#secretMode = result.config.secretMode ?? false
    this.#player.replace(result.config.clips ?? [], result.config.sequences ?? [])
    this.#events.emit('change', { config: this.getConfig() })
    return result.issues
  }

  play(action: PetAction | string): boolean {
    if (!isPetAction(action)) throw new Error(`Unknown action "${action}"`)
    const now = this.#now()
    const previous = this.#machine.action
    const accepted = this.#machine.play(action, now, { reason: 'user' })
    if (!accepted) return false
    this.#armClip(this.#machine.action)
    if (previous !== this.#machine.action) {
      this.#events.emit('action', { action: this.#machine.action, previous })
    }
    return true
  }

  setEmotion(emotion: Emotion | string): void {
    if (!isEmotion(emotion)) throw new Error(`Unknown emotion "${emotion}"`)
    const previous = this.#machine.setEmotion(emotion)
    if (previous !== emotion) this.#events.emit('emotion', { emotion, previous })
  }

  setState(state: AgentState | string): boolean {
    if (!isAgentState(state)) throw new Error(`Unknown agent state "${state}"`)
    const now = this.#now()
    const previousAction = this.#machine.action
    const previousState = this.#machine.agentState
    const previousEmotion = this.#machine.emotion
    const accepted = this.#machine.setAgentState(state, now)
    if (previousState !== state) this.#events.emit('state', { state, previous: previousState })
    if (previousEmotion !== this.#machine.emotion) {
      this.#events.emit('emotion', { emotion: this.#machine.emotion, previous: previousEmotion })
    }
    this.#armClip(this.#machine.action)
    if (previousAction !== this.#machine.action) {
      this.#events.emit('action', { action: this.#machine.action, previous: previousAction })
    }
    return accepted
  }

  lookAt(x: number, y: number): void {
    this.#pointer = { x: clamp(x, -1.5, 1.5), y: clamp(y, -1.5, 1.5) }
  }

  /** Play a sequenced blend of clips. The studio that edits sequences is v0.2. */
  playSequence(id: string): boolean {
    return this.#player.playSequence(id, this.#now())
  }

  setSecretMode(on: boolean): void {
    this.#secretMode = on
    this.#config.secretMode = on
  }

  say(text: string, opts: SayOptions = {}): SpeechHandle {
    const now = this.#now()
    const id = ++this.#speechSeq
    const kind = opts.kind ?? 'say'
    const streaming = Boolean(opts.streaming)
    const duration = opts.duration ?? Math.min(8, 1.4 + text.length * 0.06)
    this.#speech = {
      id,
      text,
      kind,
      streaming,
      closeAt: streaming ? null : now + duration,
    }
    this.#adoptTalking(now)
    this.#events.emit('speech', { text, kind, phase: 'start' })
    return {
      id: String(id),
      append: (chunk: string) => this.#mutateSpeech(id, current => current + chunk),
      replace: (next: string) => this.#mutateSpeech(id, () => next),
      end: () => {
        if (!this.#speech || this.#speech.id !== id) return
        this.#speech.streaming = false
        const length = this.#speech.text.length
        this.#speech.closeAt = this.#now() + (opts.duration ?? Math.min(8, 1.2 + length * 0.05))
        this.#events.emit('speech', { text: this.#speech.text, kind, phase: 'update' })
      },
      close: () => this.#closeSpeech(id),
    }
  }

  /**
   * Advance stats, speech, and autonomous behavior to the current clock.
   * Renderers call this once per frame via the host, or tests call it directly.
   */
  tick(): void {
    const now = this.#now()
    const dt = this.#started ? now - this.#lastTick : 0
    this.#started = true
    this.#lastTick = now
    if (dt > 0) {
      const next = stepStats(this.#stats, this.#config.behavior.rates, dt, this.#machine.action)
      const changed = next.mood !== this.#stats.mood || next.energy !== this.#stats.energy || next.hunger !== this.#stats.hunger
      this.#stats = next
      if (changed) this.#events.emit('stats', this.stats)
    }
    this.#expireSpeech(now)
    this.#autonomous(now)
  }

  notifyClick(x: number, y: number): void {
    this.lookAt(x, y)
    this.#events.emit('click', { x, y })
  }

  notifyHover(x: number, y: number): void {
    if (this.#config.interaction.lookAtPointer) this.lookAt(x, y)
    this.#events.emit('hover', { x, y })
  }

  beginDrag(x: number, y: number): void {
    this.#drag = { x, y, active: true }
    const previous = this.#machine.action
    this.#machine.play('dragged', this.#now(), { reason: 'drag', hold: true, interruptible: false })
    this.#armClip('dragged')
    if (previous !== 'dragged') this.#events.emit('action', { action: 'dragged', previous })
    this.#events.emit('dragstart', { x, y })
  }

  updateDrag(x: number, y: number, dx: number, dy: number): void {
    this.#drag = { x, y, active: true }
    this.lookAt(x, y)
    this.#events.emit('drag', { x, y, dx, dy })
  }

  endDrag(x: number, y: number): void {
    this.#drag = { x: 0, y: 0, active: false }
    if (this.#machine.lock?.reason === 'drag') this.#machine.release('drag')
    const previous = this.#machine.action
    this.#machine.play('happy', this.#now(), { reason: 'auto', seconds: 0.9, interruptible: true })
    this.#armClip(this.#machine.action)
    if (previous !== this.#machine.action) this.#events.emit('action', { action: this.#machine.action, previous })
    this.#events.emit('dragend', { x, y })
  }

  notifyPet(x: number, y: number, intensity = 1): void {
    this.lookAt(x, y)
    const previous = this.#machine.action
    this.#machine.play('petting', this.#now(), { reason: 'user' })
    this.#armClip(this.#machine.action)
    if (previous !== 'petting') this.#events.emit('action', { action: 'petting', previous })
    this.setStats({ mood: this.#stats.mood + 4 * intensity })
    this.#events.emit('pet', { x, y, intensity })
  }

  getVisualState(): PetVisualState {
    const now = this.#now()
    const action = this.#machine.action
    const emotion = this.#machine.emotion
    const reduced = this.#config.renderer.reducedMotion
    const speaking = Boolean(this.#speech)
    return {
      behavior: action,
      emotion,
      speaking,
      score: this.#stats.mood,
      pointer: { ...this.#pointer },
      secretMode: this.#secretMode,
      reducedMotion: reduced,
      speech: this.#speech
        ? { text: this.#speech.text, kind: this.#speech.kind, streaming: this.#speech.streaming }
        : null,
      appearance: { ...this.#config.appearance, species: this.#config.species },
      stats: { ...this.#stats },
      agentState: this.#machine.agentState,
      drag: { ...this.#drag },
      sprite: this.#config.sprite,
      model: this.#config.model,
      style: this.#config.style,
      quality: this.#config.renderer.quality,
      finish: this.#config.appearance.finish,
      expression: resolveExpression({
        action,
        emotion,
        speaking,
        time: now,
        reducedMotion: reduced,
        dragActive: this.#drag.active,
      }),
      pose: resolveBodyPose(action, now, reduced, this.#drag.active),
      name: this.#config.name,
      channels: this.#channels(action, now),
      sockets: this.#config.sockets?.length ? this.#config.sockets : DEFAULT_SOCKETS,
      props: this.#config.props,
    }
  }

  #armClip(action: PetAction): void {
    this.#clipAction = action
    this.#player.playAction(action, this.#now())
  }

  #channels(action: PetAction, now: number) {
    if (this.#clipAction !== action) this.#armClip(action)
    const channels = this.#player.sample(now)
    return channels.length ? channels : undefined
  }

  dispose(): void {
    this.#events.clear()
    this.#speech = null
  }

  #adoptTalking(now: number): void {
    if (this.#machine.action === 'idle' || this.#machine.action === 'talking') {
      const previous = this.#machine.action
      this.#machine.play('talking', now, { reason: 'speech', hold: true, interruptible: true })
      this.#armClip(this.#machine.action)
      if (previous !== 'talking') this.#events.emit('action', { action: 'talking', previous })
    }
  }

  #mutateSpeech(id: number, update: (text: string) => string): void {
    if (!this.#speech || this.#speech.id !== id) return
    this.#speech.text = update(this.#speech.text).slice(0, 2000)
    this.#events.emit('speech', { text: this.#speech.text, kind: this.#speech.kind, phase: 'update' })
  }

  #closeSpeech(id: number): void {
    if (!this.#speech || this.#speech.id !== id) return
    const speech = this.#speech
    this.#speech = null
    if (this.#machine.lock?.reason === 'speech') {
      const previous = this.#machine.action
      this.#machine.release('speech')
      if (previous !== this.#machine.action) {
        this.#events.emit('action', { action: this.#machine.action, previous })
      }
    }
    this.#events.emit('speech', { text: speech.text, kind: speech.kind, phase: 'end' })
  }

  #expireSpeech(now: number): void {
    if (!this.#speech || this.#speech.streaming || this.#speech.closeAt === null) return
    if (now >= this.#speech.closeAt) this.#closeSpeech(this.#speech.id)
  }

  #autonomous(now: number): void {
    this.#machine.expire(now)
    if (!this.#config.behavior.autonomous) return
    const lock = this.#machine.lock
    if (lock?.reason === 'auto') {
      const wake = (this.#machine.action === 'sleep' && this.#stats.energy >= 68)
        || (this.#machine.action === 'eating' && this.#stats.hunger <= 28)
      if (wake) this.#machine.release('auto')
      else if (this.#machine.isLocked(now)) return
    } else if (this.#machine.isLocked(now)) {
      return
    }

    const urgent = this.#stats.hunger >= 75 || this.#stats.energy <= 20 || this.#stats.mood <= 25
    if (!urgent && now < this.#nextDecision && this.#machine.action !== 'idle') return
    if (!urgent && now < this.#nextDecision) return

    const next = chooseAutonomousAction(this.#stats, this.#random)
    this.#nextDecision = now + this.#config.behavior.decisionInterval
    if (next === this.#machine.action && this.#machine.action !== 'idle') return
    const previous = this.#machine.action
    this.#machine.play(next, now, { reason: 'auto' })
    this.#armClip(this.#machine.action)
    if (previous !== this.#machine.action) {
      this.#events.emit('action', { action: this.#machine.action, previous })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
