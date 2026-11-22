"""Fit, skin, animate and optimise the owner's external fox, using Blender 4.5.

Usage: blender -b --factory-startup --python tools/blender/rig_user_model.py --
  --in /external/original.glb --out examples/models/user-fox.glb
  --renders .art-scratch/user-rig

The source is never copied or modified. Landmark proportions below are small
anatomical priors for this upright chibi, applied to measured vertex clusters.
Heat weights are solved on a closed voxel proxy and transferred to the source
with nearest-face interpolation. Anatomical geodesic blends, surface smoothing
and identical UV-seam weights protect the exclusive ear/head/tail domains.
Four influences maximum, no geometry reduction. All nine looping actions have a readable pose
at 0.6 s. WebP maps are embedded, with no external decoder dependency in three.
A landmark/weight/export report and editable review blend accompany the renders.
Add --video for 512px, 24fps H.264 wave/walk previews in .art-scratch/video.
"""
import argparse
import json
import heapq
import math
import sys
import subprocess
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector, Quaternion

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--in', dest='source', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--renders')
parser.add_argument('--skip-stills', action='store_true')
parser.add_argument('--video', action='store_true', help='Render 3.6 second wave/walk MP4 previews')
opts = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(opts.out).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
review = Path(opts.renders).resolve() if opts.renders else out.parent
review.mkdir(parents=True, exist_ok=True)
phase = Path('.art-scratch/PHASE.txt')

def marker(value):
    phase.parent.mkdir(exist_ok=True)
    lines = phase.read_text().splitlines() if phase.exists() else []
    if value not in lines:
        phase.write_text('\n'.join(lines + [value]) + '\n')
    print(value, flush=True)

def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(Path(opts.source).resolve()))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(meshes) == 1, 'Expected the owner mesh, with no generated replacement'
mesh = meshes[0]
active(mesh)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
P = np.array([v.co[:] for v in mesh.data.vertices])
lo, hi = P.min(axis=0), P.max(axis=0)
H = float(hi[2] - lo[2])
z0 = float(lo[2])
# Head and feet clusters avoid the asymmetric tail when measuring body centre.
head_cluster = P[(P[:,2] > z0 + .56*H) & (P[:,2] < z0 + .76*H)]
cx = float((np.quantile(head_cluster[:,0], .03) + np.quantile(head_cluster[:,0], .97)) / 2)
head_width = float(np.quantile(head_cluster[:,0], .97)-np.quantile(head_cluster[:,0], .03))
neck_z = z0 + .425*H
cy = float(np.median(head_cluster[:,1])) + .045*H
body = P[(P[:,2] > z0+.16*H)&(P[:,2]<z0+.39*H)&(abs(P[:,0]-cx)<.15*H)]
body_y = float(np.median(body[:,1]))
# Geodesic separation respects the fused surface: the front of the curled
# tail is close to the left paw in space, but far away along mesh edges.
adjacency = [[] for _ in P]
for edge in mesh.data.edges:
    a,b = edge.vertices
    length = float(np.linalg.norm(P[a]-P[b]))
    adjacency[a].append((b,length)); adjacency[b].append((a,length))
from mathutils.kdtree import KDTree
kd=KDTree(len(P))
for i,p in enumerate(P):kd.insert(Vector(p),i)
kd.balance()
for i,p in enumerate(P):
    for _,j,d in kd.find_range(Vector(p),.00015*H):
        if j!=i:adjacency[i].append((j,d))

def geodesic(mask):
    dist=np.full(len(P),np.inf)
    todo=[(0.,int(i)) for i in np.flatnonzero(mask)]
    assert todo, 'Empty anatomical seed cluster'
    for _,i in todo:dist[i]=0.
    heapq.heapify(todo)
    while todo:
        d,i=heapq.heappop(todo)
        if d>dist[i]:continue
        for j,w in adjacency[i]:
            nd=d+w
            if nd<dist[j]:dist[j]=nd;heapq.heappush(todo,(nd,j))
    return dist

x,y,z=P.T
arm_seeds={}
for sign,side in [(-1,'R'),(1,'L')]:
    arm_seeds[side]=(((x-cx)*sign>.245*H)&(z>z0+.15*H)&
                     (z<z0+.39*H)&(y<body_y-.065*H))
core_seed=((abs(x-cx)<.12*H)&(z<neck_z-.025*H)&(y<body_y+.04*H))
core_seed|=((z<z0+.115*H)&(x<cx+.23*H)&(y<body_y+.08*H))
head_seed=(z>neck_z+.10*H)&(x<cx+.35*H)&(y<body_y+.13*H)
tail_seed=(z<neck_z+.12*H)&(x>cx+.12*H)&(y>body_y+.18*H)
tail_seed|=(z<neck_z+.12*H)&(x>cx+.48*H)
d_tail=geodesic(tail_seed)
d_other=geodesic(core_seed|head_seed|arm_seeds['L']|arm_seeds['R'])
tail_mask=d_tail<d_other
# Tiny detached reconstruction flecks use nearest surface coordinates.
for i in np.flatnonzero(~np.isfinite(d_tail)|~np.isfinite(d_other)):
    candidates=kd.find_n(Vector(P[i]),40)
    nearest=next((j for _,j,_ in candidates if np.isfinite(d_tail[j]) and np.isfinite(d_other[j])),None)
    if nearest is not None:tail_mask[i]=tail_mask[nearest]
d_tail_surface=geodesic(tail_mask)
d_core=geodesic(core_seed|head_seed)
d_arms={side:geodesic(mask) for side,mask in arm_seeds.items()}
tail_points = P[tail_mask]
assert len(tail_points) > 250, 'No rear tail cluster detected'
feet = P[(P[:,2]<z0+.08*H)&(P[:,1]<body_y+.08*H)]
landmarks = {'height':H, 'body_center_x':cx, 'body_y':body_y,
             'neck_z':neck_z, 'head_width':head_width, 'bounds':[lo.tolist(),hi.tolist()]}

arm_data = bpy.data.armatures.new('OwnerFoxSkeleton')
rig = bpy.data.objects.new('OwnerFoxRig', arm_data)
bpy.context.collection.objects.link(rig)
active(rig)
bpy.ops.object.mode_set(mode='EDIT')
rest = {}

def bone(name, a, b, parent=None):
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = a, b
    if parent: eb.parent = arm_data.edit_bones[parent]
    eb.use_deform = True
    eb.head_radius = .07*H
    eb.tail_radius = .05*H
    eb.envelope_distance = .05*H
    rest[name] = [list(a),list(b)]
    return eb

hips_z = z0+.20*H
bone('root',(cx,body_y,z0),(cx,body_y,z0+.08*H))
bone('hips',(cx,body_y,hips_z),(cx,body_y,z0+.29*H),'root')
bone('spine',(cx,body_y,z0+.29*H),(cx,body_y,z0+.36*H),'hips')
bone('chest',(cx,body_y,z0+.36*H),(cx,body_y,neck_z),'spine')
bone('neck',(cx,body_y,neck_z),(cx,cy,neck_z+.045*H),'chest')
bone('head',(cx,cy,neck_z+.045*H),(cx,cy,z0+.76*H),'neck')
# Ear tip/base positions come from the two upper side clusters.
ear_info = {}
for sign, side in [(-1,'R'),(1,'L')]:
    ear = P[(P[:,2]>z0+.76*H)&((P[:,0]-cx)*sign>.13*H)]
    top = ear[ear[:,2]>np.quantile(ear[:,2],.90)].mean(axis=0)
    base = np.array([cx+sign*.205*H,float(np.median(ear[:,1])),z0+.77*H])
    middle = base*.45+top*.55
    bone('ear.'+side,base,middle,'head')
    bone('ear.'+side+'.tip',middle,top,'ear.'+side)
    ear_info[side] = [base.tolist(), top.tolist()]
# Limbs are measured separately so the asymmetric baked surface is respected.
for sign, side in [(-1,'R'),(1,'L')]:
    arm = P[arm_seeds[side]&(~tail_mask)]
    outer = arm[(arm[:,0]-cx)*sign>np.quantile((arm[:,0]-cx)*sign,.78)]
    paw = outer.mean(axis=0)
    shoulder = np.array([cx+sign*.135*H,body_y, z0+.386*H])
    elbow = shoulder*.42+paw*.58
    wrist = shoulder*.12+paw*.88
    palm_end = paw+(paw-shoulder)*.10
    bone('shoulder.'+side,(cx+sign*.07*H,body_y,z0+.38*H),shoulder,'chest')
    bone('upper_arm.'+side,shoulder,elbow,'shoulder.'+side)
    bone('forearm.'+side,elbow,wrist,'upper_arm.'+side)
    bone('hand.'+side,wrist,palm_end,'forearm.'+side)
    foot_cluster = feet[(feet[:,0]-cx)*sign>0]
    fx = float(np.median(foot_cluster[:,0]))
    fy = float(np.median(foot_cluster[:,1]))
    hip = (cx+sign*.075*H,body_y,hips_z)
    knee = (fx,body_y,z0+.105*H)
    ankle = (fx,fy+.025*H,z0+.045*H)
    toe = (fx,float(np.quantile(foot_cluster[:,1],.12)),z0+.025*H)
    bone('thigh.'+side,hip,knee,'hips')
    bone('shin.'+side,knee,ankle,'thigh.'+side)
    bone('foot.'+side,ankle,toe,'shin.'+side)
# A curved tail chain follows median horizontal slices, from rump to tip.
tzlo,tzhi = np.quantile(tail_points[:,2],[.05,.97])
tail_nodes = [np.array([cx+.10*H,body_y+.16*H,z0+.16*H])]
for f in [.25,.54,.80,1.0]:
    z = tzlo+(tzhi-tzlo)*f
    sl = tail_points[abs(tail_points[:,2]-z)<.055*H]
    pt = np.median(sl,axis=0)
    if f==1.0:
        pt[0] = np.quantile(sl[:,0],.8)
    tail_nodes.append(pt)
for i in range(4):
    bone('tail.'+str(i+1),tail_nodes[i],tail_nodes[i+1],'hips' if i==0 else 'tail.'+str(i))
bpy.ops.object.mode_set(mode='OBJECT')

# A closed, welded voxel proxy gives bone heat a continuous manifold instead
# of the source's UV-split reconstruction patches. Transfer interpolated surface
# weights back without changing a single source vertex, UV or material.
proxy = mesh.copy()
proxy.data = mesh.data.copy()
proxy.name = 'Closed heat-weight proxy'
bpy.context.collection.objects.link(proxy)
proxy.vertex_groups.clear()
proxy.modifiers.clear()
active(proxy)
proxy.data.remesh_voxel_size = .012 * H
proxy.data.use_remesh_preserve_volume = True
bpy.ops.object.voxel_remesh()
# Remove voxel stair steps before solving the Laplacian heat equation.
relax = proxy.modifiers.new('Proxy surface relaxation', 'SMOOTH')
relax.factor = .65
relax.iterations = 4
bpy.ops.object.modifier_apply(modifier=relax.name)
proxy_vertices = len(proxy.data.vertices)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
heat_weights = [{} for _ in P]
heat = 'closed voxel proxy automatic + nearest-face interpolated transfer'
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    coverage = sum(bool(v.groups) for v in proxy.data.vertices) / proxy_vertices
    if coverage < .99:
        raise RuntimeError(f'Heat coverage only {coverage:.1%}')
    active(mesh)
    # Destination groups must exist before Data Transfer can match by name.
    for group in proxy.vertex_groups:
        if group.name not in mesh.vertex_groups:mesh.vertex_groups.new(name=group.name)
    transfer = mesh.modifiers.new('Interpolated proxy skin', 'DATA_TRANSFER')
    transfer.object = proxy
    transfer.use_vert_data = True
    transfer.data_types_verts = {'VGROUP_WEIGHTS'}
    transfer.vert_mapping = 'POLYINTERP_NEAREST'
    transfer.layers_vgroup_select_src = 'ALL'
    transfer.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    for v in mesh.data.vertices:
        heat_weights[v.index] = {mesh.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight > 1e-7}
    if sum(bool(w) for w in heat_weights) < .99*len(P):
        raise RuntimeError('Incomplete transferred weights')
except RuntimeError as exc:
    heat = 'voxel heat failed; geodesic capsule fallback: ' + str(exc)
    heat_weights = [{} for _ in P]
    print(heat, flush=True)
bpy.data.objects.remove(proxy, do_unlink=True)
mesh.parent=rig
if not any(m.type=='ARMATURE' for m in mesh.modifiers):
    mod=mesh.modifiers.new('Fox skin','ARMATURE');mod.object=rig
for mod in mesh.modifiers:
    if mod.type=='ARMATURE': mod.use_deform_preserve_volume=False
mesh.vertex_groups.clear()
groups={n:mesh.vertex_groups.new(name=n) for n in rest}

def smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a)))
    return t*t*(3-2*t)

def distance(p,a,b):
    a,b=np.array(a),np.array(b)
    d=b-a
    t=np.clip(np.dot(p-a,d)/max(np.dot(d,d),1e-12),0,1)
    return float(np.linalg.norm(p-a-t*d))

def capsules(p,names,soft=.035):
    ds=[distance(p,*rest[n]) for n in names]
    # Gaussian relative distances avoid inverse-distance spikes at joints.
    ds=np.array(ds);w=np.exp(-(ds*ds-ds.min()**2)/(soft*H)**2)
    return {n:float(v/w.sum()) for n,v in zip(names,w) if v>1e-6}

regions={'head':0,'ears':0,'tail':0,'body':0}
vertex_regions=[]
weight_rows=[]
for i,p in enumerate(P):
    x,y,z=p
    if tail_mask[i]:
        weights=capsules(p,['tail.1','tail.2','tail.3','tail.4'],.10)
        attachment=smooth(.015*H,.18*H,d_other[i])
        weights={n:w*attachment for n,w in weights.items()}
        weights['tail.1']=weights.get('tail.1',0)+1-attachment
        regions['tail']+=1
        vertex_regions.append('tail')
    elif z>neck_z+.005*H:
        # Face, muzzle and cheek fluff stay rigid. Ear transition is above eyes.
        sign=1 if x>cx else -1
        side='L' if sign==1 else 'R'
        base,top=np.array(ear_info[side])
        outward=(x-cx)*sign
        ear_blend=smooth(.735*H+z0,.81*H+z0,z)*smooth(.105*H,.20*H,outward)
        if ear_blend>0:
            weights=capsules(p,['ear.'+side,'ear.'+side+'.tip'],.065)
            weights={n:w*ear_blend for n,w in weights.items()}
            weights['head']=1-ear_blend
            regions['ears']+=1
            vertex_regions.append('ears')
        else:
            weights={'head':1};regions['head']+=1
            vertex_regions.append('head')
    else:
        torso=capsules(p,['hips','chest'],.10)
        # Smooth neck attachment below the rigid face, away from the eyes.
        hblend=smooth(neck_z-.09*H,neck_z+.005*H,z)
        if hblend:
            torso={n:w*(1-hblend) for n,w in torso.items()};torso['head']=hblend
        sign=1 if x>cx else -1;side='L' if sign==1 else 'R'
        limb=['upper_arm.'+side,'forearm.'+side,'hand.'+side]
        # Blend across geodesic shoulder distances, never across the spatial
        # gap between a paw and the curled tail, and include the whole mitten.
        delta=d_core[i]-d_arms[side][i]
        if not math.isfinite(delta):
            delta=(abs(x-cx)-.22*H)
        armblend=smooth(-.095*H,.095*H,delta)
        armblend*=1-smooth(neck_z-.095*H,neck_z-.025*H,z)
        legblend=1-smooth(z0+.13*H,z0+.235*H,z)
        if legblend>0:
            # Blend the two thighs through the crotch instead of changing the
            # controlling leg abruptly at x=center. Distal bones stay below it.
            left=smooth(-.035*H,.035*H,x-cx)
            legs={}
            distal=1-smooth(z0+.10*H,z0+.17*H,z)
            for leg_side,side_weight in [('L',left),('R',1-left)]:
                names=['thigh.'+leg_side,'shin.'+leg_side,'foot.'+leg_side]
                row=capsules(p,names,.055)
                auto={n:heat_weights[i].get(n,0) for n in names}
                total=sum(auto.values())
                if total>1e-6:row={n:.65*auto[n]/total+.35*row.get(n,0) for n in names}
                row={n:w*distal for n,w in row.items()}
                row['thigh.'+leg_side]=row.get('thigh.'+leg_side,0)+1-distal
                for n,w in row.items():legs[n]=w*side_weight
            torso={n:w*(1-legblend) for n,w in torso.items()}
            for n,w in legs.items():torso[n]=torso.get(n,0)+w*legblend
        # Heat supplies the distribution *inside* a limb; geodesic blends
        # control how much of that limb reaches the torso. Unrestricted heat
        # can jump between nearby chest/paw faces on this fused reconstruction.
        automatic={n:heat_weights[i].get(n,0) for n in limb}
        auto_total=sum(automatic.values())
        limb_weights=capsules(p,limb,.07)
        if auto_total>1e-6:
            limb_weights={n:.65*automatic[n]/auto_total+.35*limb_weights.get(n,0) for n in limb}
        distal_blend=smooth(.60,.95,armblend)
        moved=sum(w for n,w in limb_weights.items() if n!='upper_arm.'+side)*(1-distal_blend)
        limb_weights={n:w if n=='upper_arm.'+side else w*distal_blend for n,w in limb_weights.items()}
        limb_weights['upper_arm.'+side]=limb_weights.get('upper_arm.'+side,0)+moved
        # Free one influence slot before the hand starts contributing. This
        # prevents top-four truncation from dropping a large shoulder weight.
        hand_blend=smooth(.35,.8,armblend)
        hand_weight=limb_weights.get('hand.'+side,0)*(1-hand_blend)
        limb_weights['hand.'+side]=limb_weights.get('hand.'+side,0)*hand_blend
        limb_weights['forearm.'+side]=limb_weights.get('forearm.'+side,0)+hand_weight
        if armblend>0:
            hip_to_chest=smooth(0,.25,armblend)
            moved=torso.get('hips',0)*hip_to_chest
            torso['hips']=torso.get('hips',0)-moved
            torso['chest']=torso.get('chest',0)+moved
        weights={n:w*(1-armblend) for n,w in torso.items()}
        if armblend:
            for n,w in limb_weights.items():weights[n]=weights.get(n,0)+w*armblend
        # Make both sides of the fused rump attachment follow the hips; the
        # exclusive tail chain begins with an unanimated root at this socket.
        rump=smooth(0,.10*H,d_tail_surface[i])
        weights={n:w*rump for n,w in weights.items()}
        weights['hips']=weights.get('hips',0)+1-rump
        regions['body']+=1
        vertex_regions.append('body')
    weight_rows.append(weights)

# Smooth shoulder, hip and neck transitions on the welded surface graph.
# Rigid face and exclusive ear/tail chains are never mixed with body groups.
# Surface patches are irregularly tessellated. A spatial kernel first removes
# tiny heat discontinuities without welding or changing the rendered geometry.
body_ids=[i for i,r in enumerate(vertex_regions) if r=='body']
kernels={}
for i in body_ids:
    neighbours=[(j,math.exp(-(d/(.045*H))**2)) for _,j,d in kd.find_range(Vector(P[i]),.075*H)
                if vertex_regions[j]=='body']
    total=sum(w for _,w in neighbours)
    kernels[i]=[(j,w/total) for j,w in neighbours]
for iteration in range(3):
    updated=list(weight_rows)
    for i,neighbours in kernels.items():
        row={}
        for j,k in neighbours:
            for n,w in weight_rows[j].items():row[n]=row.get(n,0)+k*w
        updated[i]=row
    weight_rows=updated
for iteration in range(5):
    updated=[]
    for i,w in enumerate(weight_rows):
        if vertex_regions[i]!='body':
            updated.append(w);continue
        neighbours=[j for j,_ in adjacency[i] if vertex_regions[j]=='body']
        if not neighbours:
            updated.append(w);continue
        row={n:.55*v for n,v in w.items()}
        for j in neighbours:
            for n,v in weight_rows[j].items():row[n]=row.get(n,0)+.45*v/len(neighbours)
        # Restore the smooth attachment to the fully rigid facial region.
        hblend=smooth(neck_z-.09*H,neck_z+.005*H,P[i,2])
        total=sum(v for n,v in row.items() if n!='head')
        if total>1e-8:
            row={n:v/total*(1-hblend) for n,v in row.items() if n!='head'}
            if hblend:row['head']=hblend
        updated.append(row)
    weight_rows=updated

# Reserve four stable influence slots at each joint before truncation. A
# changing fifth influence otherwise causes an abrupt jump on short edges.
for i,row in enumerate(weight_rows):
    if vertex_regions[i]!='body':continue
    side='L' if P[i,0]>cx else 'R'
    other='R' if side=='L' else 'L'
    row=dict(row)
    for part in ['upper_arm','forearm','hand']:
        row['chest']=row.get('chest',0)+row.pop(part+'.'+other,0)
    arm_names=[part+'.'+side for part in ['upper_arm','forearm','hand']]
    arm_total=sum(row.get(n,0) for n in arm_names)
    if P[i,2]<z0+.26*H:
        lower=smooth(z0+.16*H,z0+.26*H,P[i,2])
        removed=0.
        for n in arm_names:
            removed+=row.get(n,0)*(1-lower)
            if n in row:row[n]*=lower
        row['chest']=row.get('chest',0)+removed
        arm_total*=lower
    if arm_total>1e-8:
        for n in list(row):
            if n in ['hips','spine','neck'] or n.startswith(('thigh.','shin.','foot.')):
                row['chest']=row.get('chest',0)+row.pop(n)
        if row.get('head',0)>0:
            row['forearm.'+side]=row.get('forearm.'+side,0)+row.pop('hand.'+side,0)
    elif P[i,2]<z0+.18*H:
        for n in list(row):
            if n=='chest' or n.startswith(('upper_arm.','forearm.','hand.')):
                row['hips']=row.get('hips',0)+row.pop(n)
        # Distal leg groups never cross the crotch onto the other leg.
        for part in ['shin','foot']:
            row['thigh.'+other]=row.get('thigh.'+other,0)+row.pop(part+'.'+other,0)
        if row.get('thigh.'+other,0)>.005:
            row['shin.'+side]=row.get('shin.'+side,0)+row.pop('foot.'+side,0)
    weight_rows[i]={n:w for n,w in row.items() if w>1e-8}

# Exact coincident UV seams get identical normalised weights after smoothing.
seam_vertices={}
for i,p in enumerate(P):seam_vertices.setdefault(tuple(round(c,6) for c in p),[]).append(i)
for ids in seam_vertices.values():
    if len(ids)<2:continue
    row={}
    for i in ids:
        for n,w in weight_rows[i].items():row[n]=row.get(n,0)+w/len(ids)
    for i in ids:weight_rows[i]=row
for i,weights in enumerate(weight_rows):
    weights=sorted(weights.items(),key=lambda kv:kv[1],reverse=True)[:4]
    total=sum(w for _,w in weights)
    for n,w in weights:
        if w>1e-7:groups[n].add([i],w/total,'REPLACE')
assert all(1<=len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<1e-5 for v in mesh.data.vertices)
# Seam consistency: continuous spatial weights must match at duplicate positions.
seams={};seam_error=0.
for v in mesh.data.vertices:
    key=tuple(round(c,5) for c in v.co)
    w={mesh.vertex_groups[g.group].name: g.weight for g in v.groups}
    if key in seams:
        old=seams[key];seam_error=max(seam_error,max(abs(w.get(n,0)-old.get(n,0)) for n in w.keys()|old.keys()))
    else:seams[key]=w

scene=bpy.context.scene
scene.render.fps=30
rig.animation_data_create()
peaks={}

def reset():
    for pb in rig.pose.bones:
        pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0)
        pb.location=(0,0,0);pb.scale=(1,1,1)

def rotate(name,axis,angle):
    pb=rig.pose.bones[name];q=pb.bone.matrix_local.to_quaternion()
    pb.rotation_quaternion=q.inverted() @ Quaternion(axis,angle) @ q

def arm_rotation(name, y_angle, forward):
    pb=rig.pose.bones[name];q=pb.bone.matrix_local.to_quaternion()
    pb.rotation_quaternion=q.inverted() @ (Quaternion((1,0,0),forward) @ Quaternion((0,1,0),y_angle)) @ q

def shift(name,xyz):
    pb=rig.pose.bones[name]
    pb.location=pb.bone.matrix_local.to_quaternion().inverted() @ Vector(xyz)

# All actions close at their starting pose. Keys every .1s, including .6s.
for name,duration in [('idle',3),('wave',2.4),('happy',1.2),('success',2.4),
                      ('nod',2.4),('shake',2.4),('jump',2.4),('walk',1.2),('sleep',3.6)]:
    action=bpy.data.actions.new(name);rig.animation_data.action=action
    end=round(duration*30)+1
    for frame in list(range(1,end,3))+[end]:
        t=(frame-1)/30;ph=t/duration*2*math.pi
        reset()
        # Relax the original A-pose down to the flanks in every neutral clip.
        for sign,side in [(-1,'R'),(1,'L')]:
            rotate('upper_arm.'+side,(0,1,0),sign*.32)
        rotate('chest',(0,1,0),.018*math.sin(ph))
        rig.pose.bones['spine'].scale=(1+.009*math.sin(ph),1+.009*math.sin(ph),1+.009*math.sin(ph))
        rotate('head',(0,1,0),.025*math.sin(ph))
        for j in range(2,5):rotate('tail.'+str(j),(0,0,1),.035*math.sin(ph-.45*j))
        for side,off in [('L',0),('R',.7)]:
            rotate('ear.'+side,(0,1,0),.025*math.sin(ph+off))
            rotate('ear.'+side+'.tip',(1,0,0),.035*math.sin(ph+off-.5))
        # Smooth gesture envelope reaches full pose at .6 s.
        rise=math.sin(min(t/.6,1)*math.pi/2)**2
        fall=math.sin(min((duration-t)/.45,1)*math.pi/2)**2
        gesture=rise*fall
        if name=='wave':
            rotate('upper_arm.R',(0,1,0),-.32+(2.35+.16*math.sin(3*ph))*gesture)
            shift('shoulder.R',(-.07*H*gesture,-.12*H*gesture,.015*H*gesture))
            rotate('forearm.R',(0,1,0),(.12+.24*math.sin(3*ph))*gesture)
            rotate('hand.R',(0,1,0),.30*math.cos(3*ph)*gesture)
            rotate('head',(0,1,0),-.075*gesture)
        elif name=='success':
            for sign,side in [(-1,'R'),(1,'L')]:
                rotate('upper_arm.'+side,(0,1,0),sign*(.32-2.00*gesture))
                shift('shoulder.'+side,(sign*.12*H*gesture,-.12*H*gesture,.12*H*gesture))
                rotate('forearm.'+side,(0,1,0),sign*.10*gesture)
                rig.pose.bones['upper_arm.'+side].scale=(1,1+.25*gesture,1)
                rig.pose.bones['forearm.'+side].scale=(1,1+.10*gesture,1)
            shift('root',(0,0,.035*H*gesture))
            rotate('head',(1,0,0),-.07*gesture)
        elif name=='happy':
            bounce=(1-math.cos(ph))/2
            shift('root',(0,0,.085*H*bounce))
            rotate('head',(0,1,0),.09*math.sin(ph))
            for sign,side in [(-1,'R'),(1,'L')]:rotate('upper_arm.'+side,(0,1,0),sign*(.25-.50*bounce))
        elif name=='nod':rotate('head',(1,0,0),.40*math.sin(ph))
        elif name=='shake':rotate('head',(0,0,1),.42*math.sin(ph))
        elif name=='jump':
            lift=math.sin(math.pi*min(t/1.2,1))**2 if t<=1.2 else 0
            shift('root',(0,0,.17*H*lift))
            for sign,side in [(-1,'R'),(1,'L')]:
                rotate('upper_arm.'+side,(0,1,0),sign*(.32-1.1*lift))
                rotate('thigh.'+side,(1,0,0),-.20*lift)
                rotate('shin.'+side,(1,0,0),.25*lift)
        elif name=='walk':
            # Offset gives a leg-forward silhouette at the shared .6s sample.
            swing=math.cos(ph)
            for sign,side in [(-1,'R'),(1,'L')]:
                rotate('thigh.'+side,(1,0,0),sign*.55*swing)
                rotate('shin.'+side,(1,0,0),max(0,-sign*swing)*.50)
                arm_rotation('upper_arm.'+side,sign*.24,-sign*.40*swing)
                rotate('foot.'+side,(1,0,0),-sign*.12*swing)
            shift('root',(.018*H*math.sin(ph),0,.018*H*(1-math.cos(ph*2))))
            rotate('hips',(0,1,0),.055*math.sin(ph))
            for j in range(2,5):rotate('tail.'+str(j),(0,0,1),.055*math.sin(ph-.6*j))
        elif name=='sleep':
            rotate('neck',(1,0,0),.08)
            rotate('head',(1,0,0),.24+.015*math.sin(ph))
            for side in ['L','R']:rotate('ear.'+side,(1,0,0),.15)
        if name in ['wave','success'] and gesture>.01:
            bpy.context.view_layer.update()
            for side in (['R'] if name=='wave' else ['L','R']):
                hand=rig.pose.bones['hand.'+side]
                desired=hand.bone.matrix_local.copy()
                desired.translation=hand.matrix.translation
                hand.matrix=desired
        for pb in rig.pose.bones:
            pb.keyframe_insert('location',frame=frame,group=pb.name)
            pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
            pb.keyframe_insert('scale',frame=frame,group=pb.name)
    # Small asymmetries at the end are eliminated explicitly for seamless loops.
    scene.frame_set(1)
    for pb in rig.pose.bones:
        for path in ['location','rotation_quaternion','scale']:pb.keyframe_insert(path,frame=end,group=pb.name)
    track=rig.animation_data.nla_tracks.new();track.name=name
    track.strips.new(name,1,action);track.mute=True
    peaks[name]=.6
rig.animation_data.action=None
reset()
scene.frame_set(1)
marker('RIG done')

# Evaluate the actual skinned surface throughout every exported action. Tiny
# degenerate edges are excluded from ratios but UV-seam distances are checked.
edges=np.array([e.vertices[:] for e in mesh.data.edges],dtype=int)
rest_lengths=np.linalg.norm(P[edges[:,1]]-P[edges[:,0]],axis=1)
valid=rest_lengths>H*1e-5
labels=[]
for a,b in edges:
    kinds={vertex_regions[a],vertex_regions[b]}
    z=(P[a,2]+P[b,2])/2
    if kinds=={'head'}:label='rigid_face'
    elif 'ears' in kinds:label='ears'
    elif 'tail' in kinds:label='tail'
    elif z>neck_z-.065*H:label='neck'
    elif z<z0+.245*H:label='hips_legs'
    else:label='shoulders_torso'
    labels.append(label)
labels=np.array(labels)
stretch={}
worst_edges=[]
seam_gap=0.
depsgraph=bpy.context.evaluated_depsgraph_get()
for name in peaks:
    rig.animation_data.action=bpy.data.actions[name]
    end=int(rig.animation_data.action.frame_range[1])
    samples=sorted(set(list(range(1,end+1,6))+[19,end]))
    measures={label:[] for label in set(labels)}
    for frame in samples:
        scene.frame_set(frame);bpy.context.view_layer.update()
        evaluated=mesh.evaluated_get(depsgraph)
        coordinates=np.array([v.co[:] for v in evaluated.data.vertices])
        lengths=np.linalg.norm(coordinates[edges[:,1]]-coordinates[edges[:,0]],axis=1)
        ratio=lengths/np.maximum(rest_lengths,H*1e-5)
        for label in measures:measures[label].append(ratio[(labels==label)&valid])
        idx=int(np.argmax(np.where(valid,ratio,0)))
        worst_edges.append({'action':name,'frame':frame,'ratio':float(ratio[idx]),
                            'region':str(labels[idx]),'vertices':edges[idx].tolist(),
                            'rest_positions':P[edges[idx]].tolist(),
                            'weights':[{mesh.vertex_groups[g.group].name:g.weight for g in mesh.data.vertices[i].groups} for i in edges[idx]],
                            'rest_length':float(rest_lengths[idx]),
                            'length_change':float(lengths[idx]-rest_lengths[idx])})
        for ids in seam_vertices.values():
            if len(ids)>1:seam_gap=max(seam_gap,float(np.linalg.norm(coordinates[ids]-coordinates[ids[0]],axis=1).max()))
    stretch[name]={label:{'max':float(np.concatenate(values).max()),
                          'p99':float(np.quantile(np.concatenate(values),.99)),
                          'min':float(np.concatenate(values).min())}
                   for label,values in measures.items() if len(values[0])}
rig.animation_data.action=None
reset();scene.frame_set(1)
assert seam_gap < H*1e-5, 'Skinned UV seams separated'
assert all(regions['rigid_face']['max']<1.011 for regions in stretch.values()), 'Facial surface deformed'
print('STRETCH '+json.dumps(stretch),flush=True)

# Keep original UVs, triangles and materials; resize only embedded image maps.
textures=[]
for img in bpy.data.images:
    if not img.has_data or img.size[0]<2 or img.name in ['Render Result','Viewer Node']:continue
    target=2048 if img.name=='texture_0' else 1024
    img.scale(target,target)
    textures.append({'name':img.name,'width':target,'height':target})
active(rig);mesh.select_set(True)
for track in rig.animation_data.nla_tracks:track.mute=False
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
    export_image_format='WEBP',export_image_quality=86,export_image_webp_fallback=False,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
    export_skins=True,export_yup=True,export_force_sampling=True,export_anim_slide_to_zero=True,
    export_def_bones=True,export_all_influences=False)
for track in rig.animation_data.nla_tracks:track.mute=True
report={'bones':len(rest),'bone_landmarks':rest,'measurements':landmarks,'weight_method':heat,
        'regions':regions,'max_seam_weight_difference':seam_error,'max_influences':4,
        'stretch':stretch,'worst_edges':sorted(worst_edges,key=lambda e:e['ratio'],reverse=True)[:12],
        'max_deformed_seam_gap':seam_gap,'validation_frame_step':6,
        'textures':textures,'actions':peaks,'bytes':out.stat().st_size,
        'heat_limb_blend':.65,'smoothing_iterations':{'spatial':3,'surface':5},'proxy_vertices':proxy_vertices,'source_vertices':len(P),'source_triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons)}
(review/'report.json').write_text(json.dumps(report,indent=2))
assert out.stat().st_size<5_000_000, 'Web asset exceeds 5 MB budget'
marker('POSES done')
marker('WEIGHTS done')
marker('WEB done')
print(json.dumps({k:report[k] for k in ['bones','regions','max_seam_weight_difference','bytes']}),flush=True)

if opts.renders and (not opts.skip_stills or opts.video):
    # Headless EEVEE uses the runner's software EGL context.
    scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples=32
    scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.24,.24,.24,1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.5
    scene.view_settings.view_transform='AgX'
    def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    for location,power,size in [((cx-2.5,-3.5,4),500,4),((cx+3,-1,2),250,3),((cx+1,3,3),550,3)]:
        bpy.ops.object.light_add(type='AREA',location=location)
        light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(cx,0,0))
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,z0-.012))
    floor=bpy.context.object;floor.name='Review floor'
    mat=bpy.data.materials.new('Review neutral grey');mat.diffuse_color=(.24,.24,.24,1);floor.data.materials.append(mat)
    bpy.ops.object.camera_add(location=(cx,-6,.25))
    camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=H*1.42
    aim(camera,(cx+.055*H,0,z0+.53*H));scene.camera=camera
    if not opts.skip_stills:
        for name in peaks:
            rig.animation_data.action=bpy.data.actions[name]
            scene.frame_set(19);bpy.context.view_layer.update()
            scene.render.filepath=str(review/(name+'.png'))
            bpy.ops.render.render(write_still=True)
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(19)
    bpy.ops.wm.save_as_mainfile(filepath=str(review/'user-fox.blend'))
    print('Blender action renders complete',flush=True)

    if opts.video:
        video_dir=phase.parent/'video'
        video_dir.mkdir(parents=True,exist_ok=True)
        scene.eevee.taa_render_samples=8
        scene.render.fps=24
        for name in ['wave','walk']:
            sequence=video_dir/(name+'-frames')
            sequence.mkdir(exist_ok=True)
            action=bpy.data.actions[name]
            rig.animation_data.action=action
            period=(action.frame_range[1]-1)/30
            for i in range(86):
                # Actions remain authored at 30fps; video samples at 24fps.
                sample=1+(i/24 % period)*30
                scene.frame_set(int(sample),subframe=sample-int(sample))
                scene.render.filepath=str((sequence/f'{i:04d}.png').resolve())
                bpy.ops.render.render(write_still=True)
            subprocess.run(['/usr/bin/ffmpeg','-y','-framerate','24','-i',
                            str(sequence/'%04d.png'),'-c:v','libx264','-crf','19',
                            '-pix_fmt','yuv420p','-movflags','+faststart',
                            str(video_dir/(name+'.mp4'))],check=True)
        marker('VIDEO done')
