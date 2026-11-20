import { describe, expect, it } from 'vitest'
import {
  ACTION_CATALOG,
  DEFAULT_SOCKETS,
  Pet,
  applyEasing,
  sampleClip,
  sampleSequence,
  socketForAccessory,
  PetStateMachine,
  STYLE_PRESETS,
  chooseAutonomousAction,
  coerceStyleId,
  defaultConfig,
  evaluateRenderer,
  getStyle,
  gradeHex,
  listStyles,
  parsePetConfig,
  presetConfig,
  PRESET_COLORS,
  resolveExpression,
  resolveQualityTier,
  resolveBodyPose,
  serializePetConfig,
  styledProportions,
} from '../src/index'

describe('config schema', () => {
  it('reproduces the cream/lavender reference palette without default neckwear', () => {
    const config = presetConfig('lavender')
    expect(config.species).toBe('fox')
    expect(config.appearance.colors).toEqual(PRESET_COLORS.lavender!.colors)
    expect(config.appearance.accessories).toEqual([])
    config.appearance.colors.body = '#000000'
    expect(PRESET_COLORS.lavender!.colors.body).toBe('#f7efdf')
  })
  it('fills a kawaii default', () => {
    const { config, issues } = parsePetConfig({})
    expect(config.schemaVersion).toBe(1)
    expect(config.style).toBe('kawaii')
    expect(config.name).toBe('小云')
    expect(config.renderer.quality).toBe('auto')
    expect(issues).toEqual([])
  })

  it('accepts owner style indexes and names', () => {
    expect(parsePetConfig({ style: 1 }).config.style).toBe('kawaii')
    expect(parsePetConfig({ style: '4' }).config.style).toBe('anime')
    expect(parsePetConfig({ style: 5 }).config.style).toBe('plush')
    expect(parsePetConfig({ style: 'glassmorphism' }).config.style).toBe('glass')
    const bad = parsePetConfig({ style: 'watercolor' })
    expect(bad.config.style).toBe('kawaii')
    expect(bad.issues.some(issue => issue.path === 'style')).toBe(true)
  })

  it('clamps proportions and rejects a bad color', () => {
    const parsed = parsePetConfig({
      appearance: { colors: { body: 'nope' }, proportions: { eyeScale: 9 } },
    })
    expect(parsed.config.appearance.colors.body).toBe(defaultConfig().appearance.colors.body)
    expect(parsed.config.appearance.proportions.eyeScale).toBe(1.8)
    expect(parsed.issues.length).toBeGreaterThan(0)
  })

  it('round-trips through JSON', () => {
    const config = parsePetConfig({ name: '团子', style: 'anime', species: 'cat' }).config
    const again = parsePetConfig(JSON.parse(serializePetConfig(config))).config
    expect(again.name).toBe('团子')
    expect(again.style).toBe('anime')
    expect(again.species).toBe('cat')
  })

  it('keeps live stats when a color patch has no stats', () => {
    let now = 0
    const pet = new Pet({ behavior: { autonomous: false, stats: { mood: 10, energy: 10, hunger: 10 } } }, { now: () => now })
    pet.setStats({ mood: 80 })
    pet.setConfig({ appearance: { colors: { body: '#112233' } } })
    expect(pet.stats.mood).toBe(80)
    expect(pet.getConfig().appearance.colors.body).toBe('#112233')
    now = 1
  })
})

describe('styles', () => {
  it('covers the four owner presets and leaves 2 and 3 unused', () => {
    expect(listStyles().map(style => style.index)).toEqual([1, 4, 5, 6])
    expect(STYLE_PRESETS.kawaii.support).toEqual({ d2: 'full', d3: 'full' })
    expect(STYLE_PRESETS.anime.material.mode).toBe('toon')
    expect(STYLE_PRESETS.anime.support.d2).toBe('full')
    expect(STYLE_PRESETS.plush.material.mode).toBe('fur')
    expect(STYLE_PRESETS.plush.support.d2).toBe('approx')
    expect(STYLE_PRESETS.plush.material.furShells.low).toBeLessThan(STYLE_PRESETS.plush.material.furShells.high)
    expect(STYLE_PRESETS.glass.material.mode).toBe('glass')
    expect(STYLE_PRESETS.glass.support.d2).toBe('approx')
    expect(STYLE_PRESETS.glass.platform).toBe('ring')
    expect(getStyle(undefined).id).toBe('kawaii')
    expect(coerceStyleId('cel')).toBe('anime')
  })

  it('grades colors and proportions without losing the user slider', () => {
    const graded = gradeHex('#ff0000', { lightness: 0, saturation: 1, warmth: 0 })
    expect(graded).toMatch(/^#[0-9a-f]{6}$/)
    const proportions = styledProportions(defaultConfig().appearance.proportions, STYLE_PRESETS.kawaii)
    expect(proportions.eyeScale).toBeGreaterThan(1.2)
  })

  it('drops fur quality on weak devices', () => {
    expect(resolveQualityTier('auto', { deviceMemoryGb: 2 })).toBe('low')
    expect(resolveQualityTier('auto', { deviceMemoryGb: 16, hardwareConcurrency: 8 })).toBe('high')
    expect(resolveQualityTier('low', { deviceMemoryGb: 32 })).toBe('low')
  })
})

describe('motion and state machine', () => {
  it('sleeps the eyes and smiles when happy', () => {
    const sleep = resolveExpression({ action: 'sleep', emotion: 'neutral', speaking: false, time: 1 })
    expect(sleep.eyeOpen).toBeLessThan(0.15)
    const happy = resolveExpression({ action: 'idle', emotion: 'happy', speaking: false, time: 0.2 })
    expect(happy.smile).toBeGreaterThan(0.5)
    const talk = resolveExpression({ action: 'talking', emotion: 'neutral', speaking: true, time: 0.2 })
    expect(talk.mouthOpen).toBeGreaterThan(0.2)
    const love = resolveExpression({ action: 'idle', emotion: 'love', speaking: false, time: 0.2 })
    expect(love.heartEyes).toBe(true)
  })

  it('jumps unless motion is reduced', () => {
    expect(resolveBodyPose('jump', 0.4, false).jump).toBeGreaterThan(10)
    expect(resolveBodyPose('jump', 0.4, true).jump).toBe(0)
    expect(resolveBodyPose('wave', 0.2).wave).toBe(1)
  })

  it('lets a drag interrupt a jump, and nothing else', () => {
    const machine = new PetStateMachine()
    expect(machine.play('jump', 0)).toBe(true)
    expect(machine.play('wave', 0.1)).toBe(false)
    expect(machine.action).toBe('jump')
    expect(machine.play('dragged', 0.2, { reason: 'drag', hold: true, interruptible: false })).toBe(true)
    expect(machine.action).toBe('dragged')
    expect(ACTION_CATALOG.jump.interruptible).toBe(false)
    expect(ACTION_CATALOG.wave.interruptible).toBe(true)
  })

  it('maps agent states onto actions and emotions', () => {
    const machine = new PetStateMachine()
    machine.setAgentState('thinking', 0)
    expect(machine.action).toBe('thinking')
    expect(machine.emotion).toBe('focused')
    machine.setAgentState('success', 1)
    expect(machine.action).toBe('success')
    expect(machine.emotion).toBe('happy')
    machine.expire(4)
    expect(machine.action).toBe('idle')
  })

  it('picks eating and sleep from stats', () => {
    expect(chooseAutonomousAction({ hunger: 90, energy: 80, mood: 50 }, () => 0)).toBe('eating')
    expect(chooseAutonomousAction({ hunger: 10, energy: 5, mood: 50 }, () => 0)).toBe('sleep')
    expect(chooseAutonomousAction({ hunger: 10, energy: 80, mood: 10 }, () => 0)).toBe('sad')
  })
})

describe('agent API', () => {
  it('streams speech and then closes it', () => {
    let now = 10
    const pet = new Pet({ behavior: { autonomous: false } }, { now: () => now })
    const phases: string[] = []
    pet.on('speech', event => phases.push(event.phase))
    const handle = pet.say('你', { streaming: true })
    handle.append('好')
    expect(pet.getVisualState().speech?.text).toBe('你好')
    expect(pet.getVisualState().speaking).toBe(true)
    expect(pet.action).toBe('talking')
    handle.end()
    now = 30
    pet.tick()
    expect(pet.getVisualState().speech).toBeNull()
    expect(phases).toContain('end')
  })

  it('exposes a yk-pets compatible visual state', () => {
    const pet = new Pet({ behavior: { autonomous: false } })
    pet.lookAt(2, -2)
    pet.setEmotion('shy')
    pet.play('wave')
    const state = pet.getVisualState()
    expect(state.behavior).toBe('wave')
    expect(state.emotion).toBe('shy')
    expect(state.pointer).toEqual({ x: 1.5, y: -1.5 })
    expect(typeof state.score).toBe('number')
    expect(state.style).toBe('kawaii')
  })

  it('eats on its own when hunger is high', () => {
    let now = 0
    const pet = new Pet({
      behavior: {
        autonomous: true,
        decisionInterval: 1,
        stats: { mood: 60, energy: 80, hunger: 90 },
      },
    }, { now: () => now, random: () => 0.99 })
    pet.tick()
    now = 0.2
    pet.tick()
    expect(pet.action).toBe('eating')
  })

  it('rejects unknown actions', () => {
    const pet = new Pet()
    expect(() => pet.play('fly')).toThrow(/Unknown action/)
    expect(() => pet.setState('confused')).toThrow(/Unknown agent state/)
  })
})

describe('adaptive selection', () => {
  it('matches the yk-pets fallback reasons', () => {
    expect(evaluateRenderer({ webglSupported: false }).reason).toBe('webgl-unsupported')
    expect(evaluateRenderer({ webglSupported: true, webglContextLost: true }).reason).toBe('webgl-context-lost')
    expect(evaluateRenderer({ webglSupported: true, preference: '2d' }).target).toBe('2d')
    expect(evaluateRenderer({ webglSupported: true, preference: '3d' }).reason).toBe('manual-3d')
    expect(evaluateRenderer({ webglSupported: true, reducedMotion: true }).reason).toBe('reduced-motion')
    expect(evaluateRenderer({ webglSupported: true, averageFps: 12 }).reason).toBe('low-fps')
    expect(evaluateRenderer({ webglSupported: true, deviceMemoryGb: 8 }).target).toBe('3d')
  })
})

describe('clip tracks and sockets', () => {
  it('eases, snaps frames, and blends sequenced clips', () => {
    expect(applyEasing(0.5, 'easeIn')).toBeCloseTo(0.25)
    expect(applyEasing(0.5, 'step')).toBe(0)
    const clip = {
      id: 'wave-extra',
      action: 'wave' as const,
      duration: 1,
      tracks: [{
        id: 'paw',
        kind: 'bone' as const,
        target: 'bone-paw-r',
        property: 'rotation.z',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 1, easing: 'linear' as const },
        ],
      }],
    }
    expect(sampleClip(clip, 0.5)[0]?.value).toBeCloseTo(0.5)
    expect(sampleClip({ ...clip, mode: 'frame', fps: 2 }, 0.6)[0]?.value).toBeCloseTo(0)
    const next = { ...clip, id: 'rest', tracks: [{ ...clip.tracks[0]!, keyframes: [{ time: 0, value: 1 }, { time: 1, value: 1 }] }] }
    const blended = sampleSequence([clip, next], { id: 'seq', steps: [{ clipId: 'wave-extra', blend: 0 }, { clipId: 'rest', blend: 0.4 }] }, clip.duration - 0.2)
    expect(blended[0]?.value).toBeGreaterThan(0)
    expect(blended[0]?.value).toBeLessThan(1)
  })

  it('names sockets and lets a clip ride on play()', () => {
    expect(DEFAULT_SOCKETS.map(socket => socket.id)).toContain('neck')
    expect(socketForAccessory('bow').bone).toBe('bone-neck')
    let now = 0
    const pet = new Pet({
      behavior: { autonomous: false },
      clips: [{
        id: 'wave',
        action: 'wave',
        duration: 1,
        tracks: [{
          id: 'paw',
          kind: 'bone',
          target: 'bone-paw-r',
          property: 'rotation.z',
          keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1, easing: 'linear' }],
        }],
      }],
    }, { now: () => now })
    pet.play('wave')
    now = 0.5
    const channel = pet.getVisualState().channels?.find(item => item.target === 'bone-paw-r')
    expect(channel?.value).toBeCloseTo(0.5)
    expect(pet.getVisualState().sockets?.some(socket => socket.bone === 'bone-head')).toBe(true)
    expect(pet.playSequence('missing')).toBe(false)
  })
})
