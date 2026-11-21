"""Deterministic, self-contained Blender 4.5 felt fox authoring and GLB export.

Run from the repository root with --out and optional --render after Blender's --.
Coordinates: Z up, -Y facing camera. Organic parts are voxel fused; surface
detail is a shared, CPU Cycles baked tile, never a Blender-only shader in glTF.
The rig uses heat automatic weights for the soft shell and rigid face details.
All four actions are sampled bone keys, exported as separate NLA tracks.
"""
import argparse
import math
import os
import random
import sys
from bisect import bisect_left
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

random.seed(14)
args = argparse.ArgumentParser()
args.add_argument('--out', required=True)
args.add_argument('--render')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
out = Path(opts.out).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.render.threads_mode = 'FIXED'
scene.render.threads = 8
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.render.fps = 24

def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def material(name, color, rough=.87):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Specular IOR Level'].default_value = .26
    return mat

cream = material('Warm ivory needle felt', (.93, .80, .68))
lavender = material('Dusty lavender felt', (.52, .34, .59))
inner = material('Pale inner ear wool', (.95, .83, .75))
mint = material('Sage mint cloud felt', (.38, .62, .49))
pink = material('Peach blush felt', (.92, .52, .46))
white = material('Ivory eye whites', (.98, .92, .89), .3)
plum = material('Deep plum glossy eyes', (.055, .019, .065), .16)
iris = material('Plum iris', (.19, .058, .23), .23)
pupil = material('Dark pupils', (.018, .006, .023), .12)
thread = material('Cocoa embroidered mouth', (.19, .092, .095))
nosemat = material('Lavender nose', (.43, .27, .46), .48)
glint = material('White eye catchlights', (1, .98, .98), .1)
bs = glint.node_tree.nodes.get('Principled BSDF')
bs.inputs['Emission Color'].default_value = (1, .95, .95, 1)
bs.inputs['Emission Strength'].default_value = .2

# Bake a seamless fine wool tile on a UV plane. glTF receives real image maps.
bpy.ops.mesh.primitive_plane_add(size=2)
tile = bpy.context.object
tile.name = 'Temporary bake tile'
bake = material('Bake source', (1, 1, 1))
tile.data.materials.append(bake)
nodes, links = bake.node_tree.nodes, bake.node_tree.links
bs = nodes.get('Principled BSDF')
tex = nodes.new('ShaderNodeTexNoise')
tex.inputs['Scale'].default_value = 155
tex.inputs['Detail'].default_value = 2.6
tex.inputs['Roughness'].default_value = .72
coord = nodes.new('ShaderNodeTexCoord')
links.new(coord.outputs['UV'], tex.inputs['Vector'])
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .5
bump.inputs['Distance'].default_value = .032
links.new(tex.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], bs.inputs['Normal'])
images = {}
for kind in ['NORMAL', 'ROUGHNESS', 'EMIT']:
    image = bpy.data.images.new('Felt_' + kind.lower(), width=512, height=512)
    image.colorspace_settings.name = 'sRGB' if kind == 'EMIT' else 'Non-Color'
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    nodes.active = node
    if kind == 'ROUGHNESS':
        ramp = nodes.new('ShaderNodeMapRange')
        ramp.inputs['To Min'].default_value = .78
        ramp.inputs['To Max'].default_value = .98
        links.new(tex.outputs['Fac'], ramp.inputs['Value'])
        links.new(ramp.outputs[0], bs.inputs['Roughness'])
    if kind == 'EMIT':
        ramp = nodes.new('ShaderNodeMapRange')
        ramp.inputs['To Min'].default_value = .94
        ramp.inputs['To Max'].default_value = 1.0
        links.new(tex.outputs['Fac'], ramp.inputs['Value'])
        tint = nodes.new('ShaderNodeMixRGB')
        tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1
        tint.inputs[1].default_value = cream.diffuse_color
        links.new(ramp.outputs[0], tint.inputs[2])
        links.new(tint.outputs[0], bs.inputs['Emission Color'])
        bs.inputs['Emission Strength'].default_value = 1
    active(tile)
    bpy.ops.object.bake(type=kind, margin=8)
    image.pack()
    images[kind] = image
bpy.data.objects.remove(tile, do_unlink=True)
for mat in [cream, lavender, inner, mint, pink]:
    ns, ls = mat.node_tree.nodes, mat.node_tree.links
    bs = ns.get('Principled BSDF')
    normaltex = ns.new('ShaderNodeTexImage')
    normaltex.image = images['NORMAL']
    normal = ns.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .48
    ls.new(normaltex.outputs['Color'], normal.inputs['Color'])
    ls.new(normal.outputs[0], bs.inputs['Normal'])
    roughtex = ns.new('ShaderNodeTexImage')
    roughtex.image = images['ROUGHNESS']
    ls.new(roughtex.outputs['Color'], bs.inputs['Roughness'])
    if mat == cream:
        colortex = ns.new('ShaderNodeTexImage')
        colortex.image = images['EMIT']
        bs.inputs['Base Color'].default_value = (1, 1, 1, 1)
        ls.new(colortex.outputs['Color'], bs.inputs['Base Color'])

parts = []  # (mesh, rigid bone or None for automatic weights)
def finish(obj, name, mat, bone=None):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    parts.append((obj, bone))
    return obj

def ball(name, loc, scale, mat=cream, bone=None, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=20, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bone)

def fuse(name, objects, mat, bone=None, voxel=.038):
    for obj in objects:
        parts[:] = [(o, b) for o, b in parts if o != obj]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    rem = obj.modifiers.new('Sculpted fused wool', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier=rem.name)
    sm = obj.modifiers.new('Soft sculpt polish', 'SMOOTH')
    sm.factor = .65
    sm.iterations = 4
    bpy.ops.object.modifier_apply(modifier=sm.name)
    sub = obj.modifiers.new('Silky silhouette', 'SUBSURF')
    sub.levels = 1
    bpy.ops.object.modifier_apply(modifier=sub.name)
    dec = obj.modifiers.new('Portable sculpt', 'DECIMATE')
    dec.ratio = .24
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Remeshing loses UVs; spherical-style smart packing supplies baked maps.
    active(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    return finish(obj, name, mat, bone)

def sweep(name, centers, radii, mat=cream, bone=None, flat=1, tipmat=None):
    """Closed, smooth tapered organic lock/tail along an authored centerline."""
    verts, faces = [], []
    rings = 20
    for i, (c, r) in enumerate(zip(centers, radii)):
        c = Vector(c)
        tangent = Vector(centers[min(i+1, len(centers)-1)]) - Vector(centers[max(0, i-1)])
        tangent.normalize()
        u = tangent.cross(Vector((0, 1, 0))).normalized()
        v = tangent.cross(u).normalized()
        for j in range(rings):
            a = j * 2 * math.pi / rings
            p = c + r * (u * math.cos(a) + v * math.sin(a) * flat)
            verts.append(tuple(p))
    for i in range(len(centers)-1):
        for j in range(rings):
            faces.append((i*rings+j, i*rings+(j+1)%rings, (i+1)*rings+(j+1)%rings, (i+1)*rings+j))
    faces.extend([tuple(reversed(range(rings))), tuple((len(centers)-1)*rings+j for j in range(rings))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, name, mat, bone)
    if tipmat:
        obj.data.materials.append(tipmat)
        for p in obj.data.polygons:
            if p.center.z > 1.74 + .10*math.sin(p.center.x*8):
                p.material_index = 1
    active(obj)
    sub = obj.modifiers.new('Rounded sculpt', 'SUBSURF')
    sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=sub.name)
    active(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj

def stitch(name, points, radius=.015, mat=thread, bone='head'):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spl = curve.splines.new('BEZIER')
    spl.bezier_points.add(len(points)-1)
    for point, co in zip(spl.bezier_points, points):
        point.co = co
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    active(obj)
    bpy.ops.object.convert(target='MESH')
    return finish(obj, name, mat, bone)

# Pear silhouette, broad head with cheeks merged into a single sculpted surface.
body = ball('Pear torso', (0, 0, .96), (.59, .43, .79))
for v in body.data.vertices:
    v.co.x *= 1 - .20 * v.co.z
headparts = [ball('Round face', (0, -.015, 2.48), (1.035, .62, .81))]
for side in [-1, 1]:
    headparts.append(ball('Cheek softness', (side*.64, -.13, 2.22), (.46, .46, .34)))
    for z, x in [(2.24, .98), (2.40, 1.02)]:
        headparts.append(sweep('Cheek flick', [(side*.72, -.03, z-.10), (side*x, -.05, z), (side*(x+.16), -.02, z+.12)], [.22, .15, .004], flat=.75))
head = fuse('Sculpted head and cheek fluff', headparts, cream, 'head', .034)
ball('Soft belly', (0, -.359, .92), (.43, .060, .57), cream, 'spine')

# Tall, softly rounded triangular ears; inset is a second sculpt, not a flat decal.
for side, label in [(-1, 'R'), (1, 'L')]:
    x = side*.68
    ear = sweep('ear.'+label+' cream rim', [(x, .04, 2.91), (side*.84, .04, 3.20), (side*.99, .055, 3.62), (side*.98, .05, 3.86)], [.36, .36, .22, .012], bone='ear.'+label, flat=.45)
    inset = sweep('ear.'+label+' lavender inset', [(side*.73, -.113, 3.08), (side*.85, -.12, 3.30), (side*.97, -.045, 3.67)], [.22, .235, .008], lavender, 'ear.'+label, flat=.23)
    if label == 'R':
        for obj in [ear, inset]:
            for vert in obj.data.vertices:
                height = max(0, vert.co.z - 2.95)
                vert.co.x -= height * .25
                vert.co.z -= height * .22
    for k in range(3):
        ball('Inner ear wool', (x+side*(k-1)*.095, -.205, 3.04+k*.035), (.11, .055, .16), inner, 'ear.'+label, 20)

# Three curled forehead locks, each pointed and gently swept sideways.
for centers, radii in [
    ([(.05, -.39, 3.18), (-.10, -.60, 3.13), (-.20, -.69, 2.94), (-.12, -.70, 2.82)], [.22,.23,.15,.008]),
    ([(-.24,-.25,3.16),(-.40,-.39,3.25),(-.49,-.44,3.35)], [.20,.18,.008]),
    ([(.27,-.27,3.13),(.42,-.43,3.08),(.48,-.46,2.98)], [.18,.14,.006])]:
    sweep('Curled forehead wool', centers, radii, bone='head', flat=.65)

# Eyes: recessed plum rim, ivory sclera, large dark iris, pupil and two glints.
for side in [-1, 1]:
    x = side*.43
    eye = ball('Plum eyelid', (x, -.547, 2.52), (.298, .105, .335), thread, 'head')
    eye.rotation_euler.y = side*-.12
    ball('Ivory sclera', (x, -.584, 2.51), (.285, .105, .320), white, 'head')
    ball('Glossy plum eye', (x+side*.027, -.659, 2.52), (.234, .105, .295), plum, 'head')
    ball('Lower iris glow', (x+side*.027, -.727, 2.455), (.186, .034, .185), iris, 'head')
    ball('Deep pupil', (x+side*.017, -.746, 2.565), (.155, .028, .201), pupil, 'head')
    ball('Large eye sparkle', (x-.068, -.774, 2.67), (.052, .023, .056), glint, 'head', 24)
    ball('Small eye sparkle', (x+.098, -.765, 2.42), (.019, .013, .023), glint, 'head', 20)
    stitch('Soft eyebrow', [(x-.11,-.526,2.99),(x,-.566,3.035),(x+.10,-.53,3.005)], .018, lavender)
    ball('Warm cheek blush', (side*.66, -.552, 2.18), (.21,.018,.10), pink, 'head')
ball('Muzzle cushion', (0, -.559, 2.13), (.32,.085,.20), cream, 'head')
nose = ball('Tiny lavender nose', (0,-.704,2.255), (.112,.076,.075), nosemat,'head')
for v in nose.data.vertices:
    v.co.x *= .8 + 2.5*v.co.z
stitch('Nose seam', [(0,-.732,2.22),(0,-.735,2.14)], .012)
stitch('Smile left', [(0,-.738,2.14),(-.07,-.726,2.09),(-.15,-.70,2.105),(-.19,-.675,2.15)], .012)
stitch('Smile right', [(0,-.738,2.14),(.07,-.726,2.09),(.15,-.70,2.105),(.19,-.675,2.15)], .012)

# Mint cloud is voxel fused so the overlapping lobes have a single wool surface.
cloud = []
for x,z,r in [(-.15,1.16,.125),(0,1.22,.15),(.15,1.16,.115),(0,1.12,.15)]:
    cloud.append(ball('Cloud lobe',(x,-.476,z),(r,.042,r),mint,'spine',24))
fuse('Mint cloud chest patch',cloud,mint,'spine',.018)

# Short plush limbs: arms rest down; the right arm animates beside the face.
for side,label in [(-1,'R'),(1,'L')]:
    arm = fuse('Soft arm.'+label, [
        ball('Upper arm',(side*.57,-.01,1.32),(.20,.23,.32)),
        ball('Lower arm',(side*.69,-.10,1.05),(.18,.20,.28)),
        ball('Mitten',(side*.72,-.15,.85),(.225,.22,.245))], cream, None, .035)
    palm_y = -.354 if label == 'R' else .047
    ball('Palm pad.'+label,(side*.72,palm_y,.87),(.105,.026,.102),lavender,'hand.'+label)
    for dx,dz in [(-.10,.12),(0,.165),(.10,.12)]:
        ball('Toe pad.'+label,(side*.72+dx,palm_y+.017,.87+dz),(.043,.024,.047),lavender,'hand.'+label,20)
    ball('Stubby leg.'+label,(side*.28,.015,.31),(.22,.25,.26),cream,None)
    ball('Round foot.'+label,(side*.29,-.115,.18),(.26,.34,.19),cream,'leg.'+label)
    for dx in [-.075,.035]:
        stitch('Foot seam',[(side*.29+dx,-.43,.16),(side*.29+dx,-.425,.23)],.005,lavender,'leg.'+label)

tail = sweep('Huge curling tail', [(.34,.26,.52),(.75,.32,.63),(1.15,.35,.90),(1.46,.34,1.29),(1.56,.29,1.72),(1.47,.22,2.08),(1.23,.16,2.22),(1.12,.10,2.16)], [.20,.38,.48,.49,.43,.31,.15,.006], flat=.9, tipmat=lavender)

# A restrained fringe of short, tapered mesh wool fibers catches the rim light.
# Sparse triangles keep the complete uncompressed, textured, skinned GLB <5 MB.
fibercream = material('Ivory wool fibers', (.93,.80,.68))
fiberlavender = material('Lavender wool fibers', (.52,.34,.59))
def wool_fibers(source, count, attachment):
    source.data.calc_loop_triangles()
    triangles = list(source.data.loop_triangles)
    cumulative=[]
    area=0
    for tri in triangles:
        area += tri.area
        cumulative.append(area)
    verts, faces, materials = [], [], []
    for _ in range(count):
        tri=triangles[min(bisect_left(cumulative,random.random()*area),len(triangles)-1)]
        a,b,c=[source.data.vertices[i].co for i in tri.vertices]
        u=math.sqrt(random.random())
        v=random.random()
        p=source.matrix_world @ ((1-u)*a+u*(1-v)*b+u*v*c)
        n=(source.matrix_world.to_3x3() @ tri.normal).normalized()
        tangent=n.cross(Vector((0,0,1)))
        if tangent.length < .01:
            tangent=n.cross(Vector((1,0,0)))
        tangent.normalize()
        length=random.uniform(.009,.022)
        width=.0012
        idx=len(verts)
        verts.extend([tuple(p-tangent*width),tuple(p+tangent*width),tuple(p+n*length+tangent*length*.25)])
        faces.append((idx,idx+1,idx+2))
        materials.append(tri.material_index)
    mesh=bpy.data.meshes.new('Short wool fringe')
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(source.name+' wool fringe',mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj,obj.name,fibercream,attachment)
    obj.data.materials.append(fiberlavender)
    for poly,material_index in zip(obj.data.polygons,materials):
        poly.material_index=material_index
wool_fibers(head,1500,'head')
wool_fibers(tail,500,'tail.2')
wool_fibers(body,250,'spine')

# Armature with real deform bones and heat weighting. R means the fox's right.
bpy.ops.object.armature_add(enter_editmode=True, location=(0,0,0))
rig = bpy.context.object
rig.name = 'Felt Fox Rig'
rig.data.edit_bones.remove(rig.data.edit_bones[0])
def bone(name, head, tail, parent=None):
    b = rig.data.edit_bones.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = rig.data.edit_bones[parent]
    return b
bone('root',(0,0,0),(0,0,.25))
bone('spine',(0,0,.35),(0,0,1.63),'root')
bone('head',(0,0,1.63),(0,0,2.88),'spine')
for side,label in [(-1,'R'),(1,'L')]:
    bone('ear.'+label,(side*.66,.04,2.99),(side*.98,.05,3.73),'head')
    bone('arm.'+label+'.upper',(side*.46,0,1.52),(side*.64,-.05,1.12),'spine')
    bone('arm.'+label+'.lower',(side*.64,-.05,1.12),(side*.72,-.15,.87),'arm.'+label+'.upper')
    bone('hand.'+label,(side*.72,-.15,.87),(side*.74,-.15,.68),'arm.'+label+'.lower')
    bone('leg.'+label,(side*.28,0,.50),(side*.29,-.10,.10),'root')
bone('tail.1',(.32,.25,.53),(.95,.33,.80),'spine')
bone('tail.2',(.95,.33,.80),(1.5,.30,1.55),'tail.1')
bone('tail.3',(1.5,.30,1.55),(1.24,.16,2.19),'tail.2')
bpy.ops.object.mode_set(mode='OBJECT')

# Auto-weight deformable pieces individually, keeping tiny embroidered features
# rigidly attached to their matching bone to preserve the face during animation.
for obj, rigid in parts:
    if rigid:
        group = obj.vertex_groups.new(name=rigid)
        group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        mod = obj.modifiers.new('Fox skin','ARMATURE')
        mod.object = rig
        obj.parent = rig
    else:
        active(obj)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        # Heat weighting is calculated first, then neighboring unrelated limbs
        # are removed so waving never pulls a corner out of the pear torso.
        if obj == body:
            allowed={'spine','root'}
        elif obj == tail:
            allowed={'spine','tail.1','tail.2','tail.3'}
        elif obj.name.startswith('Soft arm.'):
            side=obj.name[-1]
            allowed={'spine','arm.'+side+'.upper','arm.'+side+'.lower','hand.'+side}
        else:
            allowed={g.name for g in obj.vertex_groups}
        for group in list(obj.vertex_groups):
            if group.name not in allowed:
                obj.vertex_groups.remove(group)
        for vert in obj.data.vertices:
            total=sum(g.weight for g in vert.groups)
            if total > 0:
                for group in list(vert.groups):
                    obj.vertex_groups[group.group].add([vert.index],group.weight/total,'REPLACE')
        # Heat weights occasionally fail for small disconnected solids.
        if not obj.vertex_groups or not any(v.groups for v in obj.data.vertices):
            target = 'spine' if obj == body else ('tail.2' if obj == tail else 'root')
            g = obj.vertex_groups.get(target) or obj.vertex_groups.new(name=target)
            g.add(list(range(len(obj.data.vertices))),1,'REPLACE')

def reset_pose():
    for pb in rig.pose.bones:
        pb.rotation_mode='XYZ'
        pb.rotation_euler=(0,0,0)
        pb.location=(0,0,0)
        pb.scale=(1,1,1)

for name,duration in [('idle',3),('wave',3),('happy',2),('success',2)]:
    rig.animation_data_create()
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    end = int(duration*24)+1
    for f in range(1,end+1,3):
        t=(f-1)/24
        phase=t/duration*2*math.pi
        reset_pose()
        p=rig.pose.bones
        p['spine'].scale=(1+.012*math.sin(phase),1+.012*math.sin(phase),1+.018*math.sin(phase))
        p['head'].rotation_euler[2]=.14+.025*math.sin(phase)
        p['tail.1'].rotation_euler[0]=.045*math.sin(phase)
        p['ear.L'].rotation_euler[1]=.025*math.sin(phase)
        if name=='wave':
            # Bone local Z turns a down-facing arm outward and up in X/Z.
            p['arm.R.upper'].rotation_euler[0]=-.5
            p['arm.R.upper'].rotation_euler[2]=1.8+.09*math.sin(phase*2)
            p['arm.R.lower'].rotation_euler[2]=.28
            # Keep the palm facing -Y even as the elbow swings in three axes.
            # Author its world orientation, then Blender derives local bone keys.
            bpy.context.view_layer.update()
            hand=p['hand.R']
            desired=Matrix.Rotation(math.pi+.17*math.sin(phase*3),4,'Y') @ hand.bone.matrix_local
            desired.translation=hand.matrix.translation
            hand.matrix=desired
        elif name=='happy':
            p['root'].location[1]=.055*(1-math.cos(phase*2))
            p['arm.R.upper'].rotation_euler[2]=.42+.15*math.sin(phase*2)
            p['arm.L.upper'].rotation_euler[2]=-.42+.15*math.sin(phase*2)
            p['head'].rotation_euler[2]=.08*math.sin(phase)
        elif name=='success':
            p['arm.R.upper'].rotation_euler[2]=2.65
            p['arm.L.upper'].rotation_euler[2]=-2.65
            p['root'].location[1]=.065*(1-math.cos(phase*2))
        for pb in p:
            pb.keyframe_insert('location',frame=f,group=pb.name)
            pb.keyframe_insert('rotation_euler',frame=f,group=pb.name)
            pb.keyframe_insert('scale',frame=f,group=pb.name)
    # Explicitly duplicate the first pose at the end for seamless looping.
    scene.frame_set(1)
    for pb in rig.pose.bones:
        pb.keyframe_insert('location',frame=end,group=pb.name)
        pb.keyframe_insert('rotation_euler',frame=end,group=pb.name)
        pb.keyframe_insert('scale',frame=end,group=pb.name)
    track=rig.animation_data.nla_tracks.new()
    track.name=name
    track.strips.new(name,1,action)
    track.mute=True
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:
    track.mute=False
reset_pose()
scene.frame_set(1)

# Export only the character; the studio is deliberately excluded from the GLB.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj,_ in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_nla_strips=True,
    export_apply=True, export_skins=True, export_yup=True, export_force_sampling=True,
    export_anim_slide_to_zero=True)
phase=Path('.art-scratch/PHASE.txt')
phase.parent.mkdir(exist_ok=True)
markers=phase.read_text().splitlines() if phase.exists() else []
if 'GLB done' not in markers:
    markers.append('GLB done')
phase.write_text('\n'.join(markers)+'\n')
print('GLB done:',out,out.stat().st_size,flush=True)

if opts.render:
    for track in rig.animation_data.nla_tracks:
        track.mute=True
    rig.animation_data.action=bpy.data.actions['wave']
    scene.frame_set(15) # 0.6 second held sample, shared with the SDK playground.
    floor=material('Lavender studio',(.73,.59,.68))
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.015))
    bpy.context.object.data.materials.append(floor)
    world=scene.world or bpy.data.worlds.new('Soft studio')
    scene.world=world
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.53,.64,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.45
    def area(name,loc,power,size,color):
        data=bpy.data.lights.new(name,'AREA')
        data.energy=power
        data.shape='DISK'
        data.size=size
        data.color=color
        obj=bpy.data.objects.new(name,data)
        scene.collection.objects.link(obj)
        obj.location=loc
        obj.rotation_euler=(Vector((0,0,1.8))-obj.location).to_track_quat('-Z','Y').to_euler()
    area('Large warm softbox',(-3,-4,6),500,4,(1,.88,.79))
    area('Lavender fill',(4,-2,4),300,4,(.83,.78,1))
    area('Wool rim',(1,3,5),600,3,(1,.85,.93))
    bpy.ops.object.camera_add(location=(.30,-9,3.05))
    camera=bpy.context.object
    camera.rotation_euler=(Vector((.22,0,1.95))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=4.55
    scene.camera=camera
    scene.view_settings.view_transform='AgX'
    scene.render.resolution_x=768
    scene.render.resolution_y=768
    scene.render.resolution_percentage=100
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.filepath=str(Path(opts.render).resolve())
    Path(opts.render).resolve().parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path('.art-scratch/felt-fox.blend').resolve()))
    bpy.ops.render.render(write_still=True)
