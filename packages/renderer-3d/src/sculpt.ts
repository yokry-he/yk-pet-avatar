/** Small, deterministic surface builders. All dimensions are in pet-local units. */
import * as THREE from 'three'

/** A closed, smooth pear/head surface, sculpted from a UV cage. */
export function sculptedForm(kind: 'head' | 'body' | 'limb' | 'foot', detail = 40): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75))
  const p = geometry.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i)
    if (kind === 'head') {
      const cheek = Math.exp(-(((y + 0.36) / 0.24) ** 2))
      const px = x * (0.6 + cheek * 0.095),
        py = y * 0.51
      const muzzle =
        z > 0 ? 0.13 * Math.exp(-((px / 0.3) ** 2) - ((py + 0.22) / 0.19) ** 2) * Math.min(1, z * 4) : 0
      const fluff =
        (0.10 * Math.exp(-(((py + 0.16) / 0.021) ** 2)) +
          0.105 * Math.exp(-(((py + 0.245) / 0.020) ** 2)) +
          0.10 * Math.exp(-(((py + 0.32) / 0.020) ** 2))) *
        Math.abs(x) ** 4
      p.setXYZ(i, px + Math.sign(x) * fluff, py, z * (0.405 + cheek * 0.018) + muzzle)
    } else if (kind === 'body') {
      const pear = 1 - y * 0.23
      p.setXYZ(i, x * 0.355 * pear, y * 0.48, z * 0.3 * pear)
    } else if (kind === 'limb') {
      const taper = 1 - y * 0.16
      p.setXYZ(i, x * 0.115 * taper, y * 0.265, z * 0.13 * taper)
    } else {
      p.setXYZ(i, x * 0.17 * (1 - y * 0.12), y * 0.2, z * 0.15)
    }
  }
  geometry.computeVertexNormals()
  return geometry
}

/** A rounded triangular ear, with a broad root and gently bent tip, never a cone. */
export function earSurface(height: number, width: number, depth: number, detail = 24): THREE.BufferGeometry {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  for (let j = 0; j <= detail; j++) {
    const t = j / detail
    const w = Math.max(0.001, width * (1 + 0.32 * Math.sin(t * Math.PI)) * (1 - t) ** 0.72)
    for (let i = 0; i <= detail; i++) {
      const a = (i / detail) * Math.PI * 2
      positions.push(
        Math.cos(a) * w,
        t * height,
        Math.sin(a) * depth * Math.sin(Math.PI * (0.12 + t * 0.88)) + t * t * 0.035,
      )
      uv.push(i / detail, t)
      if (i < detail && j < detail) {
        const k = j * (detail + 1) + i
        indices.push(k, k + detail + 1, k + 1, k + 1, k + detail + 1, k + detail + 2)
      }
    }
  }
  return surface(positions, uv, indices)
}

/** A pillow-like sculpted patch. The outline is a smooth closed spline in XY. */
export function pillowSurface(
  outline: number[][],
  depth: (x: number, y: number, r: number) => number,
  rings = 10,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    outline.map((p) => new THREE.Vector3(p[0], p[1], 0)),
    true,
    'centripetal',
  )
  const samples = 80
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  const center = outline
    .reduce((v, p) => v.add(new THREE.Vector2(p[0], p[1])), new THREE.Vector2())
    .multiplyScalar(1 / outline.length)
  for (let j = 0; j <= rings; j++) {
    const r = Math.max(0.0001, j / rings)
    for (let i = 0; i <= samples; i++) {
      const edge = curve.getPoint(i / samples)
      const x = THREE.MathUtils.lerp(center.x, edge.x, r),
        y = THREE.MathUtils.lerp(center.y, edge.y, r)
      positions.push(x, y, depth(x, y, r))
      uv.push(x + 0.5, y + 0.5)
      if (j < rings && i < samples) {
        const k = j * (samples + 1) + i
        indices.push(k, k + 1, k + samples + 1, k + 1, k + samples + 2, k + samples + 1)
      }
    }
  }
  return surface(positions, uv, indices)
}

/** One full, curved tail with a gently swept, continuous cream-tip boundary. */
export function sweptTail(thin = false, detail = 48): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.29, 0.03, -0.1),
    new THREE.Vector3(0.59, 0.24, -0.09),
    new THREE.Vector3(0.70, 0.57, -0.015),
    new THREE.Vector3(0.63, 0.83, 0.025),
    new THREE.Vector3(0.48, 0.94, 0.04),
  ])
  const radial = 24,
    frames = curve.computeFrenetFrames(detail, false)
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  const bodyIndices: number[] = [],
    tipIndices: number[] = []
  const geometry = new THREE.BufferGeometry()
  for (let j = 0; j <= detail; j++) {
    const row = j / detail,
      split = Math.round(detail * 0.65) / detail
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2
      const seam = thin ? split : 0.69 + 0.014 * Math.cos(a)
      const t = row <= split ? (row / split) * seam : seam + ((row - split) / (1 - split)) * (1 - seam)
      const center = curve.getPointAt(t),
        frame = Math.min(detail - 1, Math.floor(t * detail)),
        fraction = t * detail - frame,
        normal = frames.normals[frame]!.clone().lerp(frames.normals[frame + 1]!, fraction).normalize(),
        binormal = frames.binormals[frame]!.clone().lerp(frames.binormals[frame + 1]!, fraction).normalize()
      const radius = thin
        ? 0.048 * Math.sin(Math.PI * (0.1 + t * 0.9))
        : 0.038 * (1 - t) + 0.245 * Math.sin(Math.PI * t) ** 0.78
      const v = center
        .clone()
        .addScaledVector(normal, Math.cos(a) * Math.max(0.001, radius))
        .addScaledVector(binormal, Math.sin(a) * Math.max(0.001, radius) * 0.84)
      positions.push(v.x, v.y, v.z)
      uv.push(i / radial, t)
      if (j < detail && i < radial) {
        const k = j * (radial + 1) + i
        const target = !thin && row >= split ? tipIndices : bodyIndices
        target.push(k, k + 1, k + radial + 1, k + 1, k + radial + 2, k + radial + 1)
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  indices.push(...bodyIndices, ...tipIndices)
  geometry.setIndex(indices)
  geometry.addGroup(0, bodyIndices.length, 0)
  if (tipIndices.length) geometry.addGroup(bodyIndices.length, tipIndices.length, 1)
  geometry.computeVertexNormals()
  return geometry
}

function surface(positions: number[], uv: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Fits both axes with a margin, including portrait viewports. */
export function cameraFit(width: number, height: number, aspect: number, fovDegrees = 32): number {
  const halfFov = THREE.MathUtils.degToRad(fovDegrees / 2)
  return (Math.max(height / 2, width / (2 * Math.max(0.1, aspect))) / Math.tan(halfFov)) * 1.2
}

/** Bounds of visible surfaces; atmospheric glow must not shrink the actual character. */
export function visualBounds(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  object.updateWorldMatrix(true, true)
  object.traverseVisible((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.geometry || node.userData.ignoreFraming) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld))
  })
  return box
}

/** Chibi anatomy: broad shoulders, a soft waist, a rounded hip and a thumb in the mitten contour. */
export function anthroForm(kind: 'torso' | 'hand' | 'boot' | 'ruff', detail = 40): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75))
  const p = geometry.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    if (kind === 'torso') {
      const waist = 1 - 0.045 * Math.exp(-((y / 0.35) ** 2))
      const shoulder = 1 + 0.10 * Math.exp(-(((y - 0.58) / 0.28) ** 2))
      p.setXYZ(i, x * 0.34 * waist * shoulder, y * 0.35, z * 0.265 * waist)
    } else if (kind === 'hand') {
      const thumb = 0.055 * Math.exp(-(((y - 0.22) / 0.35) ** 2)) * Math.max(0, -x) ** 3
      p.setXYZ(i, x * 0.14 - thumb, y * 0.145, z * 0.105)
    } else if (kind === 'boot') {
      // Slightly flattened sole, broad toes projecting in +Z, small ankle at the back.
      p.setXYZ(i, x * 0.18 * (1 + z * 0.10), Math.max(-0.105, y * 0.12), z * 0.225 + 0.065)
    } else {
      const scallop = 1 + 0.055 * Math.cos(Math.atan2(z, x) * 9)
      p.setXYZ(i, x * 0.285 * scallop, y * 0.085 - Math.max(0, z) * 0.045, z * 0.24 * scallop)
    }
  }
  geometry.computeVertexNormals()
  return geometry
}

/** One continuous sleeve across the joint, ready for two-bone deformation. */
export function limbSleeve(upper: number, lower: number, root: number, joint: number, end: number, detail = 28): THREE.BufferGeometry {
  const length = upper + lower
  const profile = [
    [-length - end * 0.60, 0], [-length - end * 0.35, end * 0.72],
    [-length, end], [-upper - lower * 0.55, end * 0.4 + joint * 0.6],
    [-upper, joint], [-upper * 0.55, root * 1.04],
    [0, root * 0.94], [root * 0.45, root * 0.65], [root * 0.60, 0],
  ]
  const curve = new THREE.SplineCurve(profile.map(([y, radius]) => new THREE.Vector2(radius, y)))
  const points = Array.from({ length: 49 }, (_, i) => {
    const p = curve.getPoint(i / 48)
    return new THREE.Vector2(Math.max(0, p.x), p.y)
  })
  return new THREE.LatheGeometry(points, detail)
}
