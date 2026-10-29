
import bpy, math, json
from mathutils import Vector, Quaternion
P='mixamorig:'
D=r'C:\Users\anoth\Downloads\naija-3d'
Y=Vector((0,1,0)); Z=Vector((0,0,1)); X=Vector((1,0,0))
def arm(): return bpy.data.objects['Egbon']
def _base():
    t=bpy.data.texts.get('hk_base')
    if t: return json.loads(t.as_string())
    a=arm(); src=bpy.data.actions['idle_src']; a.animation_data.action=src
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    d={pb.name:[list(pb.location), list(pb.rotation_quaternion)] for pb in a.pose.bones}
    t=bpy.data.texts.new('hk_base'); t.write(json.dumps(d)); return d
def begin(name):
    a=arm(); b=_base()
    for c in a.pose.bones:
        c.rotation_mode='QUATERNION'; c.location=Vector(b[c.name][0]); c.rotation_quaternion=Quaternion(b[c.name][1])
    act=bpy.data.actions.get(name)
    if act: bpy.data.actions.remove(act)
    act=bpy.data.actions.new(name); act.use_fake_user=True; a.animation_data.action=act
    iks=[c for pb in a.pose.bones for c in pb.constraints if c.type=='IK']
    for c in iks: c.mute=True
    bpy.context.view_layer.update()
    mw=a.matrix_world; E0={}
    for n in ['LeftHand','RightHand','LeftFoot','RightFoot']:
        e=bpy.data.objects['IK_'+n]; e.animation_data_clear(); e.location=mw@a.pose.bones[P+n].head; E0[n]=e.location.copy()
    for c in iks: c.mute=False
    bpy.context.view_layer.update()
    ctx={'b':b,'E0':E0,'name':name}
    ensure_poles(ctx)
    return ctx
def ensure_poles(ctx):
    """Knee aim targets: parented to the hips so they turn with the body, angle found so the stance is unchanged."""
    import math
    a=arm(); mw=a.matrix_world; sc=bpy.context.scene
    iks={pb.name:c for pb in a.pose.bones for c in pb.constraints if c.type=='IK'}
    for side in ['Left','Right']:
        leg=P+side+'Leg'; c=iks[leg]
        name='POLE_'+side+'Leg'
        e=bpy.data.objects.get(name)
        # base knee position with all IK muted
        for k in iks.values(): k.mute=True
        bpy.context.view_layer.update()
        knee=(mw@a.pose.bones[leg].head).copy()
        if e is None:
            e=bpy.data.objects.new(name,None); sc.collection.objects.link(e); e.empty_display_type='CUBE'; e.empty_display_size=0.04
            e.parent=a; e.parent_type='BONE'; e.parent_bone=P+'Hips'
            bpy.context.view_layer.update()
            hip=(mw@a.pose.bones[P+side+'UpLeg'].head); foot=(mw@a.pose.bones[P+side+'Foot'].head)
            mid=(hip+foot)/2; out=(knee-mid); out.z=0
            if out.length<1e-3: out=Vector((0,-1,0))
            out=out.normalized()*0.5+Vector((0,-0.15,0))
            e.matrix_world=__import__('mathutils').Matrix.Translation(knee+out)
            print('pole', side, tuple(round(x,2) for x in knee), tuple(round(x,2) for x in out))
        for k in iks.values(): k.mute=False
        c.pole_target=e
        best=(1e9,0)
        for ang in range(-180,181,2):
            c.pole_angle=math.radians(ang); bpy.context.view_layer.update()
            d=(mw@a.pose.bones[leg].head-knee).length
            if d<best[0]: best=(d,ang)
        for ang in [best[1]+x*0.25 for x in range(-8,9)]:
            c.pole_angle=math.radians(ang); bpy.context.view_layer.update()
            d=(mw@a.pose.bones[leg].head-knee).length
            if d<best[0]: best=(d,ang)
        c.pole_angle=math.radians(best[1]); bpy.context.view_layer.update()
        ctx.setdefault('poles',{})[side]=(round(best[1],2), round(best[0],4))

def rq(ctx,bn,twist=0,lean=0,side=0):
    q=Quaternion(ctx['b'][P+bn][1])
    return q @ Quaternion(Y,math.radians(twist)) @ Quaternion(Z,math.radians(lean)) @ Quaternion(X,math.radians(side))
def key(ctx,f,hips=0,spine=0,lean=0,side=0,dip=0,fwd=0,lat=0,head=0,R=None,L=None,LF=None,RF=None,extra=None,hl=None,sl=None,hs=None):
    a=arm(); bpy.context.scene.frame_set(f)
    h=a.pose.bones[P+'Hips']
    h.location=Vector(ctx['b'][P+'Hips'][0])+Vector((lat*100,-dip*100,fwd*100))
    h.rotation_quaternion=rq(ctx,'Hips',hips,lean*0.4 if hl is None else hl,side*0.4 if hs is None else hs); h.keyframe_insert('location',frame=f)
    for bn in ['Spine','Spine1','Spine2']: a.pose.bones[P+bn].rotation_quaternion=rq(ctx,bn,spine,lean*0.2 if sl is None else sl,side*0.2)
    a.pose.bones[P+'Neck'].rotation_quaternion=rq(ctx,'Neck',-head*0.5)
    a.pose.bones[P+'Head'].rotation_quaternion=rq(ctx,'Head',-head*0.5)
    for bn,(tw,ln,sd) in (extra or {}).items(): a.pose.bones[P+bn].rotation_quaternion=rq(ctx,bn,tw,ln,sd)
    for bn in ['Hips','Spine','Spine1','Spine2','Neck','Head']+list((extra or {}).keys()): a.pose.bones[P+bn].keyframe_insert('rotation_quaternion',frame=f)
    for n,v in (('RightHand',R),('LeftHand',L),('LeftFoot',LF),('RightFoot',RF)):
        e=bpy.data.objects['IK_'+n]; e.location=ctx['E0'][n]+Vector(v or (0,0,0)); e.keyframe_insert('location',frame=f)
def export(ctx,end):
    sc=bpy.context.scene; sc.render.fps=60; sc.frame_start,sc.frame_end=1,end
    a=arm()
    for o in bpy.context.view_layer.objects: o.select_set(False)
    a.select_set(True); bpy.context.view_layer.objects.active=a
    bpy.ops.export_scene.fbx(filepath=D+'\\anim-'+ctx['name']+'.fbx', use_selection=True, object_types={'ARMATURE'}, add_leaf_bones=False,
      bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=True,
      bake_anim_simplify_factor=0.0, bake_anim_step=1.0)
def reach(ctx,f,n):
    bpy.context.scene.frame_set(f); a=arm(); return tuple(round(x,2) for x in a.matrix_world@a.pose.bones[P+n].head)
