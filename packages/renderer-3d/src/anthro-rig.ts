/** Articulated anthro body. Every surface goes through the renderer's existing style finish. */
import * as THREE from 'three'
import { ANTHRO, anthroPose, ARM_LENGTHS, LEG_LENGTHS, type Chain, type Point } from './anthro'
import { anthroForm, limbSleeve } from './sculpt'

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
  // A low relief cloud replaces the neck outfit; the head overlaps the pear body.
  const collar = new THREE.Group()
  collar.name = 'anthro-collar'
  torso.add(collar)
  collar.visible = false
  const emblem = new THREE.Group()
  emblem.name = 'anthro-chest-emblem'
  torso.add(emblem)
  emblem.visible = style === 'plush'
  for (const [x, y, radius] of [[-0.085, 0.09, 0.075], [0, 0.14, 0.092], [0.085, 0.09, 0.075], [0, 0.075, 0.085]]) {
    const lobe = add(emblem, new THREE.SphereGeometry(1, 24, 16), cloth, 'mesh-cloud-decal', false)
    lobe.position.set(x!, y!, 0.405)
    lobe.scale.set(radius!, radius!, 0.012)
  }

  const makeChain = (kind: 'arm' | 'leg', side: number) => {
    const lengths = kind === 'arm' ? ARM_LENGTHS : LEG_LENGTHS
    const root = new THREE.Group(), joint = new THREE.Group()
    root.name = `anthro-${kind === 'arm' ? 'shoulder' : 'hip'}-${side < 0 ? 'l' : 'r'}`
    joint.name = `anthro-${kind === 'arm' ? 'elbow' : 'knee'}-${side < 0 ? 'l' : 'r'}`
    group.add(root)
    root.add(joint)
    joint.position.y = -lengths[0]
    const sleeve = limbSleeve(lengths[0], lengths[1], kind === 'arm' ? 0.155 : 0.175, kind === 'arm' ? 0.14 : 0.16, kind === 'arm' ? 0.12 : 0.135, detail)
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
        const seam = line([[x, -0.13, 0.095], [x, -0.17, 0.075], [x * 0.95, -0.20, 0.045]], 0.0012, ink)
        end.add(seam)
      }
    } else {
      surface.position.set(0, -0.04, 0.015)
      for (const x of [-0.055, 0.055])
        end.add(line([[x, 0.045, 0.21], [x, 0.025, 0.255], [x, -0.015, 0.29]], 0.0012, ink))
    }
    const pads = new THREE.Group()
    pads.name = 'anthro-palm-pads'
    if (kind === 'arm') {
      end.add(pads)
      const palm = add(pads, new THREE.SphereGeometry(1, 16, 12), pink, 'mesh-anthro-palm', false)
      palm.position.set(0, -0.055, 0.117)
      palm.scale.set(0.060, 0.055, 0.010)
      for (let i = -1; i <= 1; i++) {
        const toe = add(pads, new THREE.SphereGeometry(1, 12, 8), pink, 'mesh-anthro-finger-pad', false)
        toe.position.set(i * 0.060, -0.155 + Math.abs(i) * 0.015, 0.108)
        toe.scale.set(0.025, 0.028, 0.009)
      }
    }
    return { root, joint, end, pads, sleeve, restPosition, restNormal, upperLength: lengths[0], lowerLength: lengths[1], kind }
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
    const reach = vector(pose.joint).distanceTo(vector(pose.root)) / rig.upperLength
    rig.joint.position.y = -rig.upperLength * reach
    if (rig.kind === 'arm') rig.end.position.y = -rig.lowerLength * reach
    // Linear skinning around the elbow/knee preserves a single uninterrupted surface.
    // Shared geometry keeps outline, fur and halo shells in lockstep with the sleeve.
    const p = rig.sleeve.getAttribute('position'), n = rig.sleeve.getAttribute('normal')
    const point = new THREE.Vector3(), normal = new THREE.Vector3(), bent = new THREE.Vector3()
    const pivot = new THREE.Vector3(0, -rig.upperLength * reach, 0)
    for (let i = 0; i < p.count; i++) {
      point.fromArray(rig.restPosition, i * 3)
      const weight = THREE.MathUtils.smoothstep(-point.y, rig.upperLength - 0.095, rig.upperLength + 0.095)
      point.y *= reach
      bent.copy(point).sub(pivot).applyQuaternion(rig.joint.quaternion).add(pivot)
      point.lerp(bent, weight)
      p.setXYZ(i, point.x, point.y, point.z)
      normal.fromArray(rig.restNormal, i * 3)
      normal.y /= reach
      normal.normalize()
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
    group, torsoMesh, collar, emblem, arms,
    update(pose: ReturnType<typeof anthroPose>) {
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
        rig.pads.visible = p.palm > 0.5
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
