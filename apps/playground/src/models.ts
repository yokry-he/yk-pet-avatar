import type { ModelConfig } from '@yk-pet/core'

/** Authored clips in the owner's fox. Other SDK actions resolve to idle. */
export const userFoxAnimations: ModelConfig['animations'] = {
  idle: 'idle', wave: 'wave', happy: 'happy', success: 'success',
  jump: 'jump', walk: 'walk', sleep: 'sleep',
  thinking: 'nod', error: 'shake', sad: 'shake',
}
