import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { APRICOT_COLORS, DEFAULT_PROPORTIONS, SPECIES_PART_DEFAULTS, type PetVisualState } from '@yk-pet/core'
import { cameraFit, earSurface, pillowSurface, sculptedForm, sweptTail, visualBounds } from '../src/sculpt'
import { createProceduralPet, inflate } from '../src/procedural'

const state = (
  style: PetVisualState['style'] = 'kawaii',
  species: 'fox' | 'cat' | 'bunny' = 'fox',
): PetVisualState => ({
  style,
  behavior: 'idle',
  reducedMotion: true,
  appearance: {
    species,
    colors: APRICOT_COLORS,
    proportions: DEFAULT_PROPORTIONS,
    parts: SPECIES_PART_DEFAULTS[species],
    accessories: [],
  },
})

describe('sculpted surfaces', () => {
  it('produces finite positions, normals and UVs at roots and pointed tips', () => {
    const geometries = [
      sculptedForm('head'),
      sculptedForm('body'),
      earSurface(0.6, 0.22, 0.1),
      sweptTail(),
      pillowSurface(
        [
          [-1, 0],
          [0, 1],
          [1, 0],
          [0, -1],
        ],
        (_x, _y, r) => 0.2 * (1 - r * r),
      ),
    ]
    for (const geometry of geometries) {
      for (const key of ['position', 'normal', 'uv']) {
        expect([...geometry.getAttribute(key).array].every(Number.isFinite)).toBe(true)
      }
      geometry.computeBoundingBox()
      expect(geometry.boundingBox!.isEmpty()).toBe(false)
      geometry.dispose()
    }
  })
  it('keeps the curved tail to two material draws with a cream tip', () => {
    const tail = sweptTail()
    expect(tail.groups.map((g) => g.materialIndex)).toEqual([0, 1])
    expect(tail.groups.reduce((n, g) => n + g.count, 0)).toBe(tail.index!.count)
    tail.computeBoundingBox()
    expect(tail.boundingBox!.max.y).toBeGreaterThan(0.85)
    const position = tail.getAttribute('position'),
      normal = tail.getAttribute('normal')
    const center = new THREE.Vector3()
    const row = 20,
      radial = 24
    for (let i = 0; i < radial; i++)
      center.add(new THREE.Vector3().fromBufferAttribute(position, row * (radial + 1) + i))
    center.divideScalar(radial)
    for (let i = 0; i < radial; i++) {
      const index = row * (radial + 1) + i
      const offset = new THREE.Vector3().fromBufferAttribute(position, index).sub(center)
      expect(offset.dot(new THREE.Vector3().fromBufferAttribute(normal, index))).toBeGreaterThan(0)
    }
    tail.dispose()
  })
  it('ignores hidden surfaces and atmospheric effects when framing', () => {
    const group = new THREE.Group(),
      material = new THREE.MeshBasicMaterial()
    const character = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material)
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), material)
    halo.userData.ignoreFraming = true
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), material)
    hidden.visible = false
    group.add(character, halo, hidden)
    expect(visualBounds(group).getSize(new THREE.Vector3()).toArray()).toEqual([1, 2, 1])
    for (const mesh of [character, halo, hidden]) mesh.geometry.dispose()
    material.dispose()
  })
  it.each([0.45, 1, 1.54, 3])('fits both viewport axes at aspect %s', (aspect) => {
    const distance = cameraFit(2.1, 2.5, aspect)
    const vertical = distance * Math.tan(THREE.MathUtils.degToRad(16))
    expect(vertical).toBeGreaterThanOrEqual((2.5 / 2) * 1.19)
    expect(vertical * aspect).toBeGreaterThanOrEqual((2.1 / 2) * 1.19)
  })
})

describe('procedural rig and materials', () => {
  it.each(['kawaii', 'anime', 'plush', 'glass'] as const)(
    'stands on grounded hind feet across every %s species and preserves expression cues',
    (style) => {
      for (const species of ['fox', 'cat', 'bunny', 'custom'] as const) {
        const next = {
          ...state(style),
          appearance: { ...state(style).appearance!, species, parts: SPECIES_PART_DEFAULTS[species], pose: 'stand' as const },
        }
        const pet = createProceduralPet(next, 'low')
        expect(pet.poseBlend).toBe(1)
        expect(pet.group.getObjectByName('bone-head')!.position.y).toBeGreaterThan(1.4)
        const feet: THREE.Mesh[] = []
        pet.group.traverse((node) => { if (node.name === 'mesh-hind-foot') feet.push(node as THREE.Mesh) })
        expect(feet).toHaveLength(2)
        for (const foot of feet) {
          const bounds = visualBounds(foot)
          expect(bounds.min.y).toBeGreaterThan(0)
          expect(bounds.min.y).toBeLessThan(0.03)
          const soleNormal = new THREE.Vector3(0, 0, 1).transformDirection(foot.matrixWorld)
          expect(soleNormal.y).toBeLessThan(-0.99)
          expect(foot.getObjectByName('hind-sole-pads')!.visible).toBe(false)
          expect(foot.getObjectByName('hind-toe-splits')!.visible).toBe(true)
          const torso = visualBounds(pet.group.getObjectByName('mesh-body')!)
          expect(torso.min.y - bounds.max.y).toBeGreaterThan(0.10)
        }
        pet.update({ ...next, emotion: 'happy' }, 1)
        expect(pet.group.getObjectByName('eye-happy-arc')!.visible).toBe(true)
        expect(pet.group.getObjectByName('eye-open')!.visible).toBe(false)
        expect(pet.group.getObjectByName('mesh-mouth-open')!.visible).toBe(true)
        pet.update({ ...next, emotion: 'love' }, 2)
        expect(pet.group.getObjectByName('eye-heart')!.visible).toBe(true)
        pet.update({ ...next, emotion: 'sad' }, 3)
        expect(pet.group.getObjectByName('eye-tear')!.visible).toBe(true)
        pet.update({ ...next, emotion: 'tired' }, 4)
        expect(pet.group.getObjectByName('eye-half-lid')!.visible).toBe(true)
        pet.update({ ...next, emotion: 'neutral' }, 5)
        expect(pet.group.getObjectByName('eye-half-lid')!.visible).toBe(false)
        expect(pet.group.getObjectByName('eye-tear')!.visible).toBe(false)
        pet.dispose()
      }
    },
  )
  it('blends an existing rig, reverses without snapping, and honors reduced motion', () => {
    const sit = { ...state(), reducedMotion: false }
    const stand = { ...sit, appearance: { ...sit.appearance!, pose: 'stand' as const } }
    const pet = createProceduralPet(sit, 'low')
    pet.update(stand, 0)
    pet.update(stand, 0.3)
    expect(pet.poseBlend).toBeCloseTo(0.5)
    const headY = pet.group.getObjectByName('bone-head')!.position.y
    pet.update(sit, 0.3)
    expect(pet.poseBlend).toBeCloseTo(0.5)
    expect(pet.group.getObjectByName('bone-head')!.position.y).toBe(headY)
    pet.update(sit, 0.9)
    expect(pet.poseBlend).toBe(0)
    pet.update({ ...stand, reducedMotion: true }, 0.9)
    expect(pet.poseBlend).toBe(1)
    pet.dispose()
  })
  it('keeps the feet above the floor throughout the transition and restores seated soles', () => {
    const sit = { ...state(), reducedMotion: false }
    const stand = { ...sit, appearance: { ...sit.appearance!, pose: 'stand' as const } }
    const pet = createProceduralPet(sit, 'low')
    pet.update(stand, 0)
    for (let i = 1; i <= 12; i++) {
      pet.update(stand, i * 0.05)
      pet.group.updateMatrixWorld(true)
      pet.group.traverse((foot) => {
        if (foot.name !== 'mesh-hind-foot') return
        // Rotated local bounding boxes include empty corners; check the actual surface vertices.
        foot.traverseVisible((node) => {
          const mesh = node as THREE.Mesh
          if (!mesh.geometry) return
          const position = mesh.geometry.getAttribute('position')
          const vertex = new THREE.Vector3()
          for (let j = 0; j < position.count; j++)
            expect(vertex.fromBufferAttribute(position, j).applyMatrix4(mesh.matrixWorld).y).toBeGreaterThan(0)
        })
      })
    }
    pet.update({ ...sit, reducedMotion: true }, 1)
    pet.group.traverse((node) => {
      if (node.name !== 'mesh-hind-foot') return
      expect(node.rotation.x).toBe(0)
      expect(node.scale.toArray()).toEqual([1, 1, 1])
      expect(node.getObjectByName('hind-sole-pads')!.visible).toBe(true)
      expect(node.getObjectByName('hind-toe-splits')!.visible).toBe(false)
    })
    pet.dispose()
  })
  it.each(['low', 'medium', 'high'] as const)('gates glass halos at %s quality and disposes them once', (tier) => {
    // Pin device capability so the result does not depend on the CI runner's core count.
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 })
    const pet = createProceduralPet(state('glass'), tier)
    vi.unstubAllGlobals()
    const resources = new Set<THREE.Material | THREE.BufferGeometry>()
    let halos = 0
    pet.group.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.name === 'glass-halo') {
        halos++
        expect(mesh.userData.ignoreFraming).toBe(true)
      }
      if (mesh.geometry) resources.add(mesh.geometry)
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      materials.forEach((material) => resources.add(material))
    })
    expect(halos > 0).toBe(tier !== 'low')
    const spies = [...resources].map((resource) => vi.spyOn(resource, 'dispose'))
    pet.dispose()
    pet.dispose()
    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1))
  })
  it('disables extra glass glow on a weak device even with explicit high quality', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 2, deviceMemory: 2 })
    try {
      const pet = createProceduralPet(state('glass'), 'high')
      expect(pet.group.getObjectByName('glass-halo')).toBeUndefined()
      pet.dispose()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('uses the normal attribute in basic and lit hull shaders, with distinct program keys', () => {
    const basic = new THREE.MeshBasicMaterial(),
      lit = new THREE.MeshStandardMaterial()
    inflate(basic, 0.007)
    inflate(lit, 0.02)
    for (const material of [basic, lit]) {
      const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>' }
      material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
      expect(shader.vertexShader).toContain('normalize(normal)')
      expect(shader.vertexShader).not.toContain('objectNormal')
    }
    expect(basic.customProgramCacheKey()).not.toBe(lit.customProgramCacheKey())
    basic.dispose()
    lit.dispose()
  })
  it.each(['kawaii', 'anime', 'plush', 'glass'] as const)(
    'creates, poses and disposes %s without DOM resources',
    (style) => {
      const pet = createProceduralPet(state(style), 'low')
      for (const emotion of [
        'neutral',
        'happy',
        'sad',
        'excited',
        'angry',
        'shy',
        'surprised',
        'love',
        'tired',
        'focused',
      ]) {
        pet.update({ ...state(style), emotion }, 4.08)
        pet.group.updateMatrixWorld(true)
        const box = visualBounds(pet.group)
        expect(box.max.y).toBeGreaterThan(1.9)
        expect(box.max.y).toBeLessThan(2.6)
        expect(box.min.y).toBeGreaterThan(-0.04)
      }
      const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
      pet.group.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.geometry) resources.add(mesh.geometry)
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : []) {
          resources.add(material)
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) resources.add(value)
        }
        if (node.name.startsWith('fur-shell-')) expect(node.name).toBe('fur-shell-1')
        if (
          mesh.material instanceof THREE.MeshPhysicalMaterial &&
          mesh.name === 'mesh-body' &&
          style === 'glass'
        )
          expect(mesh.material.transmission).toBe(0)
      })
      const spies = [...resources].map((resource) => vi.spyOn(resource, 'dispose'))
      pet.dispose()
      pet.dispose()
      spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1))
    },
  )
  it('retains cat and long-eared bunny variants and repeatable channel poses', () => {
    for (const species of ['cat', 'bunny'] as const) {
      const next = {
        ...state('kawaii', species),
        channels: [
          { kind: 'bone' as const, target: 'bone-paw-r', property: 'rotation.z' as const, value: 0.3 },
        ],
      }
      const pet = createProceduralPet(next, 'low')
      pet.update(next, 1)
      const paw = pet.group.getObjectByName('bone-paw-r')!
      const rotation = paw.rotation.z
      pet.update(next, 1)
      expect(paw.rotation.z).toBe(rotation)
      const ears = pet.group.getObjectByName('bone-ear-l')!
      expect(ears.children.length).toBeGreaterThan(0)
      pet.dispose()
    }
  })
})

describe('felt coat composition', () => {
  it.each(['low', 'medium', 'high'] as const)('keeps %s coat inflation, strand masks, and facial pigments in one shader', tier => {
    const pet = createProceduralPet({ ...state('plush'), appearance: { ...state('plush').appearance!, pose: 'anthro' } }, tier)
    const head = pet.group.getObjectByName('mesh-head') as THREE.Mesh
    const shell = head.getObjectByName('fur-shell-1') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    }
    shell.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
    expect(shader.uniforms).toHaveProperty('uGrow')
    expect(shader.uniforms).toHaveProperty('uFeltGrain')
    expect(shader.uniforms).toHaveProperty('uFaceBody')
    expect(shader.vertexShader).toContain('faceGroom')
    expect(shader.fragmentShader).toContain('woolGrain')
    expect(shader.fragmentShader).toContain('woolRim')
    expect(shell.material.depthWrite).toBe(false)
    expect(shell.geometry).toBe(head.geometry)
    if (tier === 'low') expect(head.children.filter(node => node.name.startsWith('fur-shell-'))).toHaveLength(1)
    if (tier === 'medium') expect(head.getObjectByName('fur-shell-4')).toBeDefined()
    if (tier === 'high') expect(head.getObjectByName('fur-shell-9')).toBeDefined()
    pet.dispose()
  })
})
