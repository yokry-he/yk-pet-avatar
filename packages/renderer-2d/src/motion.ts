/** Stateless sampling makes snapshots and manually driven renders reproducible. */
function noise(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}
function blinkPulse(time: number, start: number): number {
  const phase = (time - start) / 0.2
  return phase <= 0 || phase >= 1 ? 1 : 1 - Math.sin(phase * Math.PI) ** 2
}
/** Irregular 4.2–7.4 second intervals, occasionally followed by a second blink. */
export function naturalBlink(time: number, reducedMotion = false): number {
  if (reducedMotion) return 1
  const t = Math.max(0, time)
  const cycle = Math.floor(t / 5.8)
  const local = t - cycle * 5.8
  const start = 2.4 + noise(cycle) * 1.6
  const first = blinkPulse(local, start)
  return noise(cycle + 17) < 0.3 ? Math.min(first, blinkPulse(local, start + 0.31)) : first
}
/** Upper and lower lids converge on the same resting line during a blink. */
export function eyeLids(radius: number, expressionOpen: number, blink: number) {
  const open = Math.max(0, Math.min(1, expressionOpen))
  const upperRest = -radius + radius * 2 * (1 - open)
  const restingLine = Math.min(2, radius * 0.2)
  return {
    upper: upperRest + (restingLine - upperRest) * (1 - blink),
    lower: radius - (radius - restingLine) * (1 - blink),
  }
}
export function idleMotion(time: number, reducedMotion = false) {
  const t = reducedMotion ? 0 : Math.max(0, time)
  const breath = Math.sin(t * 1.85)
  const cycle = Math.floor(t / 6.8)
  const twitchTime = t - cycle * 6.8 - 1.5 - noise(cycle + 4) * 2
  const twitch = twitchTime > 0 && twitchTime < 0.65
    ? Math.sin(twitchTime / 0.65 * Math.PI) ** 2 * Math.sin(twitchTime * 22) * 0.085 : 0
  return {
    bob: breath * 0.65, squashX: 1 + breath * 0.006, squashY: 1 - breath * 0.009,
    tail: Math.sin(t * 1.35) * 0.065,
    head: Math.sin(t * 0.47) * 0.022 + Math.sin(t * 0.83) * 0.008, ear: twitch,
  }
}
