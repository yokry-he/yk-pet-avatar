/** Articulated anthro body. Every surface goes through the renderer's existing style finish. */
import * as THREE from 'three'
import { ANTHRO, anthroPose, ARM_LENGTHS, LEG_LENGTHS, type Chain, type Point } from './anthro'
import { anthroForm, limbSleeve, pillowSurface } from './sculpt'

type AddSurface = (
  parent: THREE.Object3D, geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[], name: string, finish?: boolean,
) => THREE.Mesh

export function createAnthroRig(
  add: AddSurface,
  body: THREE.Material,
  torsoMaterial: THREE.Material,
  cream: THREE.Material,
  pink: THREE.Material,
  cloth: THREE.Material,
  ink: THREE.Material,
  style: string,
  detail: number,
) {
  const group = new THREE.Group()
  group.name = 'anthro-body'
  const torso = new THREE.Group()
  torso.name = 'anthro-torso'
  group.add(torso)
  const torsoMesh = add(torso, anthroForm('torso', detail), torsoMaterial, 'mesh-anthro-torso')
  const ruff = add(torso, anthroForm('ruff', detail), cream, 'mesh-neck-ruff')
  ruff.position.set(0, 0.31, -0.015)
  const collar = new THREE.Group()
  collar.name = 'anthro-collar'
  torso.add(collar)
  const band = add(collar, new THREE.TorusGeometry(0.225, style === 'glass' ? 0.013 : 0.037, 10, 40), cloth, 'mesh-anthro-collar')
  band.rotation.x = Math.PI / 2
  band.scale.y = 0.84
  collar.position.y = 0.30
  if (style !== 'glass') {
    const scarfDepth = (x: number, y: number, r: number) => {
      const chestSurface = 0.265 * Math.sqrt(Math.max(0, 1 - (x / 0.34) ** 2 - ((0.30 + y) / 0.35) ** 2))
      return Math.max(chestSurface + 0.012, 0.245 + 0.02 * (1 - r * r))
    }
    const bib = add(collar, pillowSurface(
      style === 'plush'
        ? [[-0.08, 0.005], [0.075, 0.005], [0.09, -0.27], [-0.065, -0.29]]
        : [[-0.22, 0.005], [0, -0.025], [0.22, 0.005], [0.14, -0.105], [0, -0.23], [-0.14, -0.105]],
      scarfDepth, 8,
    ), cloth, 'mesh-anthro-scarf')
    if (style === 'plush') {
      // Small knit ribs and blanket stitches, kept on the scarf's visible face.
      for (let i = 0; i < 7; i++) {
        const x = -0.055 + i * 0.019
        const stitches = [[x, -0.035], [x + 0.005, -0.14], [x, -0.25]].map(([sx, sy]) => {
          const r = Math.min(1, Math.hypot(sx! / 0.08, (sy! + 0.14) / 0.145))
          return [sx!, sy!, scarfDepth(sx!, sy!, r) + 0.003]
        })
        const seam = line(stitches, 0.0025, cream)
        bib.add(seam)
      }
    } else {
      const knot = add(collar, anthroForm('hand', 20), cloth, 'mesh-scarf-knot')
      knot.position.set(0.23, -0.015, 0.13)
      knot.scale.set(0.45, 0.40, 0.48)
      const ribbon = add(collar, pillowSurface(
        [[0.20, 0], [0.35, 0.045], [0.38, -0.075], [0.27, -0.055], [0.32, -0.16], [0.22, -0.11]],
        () => 0.13, 5,
      ), cloth, 'mesh-scarf-tails')
      ribbon.rotation.y = -0.1
    }
  }

  const makeChain = (kind: 'arm' | 'leg', side: number) => {
    const lengths = kind === 'arm' ? ARM_LENGTHS : LEG_LENGTHS
    const root = new THREE.Group(), joint = new THREE.Group()
    root.name = `anthro-${kind === 'arm' ? 'shoulder' : 'hip'}-${side < 0 ? 'l' : 'r'}`
    joint.name = `anthro-${kind === 'arm' ? 'elbow' : 'knee'}-${side < 0 ? 'l' : 'r'}`
    group.add(root)
    root.add(joint)
    joint.position.y = -lengths[0]
    const sleeve = limbSleeve(lengths[0], lengths[1], kind === 'arm' ? 0.135 : 0.165, kind === 'arm' ? 0.105 : 0.125, kind === 'arm' ? 0.085 : 0.105, detail)
    add(root, sleeve, body, `mesh-anthro-${kind}`)
    const restPosition = sleeve.getAttribute('position').array.slice()
    const restNormal = sleeve.getAttribute('normal').array.slice()
    const end = new THREE.Group()
    end.name = `anthro-${kind === 'arm' ? 'hand' : 'foot'}-${side < 0 ? 'l' : 'r'}`
    // Hands inherit the forearm; feet get a separately solved level orientation.
    if (kind === 'arm') { joint.add(end); end.position.y = -lengths[1] }
    else group.add(end)
    const surface = add(end, anthroForm(kind === 'arm' ? 'hand' : 'boot', detail), cream, `mesh-anthro-${kind === 'arm' ? 'mitten' : 'boot'}`)
    if (kind === 'arm') {
      surface.position.y = -0.07
      surface.scale.x = side
      for (const x of [-0.044, 0.038]) {
        const seam = line([[x, -0.13, 0.095], [x, -0.17, 0.075], [x * 0.95, -0.20, 0.045]], 0.0025, ink)
        end.add(seam)
      }
    } else {
      surface.position.set(0, -0.04, 0.015)
      for (const x of [-0.055, 0.055])
        end.add(line([[x, 0.045, 0.21], [x, 0.025, 0.255], [x, -0.015, 0.29]], 0.0025, ink))
    }
    const pads = new THREE.Group()
    pads.name = 'anthro-palm-pads'
    if (kind === 'arm') {
      end.add(pads)
      const palm = add(pads, new THREE.SphereGeometry(1, 16, 12), pink, 'mesh-anthro-palm', false)
      palm.position.set(0, -0.07, 0.104)
      palm.scale.set(0.055, 0.048, 0.008)
      for (let i = -1; i <= 1; i++) {
        const toe = add(pads, new THREE.SphereGeometry(1, 12, 8), pink, 'mesh-anthro-finger-pad', false)
        toe.position.set(i * 0.057, -0.155 + Math.abs(i) * 0.012, 0.080)
        toe.scale.set(0.020, 0.022, 0.007)
      }
    }
    return { root, joint, end, pads, sleeve, restPosition, restNormal, upperLength: lengths[0] }
  }
  const arms = [-1, 1].map((side) => makeChain('arm', side))
  const legs = [-1, 1].map((side) => makeChain('leg', side))
  const axis = new THREE.Vector3(0, -1, 0)
  const vector = (point: Point) => new THREE.Vector3(...point)
  const orient = (rig: typeof arms[number], pose: Chain) => {
    rig.root.position.copy(vector(pose.root))
    rig.root.quaternion.setFromUnitVectors(axis, vector(pose.joint).sub(vector(pose.root)).normalize())
    const lower = new THREE.Quaternion().setFromUnitVectors(axis, vector(pose.end).sub(vector(pose.joint)).normalize())
    rig.joint.quaternion.copy(rig.root.quaternion).invert().multiply(lower)
    // Linear skinning around the elbow/knee preserves a single uninterrupted surface.
    // Shared geometry keeps outline, fur and halo shells in lockstep with the sleeve.
    const p = rig.sleeve.getAttribute('position'), n = rig.sleeve.getAttribute('normal')
    const point = new THREE.Vector3(), normal = new THREE.Vector3(), bent = new THREE.Vector3()
    const pivot = new THREE.Vector3(0, -rig.upperLength, 0)
    for (let i = 0; i < p.count; i++) {
      point.fromArray(rig.restPosition, i * 3)
      const weight = THREE.MathUtils.smoothstep(-point.y, rig.upperLength - 0.095, rig.upperLength + 0.095)
      bent.copy(point).sub(pivot).applyQuaternion(rig.joint.quaternion).add(pivot)
      point.lerp(bent, weight)
      p.setXYZ(i, point.x, point.y, point.z)
      normal.fromArray(rig.restNormal, i * 3)
      bent.copy(normal).applyQuaternion(rig.joint.quaternion)
      normal.lerp(bent, weight).normalize()
      n.setXYZ(i, normal.x, normal.y, normal.z)
    }
    p.needsUpdate = true
    n.needsUpdate = true
    rig.sleeve.computeBoundingBox()
    rig.sleeve.computeBoundingSphere()
  }
  return {
    group, torsoMesh, collar, arms,
    update(pose: ReturnType<typeof anthroPose>, wave: number) {
      torso.position.set(pose.shift, ANTHRO.torsoY + pose.breath, 0)
      torso.rotation.z = pose.shoulderRoll
      torso.scale.y = 1 + pose.breath * 0.6
      arms.forEach((rig, i) => {
        const p = pose.arms[i]!
        orient(rig, p)
        // The wrist counter-rotates independently of the elbow during the greeting.
        const desired = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.handPitch, 0, p.handRoll))
        const forearm = rig.root.quaternion.clone().multiply(rig.joint.quaternion)
        rig.end.quaternion.copy(forearm).invert().multiply(desired)
        rig.pads.visible = wave > 0.5 && i === 1
      })
      legs.forEach((rig, i) => {
        const p = pose.legs[i]!
        orient(rig, p)
        rig.end.position.copy(vector(p.end))
        rig.end.rotation.y = (i === 0 ? -1 : 1) * 0.10
      })
    },
  }
}

function line(points: number[][], radius: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 12, radius, 5, false), material)
}
