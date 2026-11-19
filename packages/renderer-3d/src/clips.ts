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

/** Pick a glTF clip name for a standard action. Explicit map wins, then a fuzzy alias. */
export function resolveClipName(
  names: readonly string[],
  action: string,
  map?: Partial<Record<PetAction, string>>,
): string | null {
  const listed = map?.[action as PetAction]
  if (listed && names.includes(listed)) return listed
  const aliases = ALIASES[action] ?? [action]
  const found = names.find(name => aliases.some(alias => clipNameMatches(name, alias)))
  return found ?? null
}
