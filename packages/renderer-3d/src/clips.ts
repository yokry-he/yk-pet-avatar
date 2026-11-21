import type { PetAction } from '@yk-pet/core'

const ALIASES: Record<string, string[]> = {
  idle: ['idle', 'stand', 'wait', 'breath'],
  walk: ['walk', 'run', 'locomotion'],
  sleep: ['sleep', 'rest', 'lie', 'lay'],
  happy: ['happy', 'joy', 'cheer'],
  sad: ['sad', 'depress'],
  thinking: ['think', 'ponder'],
  talking: ['talk', 'speak', 'mouth'],
  eating: ['eat', 'chew'],
  wave: ['wave', 'greet'],
  jump: ['jump', 'hop'],
  petting: ['pet', 'pat'],
  working: ['work', 'type'],
  success: ['success', 'win'],
  error: ['error', 'fail'],
  dragged: ['drag', 'surprise', 'shock'],
}

function clipNameMatches(name: string, alias: string): boolean {
  const lower = name.toLowerCase()
  if (alias.length >= 4) return lower.includes(alias)
  return new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`).test(lower)
}

/** Explicit mapping, then an alias, then the model's idle clip for unsupported actions. */
export function resolveClipName(
  names: readonly string[],
  action: string,
  map?: Partial<Record<PetAction, string>>,
): string | null {
  const listed = map?.[action as PetAction]
  if (listed && names.includes(listed)) return listed
  const aliases = ALIASES[action] ?? [action]
  const found = names.find(name => aliases.some(alias => clipNameMatches(name, alias)))
  if (found) return found
  const idle = map?.idle
  if (idle && names.includes(idle)) return idle
  return names.find(name => ALIASES.idle!.some(alias => clipNameMatches(name, alias))) ?? null
}

/** Seconds within a looping clip. Shared by held previews and animation playback. */
export function clipSampleTime(duration: number, seconds: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds)) return 0
  return Math.max(0, seconds) % duration
}
