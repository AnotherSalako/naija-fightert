"""Turn an image-to-3D model (Hunyuan3D, TRELLIS ... : one textured mesh, no skeleton) into the game's GLB.

Headless:
  blender -b --factory-startup --python tools/blender/rig_generated.py -- \
      --id egbon-razak --model assets-src/egbon-razak/generated/egbon-hunyuan.glb [--keep-x -0.6,-0.245]

It:
  1. imports the model and joins its meshes; --keep-x keeps only the vertices between two x values (a
     generator fed a whole turnaround sheet returns every view as its own figure side by side);
  2. reduces it to --tris triangles and bakes the source's colour onto new UVs (--texture px; the normal /
     roughness maps are dropped, the game's toon shading only reads colour);
  3. scales it to the character's height from src/sim/data/<id>.json, stands it on the floor at the origin
     facing -Y (+Z in three.js);
  4. builds the Mixamo-named skeleton and cloth bones of tools/blender/build_egbon.py, scaled to the height
     and with the arm and leg joints moved onto the mesh, and skins it with automatic weights;
  5. exports public/models/<id>.glb + .json and front / side / posed renders to assets-src/<id>/generated/.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import mathutils

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_egbon as tpl  # noqa: E402  the skeleton template (its main() only runs as __main__)


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--id', required=True)
    p.add_argument('--model', required=True)
    p.add_argument('--keep-x', default='')
    p.add_argument('--tris', type=int, default=20000)
    p.add_argument('--texture', type=int, default=2048)
    p.add_argument('--keep-uvs', action='store_true',
                   help='keep the model\'s own UVs and textures (one figure with its own texture) instead of baking')
    p.add_argument('--fresh', action='store_true', help='redo the cut / reduce / bake instead of using prepared.blend')
    return p.parse_args(argv)


def path(p: str) -> Path:
    q = Path(p)
    return q if q.is_absolute() else ROOT / q


def import_mesh(f: Path):
    if f.suffix.lower() == '.blend':
        # a cleaned-up model saved in Blender: append its meshes (with their packed textures)
        with bpy.data.libraries.load(str(f), link=False) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            if o is not None and o.type == 'MESH':
                bpy.context.scene.collection.objects.link(o)
    else:
        bpy.ops.import_scene.gltf(filepath=str(f))
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.users_collection]
    for o in bpy.data.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def keep_x(obj, lo: float, hi: float):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not lo <= v.co.x <= hi], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()


def bake(low, high, size: int, out_dir: Path):
    """New UVs on the reduced mesh; the source mesh's colour baked onto them (its own atlas holds every
    figure the generator made, so this one would only get a corner of it)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    low.data.shade_smooth()
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name='UV')
    select(low)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new(f'{low.name}_colour', size, size)
    mat = bpy.data.materials.new(f'{low.name}_body')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nodes.active = tex
    low.data.materials.clear()
    low.data.materials.append(mat)
    select(low, high)
    b = sc.render.bake
    # a coarse source sits further from the reduced copy: rays that miss leave black specks
    b.use_selected_to_active, b.cage_extrusion, b.max_ray_distance, b.margin = True, 0.03, 0.1, 12
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    img.filepath_raw = str(out_dir / 'colour.png')
    img.file_format = 'PNG'
    img.save()
    # the muscle and cloth folds the reduced mesh lost, as a tangent-space normal map
    nimg = bpy.data.images.new(f'{low.name}_normal', size // 2, size // 2)
    nimg.colorspace_settings.name = 'Non-Color'
    ntex = nodes.new('ShaderNodeTexImage')
    ntex.image = nimg
    nodes.active = ntex
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    nimg.filepath_raw = str(out_dir / 'normal.png')
    nimg.file_format = 'PNG'
    nimg.save()
    nmap = nodes.new('ShaderNodeNormalMap')
    mat.node_tree.links.new(ntex.outputs['Color'], nmap.inputs['Color'])
    mat.node_tree.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    nodes.active = tex


def own_textures(obj, size: int, normal_size: int = 0, rough_size: int = 0):
    """For a model whose texture is its own (one figure, clean UVs): keep its UVs, colour and normal
    maps, scaled to the budget (colour `size`, normal half unless given), and its metallic / roughness
    map at `rough_size` (0 drops it: the toon-only look does not read it)."""
    mat = obj.data.materials[0]
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')

    def image_into(socket):
        node = socket.links[0].from_node if socket.links else None
        while node is not None and node.type != 'TEX_IMAGE':
            ins = [i for i in node.inputs if i.links]
            node = ins[0].links[0].from_node if ins else None
        return node.image if node else None

    colour, normal = image_into(bsdf.inputs['Base Color']), image_into(bsdf.inputs['Normal'])
    rough = image_into(bsdf.inputs['Roughness']) if rough_size else None
    for n in list(nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'):
            nodes.remove(n)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.8
    for img, px, socket in ((colour, size, 'Base Color'), (normal, normal_size or size // 2, 'Normal')):
        if img is None:
            continue
        if socket == 'Normal':
            img.colorspace_settings.name = 'Non-Color'  # before scaling: changing it reloads the image
        if max(img.size) > px:
            img.scale(px, px)
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        if socket == 'Normal':
            nmap = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'], nmap.inputs['Color'])
            links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
        else:
            links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
            nodes.active = tex
    if rough is not None:
        # glTF packs roughness in green and metalness in blue of one map
        rough.colorspace_settings.name = 'Non-Color'
        if max(rough.size) > rough_size:
            rough.scale(rough_size, rough_size)
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = rough
        sep = nodes.new('ShaderNodeSeparateColor')
        links.new(tex.outputs['Color'], sep.inputs['Color'])
        links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        if colour is not None:
            nodes.active = next(n for n in nodes if n.type == 'TEX_IMAGE' and n.image == colour)
    print(f'textures: kept the model\'s own (colour {colour.size[:] if colour else None}, '
          f'normal {normal.size[:] if normal else None}, roughness {rough.size[:] if rough else None})')


def select(active, *others):
    for o in bpy.context.view_layer.objects:
        o.select_set(o is active or o in others)
    bpy.context.view_layer.objects.active = active


def decimate(obj, tris: int):
    obj.data.calc_loop_triangles()
    total = len(obj.data.loop_triangles)
    if total > tris:
        mod = obj.modifiers.new('Decimate', 'DECIMATE')
        mod.ratio = tris / total * 0.98
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bm.to_mesh(obj.data)
    bm.free()


def place(obj, height: float, *also):
    """scale to the height, centre on the origin, feet on the floor (the same move for the copies)"""
    lo, hi = bounds(obj)
    k = height / (hi.z - lo.z)
    m = mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation(-mathutils.Vector(
        ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
    for o in (obj, *also):
        o.data.transform(m)
        o.data.update()


def bounds(obj, verts=None):
    cs = [obj.matrix_world @ v.co for v in (verts or obj.data.vertices)]
    lo = mathutils.Vector([min(c[i] for c in cs) for i in range(3)])
    hi = mathutils.Vector([max(c[i] for c in cs) for i in range(3)])
    return lo, hi


def slab_centre(obj, z: float, side: int, x_min: float, band=0.02):
    """centre of the mesh on one side (x * side > x_min) within a thin horizontal slab"""
    vs = [v.co for v in obj.data.vertices if abs(v.co.z - z) < band and v.co.x * side > x_min]
    if not vs:
        return None
    lo = mathutils.Vector([min(c[i] for c in vs) for i in range(3)])
    hi = mathutils.Vector([max(c[i] for c in vs) for i in range(3)])
    return (lo + hi) / 2, lo, hi


def fit_bones(obj, height: float):
    """The template skeleton scaled to the height, its limb joints moved onto the mesh's limbs."""
    k = height / 1.82
    bones = {n: (mathutils.Vector(h) * k, mathutils.Vector(t) * k, p) for n, (h, t, p) in tpl.BONES.items()}
    joints = {}
    for side, s in (('Left', 1), ('Right', -1)):
        # arms hang outside the torso: centre of the outermost limb slab at each joint height
        for bone in ('Arm', 'ForeArm', 'Hand'):
            head = bones[f'{side}{bone}'][0]
            r = slab_centre(obj, head.z, s, abs(head.x) - 0.06 * k)
            if r:
                joints[(side, bone)] = mathutils.Vector((r[0].x, r[0].y, head.z))
        for bone in ('UpLeg', 'Leg', 'Foot'):
            head = bones[f'{side}{bone}'][0]
            r = slab_centre(obj, head.z, s, 0.02 * k)
            if r:
                joints[(side, bone)] = mathutils.Vector((r[0].x, r[0].y, head.z))
    fixed = {}
    for n, (h, t, p) in bones.items():
        for (side, bone), j in joints.items():
            if n == f'{side}{bone}':
                h = j
        fixed[n] = [h, t, p]
    # tails follow the child joints so the chains stay connected
    for n, b in fixed.items():
        kids = [c for c, cb in fixed.items() if cb[2] == n and not c.endswith('Shoulder')
                and (n not in ('Spine2', 'Hips'))]
        if len(kids) == 1:
            b[1] = fixed[kids[0]][0].copy()
    for side in ('Left', 'Right'):
        fixed[f'{side}Shoulder'][1] = fixed[f'{side}Arm'][0].copy()
        hand = fixed[f'{side}Hand']
        hand[1] = hand[0] + mathutils.Vector((0, 0, -0.15 * k))  # to the fingertips
    return fixed


def build_armature(bones, height):
    data = bpy.data.armatures.new('Rig')
    arm = bpy.data.objects.new('Armature', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, _) in bones.items():
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
    for name, (_, _, parent) in bones.items():
        if parent:
            data.edit_bones[name].parent = data.edit_bones[parent]
    for name, parent, _ in tpl.CLOTH:
        pe = data.edit_bones[parent]
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = pe.head.lerp(pe.tail, 0.35), pe.tail.copy()
        eb.parent = pe
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def weights_from_proxy(arm, body, voxel=0.008):
    """Automatic weights fail on a mesh that is not one closed surface (Blender's bone heat needs it):
    weight a watertight voxel copy instead and copy its weights across, nearest face, interpolated."""
    proxy = body.copy()
    proxy.data = body.data.copy()
    proxy.vertex_groups.clear()
    proxy.modifiers.clear()
    proxy.parent = None
    bpy.context.scene.collection.objects.link(proxy)
    mod = proxy.modifiers.new('Remesh', 'REMESH')
    mod.mode, mod.voxel_size = 'VOXEL', voxel
    select(proxy)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    select(arm, proxy)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    got = sum(1 for v in proxy.data.vertices if v.groups)
    body.vertex_groups.clear()
    for g in proxy.vertex_groups:
        body.vertex_groups.new(name=g.name)
    dt = body.modifiers.new('Weights', 'DATA_TRANSFER')
    dt.object = proxy
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'
    dt.layers_vgroup_select_dst = 'NAME'
    select(body)
    bpy.ops.object.modifier_move_to_index(modifier=dt.name, index=0)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    bpy.data.objects.remove(proxy, do_unlink=True)
    empty = sum(1 for v in body.data.vertices if not v.groups)
    print(f'skin: weights from a {voxel * 1000:.0f} mm voxel proxy ({got} proxy vertices weighted); '
          f'{empty} body vertices still empty')


def skin(arm, body, height):
    for o in bpy.context.view_layer.objects:
        o.select_set(o in (arm, body))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    empty = sum(1 for v in body.data.vertices if not v.groups)
    print(f'skin: {empty} of {len(body.data.vertices)} vertices without weights')
    if empty > len(body.data.vertices) // 2:
        weights_from_proxy(arm, body)
    separate_arms(arm, body)
    cut_bridges(arm, body)
    mw = arm.matrix_world
    for cloth, parent, radius in tpl.CLOTH:
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
            loose = max(0.0, min(1.0, (d - radius * height / 1.82) / 0.04)) * max(0.0, (t - 0.3) / 0.7)
            if loose > 0.0:
                dst.add([v.index], w * loose, 'REPLACE')
                src.add([v.index], w * (1 - loose), 'REPLACE')


def separate_arms(arm, body, core=0.8, slack=2.5, margin=0.06):
    """A hanging hand sits against the hip, so automatic weights tie the two together and a raised arm
    pulls strands of hip with it. A weight is kept only if its bone is about as near along the surface as
    it is through the air: from each bone's core (the vertices it owns outright) a shortest-path search
    over the mesh edges gives the surface distance, and a hip vertex is centimetres from the hand through
    the air but half a metre over the skin. Vertices left without weights take their surface-nearest bone."""
    import heapq
    mw = arm.matrix_world
    segs = {b.name: (mw @ b.head_local, mw @ b.tail_local) for b in arm.data.bones if not b.name.startswith('cloth')}
    vs = body.data.vertices
    nbr = [[] for _ in vs]
    for e in body.data.edges:
        a, b = e.vertices
        d = (vs[a].co - vs[b].co).length
        nbr[a].append((b, d))
        nbr[b].append((a, d))
    groups = {g.index: g for g in body.vertex_groups}
    owned = {n: [] for n in segs}
    for v in vs:
        for g in v.groups:
            name = groups[g.group].name
            if name in owned and g.weight >= core:
                owned[name].append(v.index)
    geo = {}
    for name, seeds in owned.items():
        if not seeds:
            continue
        dist = {i: 0.0 for i in seeds}
        heap = [(0.0, i) for i in seeds]
        while heap:
            d, i = heapq.heappop(heap)
            if d > dist.get(i, 9) or d > 1.2:
                continue
            for j, w in nbr[i]:
                nd = d + w
                if nd < dist.get(j, 9):
                    dist[j] = nd
                    heapq.heappush(heap, (nd, j))
        geo[name] = dist

    def air(p, seg):
        h, t = seg
        ax = t - h
        k = max(0.0, min(1.0, (p - h).dot(ax) / ax.length_squared))
        return (p - (h + ax * k)).length

    cut = filled = 0
    for v in vs:
        for g in list(v.groups):
            name = groups[g.group].name
            if name not in geo:
                continue
            surface = geo[name].get(v.index, 9)
            if surface == 9 and not any(v.index in d for d in geo.values()):
                continue  # a loose island no bone reaches: leave its automatic weights
            if surface > slack * air(v.co, segs[name]) + margin:
                groups[g.group].remove([v.index])
                cut += 1
        if not v.groups:
            reach = {n: d[v.index] for n, d in geo.items() if v.index in d}
            near = min(reach, key=reach.get) if reach else min(segs, key=lambda n: air(v.co, segs[n]))
            body.vertex_groups[near].add([v.index], 1.0, 'REPLACE')
            filled += 1
    # well below the armpit nothing is shared: a vertex follows the arm or the body, whichever owns more
    # of it (a trouser leg the hand rests on otherwise keeps a little hand weight and stretches into a strand)
    arm_bones = {n for n in segs if any(n.endswith(x) for x in ('Arm', 'ForeArm', 'Hand'))}
    below = min(segs['LeftArm'][0].z, segs['RightArm'][0].z) - 0.1
    split = 0
    for v in vs:
        if v.co.z > below or not v.groups:
            continue
        on = sum(g.weight for g in v.groups if groups[g.group].name in arm_bones)
        off = sum(g.weight for g in v.groups if groups[g.group].name not in arm_bones)
        if on and off:
            for g in list(v.groups):
                if (groups[g.group].name in arm_bones) != (on > off):
                    groups[g.group].remove([v.index])
            split += 1
    select(body)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    print(f'skin: {cut} weights cut as too far over the surface, {filled} vertices filled, {split} arm/body splits')


def cut_bridges(arm, body, webdist=9.0):
    """The generator fuses a hand to the hip it rests against with a thin bridge of faces; below the
    armpit, a face whose corners belong mostly to an arm bone on one side and a body bone on the other
    is that bridge, and goes."""
    mw = arm.matrix_world
    armpit = min((mw @ arm.data.bones[f'{s}Arm'].head_local).z for s in ('Left', 'Right')) - 0.04
    names = {g.index: g.name for g in body.vertex_groups}

    def on_arm(v):
        best = max(v.groups, key=lambda g: g.weight, default=None)
        return best is not None and any(names[best.group].endswith(x) for x in ('Arm', 'ForeArm', 'Hand'))

    limbs = [(mw @ arm.data.bones[f'{s}{b}'].head_local, mw @ arm.data.bones[f'{s}{b}'].tail_local)
             for s in ('Left', 'Right') for b in ('Arm', 'ForeArm', 'Hand')]

    def from_limb(p):
        best = 9.0
        for h, t in limbs:
            ax = t - h
            k = max(0.0, min(1.0, (p - h).dot(ax) / ax.length_squared))
            best = min(best, (p - (h + ax * k)).length)
        return best

    vs = body.data.vertices
    side = [on_arm(v) for v in vs]
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    # the web the generator stretches between a hand and the thigh it overlaps: arm-owned, but off the arm
    web = [v for v in bm.verts if side[v.index] and v.co.z < armpit and from_limb(v.co) > webdist]
    bridge = [f for f in bm.faces if f.calc_center_median().z < armpit
              and len({side[v.index] for v in f.verts}) > 1
              and max((a.co - b.co).length for a in f.verts for b in f.verts) > 0.004]
    bmesh.ops.delete(bm, geom=bridge, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=web, context='VERTS')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    print(f'skin: {len(bridge)} arm-to-body bridge faces and {len(web)} web vertices cut')


def paint_regions(arm, body, height):
    """The P2 colourway recolours clothes only. A colour attribute marks them (red: trousers, green: the
    tank top) so the game's colour swap leaves skin alone where it is the same hue (a hand on the hip)."""
    k = height / 1.82
    # the tank top reaches the shoulders; skin inside that band is left alone by the game's rule, which
    # only touches pale, unsaturated colour
    waist, shoulders = 1.03 * k, 1.58 * k
    names = {g.index: g.name for g in body.vertex_groups}
    trousers = ('Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'cloth_trouser_L', 'cloth_trouser_R')
    col = body.data.color_attributes.new('Region', 'FLOAT_COLOR', 'POINT')
    for v in body.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        bone = names[best.group] if best else ''
        z = (body.matrix_world @ v.co).z  # a Mixamo rig is scaled and turned; heights are in world space
        r = 1.0 if bone in trousers and 0.1 * k < z < waist else 0.0
        g = 1.0 if bone not in ('Head', '') and waist - 0.03 * k <= z < shoulders else 0.0
        col.data[v.index].color = (r, g, 0.0, 1.0)
    body.data.color_attributes.active_color = col


def render(arm, out_dir: Path, height: float):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.light = 'FLAT'
    sc.render.resolution_x, sc.render.resolution_y = 600, 900
    sc.world = bpy.data.worlds.new('w')
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = height * 1.15
    z = height / 2
    views = [('front', (0, -4, z), (90, 0, 0)), ('side', (4, 0, z), (90, 0, 90))]
    for name, loc, rot in views:
        cam.location, cam.rotation_euler = loc, [math.radians(r) for r in rot]
        sc.render.filepath = str(out_dir / f'rig-{name}.png')
        bpy.ops.render.render(write_still=True)
    # a test pose: guard up, a step, a bend, to show the weights hold
    pb = arm.pose.bones
    pb['RightArm'].rotation_mode = pb['LeftArm'].rotation_mode = 'XYZ'
    pb['RightArm'].rotation_euler = (math.radians(-60), 0, math.radians(-40))
    pb['LeftArm'].rotation_euler = (math.radians(-70), 0, math.radians(30))
    for b in ('RightForeArm', 'LeftForeArm', 'LeftUpLeg', 'RightLeg', 'Spine1'):
        pb[b].rotation_mode = 'XYZ'
    pb['RightForeArm'].rotation_euler = (math.radians(-90), 0, 0)
    pb['LeftForeArm'].rotation_euler = (math.radians(-100), 0, 0)
    pb['LeftUpLeg'].rotation_euler = (math.radians(-35), 0, 0)
    pb['RightLeg'].rotation_euler = (math.radians(40), 0, 0)
    pb['Spine1'].rotation_euler = (math.radians(10), 0, 0)
    cam.location, cam.rotation_euler = (2.8, -2.8, z), (math.radians(90), 0, math.radians(45))
    sc.render.filepath = str(out_dir / 'rig-posed.png')
    bpy.ops.render.render(write_still=True)
    for b in pb:
        b.rotation_euler = (0, 0, 0)
        b.rotation_quaternion = (1, 0, 0, 0)


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def prepared(a, out_dir: Path, height: float):
    """the cut, reduced, placed and baked mesh; cached in prepared.blend (the slow part), --fresh redoes it"""
    cache = out_dir / 'prepared.blend'
    if cache.exists() and not a.fresh:
        bpy.ops.wm.open_mainfile(filepath=str(cache))
        return bpy.data.objects[a.id]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = import_mesh(path(a.model))
    body.name = a.id
    if a.keep_x:
        lo, hi = (float(x) for x in a.keep_x.split(','))
        keep_x(body, lo, hi)
    if a.keep_uvs:
        decimate(body, a.tris)
        place(body, height)
        own_textures(body, a.texture)
    else:
        source = body.copy()
        source.data = body.data.copy()
        bpy.context.scene.collection.objects.link(source)
        decimate(body, a.tris)
        place(body, height, source)
        bake(body, source, a.texture, out_dir)
        bpy.data.objects.remove(source, do_unlink=True)
    for n in body.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE':
            n.image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(cache), compress=True)
    return body


def main():
    a = parse()
    out_dir = ROOT / 'assets-src' / a.id / 'generated'
    out_dir.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / 'src' / 'sim' / 'data' / f'{a.id}.json').read_text(encoding='utf-8'))
    height = data['height'] / 100
    body = prepared(a, out_dir, height)
    bones = fit_bones(body, height)
    arm = build_armature(bones, height)
    arm.name = a.id.split('-')[0].capitalize()
    skin(arm, body, height)
    paint_regions(arm, body, height)
    render(arm, out_dir, height)

    out = ROOT / 'public' / 'models'
    glb = out / f'{a.id}.glb'
    for o in bpy.context.view_layer.objects:
        o.select_set(o in (arm, body))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_skins=True,
                              export_animations=False, export_yup=True, export_image_format='JPEG',
                              export_jpeg_quality=80, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    manifest = {
        'id': a.id, 'file': f'models/{a.id}.glb', 'height': height, 'triangles': triangles(body),
        'bones': len(arm.data.bones), 'cloth': [c[0] for c in tpl.CLOTH], 'facing': '+Z',
        'source': f'tools/blender/rig_generated.py from {Path(a.model).name}', 'bytes': glb.stat().st_size,
    }
    (out / f'{a.id}.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
