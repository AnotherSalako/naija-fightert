
import bpy, heapq, pickle
from mathutils import Vector
D=r'C:\Users\anoth\Downloads\naija-3d'
def seg(arm,bn):
    b=arm.data.bones[bn]; return arm.matrix_world@b.head_local, arm.matrix_world@b.tail_local
def sd(p,ab):
    a,b=ab; d=b-a; t=max(0,min(1,(p-a).dot(d)/d.length_squared)); return (p-(a+d*t)).length
def weigh(src, px, arm, shoulder_z=1.32, torso_x=0.165):
    src.vertex_groups.clear()
    for g in px.vertex_groups: src.vertex_groups.new(name=g.name)
    for m in list(src.modifiers): src.modifiers.remove(m)
    dt=src.modifiers.new('wt','DATA_TRANSFER'); dt.object=px; dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}
    dt.vert_mapping='POLYINTERP_NEAREST'; dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
    bpy.context.view_layer.objects.active=src
    for o in bpy.context.view_layer.objects: o.select_set(False)
    src.select_set(True)
    bpy.ops.object.modifier_apply(modifier='wt')
    me=src.data; mw=src.matrix_world; P=[mw@v.co for v in me.vertices]
    G=pickle.load(open(D+r'\egbon_graph.pkl','rb')); rep=G['rep']; adj=G['adj']
    segs={bn:seg(arm,bn) for bn in ['LeftArm','LeftForeArm','RightArm','RightForeArm','LeftUpLeg','RightUpLeg']}
    seeds=[]
    for i in set(rep):
        p=P[i]
        for s,sg,full in (('L',1,'Left'),('R',-1,'Right')):
            if 0.9<p.z<1.25 and p.x*sg>0.2 and min(sd(p,segs[full+'Arm']),sd(p,segs[full+'ForeArm']))<0.07: seeds.append((0.0,i,s))
        if (0.6<p.z<0.8 and min(sd(p,segs['LeftUpLeg']),sd(p,segs['RightUpLeg']))<0.10) or (abs(p.x)<0.12 and 0.9<p.z<1.3): seeds.append((0.0,i,'B'))
    dist={}; lab={}; h=list(seeds); heapq.heapify(h)
    while h:
        d,u,l=heapq.heappop(h)
        if u in dist: continue
        dist[u]=d; lab[u]=l
        for w,c in adj.get(u,[]):
            if w not in dist: heapq.heappush(h,(d+c,w,l))
    names=[g.name for g in src.vertex_groups]
    ARM={'L':{'LeftArm','LeftArmTwist','LeftForeArm','LeftForeArmTwist','LeftHand','LeftShoulder','Spine2'},
         'R':{'RightArm','RightArmTwist','RightForeArm','RightForeArmTwist','RightHand','RightShoulder','Spine2'}}
    LOWARM={'LeftForeArm','LeftForeArmTwist','LeftHand','RightForeArm','RightForeArmTwist','RightHand'}
    UPARM={'LeftArm','LeftArmTwist','RightArm','RightArmTwist'}
    fixed=0
    for vi,v in enumerate(me.vertices):
        l=lab.get(rep[vi],'B'); p=P[vi]
        if l!='B' and abs(p.x)<torso_x: l='B'          # chest and back skin is torso, never arm
        ws={names[g.group]:g.weight for g in v.groups}
        if l in ('L','R'):
            keep={k:w for k,w in ws.items() if k in ARM[l] and (p.z>shoulder_z-0.1 or k not in ('Spine2','LeftShoulder','RightShoulder'))}
        else:
            # torso skin: upper arms may only pull it at the shoulder cap, at the outer edge
            keep={k:w for k,w in ws.items() if k not in LOWARM and not (k in UPARM and (p.z<shoulder_z or abs(p.x)<torso_x))}
        if keep!=ws:
            fixed+=1; tot=sum(keep.values())
            if tot<1e-4:
                cands=[b for b in (ARM[l] if l in ('L','R') else ['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder','LeftUpLeg','RightUpLeg']) if b in arm.data.bones]
                best=min(cands,key=lambda b: sd(p,seg(arm,b))); keep={best:1.0}; tot=1.0
            for g in list(v.groups): src.vertex_groups[g.group].remove([vi])
            for k,w in keep.items(): src.vertex_groups[k].add([vi], w/tot, 'REPLACE')
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    unify_seams(src)
    am=src.modifiers.new('Armature','ARMATURE'); am.object=arm
    return fixed
def stretch(src, factor=3.0, minlen=0.03):
    me=src.data
    dg=bpy.context.evaluated_depsgraph_get(); ev=src.evaluated_get(dg); em=ev.to_mesh()
    rest=[src.matrix_world@v.co for v in me.vertices]; posed=[ev.matrix_world@v.co for v in em.vertices]
    bad=set()
    for e in me.edges:
        a,b=e.vertices; r=(rest[a]-rest[b]).length; p=(posed[a]-posed[b]).length
        if r>1e-5 and p/r>factor and p>minlen: bad.update((a,b))
    ev.to_mesh_clear(); return bad, rest

def unify_seams(src):
    """Every copy of a vertex split by a texture seam gets the same weights, so the skin never cracks open."""
    G=pickle.load(open(D+r'\egbon_graph.pkl','rb')); rep=G['rep']
    me=src.data; names=[g.name for g in src.vertex_groups]
    groups={}
    for vi,r in enumerate(rep): groups.setdefault(r,[]).append(vi)
    n=0
    for r,vs in groups.items():
        if len(vs)<2: continue
        acc={}
        for vi in vs:
            for g in me.vertices[vi].groups: acc[names[g.group]]=acc.get(names[g.group],0)+g.weight/len(vs)
        top=sorted(acc.items(), key=lambda kv:-kv[1])[:4]; tot=sum(w for _,w in top)
        for vi in vs:
            for g in list(me.vertices[vi].groups): src.vertex_groups[g.group].remove([vi])
            for k,w in top: src.vertex_groups[k].add([vi], w/tot, 'REPLACE')
        n+=1
    return n

def smooth_region(src, test, iters=12, k=0.5):
    """Laplacian-smooth the weights over the welded skin, only where test(position) is true."""
    G=pickle.load(open(D+r'\egbon_graph.pkl','rb')); rep=G['rep']; adj=G['adj']
    me=src.data; mw=src.matrix_world; names=[g.name for g in src.vertex_groups]
    W={}
    for vi,r in enumerate(rep):
        if r not in W: W[r]={names[g.group]:g.weight for g in me.vertices[vi].groups}
    P={r:mw@me.vertices[r].co for r in W}
    region=[r for r in W if test(P[r])]
    for _ in range(iters):
        new={}
        for r in region:
            nb=adj.get(r,[])
            if not nb: continue
            avg={}
            for w,_c in nb:
                for kk,vv in W[w].items(): avg[kk]=avg.get(kk,0)+vv/len(nb)
            m={}
            for kk in set(avg)|set(W[r]): m[kk]=(1-k)*W[r].get(kk,0)+k*avg.get(kk,0)
            new[r]=m
        W.update(new)
    for vi,r in enumerate(rep):
        if not test(P[r]): continue
        top=sorted(W[r].items(), key=lambda kv:-kv[1])[:4]; tot=sum(w for _,w in top) or 1
        for g in list(me.vertices[vi].groups): src.vertex_groups[g.group].remove([vi])
        for kk,w in top:
            if w>1e-4: src.vertex_groups[kk].add([vi], w/tot, 'REPLACE')
    return len(region)


REF = {}
def retarget(arm, src, act, name):
    """Same method as the game build (tools/blender/prepare_character.py retarget_onto)."""
    import mathutils
    sc = bpy.context.scene
    srcb = {b.name.split(':')[-1]: b for b in src.pose.bones}
    A, S = arm.matrix_world, src.matrix_world
    offs = {}
    for pb in arm.pose.bones:
        s = srcb.get(pb.name)
        if not s: continue
        tr = (A @ pb.bone.matrix_local).to_3x3().normalized()
        sr = (S @ s.bone.matrix_local).to_3x3().normalized()
        swing = tr.col[1].rotation_difference(sr.col[1]).to_matrix()
        offs[pb.name] = sr.inverted() @ (swing @ tr)
    hip_t = (A @ arm.pose.bones['Hips'].bone.matrix_local).translation
    if 'hips' not in REF: REF['hips'] = (S @ srcb['Hips'].bone.matrix_local).translation.copy()
    hip_s = REF['hips']; ratio = hip_t.z / hip_s.z
    old = bpy.data.actions.get(name)
    if old: bpy.data.actions.remove(old)
    new = bpy.data.actions.new(name); new.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = new
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        for c in pb.constraints: c.mute = True
    def depth(b):
        d = 0
        while b.parent: b, d = b.parent, d + 1
        return d
    levels = {}
    for pb in arm.pose.bones: levels.setdefault(depth(pb.bone), []).append(pb)
    start, end = (int(round(x)) for x in act.frame_range)
    Ainv = A.inverted()
    src.animation_data.action = act
    for fr in range(start, end + 1):
        sc.frame_set(fr)
        for pb in arm.pose.bones: pb.location = (0,0,0); pb.rotation_quaternion = (1,0,0,0)
        bpy.context.view_layer.update()
        for lvl in sorted(levels):
            for pb in levels[lvl]:
                s = srcb.get(pb.name)
                if s is None: continue
                rot = ((S @ s.matrix).to_3x3().normalized() @ offs[pb.name]).to_quaternion()
                head = hip_t + ((S @ s.matrix).translation - hip_s) * ratio if pb.name == 'Hips' else (A @ pb.matrix).translation
                pb.matrix = Ainv @ mathutils.Matrix.LocRotScale(head, rot, mathutils.Vector((1,1,1)))
            bpy.context.view_layer.update()
        for side in ('Left','Right'):
            h, t = arm.pose.bones.get(side+'Hand'), arm.pose.bones.get(side+'ForeArmTwist')
            q = h.rotation_quaternion; tw = mathutils.Quaternion((q.w,0.0,q.y,0.0)).normalized()
            t.rotation_quaternion = mathutils.Quaternion((1,0,0,0)).slerp(tw, 0.5)
        f = fr - start + 1
        for pb in arm.pose.bones: pb.keyframe_insert('rotation_quaternion', frame=f)
        arm.pose.bones['Hips'].keyframe_insert('location', frame=f)
    return new

def load_clip(path):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new=[o for o in bpy.data.objects if o not in before]
    src=[o for o in new if o.type=='ARMATURE'][0]
    act=src.animation_data.action
    return src, act, new

def metrics(arm, act, fps=30):
    """What matters on screen: hips travel (natural speed), stride and foot lift, feet below the floor,
    hands passing into the torso, knees crossing, loop seam."""
    sc=bpy.context.scene; arm.animation_data.action=act
    s,e=(int(round(x)) for x in act.frame_range)
    W=lambda n: arm.matrix_world@arm.pose.bones[n].head
    rows=[]
    for f in range(s,e+1):
        sc.frame_set(f)
        hip=W('Hips'); sp=W('Spine'); ch=W('Spine2'); ne=W('Neck')
        def axisd(p):
            best=9
            for a,b in ((hip,sp),(sp,ch),(ch,ne)):
                d=b-a; t=max(0,min(1,(p-a).dot(d)/d.length_squared)); best=min(best,(p-(a+d*t)).length)
            return best
        lf,rf=W('LeftFoot'),W('RightFoot'); lt,rt=W('LeftToeBase'),W('RightToeBase')
        lk,rk=W('LeftLeg'),W('RightLeg')
        rows.append(dict(hip=hip.copy(), lf=lf.copy(), rf=rf.copy(), low=min(lf.z,rf.z,lt.z,rt.z),
            hand=min(axisd(W('LeftHand')),axisd(W('RightHand'))), knees=(lk-rk).length,
            pose=[pb.matrix.copy() for pb in arm.pose.bones]))
    dur=(e-s)/fps
    travel=(rows[-1]['hip']-rows[0]['hip']); travel.z=0
    lift=max(max(r['lf'].z for r in rows)-min(r['lf'].z for r in rows), max(r['rf'].z for r in rows)-min(r['rf'].z for r in rows))
    stride=max(max(r['lf'].y for r in rows)-min(r['lf'].y for r in rows), max(r['rf'].y for r in rows)-min(r['rf'].y for r in rows))
    seam=sum((a.to_quaternion().rotation_difference(b.to_quaternion()).angle) for a,b in zip(rows[0]['pose'],rows[-1]['pose']))
    return dict(dur=round(dur,2), travel=round(travel.length,2), speed=round(travel.length/max(dur,1e-3),2), stride=round(stride,2), lift=round(lift,3),
                floor=round(min(r['low'] for r in rows),3), hand_torso=round(min(r['hand'] for r in rows),3), knees=round(min(r['knees'] for r in rows),3), seam=round(seam,2))
