"""Validate the shipped fox's actual embedded geometry, skin and animation data."""
import json
from pathlib import Path
import struct
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'examples/models/felt-fox.glb')
raw = path.read_bytes()
magic, version, length = struct.unpack_from('<4sII', raw)
assert magic == b'glTF' and version == 2 and length == len(raw)
size, kind = struct.unpack_from('<I4s', raw, 12)
assert kind == b'JSON'
doc = json.loads(raw[20:20+size])
assert len(raw) < 5_000_000, f'GLB exceeds 5 MB: {len(raw)}'
assert all('uri' not in image and 'bufferView' in image for image in doc['images'])
assert len(doc['images']) >= 3, 'Missing baked maps'
names = {node.get('name') for node in doc['nodes']}
required = {'root', 'spine', 'head', 'ear.L', 'ear.R', 'hand.L', 'hand.R',
            'leg.L', 'leg.R', 'tail.1', 'tail.2', 'tail.3',
            'arm.L.upper', 'arm.L.lower', 'arm.R.upper', 'arm.R.lower'}
assert required <= names, f'Missing bones: {required - names}'
assert doc['skins'] and all('skin' in node for node in doc['nodes'] if 'mesh' in node)
assert {a['name'] for a in doc['animations']} == {'idle', 'wave', 'happy', 'success'}
binary_start = 20 + size + 8

def read_values(accessor_id):
    acc = doc['accessors'][accessor_id]
    view = doc['bufferViews'][acc['bufferView']]
    assert acc['componentType'] == 5126
    components = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    offset = binary_start + view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return struct.unpack_from('<' + 'f' * (acc['count'] * components), raw, offset), components

for clip in doc['animations']:
    varying = False
    for sampler in clip['samplers']:
        times, _ = read_values(sampler['input'])
        assert 1.9 <= times[-1] <= 3.1
        values, components = read_values(sampler['output'])
        assert all(abs(a-b) < 1e-4 for a,b in zip(values[:components],values[-components:])), 'Non-looping clip'
        varying |= any(abs(v-values[i % components]) > 1e-4 for i,v in enumerate(values))
    assert varying, f'{clip["name"]} has no motion'
triangles = sum(doc['accessors'][p['indices']]['count'] // 3
                for mesh in doc['meshes'] for p in mesh['primitives'])
print(f'PASS: {path}: {len(raw):,} bytes, {triangles:,} triangles, '
      f'{len(doc["images"])} embedded maps, 16 bones, 4 animated looping clips')
