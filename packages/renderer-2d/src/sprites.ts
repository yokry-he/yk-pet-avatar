/** Which frame of a sprite strip is visible at `time` seconds. */
export function spriteFrame(time: number, frames: number, fps = 8): number {
  if (frames <= 1) return 0
  const rate = fps > 0 ? fps : 8
  return Math.floor(Math.max(0, time) * rate) % frames
}
