import { describe, expect, it } from 'vitest'
import { spriteFrame } from '../src/sprites'
import { createCanvas2DRendererFactory } from '../src/index'

describe('sprite frames', () => {
  it('loops and stays on a single frame', () => {
    expect(spriteFrame(0, 4, 8)).toBe(0)
    expect(spriteFrame(0.2, 4, 8)).toBe(1)
    expect(spriteFrame(0.5, 4, 8)).toBe(0)
    expect(spriteFrame(3, 1, 8)).toBe(0)
  })

  it('advertises a 2d factory', () => {
    expect(createCanvas2DRendererFactory().kind).toBe('2d')
  })
})
