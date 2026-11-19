# yk-pet-avatar

可嵌入的 2D + 3D 虚拟宠物形象 SDK。它只负责外观、动画和交互表面：没有大模型、没有浏览器扩展、也没有 Git / Agent 业务。以后的 Agent 项目和 [yk-pets](https://github.com/yokry-he/yk-pets) 把它当作渲染依赖来用。

[English](README.en.md)

## 包

| 包 | 作用 |
| --- | --- |
| `@yk-pet/core` | 配置 schema、状态机、情绪、数值、Agent API、动作片段采样 |
| `@yk-pet/2d` | 分层 Canvas 宠物，实现 yk-pets 的 `PetRenderer` |
| `@yk-pet/3d` | Three.js 程序化宠物与 glTF，按需加载 |
| `@yk-pet/element` | `<yk-pet>`，自适应 2D/3D |
| `@yk-pet/react` / `@yk-pet/vue` | 薄封装 |
| `@yk-pet/playground` | 可视化编辑器 |

npm 组织名 `@yk-pet` 还没定，发布前可以改 scope。协议是 MIT。

## 开发

需要 Node 18+ 和 pnpm。

```bash
pnpm install
pnpm test
pnpm dev          # http://localhost:5173
pnpm build
```

编辑器地址可以带参数，方便截图或预览：`?theme=soft|pro|glass&mode=simple|pro&lang=zh|en&renderer=2d|3d&say=1`。主题、简洁/专业模式和语言会写进 `localStorage`。

## 安装

```bash
pnpm add @yk-pet/element @yk-pet/core
# 需要 3D 时再加
pnpm add @yk-pet/3d
```

页面里：

```html
<script type="module">
  import { defineYkPet } from '@yk-pet/element'
  defineYkPet()
  const pet = document.querySelector('yk-pet')
  pet.addEventListener('yk-ready', () => pet.say('你好，我是小云'))
</script>
<yk-pet preference="auto" style="width:280px;height:360px"></yk-pet>
```

构建产物里还有浏览器脚本 `packages/element/dist/yk-pet.global.js`。3D 脚本是 `packages/renderer-3d/dist/index.global.js`，全局名 `YkPet3D`，要在自定义元素连接之前加载。只使用 2D 时不必加载 Three.js。

## 配置（schemaVersion: 1）

`parsePetConfig` 会补默认值、夹紧范围，并留下 `issues`。默认形象是叫「小云」的杏子狐狸，风格 `kawaii`。

```json
{
  "schemaVersion": 1,
  "name": "小云",
  "species": "fox",
  "style": "kawaii",
  "appearance": {
    "colors": { "body": "#f39a52", "belly": "#fff7f0" },
    "proportions": { "headScale": 1, "eyeScale": 1.1, "earScaleL": 1, "earScaleR": 1 },
    "parts": { "ears": "pointy", "tail": "fluffy", "eyes": "round", "muzzle": "long" },
    "accessories": [{ "kind": "bow", "color": "#8ed9cc", "socket": "neck" }]
  },
  "behavior": {
    "autonomous": true,
    "stats": { "mood": 72, "energy": 80, "hunger": 18 }
  },
  "renderer": { "preference": "auto", "quality": "auto" }
}
```

`style` 接受 `kawaii` / `anime` / `plush` / `glass`，也接受主人清单里的序号 `1` / `4` / `5` / `6`。风格是一份数据（调色、描边、材质、光照），2D 完整支持软萌和赛璐璐，玻璃和毛绒在 2D 里是近似；3D 四套都有。毛绒的毛壳层数会在低内存或少核心的设备上降到 1 层。

`species`：`fox` | `cat` | `bunny` | `custom`。饰品：`bow` | `scarf` | `glasses` | `flower` | `hat`。

精灵图放在 `sprite`，glTF / GLB 放在 `model.url`。`model.animations` 把标准动作映射到片段名；不写就按名字模糊匹配。`.vrm` 会当 glTF 场景加载，**不做** VRM 弹簧骨和表情预设。`lottie` 字段会保留，v0.1 不播放。

## 风格

| id | 序号 | 2D | 3D |
| --- | --- | --- | --- |
| `kawaii`（默认） | 1 | 细暖棕描边、Q版比例（大圆头、短胖前爪、肉垫）、柔和渐变、大眼双高光、腮红 | 雕塑式程序化 Q 版狐狸（头、耳、口鼻、脸颊绒毛、身体、前后爪、蓬松尾巴），柔光+轮廓光 |
| `anime` | 4 | 细深色线、硬二分阴影、动漫高光眼 | `MeshToonMaterial` 分级阴影 + 反向外壳描边 |
| `plush` | 5 | 无硬描边、毛毡纹理、细绒边（近似） | 可编译的毛壳着色 + 绒感高光，弱设备降为 1 层 |
| `glass` | 6 | 半透明青紫渐变、发光边缘、闪光（近似） | 透射 + 虹彩 + 内发光 + 发光环，开销大时降级 |

再加一种风格：在 `STYLE_PRESETS` 里加一条，`material.mode` 仍用 `soft` / `toon` / `fur` / `glass` 时渲染器不用改。

## 美术（v2 第一阶段）

- idle 动画：呼吸、随机眨眼（含偶尔双眨）、耳朵抖动、尾巴摆动、头部轻摆
- 十种情绪（neutral happy sad excited angry shy surprised love tired focused）在 2D/3D 都有面部表现
- 3D 自动取景，整只宠物带耳朵都在画面内
- 修复 v1 毛壳着色器 objectNormal 编译错误
- playground 支持 ?style= 和 ?emotion= 参数用于截图

## Agent API

2D 和 3D 调用方式一样。

```ts
import { Pet } from '@yk-pet/core'

const pet = new Pet()
pet.say('正在看测试', { streaming: true })
const handle = pet.say('')
handle.append('第一')
handle.append('句')
handle.end()

pet.play('wave')
pet.setEmotion('happy')
pet.lookAt(0.4, -0.2)          // -1..1，相对宠物中心
pet.setState('thinking')       // idle | thinking | working | success | error
pet.on('click', (event) => console.log(event))
pet.on('drag', (event) => console.log(event))
pet.on('pet', (event) => console.log(event))
```

`<yk-pet>` 上有同名方法。自定义事件：`yk-ready`、`yk-renderer`、`yk-click`、`yk-drag`、`yk-pet`。

`getVisualState()` 的 `behavior`、`emotion`、`speaking`、`score`、`pointer`、`reducedMotion` 与 yk-pets 的 `PetVisualState` 对齐，多出来的字段（外观、风格、轨道采样）可以一起传给 `renderer.update`。

隐藏标签页或离开视口时渲染循环会停。`preference: "auto"` 会在没有 WebGL、省流、减弱动效、低内存时选 2D；3D 上下文丢失或帧率持续过低时降回 2D。

## 动作数据（给 v0.2 工坊留的口）

v0.1 **没有**关键帧编辑器。动作仍然由程序化姿态驱动，但片段已经是数据：

- `ActionClip`：`tracks[]`，轨道种类 `bone` | `part` | `effect` | `prop` | `frame`
- 关键帧缓动：`linear` | `easeIn` | `easeOut` | `easeInOut` | `step`
- `mode: "frame"` 按 `fps` 吸附，给逐帧模式用
- `ClipSequence.steps[].blend` 做片段交叉混合，`pet.playSequence(id)` 播放
- 挂点：`head`、`ear-l`、`ear-r`、`neck`、`chest`、`back`、`tail`、`paw-l`、`paw-r`、`muzzle`、`face`，对应骨骼名 `bone-head` 等
- 饰品和 `props` 挂在这些 socket 上

给某个标准动作写了 `clips` 且 `action` 相同，播放时轨道会叠到程序化姿态上（例如 `bone-paw-r` / `rotation.z`）。v0.2 的工坊只需要往这份数据里写关键帧。

## 接入

- 纯页面：[examples/html/index.html](examples/html/index.html)
- React：[examples/react/README.md](examples/react/README.md)
- Vue：[examples/vue/README.md](examples/vue/README.md)
- Electron 透明桌宠：[examples/electron](examples/electron)（`pnpm build` 后在该目录 `pnpm add -D electron && pnpm start`）
- 手机 WebView：[examples/mobile/README.md](examples/mobile/README.md)

### 接到 yk-pets

渲染器工厂的形状就是 `pet-runtime-adaptive` 里的 `PetRendererFactory`：

```ts
import { AdaptiveRendererController } from 'pet-runtime-adaptive'
import { createCanvas2DRendererFactory } from '@yk-pet/2d'
import { createThreeRendererFactory } from '@yk-pet/3d'
import { Pet } from '@yk-pet/core'

const avatar = new Pet()
const controller = new AdaptiveRendererController({
  '2d': createCanvas2DRendererFactory({ getState: () => avatar.getVisualState() }),
  '3d': createThreeRendererFactory({ getState: () => avatar.getVisualState() }),
})
```

扩展宿主自己的 `update(state)` 也可以，只要带上 `behavior`。外观在 `state.appearance` 里；不传时渲染器保留上一帧的样子。

## 编辑器

布局按专业视口来：左侧部件树，中间视口，右侧检查器（形态 / 骨骼 / 材质 / 着色），底部动作状态机。默认主题是柔光（Soft Light），另外还有专业深色和玻璃拟态，运行时切换并记住。

「简洁」模式收起树、检查器分页和视口坐标轴，改成体型滑杆、耳朵形状、色板、饰品和动作按钮。Agent 预览（说话、心想、情绪、状态）两种模式都在。

这不是 v0.2 的关键帧时间线。

## 还没做

- Lottie 播放
- VRM 人形（弹簧骨、表情预设、视线骨）
- 关键帧工坊、逐帧编辑界面、道具轨道的可视化编辑
- npm 上的正式包名与组织
