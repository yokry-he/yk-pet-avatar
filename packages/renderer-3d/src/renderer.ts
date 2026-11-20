/**
 * Three.js renderer. Imported lazily so 2D-only pages never download it.
 * glTF / GLB load on demand. `.vrm` is accepted as glTF geometry only.
 */

import {
  getStyle,
  resolveExpression,
  styledProportions,
  type Emotion,
  type PetAction,
  type PetRenderer,
  type PetRendererSnapshot,
  type PetVisualState,
} from '@yk-pet/core'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { resolveClipName } from './clips'
import { cameraFit, visualBounds } from './sculpt'
import { createProceduralPet, qualityFromState, type ProceduralPet } from './procedural'

export interface ThreeRendererOptions {
  width?: number
  height?: number
  devicePixelRatio?: number
  autoStart?: boolean
  onFrame?: (dt: number) => void
  getState?: () => PetVisualState
  getYaw?: () => number
  onFallback?: (reason: 'webgl-context-lost' | 'low-fps' | 'renderer-error') => void
}

const EMOTIONS = new Set<Emotion>([
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
])
const ACTIONS = new Set<PetAction>([
  'idle',
  'walk',
  'sleep',
  'happy',
  'sad',
  'thinking',
  'talking',
  'eating',
  'dragged',
  'wave',
  'jump',
  'petting',
  'working',
  'success',
  'error',
])

interface ModelBinding {
  mixer: THREE.AnimationMixer
  animations: THREE.AnimationClip[]
  names: string[]
  current: string | null
  nodes: Array<{ object: THREE.Object3D; base: THREE.Vector3; kind: 'head' | 'ear' | 'tail' | 'eye' }>
}

const NEUTRAL_PROPORTIONS = {
  headScale: 1,
  bodyScale: 1,
  bodyLength: 1,
  earScale: 1,
  earScaleL: 1,
  earScaleR: 1,
  tailScale: 1,
  eyeScale: 1,
  snoutScale: 1,
  cheekScale: 1,
}

export class ThreePetRenderer implements PetRenderer {
  readonly kind = '3d' as const
  canvas: HTMLCanvasElement | null = null
  #renderer: THREE.WebGLRenderer | null = null
  #scene = new THREE.Scene()
  #camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  #root = new THREE.Group()
  #lights = new THREE.Group()
  #pet: ProceduralPet | null = null
  #model: THREE.Object3D | null = null
  #clips: ModelBinding | null = null
  #frame = 0
  #last = 0
  #elapsed = 0
  #fpsFrames = 0
  #fpsStamp = 0
  #lowFps = 0
  #state: PetVisualState = { behavior: 'idle' }
  #signature = ''
  #width = 360
  #height = 420
  #dpr = 1
  #warnedVrm = false
  #disposed = false
  #loadingUrl = ''
  #loadVersion = 0
  #environment: THREE.WebGLRenderTarget | null = null
  #framing = ''

  constructor(private readonly options: ThreeRendererOptions = {}) {
    this.#width = options.width ?? 360
    this.#height = options.height ?? 420
    this.#camera.position.set(0, 1.2, 5)
    this.#camera.lookAt(0, 1, 0)
    this.#scene.add(this.#root, this.#lights)
  }

  async mount(target: Element | ShadowRoot): Promise<void> {
    const canvas = document.createElement('canvas')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    canvas.style.touchAction = 'none'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'yk pet 3d')
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      this.options.onFallback?.('webgl-context-lost')
    })
    target.append(canvas)
    this.canvas = canvas
    try {
      this.#renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    } catch (error) {
      this.options.onFallback?.('renderer-error')
      throw error
    }
    this.#renderer.setClearColor(0x000000, 0)
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace
    this.#renderer.toneMapping = THREE.NeutralToneMapping
    this.#renderer.toneMappingExposure = 1.0
    const pmrem = new THREE.PMREMGenerator(this.#renderer)
    const room = new RoomEnvironment()
    this.#environment = pmrem.fromScene(room, 0.04)
    this.#scene.environment = this.#environment.texture
    room.dispose()
    pmrem.dispose()
    const rect =
      target instanceof Element
        ? target.getBoundingClientRect()
        : { width: this.#width, height: this.#height }
    this.resize(
      rect.width || this.#width,
      rect.height || this.#height,
      this.options.devicePixelRatio ?? devicePixelRatio,
    )
    this.#ensurePet(this.#state, true)
    if (this.options.autoStart !== false) this.start()
  }

  start(): void {
    if (this.#frame || typeof requestAnimationFrame !== 'function') return
    const loop = (now: number) => {
      const dt = this.#last ? Math.min(0.05, (now - this.#last) / 1000) : 0
      this.#last = now
      this.#elapsed += dt
      this.options.onFrame?.(dt)
      const next = this.options.getState?.()
      if (next) this.#state = next
      this.#ensurePet(this.#state, false)
      this.#root.rotation.y = this.options.getYaw?.() ?? 0
      this.#pet?.update(this.#state, this.#elapsed)
      this.#syncModel(dt)
      this.#fitCamera()
      this.#renderer?.render(this.#scene, this.#camera)
      this.#watchFps(now)
      this.#frame = requestAnimationFrame(loop)
    }
    this.#frame = requestAnimationFrame(loop)
  }

  stop(): void {
    if (this.#frame) cancelAnimationFrame(this.#frame)
    this.#frame = 0
    this.#last = 0
  }

  setVisible(visible: boolean): void {
    if (this.canvas) this.canvas.style.visibility = visible ? 'visible' : 'hidden'
    if (visible) this.start()
    else this.stop()
  }

  update(state: PetVisualState): void {
    this.#state = state
    this.#ensurePet(state, false)
    this.#pet?.update(state, this.#elapsed)
    this.#fitCamera()
    if (!this.#frame) this.#renderer?.render(this.#scene, this.#camera)
  }

  resize(width: number, height: number, devicePixelRatio = this.#dpr): void {
    this.#width = Math.max(1, width)
    this.#height = Math.max(1, height)
    const cap = qualityFromState(this.#state) === 'low' ? 1 : 1.75
    this.#dpr = Math.max(1, Math.min(cap, devicePixelRatio || 1))
    this.#camera.aspect = this.#width / this.#height
    this.#camera.updateProjectionMatrix()
    this.#framing = ''
    this.#fitCamera()
    this.#renderer?.setPixelRatio(this.#dpr)
    this.#renderer?.setSize(this.#width, this.#height, false)
  }

  snapshot(): PetRendererSnapshot {
    return { state: { ...this.#state }, payload: { elapsed: this.#elapsed } }
  }

  restore(snapshot: PetRendererSnapshot): void {
    if (snapshot.state) this.#state = snapshot.state
    const payload = snapshot.payload as { elapsed?: number } | undefined
    if (typeof payload?.elapsed === 'number') this.#elapsed = payload.elapsed
  }

  dispose(): void {
    this.#disposed = true
    this.stop()
    this.#pet?.dispose()
    this.#clearModel()
    this.#environment?.dispose()
    this.#environment = null
    this.#scene.environment = null
    this.#lights.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose()
    })
    this.#renderer?.dispose()
    this.canvas?.remove()
    this.canvas = null
    this.#renderer = null
  }

  #ensurePet(state: PetVisualState, force: boolean): void {
    const tier = qualityFromState(state)
    const signature = JSON.stringify({
      species: state.appearance?.species,
      parts: state.appearance?.parts,
      accessories: state.appearance?.accessories,
      style: state.style ?? 'kawaii',
      tier,
      model: state.model?.url ?? '',
      props: state.props ?? [],
    })
    if (!force && signature === this.#signature) return
    this.#signature = signature
    this.#pet?.dispose()
    this.#pet = null
    this.#root.clear()
    this.#clearModel()
    const cap = tier === 'low' ? 1 : 1.75
    if (this.#dpr > cap) {
      this.#dpr = cap
      this.#renderer?.setPixelRatio(cap)
    }
    this.#pet = createProceduralPet(state, tier)
    this.#root.add(this.#pet.group)
    this.#applyLights(state)
    this.#framing = ''
    this.#fitCamera()
    if (state.model?.url) void this.#loadModel(state.model.url, state)
  }

  #applyLights(state: PetVisualState): void {
    this.#lights.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose()
    })
    this.#lights.clear()
    const style = getStyle(state.style)
    this.#lights.add(new THREE.HemisphereLight('#fff7ed', '#8b6b62', style.lights.ambient * 0.34))
    const key = new THREE.DirectionalLight(style.lights.key, style.lights.keyIntensity * 1.35)
    key.position.set(-3.0, 4.5, 4.0)
    const fill = new THREE.DirectionalLight(style.lights.fill, style.lights.fillIntensity * 0.45)
    fill.position.set(3.0, 1.8, 2.4)
    const rim = new THREE.DirectionalLight(style.lights.rim, style.lights.rimIntensity)
    rim.position.set(1.5, 3.0, -2.2)
    this.#lights.add(key, fill, rim)
    if (style.lights.rim2) {
      const extra = new THREE.PointLight(style.lights.rim2, style.lights.rim2Intensity ?? 0.6, 8)
      extra.position.set(1.4, 0.8, 1.2)
      this.#lights.add(extra)
    }
  }

  async #loadModel(url: string, state: PetVisualState): Promise<void> {
    this.#loadingUrl = url
    const version = ++this.#loadVersion
    const format = state.model?.format
    if ((format === 'vrm' || url.toLowerCase().endsWith('.vrm')) && !this.#warnedVrm) {
      this.#warnedVrm = true
      console.warn(
        '[yk-pet] VRM spring bones and expression presets are not applied in v0.1. Loading the glTF scene only.',
      )
    }
    try {
      const gltf = await new GLTFLoader().loadAsync(url)
      if (this.#disposed || this.#loadingUrl !== url || version !== this.#loadVersion) {
        disposeObject(gltf.scene)
        return
      }
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      gltf.scene.position.sub(center)
      gltf.scene.scale.setScalar(1.55 / Math.max(size.y, 0.001))
      gltf.scene.position.y -= 0.15
      this.#pet?.dispose()
      this.#pet = null
      this.#root.clear()
      this.#model = gltf.scene
      this.#root.add(gltf.scene)
      this.#framing = ''
      this.#fitCamera()
      const nodes: ModelBinding['nodes'] = []
      gltf.scene.traverse((object) => {
        const name = object.name.toLowerCase()
        const kind = name.includes('ear')
          ? 'ear'
          : name.includes('tail')
            ? 'tail'
            : name.includes('eye')
              ? 'eye'
              : name.includes('head')
                ? 'head'
                : null
        if (kind) nodes.push({ object, base: object.scale.clone(), kind })
      })
      this.#clips = {
        mixer: new THREE.AnimationMixer(gltf.scene),
        animations: gltf.animations,
        names: gltf.animations.map((clip) => clip.name),
        current: null,
        nodes,
      }
    } catch (error) {
      console.warn('[yk-pet] glTF load failed; the procedural pet stays visible.', error)
    }
  }

  #syncModel(dt: number): void {
    const binding = this.#clips
    if (!binding || !this.#model) return
    const action = this.#state.behavior || 'idle'
    const clipName = resolveClipName(binding.names, action, this.#state.model?.animations)
    if (clipName && clipName !== binding.current) {
      const clip = binding.animations.find((item) => item.name === clipName)
      if (clip) {
        binding.mixer.stopAllAction()
        binding.mixer.clipAction(clip).reset().play()
        binding.current = clipName
      }
    }
    binding.mixer.update(dt)
    const props = styledProportions(
      this.#state.appearance?.proportions ?? NEUTRAL_PROPORTIONS,
      getStyle(this.#state.style),
    )
    for (const node of binding.nodes) {
      const factor =
        node.kind === 'head'
          ? props.headScale
          : node.kind === 'tail'
            ? props.tailScale
            : node.kind === 'eye'
              ? props.eyeScale
              : props.earScale
      node.object.scale.copy(node.base).multiplyScalar(factor)
    }
    const emotion = EMOTIONS.has(this.#state.emotion as Emotion)
      ? (this.#state.emotion as Emotion)
      : 'neutral'
    const known = ACTIONS.has(action as PetAction) ? (action as PetAction) : 'idle'
    const expression = resolveExpression({
      action: known,
      emotion,
      speaking: Boolean(this.#state.speaking),
      time: this.#elapsed,
      reducedMotion: Boolean(this.#state.reducedMotion),
    })
    this.#model.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
      const write = (name: string, value: number) => {
        const index = mesh.morphTargetDictionary?.[name]
        if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value
      }
      write('blink', 1 - expression.eyeOpen)
      write('mouthOpen', expression.mouthOpen)
      write('joy', Math.max(0, expression.smile))
      write('sad', Math.max(0, -expression.smile))
    })
  }

  #clearModel(): void {
    this.#clips?.mixer.stopAllAction()
    if (this.#model) disposeObject(this.#model)
    this.#model = null
    this.#clips = null
    this.#loadingUrl = ''
    this.#loadVersion++
  }

  #fitCamera(): void {
    if (!this.#pet && !this.#model) return
    const signature = JSON.stringify([
      this.#width,
      this.#height,
      this.#signature,
      this.#state.appearance?.proportions,
      Boolean(this.#model),
      this.#pet?.poseBlend,
      this.#pet?.anthroBlend,
    ])
    if (signature === this.#framing) return
    this.#framing = signature
    // Measure the complete pet after its initial pose, including long bunny ears.
    // Measure in local space so turning the root never changes the camera target.
    const object = this.#model ?? this.#pet!.group
    const yaw = this.#root.rotation.y
    this.#root.rotation.y = 0
    object.updateWorldMatrix(true, true)
    // Keep the camera's fit independent of the brief squash used to swap anatomy.
    const pelvis = this.#pet?.group.getObjectByName('bone-hips')
    const squash = pelvis?.scale.y ?? 1
    if (pelvis) pelvis.scale.y = 1
    const box = visualBounds(object)
    if (pelvis) pelvis.scale.y = squash
    this.#root.rotation.y = yaw
    this.#root.updateMatrixWorld(true)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const distance =
      cameraFit(Math.hypot(size.x, size.z), size.y, this.#camera.aspect, this.#camera.fov) + size.z * 0.5
    this.#camera.position.set(center.x, center.y + distance * 0.035, center.z + distance)
    this.#camera.lookAt(center)
    this.#camera.updateProjectionMatrix()
  }

  #watchFps(now: number): void {
    if (!this.#fpsStamp) this.#fpsStamp = now
    this.#fpsFrames += 1
    const elapsed = now - this.#fpsStamp
    if (elapsed < 1000) return
    const fps = (this.#fpsFrames * 1000) / elapsed
    this.#fpsFrames = 0
    this.#fpsStamp = now
    if (this.#elapsed < 2.5) return
    this.#lowFps = fps < 22 ? this.#lowFps + 1 : 0
    if (this.#lowFps >= 2) this.options.onFallback?.('low-fps')
  }
}

export function createThreeRendererFactory(options: ThreeRendererOptions = {}) {
  return {
    kind: '3d' as const,
    create: () => new ThreePetRenderer(options),
  }
}

/** Includes shared GLTF textures and handles abandoned asynchronous loads. */
function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>()
  object.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
    if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose()
  })
  geometries.forEach((item) => item.dispose())
  materials.forEach((item) => item.dispose())
  textures.forEach((item) => item.dispose())
}
