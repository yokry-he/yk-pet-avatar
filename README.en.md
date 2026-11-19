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
