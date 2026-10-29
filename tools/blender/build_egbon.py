"""Build Egbon Abdul Razak in Blender from his sheet (spec 4.1, while no image-to-3D model exists).

Headless:   blender -b --factory-startup --python tools/blender/build_egbon.py
In a live Blender (MCP):  exec(open(path).read(), {'__file__': path, '__name__': '__main__'})

Builds into its own scene "Egbon" (never touches other scenes):
  - one continuous body from a Skin modifier over a joint graph whose widths were measured from the
    sheet's front and side views (shoulders, the baggy print trousers, the bunched cuffs, sandals);
  - painted by projecting the sheet's front view onto front-facing faces and the back view onto
    back-facing ones (assets-src/egbon-razak/atlas.png from tools/make_atlas.py);
  - an afro, the gold chain and the bead bracelet as separate pieces on their bones;
  - a Mixamo-named skeleton (Hips, Spine..., LeftArm...) with automatic weights, and cloth bones in
    the trouser legs for the renderer's springs;
then exports public/models/egbon-razak.glb (+ .json) and front / side / back renders for comparison.
The model faces -Y in Blender (Mixamo's convention), which is +Z in three.js; the game turns it.
"""

import json
import math
from pathlib import Path

import bmesh
import bpy
import mathutils

ROOT = Path(__file__).resolve().parents[2]
CHAR = 'egbon-razak'
SRC = ROOT / 'assets-src' / CHAR
# the sheet's figures are not centred on the body (the hands hang unevenly): body centre offsets, metres
FRONT_DX = 0.02
BACK_DX = -0.02
SIDE_DY = -0.02
# the Skin modifier's smoothing shrinks the body; widths measured on the sheet are scaled up by this
RADIUS_SCALE = 1.2

# joint graph: name -> (x, y, z, half-width, half-depth); +X is his left, -Y is his front
NODES = {
    'pelvis': (0, -0.03, 0.93, 0.18, 0.13),
    'waist': (0, -0.035, 1.06, 0.135, 0.105),
    'belly': (0, -0.02, 1.19, 0.105, 0.10),
    'chest': (0, 0.0, 1.31, 0.125, 0.11),
    'upchest': (0, 0.01, 1.42, 0.15, 0.10),
    'neck': (0, 0.0, 1.53, 0.055, 0.055),
    'jaw': (0, -0.015, 1.6, 0.068, 0.078),
    'skull': (0, -0.025, 1.68, 0.082, 0.094),
    'crown': (0, -0.015, 1.755, 0.072, 0.082),
}
for side, s in (('L', 1), ('R', -1)):
    NODES.update({
        f'shoulder{side}': (s * 0.19, 0.01, 1.43, 0.065, 0.065),
        f'bicep{side}': (s * 0.21, 0.01, 1.3, 0.056, 0.054),
        f'elbow{side}': (s * 0.225, 0.01, 1.16, 0.042, 0.042),
        f'forearm{side}': (s * 0.243, 0.0, 1.05, 0.044, 0.042),
        f'wrist{side}': (s * 0.26, -0.005, 0.95, 0.029, 0.027),
        f'hand{side}': (s * 0.275, -0.012, 0.87, 0.04, 0.034),
        f'hip{side}': (s * 0.085, -0.03, 0.9, 0.12, 0.13),
        f'knee{side}': (s * 0.14, -0.01, 0.55, 0.11, 0.12),
        f'shin{side}': (s * 0.16, 0.0, 0.33, 0.102, 0.11),
        f'cuff{side}': (s * 0.175, 0.0, 0.2, 0.1, 0.1),
        f'hem{side}': (s * 0.18, 0.0, 0.14, 0.075, 0.075),
        f'ankle{side}': (s * 0.185, 0.0, 0.085, 0.04, 0.042),
        f'foot{side}': (s * 0.2, -0.07, 0.035, 0.05, 0.034),
        f'toe{side}': (s * 0.21, -0.15, 0.022, 0.046, 0.02),
    })
EDGES = [('pelvis', 'waist'), ('waist', 'belly'), ('belly', 'chest'), ('chest', 'upchest'), ('upchest', 'neck'),
         ('neck', 'jaw'), ('jaw', 'skull'), ('skull', 'crown')]
for side in 'LR':
    arm = ['upchest', 'shoulder', 'bicep', 'elbow', 'forearm', 'wrist', 'hand']
    leg = ['pelvis', 'hip', 'knee', 'shin', 'cuff', 'hem', 'ankle', 'foot', 'toe']
    for chain in (arm, leg):
        names = [chain[0]] + [f'{n}{side}' for n in chain[1:]]
        EDGES += list(zip(names, names[1:]))


def P(n):
    x, y, z = NODES[n][:3]
    return (x, y, z)


# Mixamo-named skeleton: name -> (head, tail, parent)
BONES = {
    'Hips': ((0, -0.03, 0.93), (0, -0.03, 1.06), None),
    'Spine': ((0, -0.03, 1.06), (0, -0.02, 1.19), 'Hips'),
    'Spine1': ((0, -0.02, 1.19), (0, 0.0, 1.31), 'Spine'),
    'Spine2': ((0, 0.0, 1.31), (0, 0.01, 1.47), 'Spine1'),
    'Neck': ((0, 0.01, 1.47), (0, 0.0, 1.57), 'Spine2'),
    'Head': ((0, 0.0, 1.57), (0, -0.01, 1.83), 'Neck'),
}
for side, s in (('Left', 1), ('Right', -1)):
    k = 'L' if s > 0 else 'R'
    BONES.update({
        f'{side}Shoulder': ((s * 0.04, 0.01, 1.45), P(f'shoulder{k}'), 'Spine2'),
        f'{side}Arm': (P(f'shoulder{k}'), P(f'elbow{k}'), f'{side}Shoulder'),
        f'{side}ForeArm': (P(f'elbow{k}'), P(f'wrist{k}'), f'{side}Arm'),
        f'{side}Hand': (P(f'wrist{k}'), (s * 0.285, -0.015, 0.82), f'{side}ForeArm'),
        f'{side}UpLeg': (P(f'hip{k}'), P(f'knee{k}'), 'Hips'),
        f'{side}Leg': (P(f'knee{k}'), P(f'ankle{k}'), f'{side}UpLeg'),
        f'{side}Foot': (P(f'ankle{k}'), P(f'foot{k}'), f'{side}Leg'),
        f'{side}ToeBase': (P(f'foot{k}'), P(f'toe{k}'), f'{side}Foot'),
    })
# cloth bones in the trouser legs, weighted to the loose fabric below the knee
CLOTH = [('cloth_trouser_L', 'LeftLeg', 0.06), ('cloth_trouser_R', 'RightLeg', 0.06)]


def new_scene():
    old = bpy.data.scenes.get('Egbon')
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new('Egbon')
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


def link(scene, obj):
    scene.collection.objects.link(obj)
    return obj


def atlas_material():
    meta = json.loads((SRC / 'atlas.json').read_text())
    img = bpy.data.images.load(str(SRC / 'atlas.png'), check_existing=True)
    mat = bpy.data.materials.new('Egbon')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    return mat, meta


def flat_material(name, rgb, rough=0.8, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return mat


def build_body(scene):
    names = list(NODES)
    me = bpy.data.meshes.new('EgbonBody')
    me.from_pydata([NODES[n][:3] for n in names], [(names.index(a), names.index(b)) for a, b in EDGES], [])
    obj = link(scene, bpy.data.objects.new('EgbonBody', me))
    skin = obj.modifiers.new('Skin', 'SKIN')
    skin.use_smooth_shade = True
    for i, n in enumerate(names):
        sv = me.skin_vertices[0].data[i]
        sv.radius = tuple(r * RADIUS_SCALE for r in NODES[n][3:])
        sv.use_root = n == 'pelvis'
    sub = obj.modifiers.new('Subsurf', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear()
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)
    mesh.name = 'EgbonBody'
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


def project_uvs(obj, meta):
    """Paint by projection from the sheet: front-facing faces take the front view, back-facing faces
    the back view, and the flanks of the legs, arms and head (which the side-on game camera sees most)
    take the side view. Everything above the hips keeps front/back."""
    w, h = meta['width'], meta['size']
    fr, sd, bk = meta['views']['front'], meta['views']['side'], meta['views']['back']
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        c = f.calc_center_median()
        # only the legs take the side view: on the head it would paint a second (profile) face and on
        # the arms the side view has the hand over the trousers
        legs = c.z < 1.0 and abs(c.x) < 0.24
        # the back half of the head's sides (ear, fade, hair): the side view's face is further forward
        head_rear = c.z > 1.56 and n.y > -0.15
        if abs(n.x) > abs(n.y) and (legs or head_rear):
            view = 'side'
        else:
            view = 'back' if n.y > 0.0 else 'front'
        for loop in f.loops:
            x, y, z = loop.vert.co
            if view == 'front':
                px, v = fr['cx'] + (x + FRONT_DX) * fr['pxPerM'], fr
            elif view == 'back':
                px, v = bk['cx'] - (x - BACK_DX) * bk['pxPerM'], bk
            else:
                # the sheet's side view faces image-right; his front is -Y
                px, v = sd['cx'] + (-y + SIDE_DY) * sd['pxPerM'], sd
            py = v['foot'] - z * v['pxPerM']
            loop[uv].uv = (px / w, 1 - py / h)
    bm.to_mesh(obj.data)
    bm.free()


def to_scene(scene, obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    scene.collection.objects.link(obj)


def build_extras(scene):
    """Afro, chain and bracelet: (object, bone to follow)."""
    out = []
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    noise = mathutils.noise
    for v in bm.verts:
        d = v.co.normalized()
        bump = 1 + 0.07 * noise.noise(d * 6.0) + 0.04 * noise.noise(d * 13.0)
        v.co = d * bump
    me = bpy.data.meshes.new('EgbonAfro')
    bm.to_mesh(me)
    bm.free()
    afro = link(scene, bpy.data.objects.new('EgbonAfro', me))
    afro.scale = (0.088, 0.098, 0.062)
    afro.location = (0.0, -0.005, 1.775)
    afro.data.materials.append(flat_material('Afro', (0.035, 0.026, 0.02), 0.95))
    for p in me.polygons:
        p.use_smooth = True
    out.append((afro, 'Head'))

    def torus(name, major, minor, maj_seg, min_seg):
        bm = bmesh.new()
        for i in range(maj_seg):
            a = 2 * math.pi * i / maj_seg
            for j in range(min_seg):
                b = 2 * math.pi * j / min_seg
                r = major + minor * math.cos(b)
                bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
        bm.verts.ensure_lookup_table()
        for i in range(maj_seg):
            for j in range(min_seg):
                a = i * min_seg + j
                b = ((i + 1) % maj_seg) * min_seg + j
                c = ((i + 1) % maj_seg) * min_seg + (j + 1) % min_seg
                d = i * min_seg + (j + 1) % min_seg
                bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[c], bm.verts[d]))
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        return link(scene, bpy.data.objects.new(name, me))

    chain = torus('EgbonChain', 0.07, 0.0035, 40, 6)
    chain.location = (0, -0.03, 1.47)
    chain.rotation_euler = (math.radians(-28), 0, 0)
    chain.scale = (1.15, 1.0, 1.0)
    chain.data.materials.append(flat_material('Gold', (0.95, 0.7, 0.2), 0.35, 1.0))
    out.append((chain, 'Spine2'))

    beads_mat = flat_material('Beads', (0.55, 0.16, 0.05), 0.5)
    for side, bone in (('L', 'LeftForeArm'), ('R', 'RightForeArm')):
        beads = torus(f'EgbonBeads{side}', 0.031, 0.009, 14, 8)
        beads.location = NODES[f'wrist{side}'][:3]
        beads.data.materials.append(beads_mat)
        out.append((beads, bone))
    return out


def build_armature(scene):
    data = bpy.data.armatures.new('EgbonRig')
    arm = link(scene, bpy.data.objects.new('Egbon', data))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, _) in BONES.items():
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
    for name, (_, _, parent) in BONES.items():
        if parent:
            data.edit_bones[name].parent = data.edit_bones[parent]
            data.edit_bones[name].use_connect = False
    for name, parent, _ in CLOTH:
        pe = data.edit_bones[parent]
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = pe.head.lerp(pe.tail, 0.35), pe.tail.copy()
        eb.parent = pe
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def skin_to(arm, body):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # cloth: the part of each lower leg's weight that sits away from the bone goes to the cloth bone
    mw = arm.matrix_world
    for cloth, parent, radius in CLOTH:
        b = arm.data.bones[parent]
        head, tail = mw @ b.head_local, mw @ b.tail_local
        axis = tail - head
        src = body.vertex_groups.get(parent)
        dst = body.vertex_groups.new(name=cloth)
        if not src:
            continue
        for v in body.data.vertices:
            w = next((g.weight for g in v.groups if g.group == src.index), 0.0)
            if w < 0.05:
                continue
            t = max(0.0, min(1.0, (v.co - head).dot(axis) / axis.length_squared))
            d = (v.co - (head + axis * t)).length
            loose = max(0.0, min(1.0, (d - radius) / 0.04)) * max(0.0, (t - 0.3) / 0.7)
            if loose > 0.0:
                dst.add([v.index], w * loose, 'REPLACE')
                src.add([v.index], w * (1 - loose), 'REPLACE')


def attach(arm, extras):
    for obj, bone in extras:
        mat = obj.matrix_world.copy()
        obj.parent = arm
        obj.parent_type = 'BONE'
        obj.parent_bone = bone
        obj.matrix_world = mat


def triangles(objs):
    n = 0
    for o in objs:
        o.data.calc_loop_triangles()
        n += len(o.data.loop_triangles)
    return n


def export(scene, arm, objs):
    out = ROOT / 'public' / 'models'
    out.mkdir(parents=True, exist_ok=True)
    for o in scene.objects:
        o.select_set(o == arm or o.parent == arm)
    bpy.context.view_layer.objects.active = arm
    glb = out / f'{CHAR}.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format='GLB', use_selection=True, use_active_scene=True,
        export_skins=True, export_animations=False, export_yup=True, export_image_format='JPEG',
        export_jpeg_quality=88,
    )
    manifest = {
        'id': CHAR, 'file': f'models/{CHAR}.glb', 'height': 1.82, 'triangles': triangles(objs),
        'bones': len(arm.data.bones), 'cloth': [c[0] for c in CLOTH],
        'facing': '+Z', 'source': 'tools/blender/build_egbon.py (modelled from the sheet)',
        'bytes': glb.stat().st_size,
    }
    (out / f'{CHAR}.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


def render_views(scene):
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 420, 1000
    scene.world = bpy.data.worlds.new('EgbonWorld')
    cam = link(scene, bpy.data.objects.new('EgbonCam', bpy.data.cameras.new('EgbonCam')))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 1.95
    scene.camera = cam
    views = {'front': ((0, -6, 0.93), (90, 0, 0)), 'side': ((-6, 0, 0.93), (90, 0, -90)), 'back': ((0, 6, 0.93), (90, 0, 180))}
    for name, (loc, rot) in views.items():
        cam.location = loc
        cam.rotation_euler = tuple(math.radians(r) for r in rot)
        scene.render.filepath = str(SRC / f'render-{name}.png')
        with bpy.context.temp_override(scene=scene):
            bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def main():
    scene = new_scene()
    # headless there is no window to switch, so every step runs with the new scene as the context
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        mat, meta = atlas_material()
        body = build_body(scene)
        body.data.materials.append(mat)
        project_uvs(body, meta)
        extras = build_extras(scene)
        arm = build_armature(scene)
        skin_to(arm, body)
        attach(arm, extras)
        export(scene, arm, [body] + [e[0] for e in extras])
        render_views(scene)


if __name__ == '__main__':
    main()
