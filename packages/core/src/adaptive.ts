/**
 * 文件职责 / File responsibility
 * 纯函数版的 2D/3D 选择，原因枚举与 yk-pets RuntimeHealthEvaluator 对齐。
 * Pure 2D/3D selection. Reason codes line up with yk-pets RuntimeHealthEvaluator
 * so a host can share probes between the two.
 */

import type { CapabilityProbe, FallbackReason, RendererKind, RuntimeEvaluation } from './types'

export interface AdaptivePolicy {
  minimumFps: number
  maximumLongTaskRatio: number
  minimumDeviceMemoryGb: number
  minimumBatteryLevel: number
  prefer2DWhenReducedMotion: boolean
  prefer2DWhenSaveData: boolean
  prefer2DWhenLowBattery: boolean
  prefer2DWhenLowMemory: boolean
}

export const DEFAULT_ADAPTIVE_POLICY: AdaptivePolicy = {
  minimumFps: 30,
  maximumLongTaskRatio: 0.18,
  minimumDeviceMemoryGb: 3,
  minimumBatteryLevel: 0.18,
  prefer2DWhenReducedMotion: true,
  prefer2DWhenSaveData: true,
  prefer2DWhenLowBattery: true,
  prefer2DWhenLowMemory: true,
}

function decision(
  target: RendererKind,
  reason: FallbackReason,
  hard: boolean,
  healthyFor3D: boolean,
  details: string[],
): RuntimeEvaluation {
  return { target, reason, hard, healthyFor3D, details }
}

export function evaluateRenderer(probe: CapabilityProbe, policy: Partial<AdaptivePolicy> = {}): RuntimeEvaluation {
  const options = { ...DEFAULT_ADAPTIVE_POLICY, ...policy }
  const preference = probe.preference ?? 'auto'
  const details: string[] = []

  if (!probe.webglSupported) {
    return decision('2d', 'webgl-unsupported', true, false, ['WebGL unavailable'])
  }
  if (probe.webglContextLost) {
    return decision('2d', 'webgl-context-lost', true, false, ['WebGL context lost'])
  }
  if (preference === '2d') {
    return decision('2d', 'manual-2d', true, false, ['Preference 2D'])
  }
  if (preference === '3d') {
    return decision('3d', 'manual-3d', true, true, ['Preference 3D'])
  }
  if (options.prefer2DWhenReducedMotion && probe.reducedMotion) {
    details.push('Reduced motion')
    return decision('2d', 'reduced-motion', false, false, details)
  }
  if (options.prefer2DWhenSaveData && probe.saveData) {
    details.push('Save-Data')
    return decision('2d', 'save-data', false, false, details)
  }
  if (
    options.prefer2DWhenLowBattery
    && typeof probe.batteryLevel === 'number'
    && !probe.charging
    && probe.batteryLevel <= options.minimumBatteryLevel
  ) {
    details.push(`Battery ${(probe.batteryLevel * 100).toFixed(0)}%`)
    return decision('2d', 'low-battery', false, false, details)
  }
  if (
    options.prefer2DWhenLowMemory
    && typeof probe.deviceMemoryGb === 'number'
    && probe.deviceMemoryGb < options.minimumDeviceMemoryGb
  ) {
    details.push(`Memory ${probe.deviceMemoryGb} GB`)
    return decision('2d', 'low-memory', false, false, details)
  }
  if (typeof probe.averageFps === 'number' && probe.averageFps < options.minimumFps) {
    details.push(`FPS ${probe.averageFps.toFixed(1)}`)
    return decision('2d', 'low-fps', false, false, details)
  }
  if (typeof probe.longTaskRatio === 'number' && probe.longTaskRatio > options.maximumLongTaskRatio) {
    details.push(`Long tasks ${(probe.longTaskRatio * 100).toFixed(0)}%`)
    return decision('2d', 'long-tasks', false, false, details)
  }
  return decision('3d', 'recovered', false, true, ['Runtime healthy'])
}
