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
