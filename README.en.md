# yk-pet-avatar

Embeddable 2D + 3D virtual-pet avatar SDK. It owns appearance, animation, and the interaction surface only — no LLM, extension, or Git/Agent logic. [yk-pets](https://github.com/yokry-he/yk-pets) and a future agent host import it as the renderer.

中文说明见 [README.md](README.md).

## Packages

`@yk-pet/core` (schema, state machine, agent API, clip sampler), `@yk-pet/2d`, `@yk-pet/3d` (lazy Three.js), `@yk-pet/element` (`<yk-pet>`), `@yk-pet/react`, `@yk-pet/vue`, and the playground. The npm scope is provisional.

```bash
pnpm install
pnpm test
pnpm dev
pnpm build
```

Playground query flags: `?theme=soft|pro|glass&mode=simple|pro&lang=zh|en&renderer=2d|3d&say=1`.

## Art (v2 phase 1)

- idle animation: breathing, random blinking (with occasional double blinks), ear twitches, tail sway, gentle head motion
- ten emotions (neutral, happy, sad, excited, angry, shy, surprised, love, tired, focused) with facial expressions in both 2D and 3D
- 3D auto-framing keeps the whole pet, including ears, in frame
- fixed the v1 fur shell shader `objectNormal` compile error
- playground supports `?style=` and `?emotion=` params for screenshots
- New pose `appearance.pose`: `'sit'` (default, omitted means sit, backward-compatible) | `'stand'` (standing on hind legs). Supported in 2D and 3D across all four styles; switching at runtime has about a 0.6 s smooth transition, or an instant swap when `reducedMotion` is enabled. Example: `pet.setConfig({ appearance: { pose: 'stand' } })`; playground uses `?pose=stand`, and the simple-mode appearance panel has a sit/stand toggle. Exports `POSES` and `PetPose` type.
- `POSES` is now `'sit' | 'stand' | 'anthro'`. `'anthro'` is an anthropomorphic chibi fox: upright bipedal, about 2–2.5 heads tall, keeps the same large head, face, and expressions; has arms with small paw-pad hands, legs with flat feet, a slight contrapposto stance, and the big tail behind; each style has small accessories (kawaii soft scarf, anime red neckerchief, plush knitted scarf, glass glowing collar). Supported in both 2D and 3D across all four styles.
- anthro actions: breathing idle with gentle weight shift and arm sway; `pet.play('wave')` waves; `pet.play('success')` or `'happy'` puts hands on hips; thinking/eating/working/sleep keep hands together in front. Switching has about a 0.3–0.5 s smooth transition, or an instant swap when `reducedMotion` is enabled.
- Example: `pet.setConfig({ appearance: { pose: 'anthro' } })`; playground uses `?pose=anthro` (and `?action=wave`), and the simple-mode appearance panel has a sit / stand / anthro toggle.
- 3D improvements: rounded cream muzzle + cheek fluff; anime white areas stay clean without grey tint; happy uses ^ ^ squinting eyes, love uses heart eyes; smoother tail-tip transition; glass has a low-cost glow halo that turns off on weak devices / low quality.

| id | index | 2D | 3D |
| --- | --- | --- | --- |
| `kawaii` (default) | 1 | warm thin brown outlines, chibi proportions (large round head, short chunky front paws, paw pads), soft gradients, big eyes with double highlights, blush | sculpted procedural chibi fox (head, ears, muzzle, cheek fluff, body, front/back paws, fluffy tail), soft + rim light |
| `anime` | 4 | thin dark outlines, hard two-tone shading, anime highlight eyes | `MeshToonMaterial` stepped shading + inverted hull outlines |
| `plush` | 5 | no hard outlines, felt texture, fine fuzzy edges (approximate) | compilable fur shell shader + fuzzy highlight, drops to 1 shell on weak devices |
| `glass` | 6 | translucent cyan-purple gradient, glowing edge, sparkle (approximate) | transmission + iridescence + inner glow + glowing ring, degrades when heavy |

## Agent API

```ts
pet.say('hello', { streaming: true })
pet.play('wave')
pet.setEmotion('happy')
pet.lookAt(0.2, -0.4)
pet.setState('thinking') // idle | thinking | working | success | error
pet.on('click', handler)
```

`getVisualState()` matches yk-pets `PetRenderer.update` (`behavior`, `emotion`, `speaking`, `score`, `pointer`, `reducedMotion`) and adds appearance, style, and sampled clip channels.

Styles: `kawaii` (default, owner index 1), `anime` (4), `plush` (5), `glass` (6). 2D fully covers kawaii and anime and approximates plush and glass. 3D covers all four. Plush fur shells drop to a single halo on low-memory devices.

## yk-pets

```ts
import { AdaptiveRendererController } from 'pet-runtime-adaptive'
import { createCanvas2DRendererFactory } from '@yk-pet/2d'
import { createThreeRendererFactory } from '@yk-pet/3d'

new AdaptiveRendererController({
  '2d': createCanvas2DRendererFactory({ getState: () => pet.getVisualState() }),
  '3d': createThreeRendererFactory({ getState: () => pet.getVisualState() }),
})
```

## Clips without a studio

v0.1 does not ship a keyframe editor. Actions are still procedural, but clips are data: tracks (`bone`, `part`, `effect`, `prop`, `frame`), easing, `mode: "frame"`, sequenced blends via `playSequence`, and named sockets (`bone-head`, `bone-neck`, …). A clip whose `action` matches `play()` is layered onto the procedural pose. v0.2 can fill those tracks.

Examples: [HTML](examples/html/index.html), [React](examples/react/README.md), [Vue](examples/vue/README.md), [Electron](examples/electron), [mobile WebView](examples/mobile/README.md).

Deferred: Lottie playback, VRM humanoid (spring bones and expression presets), and the keyframe studio UI.
