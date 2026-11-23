"""Fit, skin, animate and optimise the owner's external fox, using Blender 4.5.

Usage: blender -b --factory-startup --python tools/blender/rig_user_model.py --
  --in /external/original.glb --out examples/models/user-fox.glb
  --renders .art-scratch/user-rig

The source is never copied or modified. Landmark proportions below are small
anatomical priors for this upright chibi, applied to measured vertex clusters.
A broad smooth shoulder band and a protected torso isolate the belly.
Baked clavicle and socket helpers distribute linear blend skinning rotation. Geodesic tail
segmentation and identical seam weights protect exclusive ear/head/tail domains.
Four influences maximum, no geometry reduction. All nine looping actions have a readable pose
at 0.6 s. WebP maps are embedded, with no external decoder dependency in three.
A landmark/weight/export report and editable review blend accompany the renders.
Add --video for 512px, 24fps H.264 wave/success/walk previews in .art-scratch/video.
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
parser.add_argument('--video', action='store_true', help='Render one full wave/success/walk loop as MP4/GIF previews')
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

# Rip the fused inner-arm/waist contact; only the freed seam rims are inset.
# Face ownership follows the inner capsule tangent; only the socket stays shared.
source_mesh = mesh.data.copy()
source_vertex_count = len(P)
source_triangle_count = sum(len(f.vertices)-2 for f in mesh.data.polygons)
zn=(P[:,2]-z0)/H
lateral=np.abs(P[:,0]-cx)/H
face_side=[]
for face in mesh.data.polygons:
    ids=np.array(face.vertices)
    c=P[ids].mean(axis=0); zz=(c[2]-z0)/H
    is_arm=(abs(c[0]-cx)/H > .32-.40*zz and .20<zz<.395
            and not np.any(tail_mask[ids]))
    face_side.append((1 if c[0]>cx else -1) if is_arm else 0)
incident=[set() for _ in P]
for f,side in zip(mesh.data.polygons,face_side):
    for i in f.vertices:incident[i].add(side)
# Duplicate only the seam below the true shoulder. The upper socket remains sewn.
split_ids=[i for i,owners in enumerate(incident) if 0 in owners and len(owners)>1 and zn[i]<.365]
coords=P.tolist(); origins=list(range(len(P))); domains=[0]*len(P)
for i,owners in enumerate(incident):
    if 0 not in owners and len(owners)==1:domains[i]=next(iter(owners))
duplicates={}
for i in split_ids:
    for side in incident[i]-{0}:
        duplicates[(i,side)]=len(coords);coords.append(P[i].tolist())
        origins.append(i);domains.append(side)
uvlayer=mesh.data.uv_layers.active
faces=[];uvs=[];normals=[];materials=[]
# Preserve every original loop UV and normal, including the unmoved exterior.
for f,side in zip(mesh.data.polygons,face_side):
    faces.append([duplicates.get((i,side),i) for i in f.vertices])
    uvs.append([tuple(uvlayer.data[k].uv) for k in f.loop_indices])
    normals.append([tuple(mesh.data.corner_normals[k].vector) for k in f.loop_indices])
    materials.append(f.material_index)
# The ripped boundary is an open U at each socket. Close each side independently
# with an inset fan; endpoints remain shared at the real shoulder joint.
edge_faces={}
for fi,face in enumerate(mesh.data.polygons):
    ids=list(face.vertices)
    for a,b in zip(ids,ids[1:]+ids[:1]):edge_faces.setdefault(tuple(sorted((a,b))),[]).append(fi)
cap_count=0;seam_edge_count=0
for side in [-1,1]:
    seam=[]
    for (a,b),fi in edge_faces.items():
        owners={face_side[f] for f in fi}
        if side in owners and 0 in owners and ((a,side) in duplicates or (b,side) in duplicates):seam.append((a,b))
    seam_edge_count+=len(seam)
    graph={}
    for a,b in seam:graph.setdefault(a,[]).append(b);graph.setdefault(b,[]).append(a)
    pending=set(graph)
    while pending:
        seed=next((i for i in pending if len(graph[i])==1),next(iter(pending)))
        path=[];prev=None;cur=seed
        while cur is not None and cur not in path:
            path.append(cur);pending.discard(cur)
            nxt=[j for j in graph[cur] if j!=prev and j not in path]
            prev,cur=cur,(nxt[0] if nxt else None)
        if len(path)<3:continue
        for owner in [0,side]:
            mapped=[duplicates.get((i,owner),i) for i in path]
            centre=P[path].mean(axis=0)
            centre[0]=(centre[0]+side*.006*H) if owner else cx+side*.14*H
            centre_id=len(coords);coords.append(centre.tolist())
            nearest=min(path,key=lambda i:float(np.linalg.norm(P[i]-centre)))
            origins.append(nearest);domains.append(owner)
            uv_by_vertex={}
            for fi in range(len(mesh.data.polygons)):
                if face_side[fi]!=owner:continue
                for i,uv in zip(mesh.data.polygons[fi].vertices,uvs[fi]):uv_by_vertex.setdefault(i,uv)
            cuv=uv_by_vertex.get(nearest,(0.,0.))
            for ia,ib in zip(range(len(path)),list(range(1,len(path)))+[0]):
                a,b=mapped[ia],mapped[ib]
                if a==b:continue
                tri=[a,b,centre_id]
                va,vb=Vector(coords[a]),Vector(coords[b]);vc=Vector(coords[centre_id])
                n=(vb-va).cross(vc-va).normalized()
                desired=side*(-1 if owner else 1)
                if n.x*desired<0:tri=[b,a,centre_id];n=-n;ia,ib=ib,ia
                faces.append(tri);uvs.append([uv_by_vertex.get(path[ia],cuv),uv_by_vertex.get(path[ib],cuv),cuv])
                normals.append([tuple(n)]*3);materials.append(0);cap_count+=1
for (i,side),duplicate in duplicates.items():
    coords[duplicate][0]=cx+side*(.32-.40*zn[i])*H
# Recess the freed torso rim into the side wall.
for i in split_ids:
    sign=1 if P[i,0]>cx else -1
    rim=abs(P[i,0]-cx)/H
    if zn[i]<.35:coords[i][0]=cx+sign*min(rim,.175)*H
new=bpy.data.meshes.new('OwnerFox separated inner arms')
new.from_pydata(coords,[],faces);new.update()
for mat in mesh.data.materials:new.materials.append(mat)
uv=new.uv_layers.new(name=uvlayer.name)
for f,values,mi in zip(new.polygons,uvs,materials):
    f.use_smooth=True;f.material_index=mi
    for k,value in zip(f.loop_indices,values):uv.data[k].uv=value
new.normals_split_custom_set([n for row in normals for n in row])
mesh.data=new
origin=np.array(origins,dtype=int)
P=np.array(coords);arm_domain=np.array(domains)
tail_mask=tail_mask[origin];d_tail_surface=d_tail_surface[origin];d_other=d_other[origin]
d_core=d_core[origin];d_arms={side:values[origin] for side,values in d_arms.items()}
# Rebuild connectivity. Coincident rip vertices must never exchange weights.
adjacency=[[] for _ in P]
for edge in mesh.data.edges:
    a,b=edge.vertices;length=float(np.linalg.norm(P[a]-P[b]))
    adjacency[a].append((b,length));adjacency[b].append((a,length))
split_report={'method':'Face-boundary rip below 0.365H socket, recessed torso rim and separate inset UV caps',
    'bridging_faces_removed':0,'boundary_edges_ripped':seam_edge_count,
    'vertices_duplicated':len(duplicates),'caps_added':cap_count,
    'original_vertices_moved':int(sum(abs(coords[i][0]-source_mesh.vertices[i].co.x)>1e-8 for i in range(source_vertex_count))),'arm_vertices':{'R':int((arm_domain==-1).sum()),'L':int((arm_domain==1).sum())}}
print('SPLIT '+json.dumps(split_report),flush=True)
marker('SPLIT done')

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
    arm = P[(arm_domain == sign)&(~tail_mask)]
    # Keep the measured original outer paw cluster for stable landmarks.
    arm = P[:source_vertex_count][arm_seeds[side]&(~tail_mask[:source_vertex_count])]
    outer = arm[(arm[:,0]-cx)*sign>np.quantile((arm[:,0]-cx)*sign,.78)]
    paw = outer.mean(axis=0)
    shoulder = np.array([cx+sign*.175*H,body_y-.065*H, z0+.405*H])
    elbow = shoulder*.42+paw*.58
    wrist = shoulder*.12+paw*.88
    palm_end = paw+(paw-shoulder)*.10
    # A real clavicle pivots at the upper sternum and ends at the socket.
    bone('shoulder.'+side,(cx+sign*.045*H,body_y-.025*H,z0+.385*H),shoulder,'chest')
    bone('upper_arm.'+side,shoulder,elbow,'shoulder.'+side)
    bone('upper_arm.twist.'+side,shoulder,elbow,'upper_arm.'+side)
    bone('shoulder.helper.'+side,shoulder,elbow,'shoulder.'+side)
    bone('armpit.helper.'+side,shoulder,elbow,'shoulder.'+side)
    bone('forearm.'+side,elbow,wrist,'upper_arm.'+side).use_connect=True
    bone('hand.'+side,wrist,palm_end,'forearm.'+side).use_connect=True
    foot_cluster = feet[(feet[:,0]-cx)*sign>0]
    fx = float(np.median(foot_cluster[:,0]))
    fy = float(np.median(foot_cluster[:,1]))
    hip = (cx+sign*.075*H,body_y,hips_z)
    knee = (fx,body_y,z0+.105*H)
    ankle = (fx,fy+.025*H,z0+.045*H)
    toe = (fx,float(np.quantile(foot_cluster[:,1],.12)),z0+.025*H)
    bone('thigh.'+side,hip,knee,'hips')
    bone('hip.helper.'+side,hip,knee,'hips')
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

marker('CLAVICLE done')

# Geometry domains replace proxy heat: nearby belly/paw surfaces must never
# exchange weights. The exterior UVs and materials are retained after the contact rip.
heat = 'Broad smooth chest/clavicle/socket/upper-arm field; underside helper; eight local surface smoothing passes'
proxy_vertices = 0
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
arm_geometry={side:{} for side in ['L','R']}
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
        # The torso field depends only on height, never on arm proximity.
        spine_blend=smooth(z0+.23*H,z0+.32*H,z)
        chest_blend=smooth(z0+.32*H,z0+.38*H,z)
        torso={'hips':1-spine_blend,'spine':spine_blend*(1-chest_blend),
               'chest':spine_blend*chest_blend}
        neck_blend=smooth(neck_z-.065*H,neck_z-.025*H,z)
        head_blend=smooth(neck_z-.035*H,neck_z+.005*H,z)
        if neck_blend:
            torso={n:w*(1-neck_blend) for n,w in torso.items()}
            torso['neck']=neck_blend*(1-head_blend)
            torso['head']=neck_blend*head_blend
        sign=1 if x>cx else -1;side='L' if sign==1 else 'R'
        # At the crotch retain the hips. Distal groups never cross the midline.
        leg_blend=1-smooth(z0+.13*H,z0+.225*H,z)
        if leg_blend:
            side_lateral=smooth(.005*H,.095*H,abs(x-cx))
            lateral=side_lateral+(1-side_lateral)*(1-smooth(z0+.04*H,z0+.14*H,z))*smooth(.01*H,.035*H,abs(x-cx))
            leg_blend*=lateral
            shin_blend=(1-smooth(z0+.05*H,z0+.16*H,z))*smooth(.20,1.,leg_blend)
            foot_blend=1-smooth(z0+.035*H,z0+.065*H,z)
            legs={'thigh.'+side:1-shin_blend,
                  'shin.'+side:shin_blend*(1-foot_blend),
                  'foot.'+side:shin_blend*foot_blend}
            # Two small rotations at the hip replace one abrupt hips/thigh mix.
            thigh_mix=max(0.,2*leg_blend-1)
            helper_mix=2*leg_blend if leg_blend<.5 else 2-2*leg_blend
            torso={n:w*(1-helper_mix-thigh_mix) for n,w in torso.items()}
            torso['hip.helper.'+side]=helper_mix
            for n,w in legs.items():torso[n]=w*thigh_mix
        shoulder,elbow=np.array(rest['upper_arm.'+side])
        wrist,palm_end=np.array(rest['hand.'+side])
        direction=palm_end-shoulder
        length=np.linalg.norm(direction);direction/=length
        plane=float(np.dot(p-shoulder,direction))
        radius=distance(p,shoulder,palm_end)
        # A broad lateral socket field has no capsule falloff on the arm:
        # distal underside vertices must remain on the limb, not the chest.
        lateral=abs(x-cx)/H
        underside=1-smooth(z0+.345*H,z0+.405*H,z)
        inner=.115+.040*underside
        outer=.215+.040*underside
        if arm_domain[i]==sign:
            arm_blend=smooth(-.20,.45,float(np.dot(p-shoulder,direction))/length)*(1-smooth(z0+.375*H,z0+.425*H,z))
        elif z>z0+.365*H and lateral>.105 and z<neck_z+.005*H:
            arm_blend=smooth(-.20,.45,float(np.dot(p-shoulder,direction))/length)*smooth(.105,.155,lateral)*(1-smooth(z0+.37*H,z0+.425*H,z))
        else:
            arm_blend=0.
        arm_geometry[side][i]=(plane,radius,arm_blend)
        u=float(np.dot(p-shoulder,direction))/length
        fore=smooth(.565,.595,u)*smooth(.80,1.,arm_blend);hand=0.
        limb={'upper_arm.'+side:1-fore,'forearm.'+side:fore*(1-hand),'hand.'+side:fore*hand}
        # Cubic partition of unity across a .10H band, without stage switches.
        t=arm_blend
        weights={n:w*(1-t)**3 for n,w in torso.items()}
        weights['shoulder.'+side]=3*t*(1-t)**2
        helper=3*t*t*(1-t)
        weights['shoulder.helper.'+side]=helper*(1-.75*underside)
        weights['armpit.helper.'+side]=helper*.75*underside
        for n,w in limb.items():weights[n]=w*t**3
        # Tail socket is fixed to hips, matching the first tail bone.
        rump=smooth(0,.10*H,d_tail_surface[i])
        weights={n:w*rump for n,w in weights.items()}
        weights['hips']=weights.get('hips',0)+1-rump
        regions['body']+=1
        vertex_regions.append('body')
    weight_rows.append(weights)

# Smooth only the socket, using mesh connectivity (including welded UV seams).
# Protected front torso and distal limb vertices are fixed boundary conditions.
torso_guard=(abs(P[:,0]-cx)<.155*H)&(P[:,2]>z0+.225*H)&(P[:,2]<z0+.36*H)&(~tail_mask)
shoulder_smooth=np.array([vertex_regions[i]=='body' and not torso_guard[i] and
    .105*H<abs(p[0]-cx)<.26*H and z0+.365*H<p[2]<neck_z+.005*H and
    not tail_mask[i] for i,p in enumerate(P)])
weight_names=list(rest)
W=np.array([[row.get(n,0.) for n in weight_names] for row in weight_rows])
for iteration in range(8):
    next_W=W.copy()
    for i in np.flatnonzero(shoulder_smooth):
        neighbours=[j for j,d in adjacency[i] if vertex_regions[j]=='body' and not tail_mask[j] and (arm_domain[j]==arm_domain[i] or P[j,2]>z0+.365*H)]
        if neighbours:
            next_W[i]=.45*W[i]+.55*W[neighbours].mean(axis=0)
    W=next_W/W.sum(axis=1,keepdims=True)
weight_rows=[{n:float(w) for n,w in zip(weight_names,row) if w>1e-8} for row in W]
marker('BAND done')
# Exact coincident UV seams get identical normalised weights after smoothing.
seam_vertices={}
for i,p in enumerate(P):seam_vertices.setdefault((int(arm_domain[i]),)+tuple(round(c,6) for c in p),[]).append(i)
for ids in seam_vertices.values():
    if len(ids)<2:continue
    row={}
    for i in ids:
        for n,w in weight_rows[i].items():row[n]=row.get(n,0)+w/len(ids)
    for i in ids:weight_rows[i]=row
for i,weights in enumerate(weight_rows):
    if arm_domain[i]:
        side='L' if arm_domain[i]>0 else 'R'
        weights={n:w for n,w in weights.items() if n.endswith('.'+side) and any(n.startswith(prefix) for prefix in ['shoulder.','upper_arm.','forearm.','hand.','armpit.'])}
    elif P[i,2]<z0+.365*H:
        weights={n:w for n,w in weights.items() if not any(n.startswith(prefix) for prefix in ['shoulder.','upper_arm.','forearm.','hand.','armpit.'])}
    if not weights:weights={'hips':1.}
    weights=sorted(((n,w) for n,w in weights.items() if w>=.02),key=lambda kv:kv[1],reverse=True)[:4]
    total=sum(w for _,w in weights)
    for n,w in weights:
        if w>1e-7:groups[n].add([i],w/total,'REPLACE')
torso_guard=(abs(P[:,0]-cx)<.155*H)&(P[:,2]>z0+.225*H)&(P[:,2]<z0+.36*H)&(~tail_mask)
assert all(all(mesh.vertex_groups[g.group].name in ['hips','spine','chest'] for g in mesh.data.vertices[i].groups) for i in np.flatnonzero(torso_guard)), 'Arm influence in protected belly/chest'
assert all(1<=len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<1e-5 for v in mesh.data.vertices)
# Seam consistency: continuous spatial weights must match at duplicate positions.
seams={};seam_error=0.
for v in mesh.data.vertices:
    key=(int(arm_domain[v.index]),)+tuple(round(c,5) for c in v.co)
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
    for frame in range(1,end+1):
        t=(frame-1)/30;ph=t/duration*2*math.pi
        reset()
        # Relax the original A-pose down to the flanks in every neutral clip.
        for sign,side in [(-1,'R'),(1,'L')]:
            rotate('upper_arm.'+side,(0,1,0),sign*.32)
        rotate('chest',(0,1,0),.018*math.sin(ph))
        # Keep the cloud/belly free of animated scale.
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
            rotate('upper_arm.R',(0,1,0),-.32+1.52*gesture)
            rotate('forearm.R',(0,1,0),(.45+.10*math.sin(3*ph))*gesture)
            rotate('hand.R',(0,1,0),.10*math.cos(3*ph)*gesture)
            rotate('head',(0,1,0),-.075*gesture)
        elif name=='success':
            for sign,side in [(-1,'R'),(1,'L')]:
                rotate('upper_arm.'+side,(0,1,0),sign*(.32-1.52*gesture))
                rotate('forearm.'+side,(0,1,0),-sign*.45*gesture)
                # No axial stretching: preserve the original round arm.
                
            shift('root',(0,0,.035*H*gesture))
            rotate('head',(1,0,0),-.07*gesture)
        elif name=='happy':
            bounce=(1-math.cos(ph))/2
            shift('root',(0,0,.085*H*bounce))
            rotate('head',(0,1,0),.09*math.sin(ph))
            for sign,side in [(-1,'R'),(1,'L')]:rotate('upper_arm.'+side,(0,1,0),sign*(.32-.80*bounce))
        elif name=='nod':rotate('head',(1,0,0),.32*math.sin(ph))
        elif name=='shake':rotate('head',(0,0,1),.42*math.sin(ph))
        elif name=='jump':
            lift=math.sin(math.pi*min(t/1.2,1))**2 if t<=1.2 else 0
            shift('root',(0,0,.17*H*lift))
            for sign,side in [(-1,'R'),(1,'L')]:
                rotate('upper_arm.'+side,(0,1,0),sign*(.32-1.35*lift))
                rotate('thigh.'+side,(1,0,0),-.20*lift)
                rotate('shin.'+side,(1,0,0),.25*lift)
        elif name=='walk':
            # Offset gives a leg-forward silhouette at the shared .6s sample.
            swing=math.cos(ph)
            for sign,side in [(-1,'R'),(1,'L')]:
                rotate('thigh.'+side,(1,0,0),sign*.36*swing)
                rotate('shin.'+side,(1,0,0),max(0,-sign*swing)*.32)
                arm_rotation('upper_arm.'+side,sign*.24,-sign*.32*swing)
                rotate('foot.'+side,(1,0,0),-sign*.12*swing)
            shift('root',(.018*H*math.sin(ph),0,.018*H*(1-math.cos(ph*2))))
            rotate('hips',(0,1,0),.055*math.sin(ph))
            for j in range(2,5):rotate('tail.'+str(j),(0,0,1),.055*math.sin(ph-.6*j))
        elif name=='sleep':
            rotate('neck',(1,0,0),.08)
            rotate('head',(1,0,0),.24+.015*math.sin(ph))
            for side in ['L','R']:rotate('ear.'+side,(1,0,0),.15)
        head=rig.pose.bones['head']
        neck=rig.pose.bones['neck']
        head_q=head.rotation_quaternion.copy()
        head_basis=head.bone.matrix_local.to_quaternion()
        neck_basis=neck.bone.matrix_local.to_quaternion()
        shared=head_basis @ Quaternion((1,0,0,0)).slerp(head_q,.45) @ head_basis.inverted()
        neck.rotation_quaternion=neck.rotation_quaternion @ neck_basis.inverted() @ shared @ neck_basis
        head.rotation_quaternion=Quaternion((1,0,0,0)).slerp(head_q,.55)
        # Direct visual keys are the baked result of fractional Copy Rotation.
        # There are no live constraints for the glTF/three.js player to solve.
        for side in ['L','R']:
            upper=rig.pose.bones['upper_arm.'+side]
            original=upper.rotation_quaternion.copy()
            identity=Quaternion((1,0,0,0))
            # Keep the clavicle fixed so the freed arm rotates around its socket.
            # Convert through rest bases: clavicle has a different local axis.
            upper_basis=upper.bone.matrix_local.to_quaternion()
            world=upper_basis @ original @ upper_basis.inverted()
            axis,angle=world.to_axis_angle()
            elevation=angle*axis.y
            raise_sign=1 if side=='R' else -1
            clav_angle=0.
            clav_world=Quaternion((0,1,0),clav_angle)
            clav=rig.pose.bones['shoulder.'+side]
            clav_basis=clav.bone.matrix_local.to_quaternion()
            clav.rotation_quaternion=clav_basis.inverted() @ clav_world @ clav_basis
            residual=clav_world.inverted() @ world
            upper.rotation_quaternion=upper_basis.inverted() @ residual @ upper_basis
            for helper,fraction in [('shoulder.helper.',.50),('armpit.helper.',.30)]:
                rig.pose.bones[helper+side].rotation_quaternion=upper_basis.inverted() @ (clav_world.inverted() @ identity.slerp(world,fraction)) @ upper_basis
            rig.pose.bones['upper_arm.twist.'+side].rotation_quaternion=identity
            rig.pose.bones['hip.helper.'+side].rotation_quaternion=identity.slerp(rig.pose.bones['thigh.'+side].rotation_quaternion,.5)
        for pb in rig.pose.bones:
            if pb.name=='root':pb.keyframe_insert('location',frame=frame,group=pb.name)
            pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
    # Small asymmetries at the end are eliminated explicitly for seamless loops.
    scene.frame_set(1)
    for pb in rig.pose.bones:
        for path in (['location','rotation_quaternion'] if pb.name=='root' else ['rotation_quaternion']):pb.keyframe_insert(path,frame=end,group=pb.name)
    track=rig.animation_data.nla_tracks.new();track.name=name
    track.strips.new(name,1,action);track.mute=True
    peaks[name]=.6
rig.animation_data.action=None
reset()
scene.frame_set(1)
marker('RIG done')

# Reproducible hierarchy/landmark/weight diagnosis in the source coordinate frame.
diagnosis_path=review/'arm-diagnosis.json'
diagnosis=json.loads(diagnosis_path.read_text()) if diagnosis_path.exists() else {}
after={'hierarchy':{},'upper_arm_weights':{},'actions':{},
       'axis_note':'raise is world Y (abduction in XZ); local Y is axial twist; no axial twist authored'}
length_slices=[]
for side in ['L','R']:
    for part in ['upper_arm','forearm']:
        name=part+'.'+side
        a,b=np.array(rest[name]);delta=b-a;length=np.linalg.norm(delta);axis=delta/length
        u=(P-a)@axis/length
        radial=np.linalg.norm(P-a-u[:,None]*delta,axis=1)
        domain=np.array([arm_geometry[side].get(i,(0,0,0))[2]>.05 for i in range(len(P))])
        # Fixed material slices near each joint. Their centroids are tracked,
        # never reselected from the posed mesh or inferred from bone lengths.
        ids=[np.flatnonzero(domain & (abs(u-f)<.12) & (radial<.075*H)) for f in [.15,.85]]
        if all(len(v)>=3 for v in ids):
            separation=float(np.linalg.norm(P[ids[1]].mean(axis=0)-P[ids[0]].mean(axis=0)))
            length_slices.append({'bone':name,'ids':ids,'rest_distance':separation})
        if part=='upper_arm':
            selected=np.flatnonzero(domain&(u>.15)&(u<.85)&(radial<.07*H))
            average={}
            for i in selected:
                for g in mesh.data.vertices[i].groups:
                    n=mesh.vertex_groups[g.group].name
                    average[n]=average.get(n,0)+g.weight/max(1,len(selected))
            after['upper_arm_weights'][side]={'vertices':len(selected),'mean_weights':average,
                'rest_axis':axis.tolist(),'rest_shoulder':a.tolist(),'rest_elbow':b.tolist()}
for pb in rig.pose.bones:
    if any(n in pb.name for n in ['arm','shoulder','hand']):
        after['hierarchy'][pb.name]={'parent':pb.parent.name if pb.parent else None,
            'connected':pb.bone.use_connect,'head':list(pb.bone.head_local),'tail':list(pb.bone.tail_local)}
for name in peaks:
    rig.animation_data.action=bpy.data.actions[name]
    scene.frame_set(19);bpy.context.view_layer.update()
    after['actions'][name]={}
    for pb in rig.pose.bones:
        if any(n in pb.name for n in ['arm','shoulder','hand']):
            delta=pb.matrix.to_quaternion()@pb.bone.matrix_local.to_quaternion().inverted()
            axis,angle=delta.to_axis_angle()
            after['actions'][name][pb.name]={'world_rotation_deg':math.degrees(angle),
                'world_axis':list(axis),'local_rotation_deg':math.degrees(pb.rotation_quaternion.angle),
                'location':list(pb.location),'scale':list(pb.scale),'head':list(pb.head),'tail':list(pb.tail)}
diagnosis['after']=after
diagnosis_path.write_text(json.dumps(diagnosis,indent=2))
print('ARM DIAGNOSIS '+json.dumps(after),flush=True)
marker('DIAG done')
rig.animation_data.action=None
reset();scene.frame_set(1)

# Measure every frame on the evaluated mesh (LBS, exactly as exported).
edges=np.array([e.vertices[:] for e in mesh.data.edges],dtype=int)
rest_lengths=np.linalg.norm(P[edges[:,1]]-P[edges[:,0]],axis=1)
valid=rest_lengths>H*1e-5
vertex_labels=[]
for i,(x,y,z) in enumerate(P):
    kind=vertex_regions[i]
    side='L' if x>cx else 'R'
    geometry=arm_geometry[side].get(i,(0,0,0))
    if kind=='tail':label='tail'
    elif kind=='ears':label='ears'
    elif kind=='head':label='face'
    elif geometry[2]>.98:label='arm'
    elif geometry[2]>.001:label='shoulders'
    elif z>neck_z-.065*H:label='neck'
    elif z<z0+.225*H:label='crotch'
    elif y<body_y-.10*H and abs(x-cx)<.15*H and z<z0+.36*H:label='belly'
    else:label='chest_sides'
    vertex_labels.append(label)
# Edges at region boundaries are included in both domains; no outlier is hidden.
vertex_labels=np.array(vertex_labels)
region_names=['belly','chest_sides','shoulders','arm','crotch','neck','face','ears','tail']
region_edges={label:valid & (((vertex_labels[edges[:,0]]==label)&(vertex_labels[edges[:,1]]==label)) if label in ['face','belly','arm'] else ((vertex_labels[edges[:,0]]==label)|(vertex_labels[edges[:,1]]==label))) for label in region_names}
labels=np.array([vertex_labels[a] if vertex_labels[a]==vertex_labels[b] else vertex_labels[a]+'/'+vertex_labels[b] for a,b in edges])
# Fixed material slices, measured in the controlling bone's local transverse
# plane. PCA eigenvectors choose principal axes; extents are max-min projections.
slices=[]
def principal_extent(points):
    # Fit the slice in 3D after conversion to bone-local space. Projecting
    # straight onto bone XZ would mistake socket bending for lost thickness.
    centred=points-points.mean(axis=0)
    _,axes=np.linalg.eigh(centred.T@centred/max(1,len(points)))
    ext=np.ptp(centred@axes[:,-2:],axis=0)
    return sorted(float(v) for v in ext)
for side in ['L','R']:
    for part in ['upper_arm','forearm']:
        name=part+'.'+side
        a,b=np.array(rest[name]);axis=b-a;length=np.linalg.norm(axis);axis/=length
        u=(P-a)@axis/length
        radial=np.linalg.norm(P-a-u[:,None]*length*axis,axis=1)
        arm_ids=np.array([arm_geometry[side].get(i,(0,0,0))[2]>.05 for i in range(len(P))])
        inv=np.array(rig.data.bones[name].matrix_local.inverted())
        local=(np.c_[P,np.ones(len(P))]@inv.T)[:,:3]
        for fraction in [.25,.50,.75]:
            ids=np.flatnonzero(arm_ids&(abs(u-fraction)<.16)&(radial<.13*H))
            if len(ids)<8:continue
            ext=principal_extent(local[ids])
            if ext[0]<H*.005:continue
            slices.append({'bone':name,'fraction':fraction,'ids':ids,'rest_extents':ext})
np.savez(review/'metric-slices.npz',**{str(i):P[sl['ids']] for i,sl in enumerate(slices)})
stretch={};thickness={};arm_lengths={};bone_scale_error=0.;arm_location_max=0.;worst_edges=[];region_worst={};seam_gap=0.
depsgraph=bpy.context.evaluated_depsgraph_get()
seam_pairs=np.array([(ids[0],i) for ids in seam_vertices.values() for i in ids[1:]],dtype=int)
for name in peaks:
    rig.animation_data.action=bpy.data.actions[name]
    end=int(rig.animation_data.action.frame_range[1])
    measures={label:[] for label in region_names}
    length_stats={sl['bone']:{'min':1e9,'max':0.,'rest_distance':sl['rest_distance'],'slice_vertices':[len(ids) for ids in sl['ids']],'slice_fractions':[.15,.85]} for sl in length_slices}
    slice_stats=[dict(bone=sl['bone'],fraction=sl['fraction'],vertices=len(sl['ids']),rest_extents=sl['rest_extents'],min_ratio=1e9) for sl in slices]
    for frame in range(1,end+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        evaluated=mesh.evaluated_get(depsgraph)
        coords=np.empty(len(P)*3,dtype=np.float32)
        evaluated.data.vertices.foreach_get('co',coords);coordinates=coords.reshape((-1,3))
        for pb in rig.pose.bones:
            bone_scale_error=max(bone_scale_error,max(abs(v-1) for v in pb.scale))
            if any(n in pb.name for n in ['arm','shoulder','hand']):arm_location_max=max(arm_location_max,pb.location.length)
        for sl in length_slices:
            centres=[coordinates[ids].mean(axis=0) for ids in sl['ids']]
            value=float(np.linalg.norm(centres[1]-centres[0])/sl['rest_distance'])
            stat=length_stats[sl['bone']]
            if value<stat['min']:stat.update(min=value,min_frame=frame)
            if value>stat['max']:stat.update(max=value,max_frame=frame)
        lengths=np.linalg.norm(coordinates[edges[:,1]]-coordinates[edges[:,0]],axis=1)
        ratio=lengths/np.maximum(rest_lengths,H*1e-5)
        for label,mask in region_edges.items():
            measures[label].append(ratio[mask])
            if np.any(mask):
                idx=int(np.argmax(np.where(mask,ratio,0)))
                if label not in region_worst or ratio[idx]>region_worst[label]['ratio']:
                    region_worst[label]={'action':name,'frame':frame,'ratio':float(ratio[idx]),'vertices':edges[idx].tolist(),'rest_positions':P[edges[idx]].tolist(),'weights':[{mesh.vertex_groups[g.group].name:g.weight for g in mesh.data.vertices[i].groups} for i in edges[idx]]}
        idx=int(np.argmax(np.where(valid,ratio,0)))
        worst_edges.append({'action':name,'frame':frame,'ratio':float(ratio[idx]),'region':str(labels[idx]),'vertices':edges[idx].tolist(),'rest_positions':P[edges[idx]].tolist(),'weights':[{mesh.vertex_groups[g.group].name:g.weight for g in mesh.data.vertices[i].groups} for i in edges[idx]],'rest_length':float(rest_lengths[idx])})
        for sl,stat in zip(slices,slice_stats):
            inv=np.array(rig.pose.bones[sl['bone']].matrix.inverted())
            local=(np.c_[coordinates[sl['ids']],np.ones(len(sl['ids']))]@inv.T)[:,:3]
            ext=principal_extent(local)
            r=ext[0]/sl['rest_extents'][0]
            if r<stat['min_ratio']:stat.update(min_ratio=r,frame=frame,deformed_extents=ext)
        if len(seam_pairs):seam_gap=max(seam_gap,float(np.linalg.norm(coordinates[seam_pairs[:,0]]-coordinates[seam_pairs[:,1]],axis=1).max()))
    stretch[name]={label:{'max':float(np.concatenate(values).max()),'p99':float(np.quantile(np.concatenate(values),.99)),'min':float(np.concatenate(values).min())} for label,values in measures.items() if len(values[0])}
    arm_lengths[name]={'bones':length_stats,'min':min(v['min'] for v in length_stats.values()),'max':max(v['max'] for v in length_stats.values()),'frames_evaluated':end}
    thickness[name]={'min_ratio':min((v['min_ratio'] for v in slice_stats),default=None),'slices':slice_stats,'frames_evaluated':end}
rig.animation_data.action=None
reset();scene.frame_set(1)
assert seam_gap < H*1e-5, 'Skinned UV seams separated'
# The face interior is rigid; boundary edges are separately included in neck.
assert not any(pb.constraints for pb in rig.pose.bones)
print('STRETCH '+json.dumps(stretch),flush=True)

# Keep original exterior UVs and materials; resize only embedded image maps.
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
        'split':split_report,'regions':regions,'max_seam_weight_difference':seam_error,'max_influences':4,
        'stretch':stretch,'worst_edges':sorted(worst_edges,key=lambda e:e['ratio'],reverse=True)[:12],
        'max_deformed_seam_gap':seam_gap,'validation_frame_step':1,
        'arm_thickness':thickness,'arm_length_ratios':arm_lengths,'bone_scale_max_error':bone_scale_error,'arm_location_max':arm_location_max,'region_worst':region_worst,
        'arm_length_method':'Distance of fixed mesh vertex centroid slices at 15/85 percent of each rest segment, +/-12 percent slice width, .075H radius; no bone-length substitution',
        'metric_method':'All integer frames, evaluated LBS mesh; boundary edges in flexible joints; 3D PCA two principal max-min extents in bone-local fixed material slices',
        'helpers':'Fixed clavicle pivot; raised arm rotates at socket; socket helper 50% total and underside 30% total; upper_arm carries residual swing and connected forearm; no arm translations/scales',
        'protected_torso_vertices':int(torso_guard.sum()),'protected_torso_arm_weight_max':0,
        'targets_met':{'arm_length':all(.95<=arm_lengths[a]['min'] and arm_lengths[a]['max']<=1.05 for a in ['wave','success','happy','jump','walk']),'bone_scale':bone_scale_error<1e-6,'arm_location':arm_location_max<1e-6,'belly':all(v.get('belly',{}).get('max',0)<1.15 for v in stretch.values()),'face':all(v['face']['max']<1.011 for v in stretch.values()),'arm_thickness':all(v['min_ratio']>=.8 for v in thickness.values()),'shoulders':all(v['shoulders']['max']<=2.5 for v in stretch.values()),'crotch':all(v['crotch']['max']<2 for v in stretch.values()),'neck':all(v['neck']['max']<2 for v in stretch.values())},
        'textures':textures,'actions':peaks,'bytes':out.stat().st_size,
        'heat_limb_blend':0,'smoothing_iterations':{'spatial':0,'surface':8},'proxy_vertices':proxy_vertices,'source_vertices':source_vertex_count,'source_triangles':source_triangle_count,'output_vertices':len(P),'output_triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons)}
requested_actions=['wave','success','happy','jump','walk']
report['targets_by_action']={a:{'shoulders':stretch[a]['shoulders']['max']<=2.5,
    'arm_length':arm_lengths[a]['min']>=.95 and arm_lengths[a]['max']<=1.05,
    'arm_thickness':thickness[a]['min_ratio']>=.8,
    'belly':stretch[a]['belly']['max']<=1.15,
    'neck':stretch[a]['neck']['max']<2,'crotch':stretch[a]['crotch']['max']<2} for a in requested_actions}
report['targets_by_action']={}
for name in ['wave','success','happy','jump','walk']:
    values=stretch[name]
    report['targets_by_action'][name]={
        'shoulder_stretch':{'value':values['shoulders']['max'],'limit':2.5,'met':values['shoulders']['max']<=2.5},
        'arm_length':{'min':arm_lengths[name]['min'],'max':arm_lengths[name]['max'],'limits':[.95,1.05],'met':arm_lengths[name]['min']>=.95 and arm_lengths[name]['max']<=1.05},
        'arm_thickness':{'value':thickness[name]['min_ratio'],'minimum':.8,'met':thickness[name]['min_ratio']>=.8},
        'belly':{'min':values['belly']['min'],'max':values['belly']['max'],'met':values['belly']['min']>.9 and values['belly']['max']<1.1},
        'neck':{'value':values['neck']['max'],'limit':2.,'met':values['neck']['max']<2},
        'crotch':{'value':values['crotch']['max'],'limit':2.,'met':values['crotch']['max']<2}}
before_path=Path('/workspace/yk-pet-art/user-model/before-r4/report.json')
if before_path.exists():report['before']=json.loads(before_path.read_text())
# The before snapshot is read verbatim from before-r4.
(review/'report.json').write_text(json.dumps(report,indent=2))
assert out.stat().st_size<5_000_000, 'Web asset exceeds 5 MB budget'
marker('CHAIN done')
marker('ANIM done')
marker('SEGMENT done')
marker('HELPERS done')
marker('METRIC done')
marker('POSES done')
marker('WEIGHTS done')
marker('WEB done')
print(json.dumps({k:report[k] for k in ['bones','regions','max_seam_weight_difference','bytes']}),flush=True)

if opts.renders and (not opts.skip_stills or opts.video):
    # Headless EEVEE uses the runner's software EGL context.
    scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples=8
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
        rig.animation_data.action=None;reset();scene.frame_set(1);bpy.context.view_layer.update()
        modified_mesh=mesh.data
        mesh.data=source_mesh
        scene.render.filepath=str(review/'rest-before.png');bpy.ops.render.render(write_still=True)
        mesh.data=modified_mesh
        scene.render.filepath=str(review/'rest-after.png');bpy.ops.render.render(write_still=True)
        # Compare encoded PNG channels, so the threshold is exactly 10/255.
        diff_script="from PIL import Image; import numpy as np; import json; from pathlib import Path; p=Path(__import__('sys').argv[1]); a=np.asarray(Image.open(p/'rest-before.png').convert('RGB')).astype(float); b=np.asarray(Image.open(p/'rest-after.png').convert('RGB')).astype(float); d=abs(a-b); Image.fromarray(np.uint8(np.clip(d*8,0,255))).save(p/'rest-diff.png'); (p/'rest-diff.json').write_text(json.dumps({'mean_abs_diff_255':float(d.mean()),'pixels_over_10_percent':float((d.max(2)>10).mean()*100),'threshold_255':10,'diff_display_gain':8}))"
        subprocess.run(['/usr/bin/python3','-c',diff_script,str(review)],check=True)
        report['rest_diff']=json.loads((review/'rest-diff.json').read_text())
        report['targets_met']['rest_diff']=report['rest_diff']['pixels_over_10_percent']<1
        (review/'report.json').write_text(json.dumps(report,indent=2));marker('RESTDIFF done')
        for name in peaks:
            rig.animation_data.action=bpy.data.actions[name]
            scene.frame_set(19);bpy.context.view_layer.update()
            scene.render.filepath=str(review/(name+'.png'))
            bpy.ops.render.render(write_still=True)
    if not opts.skip_stills:
        camera_location=camera.location.copy();camera_rotation=camera.rotation_euler.copy();camera_scale=camera.data.ortho_scale
        camera.data.ortho_scale=H*.48
        for name in ['wave','success']:
            rig.animation_data.action=bpy.data.actions[name];scene.frame_set(19);bpy.context.view_layer.update()
            target=rig.pose.bones['upper_arm.R'].head.copy()+Vector((-.035*H,0,-.015*H))
            camera.location=(target.x,-6,target.z+.12*H);aim(camera,target)
            scene.render.filepath=str(review/('armpit-'+name+'.png'));bpy.ops.render.render(write_still=True)
        camera.location=camera_location;camera.rotation_euler=camera_rotation;camera.data.ortho_scale=camera_scale
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(19)
    bpy.ops.wm.save_as_mainfile(filepath=str(review/'user-fox.blend'))
    print('Blender action renders complete',flush=True)

    if opts.video:
        video_dir=phase.parent/'video'
        video_dir.mkdir(parents=True,exist_ok=True)
        scene.eevee.taa_render_samples=2
        scene.render.fps=24
        for name in ['wave','success','walk']:
            sequence=video_dir/(name+'-frames')
            sequence.mkdir(exist_ok=True)
            for previous in sequence.glob('*.png'):previous.unlink()
            action=bpy.data.actions[name]
            rig.animation_data.action=action
            period=(action.frame_range[1]-1)/30
            for i in range(round(period*24)):
                if i%12==0:print('VIDEO CHUNK '+name+' '+str(i//12),flush=True)
                # Actions remain authored at 30fps; video samples at 24fps.
                sample=1+(i/24 % period)*30
                scene.frame_set(int(sample),subframe=sample-int(sample))
                scene.render.filepath=str((sequence/f'{i:04d}.png').resolve())
                bpy.ops.render.render(write_still=True)
            subprocess.run(['/usr/bin/ffmpeg','-y','-framerate','24','-i',
                            str(sequence/'%04d.png'),'-c:v','libx264','-crf','19',
                            '-threads','4','-pix_fmt','yuv420p','-movflags','+faststart',
                            str(video_dir/(name+'.mp4'))],check=True)
            subprocess.run(['/usr/bin/ffmpeg','-y','-i',str(video_dir/(name+'.mp4')),
                            '-filter_complex_threads','1','-filter_complex','fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
                            '-loop','0',str(video_dir/(name+'.gif'))],check=True)
            assert (video_dir/(name+'.gif')).stat().st_size<=1_500_000
        report['video']={name:{'mp4_bytes':(video_dir/(name+'.mp4')).stat().st_size,
            'gif_bytes':(video_dir/(name+'.gif')).stat().st_size,'width':512,'height':512,'fps':24}
            for name in ['wave','success','walk']}
        (review/'report.json').write_text(json.dumps(report,indent=2))
        marker('VIDEO done')
