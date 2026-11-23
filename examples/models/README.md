# Felt fox

`felt-fox.glb` is authored entirely by [felt_fox.py](../../tools/blender/felt_fox.py)
in Blender 4.5. It includes embedded 512px CPU Cycles baked wool normal,
roughness and ivory color maps, a deform skeleton, short mesh wool fibers,
and looping `idle`, `wave`, `happy`, and `success` skeletal clips.
Unsupported SDK actions use `idle`. The right paw is the paw on the viewer's left.

Open the playground with:

```
http://127.0.0.1:5173/?renderer=3d&style=plush&model=felt-fox&action=wave&hold=1
```

Use the model from an application (serve the GLB at your chosen URL):

```ts
pet.setConfig({
  model: {
    url: '/models/felt-fox.glb',
    animations: { idle: 'idle', wave: 'wave', happy: 'happy', success: 'success' },
  },
  behavior: { autonomous: false },
})
pet.play('wave', { hold: true, sampleTime: 0.6 })
```

`sampleTime` is seconds within the selected looping clip and freezes that pose.
Without a sample time, clips play normally. Style changes affect studio lighting;
the asset keeps its authored materials and proportions. This fox has no expression
morph targets, so emotion changes remain procedural-only. Failed model loads
keep the procedural pet visible; loading remains inside the lazy 3D renderer.

Regenerate from the repository root:

```sh
BLENDER_USER_CONFIG=/tmp/bcfg BLENDER_USER_SCRIPTS=/tmp/bscripts \
  /home/box/.local/bin/blender -b --factory-startup \
  --python tools/blender/felt_fox.py -- \
  --out examples/models/felt-fox.glb --render .art-scratch/blender-felt-fox.png
python3 tools/blender/inspect_glb.py examples/models/felt-fox.glb
```

The optional render also saves an editable `.art-scratch/felt-fox.blend`.
Studio, lights, floor and camera are excluded from the exported character.

## Owner's fox

`user-fox.glb` preserves the owner's original mesh and UVs, with a fitted 28-bone
skin and nine looping clips: `idle`, `wave`, `happy`, `success`, `nod`, `shake`,
`jump`, `walk`, and `sleep`. The playground maps thinking to nod, error/sad to
shake, and unsupported actions to idle. Open
`/?renderer=3d&style=plush&model=user-fox&action=wave&hold=1`.
All clips have a readable held pose at `sampleTime: 0.6` seconds.

Regenerate using the external, read-only original (never add it to this repo):

```sh
BLENDER_USER_CONFIG=/tmp/bcfg BLENDER_USER_SCRIPTS=/tmp/bscripts \
  /home/box/.local/bin/blender -b --factory-startup \
  --python tools/blender/rig_user_model.py -- \
  --in /workspace/yk-pet-art/user-model/original.glb \
  --out examples/models/user-fox.glb --renders .art-scratch/user-rig
python3 tools/blender/inspect_user_model.py examples/models/user-fox.glb
```

The script measures anatomical clusters, attempts automatic weights, then repairs
the split surface using geodesic regions and smooth capsule weights. The face
stays rigid, the tail uses only its four bones, and weights are normalised to
four influences. EEVEE peak renders, a landmark/weight report, and an editable
review blend go under `--renders`. The source is neither modified nor copied.

The web asset is about 4.37 MB, with embedded WebP maps: 2048px base colour,
1024px normal and metallic/roughness. It needs three's built-in
`EXT_texture_webp` support; no geometry decoder is required. The original
18,486 triangles are retained. Sleep uses a drooped head and slow breathing;
the source has no eyelid or facial shape keys.
