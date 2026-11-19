/** Standing glass is a single translucent volume, including its ears and tail. */
export type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

interface Layer {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: DrawContext
}
interface GlassLayers { mask: Layer; material: Layer; edge?: Layer }
const layers = new WeakMap<DrawContext, GlassLayers>()

function createLayer(): Layer | undefined {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas')
    : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : undefined
  if (!canvas) return undefined
  const ctx = canvas.getContext('2d') as DrawContext | null
  return ctx ? { canvas, ctx } : undefined
}

function reset(layer: Layer, width: number, height: number): void {
  if (layer.canvas.width !== width) layer.canvas.width = width
  if (layer.canvas.height !== height) layer.canvas.height = height
  layer.ctx.resetTransform()
  layer.ctx.globalAlpha = 1
  layer.ctx.globalCompositeOperation = 'source-over'
  layer.ctx.clearRect(0, 0, width, height)
}

/** The trace callback fills geometry opaquely; no per-part material or outlines enter the mask. */
export function compositeGlass(
  ctx: DrawContext, trace: (mask: DrawContext) => void,
  opacity: number, outlineWidth: number, detail: boolean,
): boolean {
  let pair = layers.get(ctx)
  if (!pair) {
    const mask = createLayer()
    const material = createLayer()
    if (!mask || !material) return false
    pair = { mask, material }
    layers.set(ctx, pair)
  }
  const { width, height } = ctx.canvas
  const transform = ctx.getTransform()
  const scale = Math.hypot(transform.a, transform.b)
  const { mask, material } = pair
  reset(mask, width, height)
  mask.ctx.save(); mask.ctx.setTransform(transform)
  trace(mask.ctx)
  mask.ctx.restore()

  reset(material, width, height)
  if (outlineWidth > 0) {
    // Dilate the union mask, then remove its interior: only the exterior gets a rim.
    const samples = detail ? 8 : 4
    const radius = outlineWidth * scale * 0.65
    for (let i = 0; i < samples; i++) {
      const angle = i / samples * Math.PI * 2
      material.ctx.drawImage(mask.canvas, Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    material.ctx.globalCompositeOperation = 'destination-out'
    material.ctx.drawImage(mask.canvas, 0, 0)
    material.ctx.globalCompositeOperation = 'source-in'
    material.ctx.setTransform(transform)
    const rim = material.ctx.createLinearGradient(-70, -160, 100, 100)
    rim.addColorStop(0, '#b9fdff'); rim.addColorStop(0.45, '#78e5ff')
    rim.addColorStop(0.75, '#dfb6ff'); rim.addColorStop(1, '#9b8fff')
    material.ctx.fillStyle = rim
    material.ctx.fillRect(-1024, -1024, 2048, 2048)
    ctx.save(); ctx.resetTransform(); ctx.globalAlpha *= opacity
    if (detail) { ctx.shadowBlur = 7; ctx.shadowColor = '#8adfff' }
    ctx.drawImage(material.canvas, 0, 0); ctx.restore()
  }

  reset(material, width, height)
  const brush = material.ctx
  brush.setTransform(transform)
  const field = brush.createLinearGradient(-70, -150, 95, 100)
  field.addColorStop(0, '#72d5f1'); field.addColorStop(0.28, '#7098d4')
  field.addColorStop(0.56, '#6d5bb6'); field.addColorStop(0.82, '#ae7bda')
  field.addColorStop(1, '#d7b0f3')
  brush.fillStyle = field; brush.fillRect(-1024, -1024, 2048, 2048)
  const depth = brush.createRadialGradient(28, 0, 0, 28, 0, 135)
  depth.addColorStop(0, 'rgba(34,31,117,0.6)')
  depth.addColorStop(0.65, 'rgba(61,44,151,0.22)'); depth.addColorStop(1, 'rgba(61,44,151,0)')
  brush.fillStyle = depth; brush.fillRect(-1024, -1024, 2048, 2048)
  const light = brush.createRadialGradient(-51, -28, 0, -51, -28, 130)
  light.addColorStop(0, 'rgba(137,247,255,0.48)')
  light.addColorStop(0.55, 'rgba(137,247,255,0.12)'); light.addColorStop(1, 'rgba(137,247,255,0)')
  brush.fillStyle = light; brush.fillRect(-1024, -1024, 2048, 2048)
  // Broad optical pools describe round volumes without introducing joint outlines.
  brush.save(); brush.translate(-20, -81); brush.scale(78, 58)
  const headLight = brush.createRadialGradient(0, 0, 0, 0, 0, 1)
  headLight.addColorStop(0, 'rgba(183,247,255,0.28)'); headLight.addColorStop(1, 'rgba(183,247,255,0)')
  brush.fillStyle = headLight; brush.fillRect(-1, -1, 2, 2); brush.restore()
  brush.save(); brush.translate(-14, 36); brush.scale(32, 59)
  const bodyLight = brush.createRadialGradient(0, 0, 0, 0, 0, 1)
  bodyLight.addColorStop(0, 'rgba(119,232,255,0.28)'); bodyLight.addColorStop(1, 'rgba(119,232,255,0)')
  brush.fillStyle = bodyLight; brush.fillRect(-1, -1, 2, 2); brush.restore()
  if (detail) {
    // A Fresnel glow follows the union's inside edge, never the hidden edges of its parts.
    pair.edge ??= createLayer()
    if (pair.edge) {
      const edge = pair.edge
      // The soft optical glow can use half resolution; the silhouette/rim remain full resolution.
      const edgeWidth = Math.ceil(width / 2)
      const edgeHeight = Math.ceil(height / 2)
      const sx = edgeWidth / width
      const sy = edgeHeight / height
      reset(edge, edgeWidth, edgeHeight)
      edge.ctx.filter = `blur(${3 * scale * sx}px)`
      edge.ctx.drawImage(mask.canvas, 0, 0, edgeWidth, edgeHeight)
      edge.ctx.filter = 'none'
      edge.ctx.globalCompositeOperation = 'source-out'
      edge.ctx.drawImage(mask.canvas, 0, 0, edgeWidth, edgeHeight)
      edge.ctx.globalCompositeOperation = 'source-in'
      edge.ctx.setTransform(transform.a * sx, transform.b * sy, transform.c * sx,
        transform.d * sy, transform.e * sx, transform.f * sy)
      const edgeLight = edge.ctx.createLinearGradient(-60, -140, 80, 90)
      edgeLight.addColorStop(0, '#adf8ff'); edgeLight.addColorStop(0.5, '#8aefff')
      edgeLight.addColorStop(1, '#d6a6ff')
      edge.ctx.fillStyle = edgeLight; edge.ctx.fillRect(-1024, -1024, 2048, 2048)
      brush.save(); brush.resetTransform(); brush.globalCompositeOperation = 'screen'
      brush.drawImage(edge.canvas, 0, 0, width, height); brush.restore()
    }
  }
  brush.resetTransform(); brush.globalCompositeOperation = 'destination-in'
  brush.drawImage(mask.canvas, 0, 0)
  ctx.save(); ctx.resetTransform(); ctx.globalAlpha *= opacity * 0.73
  ctx.drawImage(material.canvas, 0, 0); ctx.restore()
  return true
}
