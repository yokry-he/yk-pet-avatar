import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pet } from '@yk-pet/core'
import { ThreePetRenderer } from '../src/renderer'
import { Canvas2DPetRenderer } from '../../renderer-2d/src/renderer'

afterEach(() => vi.unstubAllGlobals())

describe('procedural action clock', () => {
  it.each([ThreePetRenderer, Canvas2DPetRenderer])('keeps %s aligned with timed core actions after a slow frame', (Renderer) => {
    let frame: FrameRequestCallback = () => {}
    let now = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const pet = new Pet({ behavior: { autonomous: false }, renderer: { quality: 'low' }, appearance: { pose: 'anthro' } }, { now: () => now })
    const renderer = new Renderer({ onFrame: () => pet.tick(), getState: () => pet.getVisualState() })
    renderer.start()
    frame(100)
    pet.play('wave')
    now = 0.6
    frame(700) // SwiftShader can take much longer than the old 50 ms clock cap.
    expect(renderer.snapshot().payload).toMatchObject({ elapsed: 0.6 })
    expect(renderer.snapshot().state?.behavior).toBe('wave')
    now = 2
    frame(2100)
    expect(renderer.snapshot().state?.behavior).toBe('idle')
    renderer.dispose()
  })
})
