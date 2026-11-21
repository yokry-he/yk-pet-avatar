import './editor.css'
import {
  ACTION_CATALOG,
  PRESET_COLORS,
  presetConfig,
  POSES,
  type PetPose,
  SPECIES_PART_DEFAULTS,
  listStyles,
  type Emotion,
  type PetAction,
  type PetConfig,
  type PetStyleId,
  type RendererPreference,
  type Species,
} from '@yk-pet/core'
import { defineYkPet, type YkPetElement } from '@yk-pet/element'
import { translate, type Lang, type MessageKey } from './i18n'

type Theme = 'soft' | 'pro' | 'glass'
type Mode = 'simple' | 'pro'

const ACTIONS: PetAction[] = ['idle', 'walk', 'wave', 'jump', 'happy', 'sleep', 'thinking', 'eating', 'sad']
const EMOTIONS: Emotion[] = ['neutral', 'happy', 'sad', 'excited', 'shy', 'surprised', 'love', 'focused']
const STATES = ['idle', 'thinking', 'working', 'success', 'error'] as const
const EARS = ['pointy', 'round', 'floppy', 'long'] as const
const ACCESSORIES = ['bow', 'scarf', 'glasses', 'flower', 'hat'] as const
const TREE = [
  { id: 'root', children: [
    { id: 'head', children: [{ id: 'ears' }, { id: 'eyes' }, { id: 'muzzle' }, { id: 'nose' }] },
    { id: 'body' },
    { id: 'tail' },
    { id: 'accessories' },
  ] },
]

const query = new URLSearchParams(location.search)
const saved = readSaved()
let lang: Lang = (query.get('lang') as Lang) || saved.lang || 'zh'
let theme: Theme = (query.get('theme') as Theme) || saved.theme || 'soft'
let mode: Mode = (query.get('mode') as Mode) || saved.mode || 'simple'
let category = 'appearance'
let tab = 'morph'
let part = 'root'
const log: string[] = []

defineYkPet()
const app = document.querySelector('#app') as HTMLElement
app.innerHTML = shell()
const pet = app.querySelector('yk-pet') as YkPetElement
pet.preference = (query.get('renderer') as RendererPreference) || '2d'
pet.config = { behavior: { autonomous: true } }
const paletteParam = query.get('palette')
if (paletteParam && Object.hasOwn(PRESET_COLORS, paletteParam)) {
  const preset = presetConfig(paletteParam)
  pet.setConfig({ species: preset.species, appearance: { colors: preset.appearance.colors, parts: preset.appearance.parts, accessories: preset.appearance.accessories } })
}
const styleParam = query.get('style') as PetStyleId | null
if (styleParam && listStyles().some(style => style.id === styleParam)) pet.setConfig({ style: styleParam })
const poseParam = query.get('pose')
if ((POSES as readonly string[]).includes(poseParam ?? '')) pet.setConfig({ appearance: { pose: poseParam as PetPose } })
if (query.get('model') === 'felt-fox') {
  pet.setConfig({
    model: {
      url: new URL('../../../examples/models/felt-fox.glb', import.meta.url).href,
      animations: { idle: 'idle', wave: 'wave', happy: 'happy', success: 'success' },
    },
    behavior: { autonomous: false },
  })
}
const actionParam = query.get('action')
if (actionParam) {
  pet.setConfig({ behavior: { autonomous: false } })
  const hold = query.get('hold') === '1'
  pet.play(actionParam, hold ? { hold: true, sampleTime: 0.6 } : {})
}
const emotionParam = query.get('emotion')
if (emotionParam) pet.setEmotion(emotionParam)
applyTheme()
bind()
refresh()
if (query.get('say') === '1') {
  window.setTimeout(() => pet.say(lang === 'zh' ? '你好，我是小云' : "Hi! I'm your pet."), 400)
}

function shell(): string {
  return `
  <header>
    <div class="brand"><div class="paw">🐾</div><div><h1 data-i18n="title"></h1><p data-i18n="subtitle"></p></div></div>
    <div class="seg" id="renderer">${['2d', '3d'].map(kind => `<button type="button" data-renderer="${kind}">${kind.toUpperCase()}</button>`).join('')}</div>
    <div class="themes" id="themes">
      ${(['soft', 'pro', 'glass'] as Theme[]).map(id => `<button type="button" data-theme="${id}" data-i18n="theme${id === 'soft' ? 'Soft' : id === 'pro' ? 'Pro' : 'Glass'}"></button>`).join('')}
    </div>
    <button type="button" class="chip" id="mode"></button>
    <button type="button" class="chip" id="lang" data-i18n="lang"></button>
    <button type="button" class="primary" id="export" data-i18n="export"></button>
  </header>
  <aside class="left">
    <nav class="nav simple-only" id="nav">
      ${['appearance', 'style', 'actions', 'behavior', 'agent'].map(id => `<button type="button" data-cat="${id}" data-i18n="${id}"></button>`).join('')}
    </nav>
    <div class="pro-only">
      <h2 data-i18n="parts"></h2>
      <ul class="tree" id="tree"></ul>
    </div>
    <div id="style-list"></div>
  </aside>
  <section class="viewport" id="viewport">
    <yk-pet></yk-pet>
    <div class="gizmo pro-only" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="badge" id="badge">2D</div>
  </section>
  <section class="agent">
    <h2 data-i18n="agentLog"></h2>
    <div class="agent-row">
      <input id="say-input" data-i18n-placeholder="sayPlaceholder" />
      <button type="button" class="chip" id="say" data-i18n="say"></button>
      <button type="button" class="chip" id="think" data-i18n="think"></button>
    </div>
    <div class="chips" id="emotions"></div>
    <div class="chips" id="states"></div>
    <ul class="log" id="log"></ul>
  </section>
  <aside class="inspector">
    <div class="simple-only">
      <section class="panel" data-panel="appearance"></section>
      <section class="panel" data-panel="style"></section>
      <section class="panel" data-panel="actions"></section>
      <section class="panel" data-panel="behavior"></section>
      <section class="panel" data-panel="agent"><p data-i18n="agentLog"></p></section>
    </div>
    <div class="pro-only">
      <div class="tabs" id="tabs">
        ${['morph', 'bone', 'material', 'shader'].map(id => `<button type="button" class="tab" data-tab="${id}" data-i18n="${id}"></button>`).join('')}
      </div>
      <div id="pro-body"></div>
    </div>
    <h2 data-i18n="json"></h2>
    <textarea id="json" spellcheck="false"></textarea>
    <button type="button" class="chip" id="import" data-i18n="import"></button>
  </aside>
  <footer class="timeline">
    <strong data-i18n="timeline"></strong>
    <div class="chips" id="action-chips"></div>
  </footer>`
}

function bind(): void {
  app.querySelector('#export')?.addEventListener('click', () => download(pet.exportConfig()))
  app.querySelector('#import')?.addEventListener('click', () => {
    const text = (app.querySelector('#json') as HTMLTextAreaElement).value
    pet.importConfig(text)
    refresh()
  })
  app.querySelector('#mode')?.addEventListener('click', () => { mode = mode === 'simple' ? 'pro' : 'simple'; applyTheme(); refresh() })
  app.querySelector('#lang')?.addEventListener('click', () => { lang = lang === 'zh' ? 'en' : 'zh'; applyTheme(); refresh() })
  app.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(button => {
    button.addEventListener('click', () => { theme = button.dataset.theme as Theme; applyTheme() })
  })
  app.querySelectorAll<HTMLButtonElement>('[data-renderer]').forEach(button => {
    button.addEventListener('click', () => { pet.preference = button.dataset.renderer as RendererPreference; refresh() })
  })
  app.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach(button => {
    button.addEventListener('click', () => { category = button.dataset.cat || 'appearance'; refresh() })
  })
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => {
    button.addEventListener('click', () => { tab = button.dataset.tab || 'morph'; refresh() })
  })
  app.querySelector('#say')?.addEventListener('click', () => send('say'))
  app.querySelector('#think')?.addEventListener('click', () => send('think'))
  app.querySelector('#say-input')?.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') send('say')
  })
  const viewport = app.querySelector('#viewport') as HTMLElement
  let dragging = false
  let lastX = 0
  viewport.addEventListener('pointerdown', (event) => {
    if (mode !== 'pro' || pet.preference !== '3d') return
    dragging = true
    lastX = event.clientX
  })
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return
    pet.viewYaw += (event.clientX - lastX) * 0.01
    lastX = event.clientX
  })
  window.addEventListener('pointerup', () => { dragging = false })
  pet.addEventListener('yk-renderer', (event) => {
    const detail = (event as CustomEvent<{ kind: string }>).detail
    const badge = app.querySelector('#badge')
    if (badge) badge.textContent = detail.kind.toUpperCase()
  })
  window.setInterval(() => {
    const area = app.querySelector('#json') as HTMLTextAreaElement | null
    if (area && document.activeElement !== area) area.value = pet.exportConfig()
    paintStats()
  }, 500)
}

function refresh(): void {
  applyI18n()
  const config = pet.getConfig()
  paintPressed('[data-theme]', theme, 'theme')
  paintPressed('[data-renderer]', pet.preference, 'renderer')
  paintPressed('[data-cat]', category, 'cat')
  paintPressed('[data-tab]', tab, 'tab')
  const modeButton = app.querySelector('#mode')
  if (modeButton) modeButton.textContent = mode === 'simple' ? t('pro') : t('simple')
  paintStyles()
  paintTree()
  paintSimple(config)
  paintPro(config)
  paintActions()
  paintAgent()
  const area = app.querySelector('#json') as HTMLTextAreaElement
  area.value = pet.exportConfig()
  persist()
}

function paintStyles(): void {
  const host = app.querySelector('#style-list') as HTMLElement
  const current = pet.getConfig().style
  host.innerHTML = listStyles().map(style => `
    <button type="button" class="style-card" data-style="${style.id}" aria-pressed="${style.id === current}">
      <strong>${t(style.id as MessageKey)}</strong>
      <small>${t(`${style.id}Hint` as MessageKey)}${style.support.d2 === 'approx' ? ` · ${t('support2d')}` : ''}</small>
    </button>`).join('')
  host.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(button => {
    button.addEventListener('click', () => {
      pet.setConfig({ style: button.dataset.style as PetStyleId })
      refresh()
    })
  })
}

function paintTree(): void {
  const root = app.querySelector('#tree') as HTMLElement
  const render = (nodes: typeof TREE): string => `<ul>${nodes.map(node => `
    <li><button type="button" data-part="${node.id}" aria-pressed="${part === node.id}">${t((node.id === 'root' ? 'root' : node.id) as MessageKey)}</button>
    ${'children' in node && node.children ? render(node.children as typeof TREE) : ''}</li>`).join('')}</ul>`
  root.innerHTML = render(TREE)
  root.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(button => {
    button.addEventListener('click', () => { part = button.dataset.part || 'root'; refresh() })
  })
}

function paintSimple(config: PetConfig): void {
  const appearance = app.querySelector('[data-panel="appearance"]') as HTMLElement
  appearance.hidden = category !== 'appearance'
  appearance.innerHTML = `
    <h2>${t('species')}</h2>
    <div class="chips">${(['fox', 'cat', 'bunny', 'custom'] as Species[]).map(id => `<button type="button" class="chip" data-species="${id}" aria-pressed="${config.species === id}">${t(id)}</button>`).join('')}</div>
    ${poseControl(config)}
    ${slider(t('bodySize'), 'bodyScale', config.appearance.proportions.bodyScale, 0.6, 1.6)}
    <h2>${t('earShape')}</h2>
    <div class="ears">${EARS.map(id => `<button type="button" class="ear" data-ear="${id}" aria-pressed="${config.appearance.parts.ears === id}">${t(id)}</button>`).join('')}</div>
    <h2>${t('color')}</h2>
    <div class="swatches">${Object.entries(PRESET_COLORS).map(([name, preset]) => `<button type="button" class="swatch" data-palette="${name}" style="background:${preset.colors.body}" title="${name}"></button>`).join('')}
      <input type="color" id="body-color" value="${toHex(config.appearance.colors.body)}" /></div>
    <h2>${t('accessories')}</h2>
    <div class="accs">${ACCESSORIES.map(id => `<button type="button" class="acc" data-acc="${id}" aria-pressed="${config.appearance.accessories.some(item => item.kind === id)}">${t(id)}</button>`).join('')}</div>`
  appearance.querySelectorAll<HTMLButtonElement>('[data-species]').forEach(button => button.addEventListener('click', () => {
    const species = button.dataset.species as Species
    pet.setConfig({ species, appearance: { parts: SPECIES_PART_DEFAULTS[species] } })
    refresh()
  }))
  bindPoseControl(appearance)
  bindRange(appearance, 'bodyScale', value => pet.setConfig({ appearance: { proportions: { bodyScale: value } } }))
  appearance.querySelectorAll<HTMLButtonElement>('[data-ear]').forEach(button => button.addEventListener('click', () => {
    pet.setConfig({ appearance: { parts: { ears: button.dataset.ear as PetConfig['appearance']['parts']['ears'] } } })
    refresh()
  }))
  appearance.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach(button => button.addEventListener('click', () => {
    const preset = PRESET_COLORS[button.dataset.palette || 'apricot']
    if (!preset) return
    pet.setConfig({ species: preset.species, appearance: { colors: preset.colors, parts: preset.parts } })
    refresh()
  }))
  appearance.querySelector('#body-color')?.addEventListener('input', (event) => {
    pet.setConfig({ appearance: { colors: { body: (event.target as HTMLInputElement).value } } })
  })
  appearance.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach(button => button.addEventListener('click', () => {
    const kind = button.dataset.acc as typeof ACCESSORIES[number]
    const current = pet.getConfig().appearance.accessories
    const exists = current.some(item => item.kind === kind)
    const accessories = exists ? current.filter(item => item.kind !== kind) : [...current, { kind, color: kind === 'bow' ? '#8ed9cc' : '#f08a62' }]
    pet.setConfig({ appearance: { accessories } })
    refresh()
  }))
  const behavior = app.querySelector('[data-panel="behavior"]') as HTMLElement
  behavior.hidden = category !== 'behavior'
  behavior.innerHTML = `
    <label class="check"><input id="auto" type="checkbox" ${config.behavior.autonomous ? 'checked' : ''}/> ${t('autonomous')}</label>
    ${slider(t('mood'), 'mood', config.behavior.stats.mood, 0, 100)}
    ${slider(t('energy'), 'energy', config.behavior.stats.energy, 0, 100)}
    ${slider(t('hunger'), 'hunger', config.behavior.stats.hunger, 0, 100)}`
  behavior.querySelector('#auto')?.addEventListener('change', (event) => {
    pet.setConfig({ behavior: { autonomous: (event.target as HTMLInputElement).checked } })
  })
  for (const key of ['mood', 'energy', 'hunger'] as const) {
    bindRange(behavior, key, value => pet.pet.setStats({ [key]: value }))
  }
  const stylePanel = app.querySelector('[data-panel="style"]') as HTMLElement
  stylePanel.hidden = category !== 'style'
  stylePanel.innerHTML = ''
  const actions = app.querySelector('[data-panel="actions"]') as HTMLElement
  actions.hidden = category !== 'actions'
  actions.innerHTML = `<p>${t('timeline')}</p>`
  const agentPanel = app.querySelector('[data-panel="agent"]') as HTMLElement
  if (agentPanel) agentPanel.hidden = category !== 'agent'
}

function paintPro(config: PetConfig): void {
  const host = app.querySelector('#pro-body') as HTMLElement
  const p = config.appearance.proportions
  const finish = config.appearance.finish ?? {}
  if (tab === 'morph') {
    host.innerHTML = [
      slider(t('head'), 'headScale', p.headScale, 0.6, 1.6),
      slider(t('snout'), 'snoutScale', p.snoutScale, 0.5, 1.6),
      slider(t('eyeSize'), 'eyeScale', p.eyeScale, 0.5, 1.8),
      slider(t('ears'), 'earScale', p.earScale, 0.4, 1.8),
      slider(t('cheek'), 'cheekScale', p.cheekScale, 0.4, 1.8),
    ].join('')
  } else if (tab === 'bone') {
    host.innerHTML = [
      slider(t('head'), 'headScale', p.headScale, 0.6, 1.6),
      slider(t('body'), 'bodyScale', p.bodyScale, 0.6, 1.6),
      slider(t('earL'), 'earScaleL', p.earScaleL, 0.4, 1.8),
      slider(t('earR'), 'earScaleR', p.earScaleR, 0.4, 1.8),
      slider(t('tail'), 'tailScale', p.tailScale, 0.3, 1.8),
    ].join('')
  } else if (tab === 'material') {
    host.innerHTML = `<div class="colors">${(['body', 'belly', 'accent', 'nose', 'eye', 'blush'] as const).map(key => `
      <label>${t(key === 'body' ? 'body' : key === 'eye' ? 'eyes' : key === 'blush' ? 'cheek' : 'color')}
        <input data-color="${key}" type="color" value="${toHex(config.appearance.colors[key])}" />
      </label>`).join('')}</div>
      ${slider(t('gloss'), 'gloss', finish.gloss ?? 0.5, 0, 1)}`
  } else {
    host.innerHTML = `
      ${slider(t('outline'), 'outlineWidth', finish.outlineWidth ?? 1, 0, 2.5)}
      <label class="row">${t('outlineColor')}<input id="outline-color" type="color" value="${toHex(finish.outlineColor || '#c4846a')}" /></label>
      <label class="row">${t('quality')}
        <select id="quality">${['auto', 'low', 'medium', 'high'].map(id => `<option value="${id}" ${config.renderer.quality === id ? 'selected' : ''}>${t(id as MessageKey)}</option>`).join('')}</select>
      </label>`
  }
  host.insertAdjacentHTML('afterbegin', poseControl(config))
  bindPoseControl(host)
  host.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(input => {
    const key = input.dataset.key || ''
    input.addEventListener('input', () => {
      const value = Number(input.value)
      if (key === 'gloss' || key === 'outlineWidth') pet.setConfig({ appearance: { finish: { [key]: value } } })
      else pet.setConfig({ appearance: { proportions: { [key]: value } } })
    })
  })
  host.querySelectorAll<HTMLInputElement>('[data-color]').forEach(input => {
    input.addEventListener('input', () => pet.setConfig({ appearance: { colors: { [input.dataset.color || 'body']: input.value } } }))
  })
  host.querySelector('#outline-color')?.addEventListener('input', (event) => {
    pet.setConfig({ appearance: { finish: { outlineColor: (event.target as HTMLInputElement).value } } })
  })
  host.querySelector('#quality')?.addEventListener('change', (event) => {
    pet.setConfig({ renderer: { quality: (event.target as HTMLSelectElement).value as PetConfig['renderer']['quality'] } })
  })
}

function poseControl(config: PetConfig): string {
  return `<h2>${t('pose')}</h2><div class="chips" role="group" aria-label="${t('pose')}">${POSES.map(pose =>
    `<button type="button" class="chip" data-pose="${pose}" aria-pressed="${(config.appearance.pose ?? 'sit') === pose}">${t(pose)}</button>`,
  ).join('')}</div>`
}

function bindPoseControl(host: HTMLElement): void {
  host.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(button => button.addEventListener('click', () => {
    const pose = (POSES as readonly string[]).includes(button.dataset.pose ?? '') ? button.dataset.pose as PetPose : 'sit'
    pet.setConfig({ appearance: { pose } })
    refresh()
  }))
}

function paintActions(): void {
  const host = app.querySelector('#action-chips') as HTMLElement
  host.innerHTML = ACTIONS.map(action => {
    const spec = ACTION_CATALOG[action]
    return `<button type="button" class="chip" data-action="${action}" aria-pressed="${pet.pet.action === action}" title="${spec.interruptible ? '' : 'locked'}">${t(action as MessageKey)}</button>`
  }).join('')
  host.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
    button.addEventListener('click', () => {
      pet.play(button.dataset.action as PetAction)
      note(t(button.dataset.action as MessageKey))
      refresh()
    })
  })
}

function paintAgent(): void {
  const emotions = app.querySelector('#emotions') as HTMLElement
  emotions.innerHTML = EMOTIONS.map(id => `<button type="button" class="chip" data-emotion="${id}">${t(id as MessageKey)}</button>`).join('')
  emotions.querySelectorAll<HTMLButtonElement>('[data-emotion]').forEach(button => {
    button.addEventListener('click', () => {
      pet.setEmotion(button.dataset.emotion as Emotion)
      note(t(button.dataset.emotion as MessageKey))
    })
  })
  const states = app.querySelector('#states') as HTMLElement
  states.innerHTML = STATES.map(id => `<button type="button" class="chip" data-state="${id}">${t(id as MessageKey)}</button>`).join('')
  states.querySelectorAll<HTMLButtonElement>('[data-state]').forEach(button => {
    button.addEventListener('click', () => {
      pet.setState(button.dataset.state as typeof STATES[number])
      note(t(button.dataset.state as MessageKey))
    })
  })
  const list = app.querySelector('#log') as HTMLElement
  list.innerHTML = log.map(line => `<li>${line}</li>`).join('')
}

function paintStats(): void {
  if (category !== 'behavior') return
  const stats = pet.pet.stats
  for (const key of ['mood', 'energy', 'hunger'] as const) {
    const input = app.querySelector<HTMLInputElement>(`input[data-key="${key}"]`)
    if (input && document.activeElement !== input) input.value = String(stats[key])
  }
}

function send(kind: 'say' | 'think'): void {
  const input = app.querySelector('#say-input') as HTMLInputElement
  const text = input.value.trim() || t('sayPlaceholder')
  pet.say(text, { kind: kind === 'think' ? 'think' : 'say' })
  note(`${t(kind)}: ${text}`)
}

function note(line: string): void {
  log.unshift(line)
  log.splice(6)
  const list = app.querySelector('#log') as HTMLElement | null
  if (list) list.innerHTML = log.map(item => `<li>${item}</li>`).join('')
}

function slider(label: string, key: string, value: number, min: number, max: number): string {
  return `<label class="slider">${label}<input data-key="${key}" type="range" min="${min}" max="${max}" step="0.01" value="${value}"/></label>`
}

function bindRange(root: ParentNode, key: string, apply: (value: number) => void): void {
  root.querySelector<HTMLInputElement>(`input[data-key="${key}"]`)?.addEventListener('input', (event) => {
    apply(Number((event.target as HTMLInputElement).value))
  })
}

function paintPressed(selector: string, value: string, attr: string): void {
  app.querySelectorAll<HTMLElement>(selector).forEach(node => {
    node.setAttribute('aria-pressed', node.dataset[attr] === value ? 'true' : 'false')
  })
}

function applyI18n(): void {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  document.documentElement.dataset.lang = lang
  app.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => {
    node.textContent = t(node.dataset.i18n as MessageKey)
  })
  app.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach(node => {
    node.placeholder = t(node.dataset.i18nPlaceholder as MessageKey)
  })
}

function applyTheme(): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.mode = mode
  persist()
}

function persist(): void {
  localStorage.setItem('yk-pet-editor', JSON.stringify({ theme, mode, lang }))
}

function readSaved(): { theme?: Theme; mode?: Mode; lang?: Lang } {
  try { return JSON.parse(localStorage.getItem('yk-pet-editor') || '{}') as { theme?: Theme; mode?: Mode; lang?: Lang } }
  catch { return {} }
}

function t(key: MessageKey): string {
  return translate(lang, key)
}

function toHex(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#f39a52'
}

function download(json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'yk-pet.json'
  link.click()
  URL.revokeObjectURL(url)
}
