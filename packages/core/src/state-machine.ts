/**
 * 文件职责 / File responsibility
 * 动作锁：定时动作、Agent 挂起、拖拽和自主行为互相打断的规则。
 * Action locks: how timed actions, agent holds, drags, and autonomy interrupt each other.
 */

import type { AgentState, Emotion, PetAction } from './types'

export type LockReason = 'user' | 'auto' | 'agent' | 'speech' | 'drag'

export interface ActionLock {
  reason: LockReason
  /** Null means the lock is held until `release`. */
  until: number | null
  interruptible: boolean
}

export interface PlayOptions {
  reason?: LockReason
  hold?: boolean
  seconds?: number
  interruptible?: boolean
}

interface ActionSpec {
  seconds: number
  hold: boolean
  interruptible: boolean
}

export const ACTION_CATALOG: Record<PetAction, ActionSpec> = {
  idle: { seconds: 0, hold: false, interruptible: true },
  walk: { seconds: 2.8, hold: false, interruptible: true },
  sleep: { seconds: 0, hold: true, interruptible: true },
  happy: { seconds: 2.2, hold: false, interruptible: true },
  sad: { seconds: 2.4, hold: false, interruptible: true },
  thinking: { seconds: 0, hold: true, interruptible: true },
  talking: { seconds: 0, hold: true, interruptible: true },
  eating: { seconds: 2.6, hold: false, interruptible: false },
  dragged: { seconds: 0, hold: true, interruptible: false },
  wave: { seconds: 1.8, hold: false, interruptible: true },
  jump: { seconds: 0.85, hold: false, interruptible: false },
  petting: { seconds: 1.5, hold: false, interruptible: true },
  working: { seconds: 0, hold: true, interruptible: true },
  success: { seconds: 2.1, hold: false, interruptible: true },
  error: { seconds: 2.2, hold: false, interruptible: true },
}

const PRIORITY: Record<LockReason, number> = {
  auto: 1,
  speech: 2,
  user: 3,
  agent: 3,
  drag: 4,
}

export const AGENT_ACTION: Record<AgentState, { action: PetAction; emotion: Emotion; hold: boolean; seconds: number }> = {
  idle: { action: 'idle', emotion: 'neutral', hold: false, seconds: 0 },
  thinking: { action: 'thinking', emotion: 'focused', hold: true, seconds: 0 },
  working: { action: 'working', emotion: 'focused', hold: true, seconds: 0 },
  success: { action: 'success', emotion: 'happy', hold: false, seconds: 2.1 },
  error: { action: 'error', emotion: 'sad', hold: false, seconds: 2.2 },
}

export class PetStateMachine {
  action: PetAction = 'idle'
  emotion: Emotion = 'neutral'
  agentState: AgentState = 'idle'
  lock: ActionLock | null = null

  isLocked(now: number): boolean {
    if (!this.lock) return false
    if (this.lock.until !== null && now >= this.lock.until) return false
    return true
  }

  canReplace(reason: LockReason, now: number): boolean {
    if (!this.isLocked(now)) return true
    if (!this.lock) return true
    if (reason === 'drag') return true
    if (!this.lock.interruptible) return false
    return PRIORITY[reason] >= PRIORITY[this.lock.reason]
  }

  play(action: PetAction, now: number, opts: PlayOptions = {}): boolean {
    const reason = opts.reason ?? 'user'
    if (!this.canReplace(reason, now)) return false
    const spec = ACTION_CATALOG[action]
    this.action = action
    const hold = opts.hold ?? spec.hold
    const seconds = opts.seconds ?? spec.seconds
    const interruptible = opts.interruptible ?? spec.interruptible
    if (!hold && seconds <= 0) {
      this.lock = null
    } else {
      this.lock = {
        reason,
        until: hold ? null : now + seconds,
        interruptible,
      }
    }
    return true
  }

  setEmotion(emotion: Emotion): Emotion {
    const previous = this.emotion
    this.emotion = emotion
    return previous
  }

  setAgentState(state: AgentState, now: number): boolean {
    this.agentState = state
    const mapped = AGENT_ACTION[state]
    this.emotion = mapped.emotion
    if (state === 'idle') {
      if (this.lock?.reason === 'agent') this.release('agent')
      else this.play('idle', now, { reason: 'agent', hold: false, seconds: 0 })
      return true
    }
    return this.play(mapped.action, now, {
      reason: 'agent',
      hold: mapped.hold,
      seconds: mapped.seconds,
      interruptible: true,
    })
  }

  release(reason?: LockReason): boolean {
    if (this.lock && reason && this.lock.reason !== reason) return false
    this.lock = null
    this.action = 'idle'
    return true
  }

  /** Drop a timed lock and return to idle. Returns true when a lock expired. */
  expire(now: number): boolean {
    if (!this.lock || this.lock.until === null || now < this.lock.until) return false
    this.lock = null
    this.action = 'idle'
    return true
  }
}
