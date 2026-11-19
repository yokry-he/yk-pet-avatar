/**
 * 文件职责 / File responsibility
 * 程序化的部件宠物。同一套骨头，四套材质：软萌、赛璐璐、毛绒壳、玻璃。
 * Part-based procedural pet. One rig, four material treatments.
 */

import {
  channelValue,
  getStyle,
  gradeColors,
  resolveBodyPose,
  resolveExpression,
  resolveQualityTier,
  socketForAccessory,
  styledProportions,
  type PetAction,
  type PetColors,
  type PetVisualState,
  type QualityTier,
  type StylePreset,
} from '@yk-pet/core'
import * as THREE from 'three'

interface Tint {
  material: THREE.MeshStandardMaterial | THREE.MeshToonMaterial | THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial
  slot: keyof PetColors | 'outline' | 'glow'
}

export interface ProceduralPet {
  group: THREE.Group
  update(state: PetVisualState, time: number): void
  dispose(): void
}

const toonCache = new Map<string, THREE.DataTexture>()
let furTexture: THREE.CanvasTexture | null = null

export function createProceduralPet(state: PetVisualState, tier: QualityTier): ProceduralPet {
  const style = getStyle(state.style)
  const parts = state.appearance?.parts ?? { ears: 'pointy' as const, tail: 'fluffy' as const, eyes: 'round' as const, muzzle: 'short' as const }
  const species = state.appearance?.species ?? 'fox'
  const tints: Tint[] = []
  const group = new THREE.Group()
  const rig = new THREE.Group()
  group.add(rig)

  const hips = new THREE.Group()
  hips.name = 'bone-hips'
  rig.add(hips)
  const chest = new THREE.Group()
  chest.name = 'bone-chest'
  hips.add(chest)
  const neck = new THREE.Group()
  neck.name = 'bone-neck'
  neck.position.set(0, 0.28, 0.12)
  hips.add(neck)
  const head = new THREE.Group()
  head.name = 'bone-head'
  head.position.set(0, 0.62, 0.02)
  hips.add(head)

  const bodyMat = materialFor(style, '#ffffff', 'body')
  tints.push({ material: bodyMat, slot: 'body' })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 32, 24), bodyMat)
  body.name = 'mesh-body'
  body.scale.set(1.08, 0.9, 0.92)
  chest.add(body)
  outlineAndFur(chest, body, style, tier, tints)

  const bellyMat = materialFor(style, '#ffffff', 'belly')
  tints.push({ material: bellyMat, slot: 'belly' })
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), bellyMat)
  belly.position.set(0, -0.06, 0.24)
  belly.scale.set(1.05, 0.82, 0.62)
  chest.add(belly)

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 24), bodyMat)
  head.add(headMesh)
  outlineAndFur(head, headMesh, style, tier, tints)

  const earL = makeEar(head, -1, style, tints, parts.ears, tier)
  const earR = makeEar(head, 1, style, tints, parts.ears, tier)

  const snoutMat = materialFor(style, '#ffffff', 'belly')
  tints.push({ material: snoutMat, slot: 'belly' })
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), snoutMat)
  snout.position.set(0, -0.08, 0.3)
  snout.scale.set(1.15, 0.72, 1)
  head.add(snout)

  const noseMat = materialFor(style, '#ffffff', 'nose')
  tints.push({ material: noseMat, slot: 'nose' })
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), noseMat)
  nose.position.set(0, -0.02, 0.14)
  snout.add(nose)

  const eyeL = makeEye(head, -1, style)
  const eyeR = makeEye(head, 1, style)
  const blushMat = new THREE.MeshBasicMaterial({ color: '#ffb0b8', transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  const blushL = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), blushMat)
  blushL.position.set(-0.2, -0.05, 0.34)
  const blushR = blushL.clone()
  blushR.position.x = 0.2
  head.add(blushL, blushR)

  const tail = makeTail(hips, style, tints, parts.tail, species)
  const pawL = makePaw(hips, -1, bodyMat)
  const pawR = makePaw(hips, 1, bodyMat)

  const accessories = new THREE.Group()
  accessories.name = 'sockets'
  hips.add(accessories)
  buildAccessories(accessories, state.appearance?.accessories ?? [], state.props ?? [], style)

  if (species === 'cat' || species === 'bunny') addWhiskers(head)
  if (style.platform === 'ring') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.015, 12, 48),
      new THREE.MeshBasicMaterial({ color: style.palette.glow }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.02
    group.add(ring)
    const ring2 = ring.clone()
    ring2.material = (ring.material as THREE.MeshBasicMaterial).clone()
    ;(ring2.material as THREE.MeshBasicMaterial).color.set(style.palette.rim)
    ring2.scale.setScalar(0.62)
    group.add(ring2)
  } else {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 32),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16 }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.01
    group.add(shadow)
  }

  return {
    group,
    update(next, time) {
      const active = getStyle(next.style)
      const colors = gradeColors(next.appearance?.colors ?? {
        body: '#f39a52', belly: '#fff7f0', ear: '#ef8a42', innerEar: '#ffc7b8',
        eye: '#2c2428', accent: '#fffaf6', nose: '#ff8d9a', blush: '#ffb0b8',
      }, active.grade)
      const props = styledProportions(next.appearance?.proportions ?? {
        headScale: 1, bodyScale: 1, bodyLength: 1, earScale: 1, earScaleL: 1, earScaleR: 1,
        tailScale: 1, eyeScale: 1, snoutScale: 1, cheekScale: 1,
      }, active)
      const outline = next.finish?.outlineColor ?? (active.outline.followBody ? colors.body : active.outline.color)
      for (const tint of tints) {
        const color = tint.slot === 'outline' ? outline : tint.slot === 'glow' ? active.palette.glow : colors[tint.slot]
        if ('color' in tint.material) tint.material.color.set(color)
      }
      blushMat.color.set(colors.blush)
      blushMat.opacity = 0.15 + active.blush * 0.4 * (props.cheekScale)
      const action = (next.behavior || 'idle') as PetAction
      const reduced = Boolean(next.reducedMotion)
      const drag = Boolean(next.drag && next.drag.active)
      const pose = resolveBodyPose(action, time, reduced, drag)
      const expression = resolveExpression({
        action, emotion: (next.emotion as 'neutral') || 'neutral', speaking: Boolean(next.speaking),
        time, reducedMotion: reduced, dragActive: drag,
      })
      const seated = !['walk', 'jump', 'working', 'dragged'].includes(action)
      hips.position.y = seated ? 0.32 : 0.48
      hips.rotation.x = seated ? 0.18 : pose.lean
      hips.scale.set(props.bodyScale, props.bodyScale * props.bodyLength, props.bodyScale)
      hips.position.y += pose.bob * 0.01 + pose.jump * 0.012
      head.scale.setScalar(props.headScale)
      head.rotation.z = pose.lean * 0.8
      head.rotation.y = Math.sin(time * (pose.think ? 1.4 : 0.7)) * 0.08
      earL.scale.setScalar(props.earScale * props.earScaleL)
      earR.scale.setScalar(props.earScale * props.earScaleR)
      earL.rotation.z = 0.55 + pose.earTwitch + expression.earDrop * 0.35
      earR.rotation.z = -0.55 - pose.earTwitch - expression.earDrop * 0.35
      snout.scale.set(1.15 * props.snoutScale, 0.72 * props.snoutScale, props.snoutScale)
      const almond = next.appearance?.parts?.eyes === 'almond' || active.material.mode === 'toon'
      const dot = next.appearance?.parts?.eyes === 'dot' ? 0.62 : 1
      const eyeY = Math.max(0.08, expression.eyeOpen) * (almond ? 0.78 : 1) * dot
      const eyeX = props.eyeScale * (almond ? 1.12 : 1) * dot
      for (const eye of [eyeL, eyeR]) {
        eye.group.scale.set(eyeX, props.eyeScale * eyeY, props.eyeScale * dot)
        const pointer = next.pointer ?? { x: 0, y: 0 }
        eye.group.rotation.y = pointer.x * 0.45
        eye.group.rotation.x = pointer.y * 0.3
        eye.iris.color.set(expression.heartEyes ? '#ff5d8f' : colors.eye)
        if (active.material.mode === 'glass') {
          eye.iris.emissive?.set(active.palette.glow)
          eye.iris.emissiveIntensity = 0.6
        }
      }
      tail.rotation.y = pose.tailWag + (channelValue(next.channels, 'bone-tail', 'rotation.y') ?? 0)
      tail.rotation.z = (seated ? 0.95 : 0.25) + pose.tailLift
      head.rotation.z += channelValue(next.channels, 'bone-head', 'rotation.z') ?? 0
      pawR.rotation.z += channelValue(next.channels, 'bone-paw-r', 'rotation.z') ?? 0
      tail.scale.setScalar(props.tailScale)
      pawL.position.y = seated ? -0.02 : -0.42 + Math.sin(pose.pawPhase) * 0.06
      pawR.position.y = seated ? -0.02 : -0.42 - Math.sin(pose.pawPhase) * 0.06
      pawL.position.z = seated ? 0.32 : 0.12
      pawR.position.z = seated ? 0.32 : 0.12
      if (pose.wave > 0) {
        pawR.rotation.z = -1.1 + Math.sin(time * 12) * 0.4
        pawR.position.y = 0.15
      } else {
        pawR.rotation.z = 0
      }
      blushL.scale.setScalar(props.cheekScale)
      blushR.scale.setScalar(props.cheekScale)
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      group.traverse(obj => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) geometries.add(mesh.geometry)
        const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        list.forEach(material => materials.add(material))
      })
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
    },
  }
}

export function qualityFromState(state: PetVisualState): QualityTier {
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & { deviceMemory?: number }
  return resolveQualityTier(state.finish?.furQuality ?? state.quality, {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
  })
}

function makeEar(head: THREE.Group, side: number, style: StylePreset, tints: Tint[], ears: string, tier: QualityTier): THREE.Group {
  const bone = new THREE.Group()
  bone.name = side < 0 ? 'bone-ear-l' : 'bone-ear-r'
  bone.position.set(side * 0.18, 0.32, 0)
  bone.rotation.z = side * -0.35
  const height = ears === 'long' ? 0.78 : ears === 'round' || ears === 'floppy' ? 0.24 : 0.55
  const radius = ears === 'round' ? 0.14 : 0.12
  const geo = ears === 'round' || ears === 'floppy'
    ? new THREE.SphereGeometry(radius, 18, 14)
    : new THREE.ConeGeometry(radius, height, 16)
  const mat = materialFor(style, '#ffffff', 'ear')
  tints.push({ material: mat, slot: 'ear' })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = ears === 'floppy' ? 0.02 : height * 0.35
  if (ears === 'floppy') mesh.rotation.z = side * -0.9
  bone.add(mesh)
  outlineAndFur(bone, mesh, style, tier, tints)
  const innerMat = materialFor(style, '#ffffff', 'innerEar')
  tints.push({ material: innerMat, slot: 'innerEar' })
  const inner = new THREE.Mesh(
    ears === 'round' ? new THREE.SphereGeometry(radius * 0.55, 12, 10) : new THREE.ConeGeometry(radius * 0.55, height * 0.55, 12),
    innerMat,
  )
  inner.position.set(0, mesh.position.y * 0.85, 0.04)
  bone.add(inner)
  if (ears !== 'none') head.add(bone)
  return bone
}

function makeEye(head: THREE.Group, side: number, style: StylePreset) {
  const group = new THREE.Group()
  group.position.set(side * 0.15, 0.04, 0.3)
  const gloss = Math.max(0.05, 1 - style.material.gloss)
  const white = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 18, 14),
    new THREE.MeshPhysicalMaterial({ color: '#fffdfb', roughness: gloss, clearcoat: style.material.gloss, clearcoatRoughness: 0.08 }),
  )
  white.scale.set(1, 1.15, 0.5)
  const iris = new THREE.MeshStandardMaterial({ color: '#2c2428', roughness: gloss, metalness: 0.04, emissive: '#000000' })
  const irisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 12), iris)
  irisMesh.position.z = 0.045
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), new THREE.MeshBasicMaterial({ color: '#140e12' }))
  pupil.position.z = 0.075
  const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  highlight.position.set(-0.028, 0.03, 0.086)
  group.add(white, irisMesh, pupil, highlight)
  if (style.sparkle > 0.5) {
    const spark = highlight.clone()
    spark.scale.setScalar(0.55)
    spark.position.set(0.03, -0.02, 0.088)
    group.add(spark)
  }
  head.add(group)
  return { group, iris }
}

function makeTail(hips: THREE.Group, style: StylePreset, tints: Tint[], tail: string, species: string): THREE.Group {
  const bone = new THREE.Group()
  bone.name = 'bone-tail'
  bone.position.set(0.28, 0.02, -0.22)
  const mat = materialFor(style, '#ffffff', 'body')
  tints.push({ material: mat, slot: 'body' })
  const tip = materialFor(style, '#ffffff', 'accent')
  tints.push({ material: tip, slot: 'accent' })
  if (tail === 'none') {
    hips.add(bone)
    return bone
  }
  if (tail === 'thin' || species === 'cat' && tail === 'fluffy') {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.48, 6, 12), mat)
    mesh.rotation.x = Math.PI / 2.4
    mesh.position.z = -0.2
    bone.add(mesh)
  } else if (tail === 'puff' || tail === 'bob') {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(tail === 'bob' ? 0.1 : 0.16, 18, 14), tip)
    mesh.position.set(0, 0.05, -0.08)
    bone.add(mesh)
  } else {
    const radii = [0.16, 0.18, 0.15, 0.12]
    radii.forEach((radius, index) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), index === radii.length - 1 ? tip : mat)
      mesh.position.set(0, 0.04 * index, -0.16 * index)
      bone.add(mesh)
      if (index === 0) outlineAndFur(bone, mesh, style, 'low', tints)
    })
  }
  hips.add(bone)
  return bone
}

function makePaw(hips: THREE.Group, side: number, material: THREE.Material): THREE.Group {
  const bone = new THREE.Group()
  bone.name = side < 0 ? 'bone-paw-l' : 'bone-paw-r'
  bone.position.set(side * 0.2, -0.05, 0.28)
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), material)
  mesh.scale.set(1, 0.72, 1.15)
  bone.add(mesh)
  hips.add(bone)
  return bone
}

function addWhiskers(head: THREE.Group): void {
  const points: number[] = []
  for (const side of [-1, 1]) {
    for (const y of [-0.02, 0.02, 0.06]) {
      points.push(side * 0.12, y, 0.36, side * 0.38, y + side * 0.01, 0.34)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  head.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#6a584e' })))
}

function buildAccessories(
  parent: THREE.Group,
  accessories: { kind: string; color?: string; socket?: string }[],
  props: { id: string; socket: string; color?: string }[],
  style: StylePreset,
): void {
  for (const item of accessories) {
    const socket = socketForAccessory(item.kind, item.socket)
    const holder = new THREE.Group()
    holder.name = `socket-${socket.id}`
    holder.position.set(socket.position.x, socket.position.y - 0.08, socket.position.z)
    parent.add(holder)
    const color = new THREE.Color(item.color ?? '#8ed9cc')
    const mat = style.material.mode === 'glass'
      ? new THREE.MeshPhysicalMaterial({ color, transmission: 0.4, roughness: 0.2, emissive: color, emissiveIntensity: 0.2 })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.45 })
    if (item.kind === 'bow') {
      const left = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat)
      left.scale.set(1.4, 0.8, 0.5)
      left.position.x = -0.09
      const right = left.clone()
      right.position.x = 0.09
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat)
      holder.add(left, right, knot)
    } else if (item.kind === 'scarf') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 10, 20), mat)
      band.rotation.x = Math.PI / 2
      holder.add(band)
    } else if (item.kind === 'glasses') {
      const glass = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
      const l = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 16), glass)
      l.position.x = -0.12
      const r = l.clone()
      r.position.x = 0.12
      holder.add(l, r)
    } else if (item.kind === 'flower') {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mat)
      for (let i = 0; i < 5; i += 1) {
        const p = petal.clone()
        const a = (i / 5) * Math.PI * 2
        p.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.02)
        holder.add(p)
      }
    } else if (item.kind === 'hat') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 20), mat)
      brim.position.y = 0
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat)
      top.position.y = 0.1
      holder.add(brim, top)
    }
  }
  for (const prop of props) {
    const socket = socketForAccessory('prop', prop.socket)
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 10),
      new THREE.MeshStandardMaterial({ color: prop.color ?? '#7af0ff', roughness: 0.35 }),
    )
    bead.name = `prop-${prop.id}`
    bead.position.set(socket.position.x, socket.position.y - 0.08, socket.position.z + 0.05)
    parent.add(bead)
  }
}

function outlineAndFur(parent: THREE.Object3D, source: THREE.Mesh, style: StylePreset, tier: QualityTier, tints: Tint[]): void {
  const width = style.outline.width * 0.004 * (style.outline.passes > 0 ? 1 : 0)
  if (width > 0) {
    const mat = new THREE.MeshBasicMaterial({
      color: style.outline.color,
      side: THREE.BackSide,
      transparent: style.outline.opacity < 1,
      opacity: style.outline.opacity,
    })
    inflate(mat, width)
    const shell = new THREE.Mesh(source.geometry, mat)
    shell.position.copy(source.position)
    shell.rotation.copy(source.rotation)
    shell.scale.copy(source.scale)
    parent.add(shell)
    tints.push({ material: mat, slot: 'outline' })
    if (style.outline.passes === 2) {
      const soft = mat.clone()
      soft.opacity = 0.35
      inflate(soft, width * 1.8)
      const outer = new THREE.Mesh(source.geometry, soft)
      outer.position.copy(source.position)
      outer.rotation.copy(source.rotation)
      outer.scale.copy(source.scale)
      parent.add(outer)
      tints.push({ material: soft, slot: 'outline' })
    }
  }
  const shells = style.material.furShells[tier] ?? 0
  if (shells <= 0 || style.material.mode !== 'fur') return
  const tex = tier === 'low' ? null : furAlpha()
  for (let i = 1; i <= shells; i += 1) {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      transparent: true,
      opacity: tier === 'low' ? 0.28 : 0.22,
      alphaMap: tex ?? undefined,
      depthWrite: false,
    })
    inflate(mat, style.material.furLength * (i / shells))
    const shell = new THREE.Mesh(source.geometry, mat)
    shell.position.copy(source.position)
    shell.rotation.copy(source.rotation)
    shell.scale.copy(source.scale)
    parent.add(shell)
    tints.push({ material: mat, slot: 'body' })
  }
}

function inflate(material: THREE.Material, amount: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrow = { value: amount }
    shader.vertexShader = `uniform float uGrow;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n transformed += normalize(objectNormal) * uGrow;',
    )}`
  }
}

function materialFor(style: StylePreset, color: string, slot: string): THREE.MeshStandardMaterial | THREE.MeshToonMaterial | THREE.MeshPhysicalMaterial {
  const tint = new THREE.Color(color)
  if (style.material.mode === 'toon') {
    return new THREE.MeshToonMaterial({ color: tint, gradientMap: toonGradient(style) })
  }
  if (style.material.mode === 'glass') {
    return new THREE.MeshPhysicalMaterial({
      color: tint,
      roughness: slot === 'eye' ? 0.05 : style.material.roughness,
      metalness: style.material.metalness,
      transmission: style.material.transmission,
      thickness: style.material.thickness,
      ior: 1.35,
      transparent: true,
      iridescence: style.material.iridescence,
      iridescenceIOR: 1.25,
      emissive: new THREE.Color(style.palette.glow),
      emissiveIntensity: style.material.emissive,
      attenuationColor: tint,
      attenuationDistance: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    })
  }
  return new THREE.MeshStandardMaterial({
    color: tint,
    roughness: style.material.roughness,
    metalness: style.material.metalness,
    emissive: tint,
    emissiveIntensity: style.material.mode === 'fur' ? style.material.emissive : 0.03,
  })
}

function toonGradient(style: StylePreset): THREE.DataTexture {
  const key = `${style.material.toonBands}:${style.material.toonShadow}`
  const cached = toonCache.get(key)
  if (cached) return cached
  const bands = Math.max(2, style.material.toonBands)
  const data = new Uint8Array(bands)
  for (let i = 0; i < bands; i += 1) {
    const t = bands === 1 ? 1 : i / (bands - 1)
    data[i] = Math.round(style.material.toonShadow * 180 + t * (255 - style.material.toonShadow * 180))
  }
  const texture = new THREE.DataTexture(data, bands, 1)
  texture.format = THREE.RedFormat
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  toonCache.set(key, texture)
  return texture
}

function furAlpha(): THREE.CanvasTexture {
  if (furTexture) return furTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    furTexture = new THREE.CanvasTexture(canvas)
    return furTexture
  }
  const image = ctx.createImageData(128, 128)
  for (let i = 0; i < image.data.length; i += 4) {
    const solid = Math.random() > 0.42
    image.data[i] = 255
    image.data[i + 1] = 255
    image.data[i + 2] = 255
    image.data[i + 3] = solid ? 255 : 0
  }
  ctx.putImageData(image, 0, 0)
  furTexture = new THREE.CanvasTexture(canvas)
  furTexture.wrapS = THREE.RepeatWrapping
  furTexture.wrapT = THREE.RepeatWrapping
  furTexture.repeat.set(5, 5)
  return furTexture
}
