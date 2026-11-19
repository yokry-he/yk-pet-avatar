/** Sculpted, articulated chibi pets. Three.js stays behind the renderer's lazy entry. */
import {
  channelValue,
  getStyle,
  gradeColors,
  resolveBodyPose,
  resolveExpression,
  resolveQualityTier,
  socketForAccessory,
  styledProportions,
  SPECIES_PART_DEFAULTS,
  DEFAULT_PROPORTIONS,
  APRICOT_COLORS,
  type Emotion,
  type PetAction,
  type PetColors,
  type PetVisualState,
  type QualityTier,
  type StylePreset,
} from '@yk-pet/core'
import * as THREE from 'three'
import { earSurface, pillowSurface, sculptedForm, sweptTail } from './sculpt'

type PetMaterial = THREE.MeshStandardMaterial | THREE.MeshToonMaterial | THREE.MeshBasicMaterial
interface Tint {
  material: PetMaterial
  slot: keyof PetColors | 'outline'
}
export interface ProceduralPet {
  group: THREE.Group
  update(state: PetVisualState, time: number): void
  dispose(): void
}

export function createProceduralPet(state: PetVisualState, tier: QualityTier): ProceduralPet {
  const style = getStyle(state.style)
  const species = state.appearance?.species ?? 'fox'
  const parts = { ...SPECIES_PART_DEFAULTS[species], ...state.appearance?.parts }
  const tints: Tint[] = [],
    textures = new Set<THREE.Texture>()
  const materials = new Set<THREE.Material>(),
    geometries = new Set<THREE.BufferGeometry>()
  const gradient = style.material.mode === 'toon' ? toonGradient(style) : undefined
  const noise = style.material.mode === 'fur' ? furTexture() : undefined
  if (gradient) textures.add(gradient)
  if (noise) textures.add(noise)
  const group = new THREE.Group(),
    hips = new THREE.Group(),
    chest = new THREE.Group(),
    head = new THREE.Group()
  group.add(hips)
  hips.add(chest, head)
  hips.name = 'bone-hips'
  chest.name = 'bone-chest'
  head.name = 'bone-head'
  head.position.set(0, 1.12, 0.035)
  chest.position.y = 0.49
  const mat = (slot: keyof PetColors): PetMaterial => {
    const m = materialFor(style, slot, tier, gradient, noise)
    m.userData.roughness = 'roughness' in m ? m.roughness : undefined
    materials.add(m)
    tints.push({ material: m, slot })
    return m
  }
  const bodyMat = mat('body'),
    creamMat = mat('belly'),
    earMat = mat('ear'),
    pinkMat = mat('innerEar'),
    tipMat = mat('accent')
  const add = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    name: string,
    finish = true,
  ) => {
    geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    parent.add(mesh)
    if (style.material.mode === 'glass') glassColors(geometry)
    if (finish) surfaceFinish(mesh, style, tier, tints, materials, noise)
    return mesh
  }
  const faceBody = new THREE.Color(),
    faceCream = new THREE.Color(),
    faceBlush = new THREE.Color()
  const blushStrength = { value: 0 }
  const torsoMat = mat('body')
  const torsoMesh = add(chest, sculptedForm('body'), torsoMat, 'mesh-body')
  const headMat = mat('body')
  headMat.vertexColors = style.id === 'glass'
  const headMesh = add(head, sculptedForm('head', 64), headMat, 'mesh-head')
  headMesh.traverse((node) => {
    const mesh = node as THREE.Mesh
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const m of list)
      if (!(m instanceof THREE.MeshBasicMaterial))
        paintMarkings(m, faceBody, faceCream, 'face', faceBlush, blushStrength)
  })

  // The cream mask is pigmentation on the sculpted head, avoiding a floating cheek plate.
  const muzzle = headMesh
  torsoMesh.traverse((node) => {
    const mesh = node as THREE.Mesh
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const m of list)
      if (!(m instanceof THREE.MeshBasicMaterial))
        paintMarkings(m, faceBody, faceCream, 'chest', faceBlush, blushStrength)
  })

  earMat.vertexColors = style.id === 'anime' || style.id === 'plush'
  const ears = [-1, 1].map((side) => {
    const bone = new THREE.Group()
    bone.name = side < 0 ? 'bone-ear-l' : 'bone-ear-r'
    bone.position.set(side * 0.375, 0.31, -0.045)
    const long = parts.ears === 'long',
      round = parts.ears === 'round',
      floppy = parts.ears === 'floppy'
    const h = long ? 0.83 : round ? 0.29 : 0.51,
      w = long ? 0.125 : round ? 0.18 : 0.225
    const outer = add(bone, earSurface(h, w, 0.115), earMat, 'mesh-ear')
    if (earMat.vertexColors) {
      const p = outer.geometry.getAttribute('position'),
        colors: number[] = []
      const white = new THREE.Color('#ffffff'),
        dark = new THREE.Color('#463027')
      for (let i = 0; i < p.count; i++) {
        const c = white.clone().lerp(dark, THREE.MathUtils.smoothstep(p.getY(i) / h, 0.76, 0.96))
        colors.push(c.r, c.g, c.b)
      }
      outer.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    }
    if (round) outer.scale.y = 0.85
    const inner = add(bone, earSurface(h * 0.74, w * 0.69, 0.035), pinkMat, 'mesh-inner-ear', false)
    inner.position.set(0, 0.065, 0.102)
    // Small cream tufts nestle in the ear cup.
    if (!long && !round) {
      const tuft = add(
        bone,
        pillowSurface(
          [
            [-0.12, 0.1],
            [-0.08, 0.21],
            [-0.04, 0.18],
            [0, 0.26],
            [0.04, 0.18],
            [0.09, 0.19],
            [0.12, 0.1],
            [0, 0.045],
          ],
          (_x, _y, r) => 0.12 + 0.025 * (1 - r * r),
          5,
        ),
        creamMat,
        'mesh-ear-tuft',
        false,
      )
      tuft.scale.setScalar(0.9)
    }
    bone.userData.floppy = floppy
    if (parts.ears !== 'none') head.add(bone)
    return bone
  })

  const noseMat = new THREE.MeshPhysicalMaterial({
    color: '#39251e',
    transparent: style.id === 'glass',
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
  })
  materials.add(noseMat)
  const nose = add(
    head,
    pillowSurface(
      [
        [-0.069, 0.015],
        [-0.05, 0.042],
        [0.05, 0.042],
        [0.069, 0.015],
        [0.03, -0.029],
        [0, -0.044],
        [-0.03, -0.029],
      ],
      (_x, _y, r) => 0.035 * (1 - r * r),
      6,
    ),
    noseMat,
    'mesh-nose',
    false,
  )
  nose.position.set(0, -0.145, 0.482)
  const eyeL = makeEye(head, -1, style, materials),
    eyeR = makeEye(head, 1, style, materials)
  const ink = new THREE.MeshBasicMaterial({
    color: style.id === 'glass' ? '#425796' : '#5b3426',
    transparent: style.id === 'glass',
  })
  materials.add(ink)
  const brows = [-1, 1].map((side) => {
    const brow = stroke(
      [
        [-0.052, 0, side < 0 ? -0.014 : 0.012],
        [0, 0.019, -0.008],
        [0.052, 0, side < 0 ? 0.012 : -0.014],
      ],
      0.009,
      ink,
    )
    brow.position.set(side * 0.25, 0.29, 0.3)
    head.add(brow)
    return brow
  })
  const mouth = new THREE.Group()
  mouth.position.set(0, -0.239, 0.476)
  head.add(mouth)
  const stem = stroke(
    [
      [0, 0.064, 0],
      [0, 0.026, 0],
    ],
    0.0065,
    ink,
  )
  mouth.add(stem)
  const smiles = [-1, 0, 1].map((mood) => {
    const mesh = stroke(
      mood === 0
        ? [
            [-0.105, 0.01, 0],
            [-0.065, -0.018, 0],
            [0, 0.006, 0],
            [0.065, -0.018, 0],
            [0.105, 0.01, 0],
          ]
        : [
            [-0.127, mood * 0.018, 0],
            [-0.102, -mood * 0.014, 0],
            [-0.057, -mood * 0.022, 0],
            [0, 0.006, 0],
            [0.057, -mood * 0.022, 0],
            [0.102, -mood * 0.014, 0],
            [0.127, mood * 0.018, 0],
          ],
      0.0065,
      ink,
    )
    mouth.add(mesh)
    return mesh
  })
  const oralMat = new THREE.MeshBasicMaterial({
    color: style.id === 'glass' ? '#263985' : '#6d292b',
    transparent: style.id === 'glass',
  })
  materials.add(oralMat)
  const openMouth = add(
    mouth,
    pillowSurface(
      [
        [-0.09, 0],
        [0, -0.013],
        [0.09, 0],
        [0.075, -0.1],
        [0, -0.155],
        [-0.075, -0.1],
      ],
      (_x, _y, r) => 0.006 + 0.008 * (1 - r * r),
      6,
    ),
    oralMat,
    'mesh-mouth-open',
    false,
  )
  const roundMouth = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), oralMat)
  roundMouth.position.set(0, -0.04, 0.016)
  roundMouth.scale.set(0.046, 0.062, 0.012)
  mouth.add(roundMouth)
  const tongueMat = new THREE.MeshStandardMaterial({
    color: style.id === 'glass' ? '#a6b3ff' : '#f59295',
    roughness: 0.65,
    transparent: style.id === 'glass',
  })
  materials.add(tongueMat)
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), tongueMat)
  tongue.position.set(0, -0.108, 0.021)
  tongue.scale.set(0.063, 0.034, 0.008)
  openMouth.add(tongue)
  // Hind soles face the viewer. Small toe beans are embedded in the cream pad.
  const beanMat = mat('innerEar')
  if (beanMat instanceof THREE.MeshPhysicalMaterial && style.id === 'glass') {
    beanMat.transmission = 0
    beanMat.emissiveIntensity = 0.55
  }
  for (const side of [-1, 1]) {
    const foot = add(hips, sculptedForm('foot', 28), bodyMat, 'mesh-hind-foot')
    foot.position.set(side * 0.32, 0.225, 0.21)
    foot.rotation.z = side * -0.22
    const sole = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), creamMat)
    sole.position.set(0, -0.012, 0.112)
    sole.scale.set(0.137, 0.164, 0.05)
    foot.add(sole)
    const bean = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), beanMat)
    bean.position.set(0, -0.057, 0.158)
    bean.scale.set(0.063, 0.067, 0.018)
    foot.add(bean)
    for (let i = 0; i < 3; i++) {
      const toe = new THREE.Mesh(bean.geometry, beanMat)
      toe.scale.set(0.024, 0.032, 0.013)
      toe.position.set((i - 1) * 0.065, 0.054 - Math.abs(i - 1) * 0.012, 0.157)
      foot.add(toe)
    }
  }
  const palmPads: THREE.Group[] = []
  const paws = [-1, 1].map((side) => {
    const bone = new THREE.Group()
    bone.name = side < 0 ? 'bone-paw-l' : 'bone-paw-r'
    bone.position.set(side * 0.175, 0.325, 0.265)
    hips.add(bone)
    const limb = add(bone, sculptedForm('limb', 28), bodyMat, 'mesh-foreleg')
    limb.rotation.z = side * -0.08
    const paw = add(bone, sculptedForm('foot', 28), creamMat, 'mesh-front-paw')
    paw.position.set(side * 0.022, -0.2, 0.042)
    paw.scale.set(0.66, 0.6, 0.84)
    const pads = new THREE.Group()
    paw.add(pads)
    palmPads.push(pads)
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), beanMat)
    palm.position.set(0, -0.177, 0.01)
    palm.scale.set(0.065, 0.013, 0.07)
    pads.add(palm)
    for (let i = 0; i < 3; i++) {
      const bean = new THREE.Mesh(palm.geometry, beanMat)
      bean.position.set((i - 1) * 0.058, -0.163, 0.085)
      bean.scale.set(0.023, 0.012, 0.027)
      pads.add(bean)
    }
    for (const offset of [-0.038, 0.038]) {
      const seam = stroke(
        [
          [offset, -0.018, 0.143],
          [offset, -0.065, 0.126],
        ],
        0.0025,
        ink,
      )
      seam.position.copy(paw.position)
      bone.add(seam)
    }
    return bone
  })
  const tail = new THREE.Group()
  tail.name = 'bone-tail'
  tail.position.set(0.29, 0.24, -0.2)
  hips.add(tail)
  if (parts.tail !== 'none') {
    if (parts.tail === 'puff' || parts.tail === 'bob') {
      const puff = add(tail, sculptedForm('foot', 24), tipMat, 'mesh-tail')
      puff.scale.setScalar(parts.tail === 'bob' ? 0.6 : 0.95)
      puff.position.set(0.14, 0, -0.08)
    } else add(tail, sweptTail(parts.tail === 'thin'), [bodyMat, tipMat], 'mesh-tail')
  }
  const accessories = new THREE.Group()
  accessories.name = 'sockets'
  accessories.position.y = 0.49
  hips.add(accessories)
  buildAccessories(accessories, state.appearance?.accessories ?? [], state.props ?? [], style, materials)
  if (species === 'cat' || species === 'bunny') {
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const whisker = stroke(
          [
            [side * 0.36, -0.225 + i * 0.045, 0.39],
            [side * 0.55, -0.24 + i * 0.065, 0.33],
          ],
          0.0025,
          ink,
        )
        head.add(whisker)
      }
  }
  const shadowTexture = contactTexture()
  textures.add(shadowTexture)
  const shadowMat = new THREE.MeshBasicMaterial({
    color: style.id === 'glass' ? '#6d5cff' : '#68432b',
    map: shadowTexture,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 1.12), shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(0.12, 0.012, 0)
  group.add(shadow)
  if (style.platform === 'ring') {
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.69 + i * 0.035, i === 0 ? 0.009 : 0.016, 8, 72),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? '#a6faff' : '#9976ff',
          transparent: true,
          opacity: i === 0 ? 0.85 : 0.13,
          depthWrite: false,
        }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.set(0.06, 0.025, 0)
      group.add(ring)
    }
    const aura = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.5),
      new THREE.MeshBasicMaterial({
        color: '#7367ff',
        map: shadowTexture,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    aura.position.set(0.05, 1.0, -0.55)
    aura.userData.ignoreFraming = true
    group.add(aura)
    const glow = new THREE.PointLight('#77dfff', 0.4, 2)
    glow.position.set(0, 0.65, 0.2)
    hips.add(glow)
  }

  let disposed = false
  const pet: ProceduralPet = {
    group,
    update(next, time) {
      const colors = gradeColors(next.appearance?.colors ?? APRICOT_COLORS, {
        ...style.grade,
        lightness: style.id === 'glass' ? 0.02 : -0.045,
        saturation: style.grade.saturation * 1.18,
      })
      const props = styledProportions(next.appearance?.proportions ?? DEFAULT_PROPORTIONS, style)
      for (const tint of tints) {
        let color =
          tint.slot === 'outline' ? (next.finish?.outlineColor ?? style.outline.color) : colors[tint.slot]
        if (style.id === 'glass' && tint.slot !== 'outline')
          color =
            tint.slot === 'innerEar'
              ? '#bc8ef9'
              : tint.slot === 'belly' || tint.slot === 'accent'
                ? '#b5eaff'
                : '#8abfff'
        tint.material.color.set(tint.material.userData.faceMask ? '#ffffff' : color)
        if (tint.slot === 'outline' && tint.material.userData.grow)
          tint.material.userData.grow.value = 0.007 * (next.finish?.outlineWidth ?? 1)
        if (tint.material instanceof THREE.MeshPhysicalMaterial)
          tint.material.roughness =
            next.finish?.gloss === undefined
              ? tint.material.userData.roughness
              : THREE.MathUtils.lerp(style.material.roughness, 0.12, next.finish.gloss)
        if (tint.slot === 'innerEar' && style.id !== 'glass')
          tint.material.color.lerp(new THREE.Color('#ed8d94'), 0.25)
      }
      faceBody.set(style.id === 'glass' ? '#83c9ff' : colors.body)
      faceCream.set(style.id === 'glass' ? '#b5eaff' : colors.belly)
      faceBlush.set(colors.blush)
      // Foxes have a dark button nose; bunny noses retain the selected pink.
      const defaultNose = (next.appearance?.colors.nose ?? APRICOT_COLORS.nose) === APRICOT_COLORS.nose
      noseMat.color.set(
        style.id === 'glass' ? '#253888' : species === 'fox' && defaultNose ? '#39251e' : colors.nose,
      )
      const action = (next.behavior || 'idle') as PetAction,
        reduced = Boolean(next.reducedMotion),
        drag = Boolean(next.drag?.active)
      const pose = resolveBodyPose(action, time, reduced, drag)
      const expression = resolveExpression({
        action,
        emotion: (next.emotion || 'neutral') as Emotion,
        speaking: Boolean(next.speaking),
        time,
        reducedMotion: reduced,
        dragActive: drag,
      })
      const t = reduced ? 0 : time
      hips.position.y = pose.jump * 0.006
      hips.rotation.set(pose.lean * 0.25, 0, 0)
      // Head and torso proportions are independent; feet stay grounded while breathing.
      chest.scale.set(
        props.bodyScale * pose.squashX,
        props.bodyScale * props.bodyLength * pose.squashY,
        props.bodyScale,
      )
      chest.position.y = 0.49 + (props.bodyScale * props.bodyLength - 1) * 0.46
      head.position.y = 1.12 + (props.bodyScale * props.bodyLength - 1) * 0.34 + pose.bob * 0.0015
      head.scale.setScalar(props.headScale)
      head.rotation.set(
        0,
        Math.sin(t * 0.65) * 0.025,
        pose.lean * 0.5 + (channelValue(next.channels, 'bone-head', 'rotation.z') ?? 0),
      )
      ears.forEach((ear, i) => {
        const side = i === 0 ? -1 : 1
        ear.scale.setScalar(props.earScale * (i === 0 ? props.earScaleL : props.earScaleR))
        const twitch = Math.sin(t * 2.3 + i) * Math.max(0, Math.sin(t * 0.81 + i) - 0.85) * 0.24
        ear.rotation.z =
          -side * (parts.ears === 'long' ? 0.13 : 0.29) -
          side * (expression.earDrop * 0.42 + twitch + (ear.userData.floppy ? 0.65 : 0))
      })
      const snoutDepth = 1 + (props.snoutScale - 1) * 0.12
      muzzle.scale.set(1 + (props.cheekScale - 1) * 0.07, 1, snoutDepth)
      nose.position.z = 0.482 * snoutDepth
      mouth.position.z = 0.476 * snoutDepth
      for (const eye of [eyeL, eyeR]) {
        eye.group.position.z = 0.363 * snoutDepth
        const dot = parts.eyes === 'dot' ? 0.65 : 1,
          almond = parts.eyes === 'almond' ? 0.82 : 1
        const eyeSize = props.eyeScale / style.shape.eye
        eye.group.scale.set(
          eyeSize * dot * 1.1,
          eyeSize * dot * Math.max(0.045, expression.eyeOpen) * almond * 0.93,
          1,
        )
        eye.gaze.position.set((next.pointer?.x ?? 0) * 0.015, -(next.pointer?.y ?? 0) * 0.012, 0)
        eye.pupil.scale.set(0.097 * expression.pupil, 0.121 * expression.pupil, 0.026)
        eye.heart.visible = expression.heartEyes
        eye.pupil.visible = !expression.heartEyes
        eye.iris.color
          .set(style.id === 'glass' ? '#4556bc' : colors.eye)
          .lerp(new THREE.Color(style.id === 'glass' ? '#5cf1ff' : '#ac642e'), 0.48)
      }
      const emotion = next.emotion || 'neutral'
      brows.forEach((brow, i) => {
        const side = i === 0 ? -1 : 1
        brow.position.z = 0.3 * snoutDepth
        brow.rotation.z =
          side *
          (emotion === 'angry'
            ? 0.39
            : emotion === 'sad'
              ? -0.4
              : emotion === 'focused'
                ? 0.2
                : expression.brow * 0.1)
        brow.position.y = 0.285 + (emotion === 'surprised' ? 0.038 : expression.brow * 0.016)
      })
      smiles.forEach(
        (smile, i) => (smile.visible = i === (expression.smile < -0.2 ? 0 : expression.smile > 0.15 ? 2 : 1)),
      )
      const opening = Math.max(expression.mouthOpen, expression.smile > 0.6 ? 0.65 : 0)
      roundMouth.visible = emotion === 'surprised'
      stem.visible = !roundMouth.visible
      if (roundMouth.visible) smiles.forEach((smile) => (smile.visible = false))
      openMouth.visible = opening > 0.08 && !roundMouth.visible
      openMouth.scale.set(emotion === 'surprised' ? 0.58 : 1, Math.max(0.2, opening), 1)
      blushStrength.value =
        style.id === 'glass'
          ? 0
          : Math.min(0.8, (0.08 + expression.blush * 0.52 * style.blush) * props.cheekScale)
      tail.scale.setScalar(props.tailScale)
      tail.rotation.set(
        0,
        pose.tailWag * 0.22 + (channelValue(next.channels, 'bone-tail', 'rotation.y') ?? 0),
        Math.sin(t * 1.3) * 0.045 + pose.tailLift * 0.07,
      )
      paws.forEach((paw, i) => {
        palmPads[i]!.visible = pose.wave > 0 && i === 1
        paw.rotation.set(0, 0, 0)
        paw.position.set(
          (i === 0 ? -1 : 1) * 0.175,
          0.325 + Math.sin(pose.pawPhase + i * Math.PI) * 0.035,
          0.265,
        )
        if (pose.wave > 0 && i === 1) {
          paw.rotation.z = 2.4 + Math.sin(t * 9) * 0.2
          paw.rotation.x = 1.2
          paw.position.set(0.45, 0.78, 0.27)
        }
        paw.rotation.z +=
          channelValue(next.channels, i === 0 ? 'bone-paw-l' : 'bone-paw-r', 'rotation.z') ?? 0
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) geometries.add(mesh.geometry)
        const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        for (const material of list) {
          materials.add(material)
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
        }
        if (obj instanceof THREE.Light) obj.dispose()
      })
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
    },
  }
  pet.update(state, 0)
  return pet
}

export function qualityFromState(state: PetVisualState): QualityTier {
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & { deviceMemory?: number }
  return resolveQualityTier(state.finish?.furQuality ?? state.quality, {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  })
}

function stroke(points: number[][], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])))
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 20, radius, 6, false), material)
}

function makeEye(head: THREE.Group, side: number, style: StylePreset, materials: Set<THREE.Material>) {
  const group = new THREE.Group()
  group.position.set(side * 0.255, 0.055, 0.363)
  group.rotation.y = side * 0.28
  const material = (color: string, roughness = 0.2) => {
    const m = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      clearcoat: 0.45,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.45,
      transparent: style.id === 'glass',
    })
    materials.add(m)
    return m
  }
  const lens = (x: number, y: number, z: number, m: THREE.Material, depth: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), m)
    mesh.scale.set(x, y, z)
    mesh.position.z = depth
    return mesh
  }
  group.add(lens(0.159, 0.192, 0.035, material(style.id === 'glass' ? '#afdfff' : '#fff0d4', 0.7), 0))
  const gaze = new THREE.Group()
  group.add(gaze)
  gaze.add(lens(0.137, 0.171, 0.033, material('#fff9ef', 0.6), 0.025))
  const iris = material('#86502c', 0.12)
  const irisMesh = lens(0.123, 0.155, 0.035, iris, 0.047)
  irisMesh.position.x = 0.01
  gaze.add(irisMesh)
  const pupil = lens(0.097, 0.121, 0.026, material('#130f13', 0.1), 0.078)
  pupil.position.y = 0.022
  gaze.add(pupil)
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: style.id === 'glass' })
  materials.add(shine)
  for (const [x, y, r] of [
    [-0.039, 0.077, 0.029],
    [0.045, -0.058, 0.012],
  ]) {
    const light = lens(r!, r!, 0.009, shine, 0.11)
    light.position.x = x!
    light.position.y = y!
    gaze.add(light)
  }
  const heartShape = new THREE.Shape()
  heartShape.moveTo(0, -0.075)
  heartShape.bezierCurveTo(-0.15, 0.02, -0.066, 0.13, 0, 0.062)
  heartShape.bezierCurveTo(0.066, 0.13, 0.15, 0.02, 0, -0.075)
  const heartMat = new THREE.MeshBasicMaterial({
    color: '#f45c87',
    side: THREE.DoubleSide,
    transparent: style.id === 'glass',
  })
  materials.add(heartMat)
  const heart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape, 20), heartMat)
  heart.position.z = 0.124
  gaze.add(heart)
  head.add(group)
  return { group, gaze, iris, pupil, heart }
}

function buildAccessories(
  parent: THREE.Group,
  accessories: { kind: string; color?: string; socket?: string }[],
  props: { id: string; socket: string; color?: string }[],
  style: StylePreset,
  materials: Set<THREE.Material>,
): void {
  for (const item of accessories) {
    const socket = socketForAccessory(item.kind, item.socket)
    const holder = new THREE.Group()
    holder.name = `socket-${socket.id}`
    holder.position.set(socket.position.x, socket.position.y - 0.08, socket.position.z)
    parent.add(holder)
    const color = new THREE.Color(item.color ?? '#8ed9cc')
    const mat =
      style.material.mode === 'glass'
        ? new THREE.MeshPhysicalMaterial({
            color,
            transmission: 0.4,
            roughness: 0.2,
            emissive: color,
            emissiveIntensity: 0.2,
          })
        : new THREE.MeshStandardMaterial({ color, roughness: 0.45 })
    materials.add(mat)
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
      materials.add(glass)
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

/** Expand in object space using the normal attribute, available in basic and lit shaders. */
export function inflate(material: THREE.Material, amount: number): void {
  const grow = { value: amount }
  material.userData.grow = grow
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrow = grow
    shader.vertexShader = `uniform float uGrow;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normalize(normal) * uGrow;',
    )}`
  }
  material.customProgramCacheKey = () => `pet-inflate-v2:${amount}`
}

function surfaceFinish(
  source: THREE.Mesh,
  style: StylePreset,
  tier: QualityTier,
  tints: Tint[],
  materials: Set<THREE.Material>,
  noise?: THREE.Texture,
): void {
  // The shell is parented to the surface so later pose/shape changes stay aligned.
  if (style.id === 'anime') {
    const m = new THREE.MeshBasicMaterial({ color: style.outline.color, side: THREE.BackSide })
    inflate(m, 0.007)
    materials.add(m)
    tints.push({ material: m, slot: 'outline' })
    const shell = new THREE.Mesh(source.geometry, m)
    shell.name = 'outline'
    source.add(shell)
  }
  if (style.material.mode !== 'fur') return
  const base = Array.isArray(source.material) ? source.material : [source.material]
  const layers = style.material.furShells[tier]
  for (let i = 1; i <= layers; i++) {
    const shellMaterials = base.map((original) => {
      const tint = tints.find((t) => t.material === original)
      const m = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: original instanceof THREE.MeshStandardMaterial && original.vertexColors,
        roughness: 1,
        alphaMap: noise,
        alphaTest: 0.36 + (i / layers) * 0.18,
        transparent: true,
        opacity: 0.65 * (1 - i / (layers + 1)),
        depthWrite: false,
      })
      inflate(m, style.material.furLength * (i / layers) * 0.8)
      materials.add(m)
      tints.push({ material: m, slot: tint?.slot ?? 'body' })
      return m
    })
    const shell = new THREE.Mesh(
      source.geometry,
      shellMaterials.length === 1 ? shellMaterials[0] : shellMaterials,
    )
    shell.name = `fur-shell-${i}`
    source.add(shell)
  }
}

function materialFor(
  style: StylePreset,
  slot: string,
  tier: QualityTier,
  gradient?: THREE.Texture,
  noise?: THREE.Texture,
): PetMaterial {
  if (style.id === 'anime') return new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradient })
  if (style.id === 'glass') {
    const material = new THREE.MeshPhysicalMaterial({
      color: '#9bcfff',
      vertexColors: true,
      roughness: tier === 'low' ? 0.29 : 0.22,
      metalness: 0,
      transmission: tier === 'low' ? 0 : tier === 'medium' ? 0.45 : style.material.transmission,
      thickness: 0.3,
      ior: 1.32,
      iridescence: 1,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [180, 520],
      emissive: '#7b6de8',
      emissiveIntensity: slot === 'belly' ? 0.3 : 0.19,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.65,
    })
    innerGlow(material)
    return material
  }
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: style.id === 'plush' ? 0.97 : 0.54,
    metalness: 0,
    clearcoat: style.id === 'plush' ? 0 : 0.12,
    clearcoatRoughness: 0.52,
    sheen: style.id === 'plush' ? 1 : 0.16,
    sheenColor: new THREE.Color('#ffdfbc'),
    sheenRoughness: 0.85,
    envMapIntensity: 0.16,
    bumpMap: noise ?? null,
    bumpScale: style.id === 'plush' ? 0.008 : 0,
  })
}

function glassColors(geometry: THREE.BufferGeometry): void {
  const p = geometry.getAttribute('position'),
    colors: number[] = []
  const a = new THREE.Color('#57e9ff'),
    b = new THREE.Color('#c080ff')
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp(0.45 + p.getX(i) * 0.65 + p.getY(i) * 0.15, 0, 1)
    const color = a.clone().lerp(b, t)
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
}

function toonGradient(style: StylePreset): THREE.DataTexture {
  const bands = Math.max(2, Math.min(3, style.material.toonBands))
  const data = new Uint8Array(bands * 4)
  for (let i = 0; i < bands; i++) {
    const light = Math.round(100 + (i / (bands - 1)) * 155)
    data.set([light, light, light, 255], i * 4)
  }
  const texture = new THREE.DataTexture(data, bands, 1, THREE.RGBAFormat)
  texture.minFilter = texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

/** Seeded grain; alphaMap reads GREEN, not the alpha channel. No DOM/canvas dependency. */
function furTexture(): THREE.DataTexture {
  const size = 128,
    data = new Uint8Array(size * size * 4)
  let seed = 7391
  for (let i = 0; i < data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const value = seed >>> 24
    data.set([value, value, value, 255], i)
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 3)
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function contactTexture(): THREE.DataTexture {
  const size = 64,
    data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2))
      const alpha = Math.round(Math.max(0, Math.exp(-r * r * 5) - Math.exp(-5)) * 255)
      data.set([255, 255, 255, alpha], (y * size + x) * 4)
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Analytic pigmentation stays crisp at every LOD and follows the muzzle through its fur shells. */
function paintMarkings(
  material: THREE.Material,
  body: THREE.Color,
  cream: THREE.Color,
  pattern: 'face' | 'chest',
  blush: THREE.Color,
  blushStrength: { value: number },
): void {
  material.userData.faceMask = true
  const before = material.onBeforeCompile.bind(material),
    key = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer)
    shader.uniforms.uFaceBody = { value: body }
    shader.uniforms.uFaceCream = { value: cream }
    shader.uniforms.uBlushColor = { value: blush }
    shader.uniforms.uBlushStrength = blushStrength
    shader.vertexShader =
      'varying vec3 vPetLocal;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPetLocal = position;')
    shader.fragmentShader =
      'varying vec3 vPetLocal;\nuniform vec3 uFaceBody;\nuniform vec3 uFaceCream;\nuniform vec3 uBlushColor;\nuniform float uBlushStrength;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      ${
        pattern === 'face'
          ? `
        float edge = -0.19 + 0.105 * pow(abs(vPetLocal.x)/0.62, 1.4) + 0.045 * exp(-pow(vPetLocal.x/0.16, 2.0));
        float mask = smoothstep(-0.002, 0.002, edge-vPetLocal.y) * smoothstep(0.02, 0.17, vPetLocal.z);
      `
          : `
        float height = clamp((vPetLocal.y+0.29)/0.64,0.0,1.0);
        float width = 0.235 * pow(height,0.63);
        float mask = (1.0-smoothstep(width-0.003,width+0.003,abs(vPetLocal.x))) * smoothstep(-0.30,-0.28,vPetLocal.y) * smoothstep(0.10,0.22,vPetLocal.z);
      `
      }
      vec3 pigment = mix(uFaceBody, uFaceCream, mask);
      ${
        pattern === 'face'
          ? `float blush = exp(-pow((abs(vPetLocal.x)-0.40)/0.073,2.0)-pow((vPetLocal.y+0.16)/0.042,2.0))*smoothstep(0.12,0.23,vPetLocal.z);
      pigment = mix(pigment,uBlushColor,blush*uBlushStrength);`
          : ''
      }
      diffuseColor.rgb *= pigment;
      ${material instanceof THREE.MeshToonMaterial ? '' : `diffuseColor.rgb *= mix(0.66,1.0,smoothstep(0.0,0.39,vPetLocal.z));`}
    `,
      )
  }
  material.customProgramCacheKey = () => `${key}:pet-${pattern}-mask-v4`
}

/** Fresnel emission gives a luminous silhouette without a postprocessing render target. */
function innerGlow(material: THREE.MeshPhysicalMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float petRim = pow(1.0-abs(dot(normal,normalize(vViewPosition))),2.2);
      totalEmissiveRadiance += mix(vec3(0.10,0.25,0.60),vec3(0.16,0.80,1.0),petRim) * (0.08+petRim*0.55);
    `,
    )
  }
  material.customProgramCacheKey = () => 'pet-hologram-v2'
}
