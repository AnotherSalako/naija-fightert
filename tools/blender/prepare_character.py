"""Turn a rigged character (an image-to-3D model rigged in Mixamo, or any GLB/FBX with a skeleton)
into the game's GLB (spec 4.1 steps 3-6).

Headless:
  blender -b --factory-startup --python tools/blender/prepare_character.py -- \
      --id egbon-razak --model assets-src/egbon-razak/mixamo/egbon-rigged-tpose.fbx \
      [--anims assets-src/egbon-razak/mixamo/anims] [--out public/models] [--facing -Y]

It:
  1. imports the model and every animation file in --anims (Mixamo FBX; the file name, less an
     "anim-" prefix, becomes the clip name: anim-jab.fbx -> "jab"); the rigged file's own one-pose
     action is dropped;
  2. strips Mixamo's "mixamorig:" prefix so bones are named Hips, Spine, LeftArm ... as the game expects;
  3. scales it to the character's height from src/sim/data/<id>.json, stands it on the floor at the
     origin and turns it to face -Y (which is +Z in three.js, like build_egbon.py's model);
  4. reduces it to at most --tris triangles (25,000); keeps its colour map (--texture px, 2048) and
     normal map (half that) and drops metallic / roughness, which the toon shading does not read;
  5. adds cloth bones from assets-src/<id>/cloth.json, e.g. [{"name": "cloth_trouser_L", "parent": "LeftLeg"}];
  6. paints the clothing regions the game's P2 colour swap reads (tools/blender/rig_generated.py);
  7. makes every clip play in place (the sim moves the fighter, not the animation), and finds each
     clip's moment of contact (the hand or foot furthest out), so the game can line it up with a move's
     first active frame;
  8. exports <out>/<id>.glb and <out>/<id>.json (clips: name -> duration and contact, in seconds).
Then list the model in MODELS in src/render/skinned.ts (if it is not there yet).
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import mathutils

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rig_generated import own_textures, paint_regions  # noqa: E402

# clips whose hips must not move at all: the sim already lifts the fighter through a jump
STILL_HIPS = {'jump'}
OUT_FPS = 60


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--id', required=True)
    p.add_argument('--model', required=True)
    p.add_argument('--anims', default='')
    p.add_argument('--out', default='public/models')
    p.add_argument('--tris', type=int, default=50000)
    p.add_argument('--texture', type=int, default=2048)
    p.add_argument('--normal', type=int, default=2048, help='normal map size (px)')
    p.add_argument('--facing', default='-Y', choices=['-Y', '+Y', '+X', '-X'],
                   help='the way the imported model faces in Blender (Mixamo and most generators: -Y)')
    return p.parse_args(argv)


def path(p: str) -> Path:
    q = Path(p)
    return q if q.is_absolute() else ROOT / q


def import_file(f: Path) -> list:
    before = set(bpy.data.objects)
    ext = f.suffix.lower()
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(f))
    elif ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=str(f))
    else:
        raise SystemExit(f'cannot import {f} (use .fbx, .glb or .gltf)')
    return [o for o in bpy.data.objects if o not in before]


def fcurves(act) -> list:
    """an action's F-curves (Blender 5 keeps them in layered channel bags)"""
    if hasattr(act, 'fcurves'):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def bounds(meshes):
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = -lo
    for m in meshes:
        for c in m.bound_box:
            w = m.matrix_world @ mathutils.Vector(c)
            lo = mathutils.Vector([min(a, b) for a, b in zip(lo, w)])
            hi = mathutils.Vector([max(a, b) for a, b in zip(hi, w)])
    return lo, hi


def triangles(meshes) -> int:
    n = 0
    for m in meshes:
        m.data.calc_loop_triangles()
        n += len(m.data.loop_triangles)
    return n


def limit_weights(m, most: int) -> None:
    """Keep each vertex's `most` strongest bone weights and renormalise them to sum to 1."""
    bones = {g.index for g in m.vertex_groups}
    worst = 0
    for v in m.data.vertices:
        # copied out first: the element references go stale once a group is removed from the vertex
        gs = sorted(((g.group, g.weight) for g in v.groups if g.group in bones and g.weight > 0), key=lambda g: -g[1])
        worst = max(worst, len(gs))
        keep, drop = gs[:most], gs[most:]
        for group, _ in drop:
            m.vertex_groups[group].remove([v.index])
        total = sum(w for _, w in keep)
        if total > 0:
            for group, w in keep:
                m.vertex_groups[group].add([v.index], w / total, 'REPLACE')
    print(f'weights: at most {worst} per vertex before, {most} after, all normalised')


def lighten_crotch(m, height: float, passes: int = 60) -> None:
    """Image generators bake shadow into the colour map; between the legs it shows as a dark grey-brown
    patch on the trousers. The texels of the crotch / inner-thigh faces that are much darker than the
    trouser around them are filled in from their lighter neighbours (a small diffusion inpaint), so
    the print carries on instead of a flat patch."""
    import numpy as np
    mat = m.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    link = bsdf.inputs['Base Color'].links[0] if bsdf.inputs['Base Color'].links else None
    if not link or link.from_node.type != 'TEX_IMAGE':
        return
    img = link.from_node.image
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    k = height / 1.82
    names = {g.index: g.name for g in m.vertex_groups}
    legs = {'Hips', 'LeftUpLeg', 'RightUpLeg'}
    world = [m.matrix_world @ v.co for v in m.data.vertices]
    uv = m.data.uv_layers.active.data
    mask = np.zeros((H, W), dtype=bool)
    for poly in m.data.polygons:
        ps = [world[i] for i in poly.vertices]
        if not all(abs(p.x) < 0.2 * k and 0.4 * k < p.z < 1.0 * k for p in ps):
            continue
        best = max(m.data.vertices[poly.vertices[0]].groups, key=lambda g: g.weight, default=None)
        if best is None or names.get(best.group) not in legs:
            continue
        pts = [(uv[li].uv.x * W, uv[li].uv.y * H) for li in poly.loop_indices]
        for t in range(1, len(pts) - 1):
            (ax, ay), (bx, by), (cx, cy) = pts[0], pts[t], pts[t + 1]
            x0, x1 = int(max(0, min(ax, bx, cx))), int(min(W - 1, max(ax, bx, cx) + 1))
            y0, y1 = int(max(0, min(ay, by, cy))), int(min(H - 1, max(ay, by, cy) + 1))
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(d) < 1e-9:
                continue
            l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
            l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
            inside = (l1 >= -0.01) & (l2 >= -0.01) & (1 - l1 - l2 >= -0.01)
            mask[y0:y1 + 1, x0:x1 + 1] |= inside
    if not mask.any():
        print('crotch: no faces found')
        return
    lum = px[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    dark = mask & (lum < np.median(lum[mask]) * 0.72)
    fill = dark.copy()
    rgb = px[..., :3]
    for _ in range(passes):
        if not fill.any():
            break
        known = ~fill
        acc = np.zeros_like(rgb)
        cnt = np.zeros((H, W), dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            shifted = np.roll(np.roll(rgb, dy, 0), dx, 1)
            ok = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += shifted * ok[..., None]
            cnt += ok
        grow = fill & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        fill &= ~grow
    px[..., :3] = rgb
    img.pixels[:] = px.ravel()
    img.update()
    print(f'crotch: {int(mask.sum())} texels in the region, {int(dark.sum())} dark ones filled from the trouser around them')


def in_place(arm, act, name: str) -> None:
    """Hold the hips over the origin: their location keys keep only the vertical part (none at all for
    STILL_HIPS clips). Which local axis is vertical depends on the hips bone's rest orientation."""
    rest = (arm.matrix_world.to_3x3() @ arm.data.bones['Hips'].matrix_local.to_3x3()).normalized()
    vertical = max(range(3), key=lambda i: abs(rest.col[i].z))
    for fc in fcurves(act):
        # hand-keyed clips (hk-*) are authored around the fighter's spot and keep their hips travel (a step-in)
        if name.startswith('hk-'):
            return
        if fc.data_path == 'pose.bones["Hips"].location' and (fc.array_index != vertical or name in STILL_HIPS):
            first = fc.keyframe_points[0].co[1] if fc.keyframe_points else 0.0
            for k in fc.keyframe_points:
                k.co[1] = k.handle_left[1] = k.handle_right[1] = first


def bake_onto(arm, src, act, name: str):
    """A new action on `arm` that reproduces `src` playing `act`, frame by frame, in armature space."""
    sc = bpy.context.scene
    srcb = {b.name.split(':')[-1]: b for b in src.pose.bones}
    new = bpy.data.actions.new(name + '__baked')
    arm.animation_data_create()
    keep = arm.animation_data.action
    arm.animation_data.action = new
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    def depth(b):
        d = 0
        while b.parent:
            b, d = b.parent, d + 1
        return d
    levels: dict = {}
    for pb in arm.pose.bones:
        levels.setdefault(depth(pb.bone), []).append(pb)
    to_arm = arm.matrix_world.inverted() @ src.matrix_world
    start, end = (int(round(x)) for x in act.frame_range)
    for fr in range(start, end + 1):
        sc.frame_set(fr)
        for lvl in sorted(levels):
            for pb in levels[lvl]:
                s = srcb.get(pb.name.split(':')[-1])
                if s:
                    pb.matrix = to_arm @ s.matrix
            bpy.context.view_layer.update()
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=fr - start + 1)
        arm.pose.bones['Hips'].keyframe_insert('location', frame=fr - start + 1)
    arm.animation_data.action = keep
    new.use_fake_user = True
    return new


def contact(src, act, fps: float) -> tuple[float, float]:
    """Seconds into the clip when a hand (from the chest) or a foot (from the hips) has reached out
    furthest beyond where it started: the moment a strike lands. Measured from each limb's own start,
    since a fighting stance already holds the feet far from the hips. Measured on the clip's own
    imported skeleton, which plays it as is."""
    start, end = (int(round(x)) for x in act.frame_range)
    pb = {b.name.split(':')[-1]: b for b in src.pose.bones}
    mw = src.matrix_world

    def reaches():
        chest, hips = mw @ pb['Spine2'].head, mw @ pb['Hips'].head
        return [(mw @ pb[f'{s}Hand'].head - chest).length for s in ('Left', 'Right')] + \
               [(mw @ pb[f'{s}Foot'].head - hips).length for s in ('Left', 'Right')]

    bpy.context.scene.frame_set(start)
    first = reaches()
    best, when = -1.0, start
    lowest, low_at = 1e9, start
    for fr in range(start, end + 1):
        bpy.context.scene.frame_set(fr)
        out = max(r - r0 for r, r0 in zip(reaches(), first))
        if out > best:
            best, when = out, fr
        hips = (mw @ pb['Hips'].head).z
        if hips < lowest - 1e-4:
            lowest, low_at = hips, fr
    return round((when - start) / fps, 3), round((low_at - start) / fps, 3)


def main() -> None:
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = import_file(path(a.model))
    arm = next((o for o in objs if o.type == 'ARMATURE'), None)
    meshes = [o for o in objs if o.type == 'MESH']
    if not arm:
        raise SystemExit('the model has no skeleton: rig it first (Mixamo, see DELE_TODO.md)')
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)  # the rigged file's own T-pose "animation"
    for b in arm.data.bones:
        b.name = b.name.split(':')[-1]
    for m in meshes:
        for g in m.vertex_groups:
            g.name = g.name.split(':')[-1]

    # clips from separate files: same skeleton, so the actions can be shared
    clips = []
    info = {}
    src_fps: dict = {}
    folder = path(a.anims) if a.anims else None
    if folder and folder.exists():
        for f in sorted(list(folder.glob('*.fbx')) + list(folder.glob('*.glb'))):
            new = import_file(f)
            src = next((o for o in new if o.type == 'ARMATURE'), None)
            act = src.animation_data.action if src and src.animation_data else None
            if act and f.stem.startswith('anim-hk-'):
                # hand-keyed clips come from another export of the rig whose bone rests differ: copy the
                # pose bone by bone (armature space) onto this skeleton instead of sharing the keys
                act = bake_onto(arm, src, act, f.stem.removeprefix('anim-'))
            if act:
                act.name = f.stem.removeprefix('anim-')
                act.use_fake_user = True
                clips.append(act)
                fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
                src_fps[act.name] = fps
                hit, low = contact(src, act, fps)
                info[act.name] = {'duration': round((act.frame_range[1] - act.frame_range[0]) / fps, 3),
                                  'contact': hit, 'low': low}
            for o in new:
                bpy.data.objects.remove(o, do_unlink=True)
    for act in clips:
        for fc in fcurves(act):
            # Mixamo names the channels "mixamorig:Hips" etc.; keep them matching the renamed bones
            fc.data_path = fc.data_path.replace('mixamorig:', '')
        in_place(arm, act, act.name)
        # every clip on one 60 fps timeline (Mixamo files are 30 fps, hand-keyed ones 60), so the export
        # samples each at its own speed and a hand-keyed hit frame stays a whole frame
        k = OUT_FPS / src_fps.get(act.name, OUT_FPS)
        if abs(k - 1) > 1e-6:
            start = act.frame_range[0]
            for fc in fcurves(act):
                for kp in fc.keyframe_points:
                    for attr in ('co', 'handle_left', 'handle_right'):
                        v = getattr(kp, attr)
                        v[0] = start + (v[0] - start) * k
    bpy.context.scene.render.fps, bpy.context.scene.render.fps_base = OUT_FPS, 1.0

    # size, floor, facing
    data = json.loads((ROOT / 'src' / 'sim' / 'data' / f'{a.id}.json').read_text(encoding='utf-8'))
    height = data['height'] / 100
    bpy.context.view_layer.update()
    lo, hi = bounds(meshes)
    k = height / max(1e-6, hi.z - lo.z)
    arm.scale = arm.scale * k
    arm.rotation_euler.z += math.radians({'-Y': 0, '+Y': 180, '+X': -90, '-X': 90}[a.facing])
    bpy.context.view_layer.update()
    lo, hi = bounds(meshes)
    arm.location -= mathutils.Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.context.view_layer.update()

    # budgets
    total = triangles(meshes)
    if total > a.tris:
        for m in meshes:
            mod = m.modifiers.new('Decimate', 'DECIMATE')
            mod.ratio = a.tris / total * 0.98
            with bpy.context.temp_override(object=m, active_object=m, selected_objects=[m]):
                bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
                bpy.ops.object.modifier_apply(modifier=mod.name)
    for m in meshes:
        own_textures(m, a.texture, a.normal, rough_size=1024)

    # cloth bones: copies of their parent bone, weighted to the loose part of the parent's region
    cloth_file = ROOT / 'assets-src' / a.id / 'cloth.json'
    cloth = json.loads(cloth_file.read_text()) if cloth_file.exists() else []
    made = []
    if cloth:
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        for c in cloth:
            pe = arm.data.edit_bones.get(c['parent'])
            if not pe:
                print(f'cloth: no bone {c["parent"]}, skipped')
                continue
            eb = arm.data.edit_bones.new(c['name'])
            eb.head, eb.tail, eb.roll, eb.parent = pe.head.lerp(pe.tail, 0.35), pe.tail.copy(), pe.roll, pe
            made.append(c)
        bpy.ops.object.mode_set(mode='OBJECT')
        mw = arm.matrix_world
        for c in made:
            b = arm.data.bones[c['name']]
            head, tail = mw @ b.head_local, mw @ b.tail_local
            axis = tail - head
            for m in meshes:
                src = m.vertex_groups.get(c['parent'])
                if not src:
                    continue
                dst = m.vertex_groups.new(name=c['name'])
                for v in m.data.vertices:
                    w = next((g.weight for g in v.groups if g.group == src.index), 0.0)
                    if w < 0.05:
                        continue
                    p = m.matrix_world @ v.co
                    t = max(0.0, min(1.0, (p - head).dot(axis) / axis.length_squared))
                    d = (p - (head + axis * t)).length
                    loose = max(0.0, min(1.0, (d - c.get('radius', 0.07)) / 0.04)) * max(0.0, (t - 0.3) / 0.7)
                    if loose > 0:
                        dst.add([v.index], w * loose, 'REPLACE')
                        src.add([v.index], w * (1 - loose), 'REPLACE')
    for m in meshes:
        paint_regions(arm, m, height)
        lighten_crotch(m, height)
        # glTF skins carry at most 4 influences per vertex: keep the strongest 4 and renormalise, so the
        # exporter drops nothing and no vertex is left under-weighted (cracks at the joints)
        limit_weights(m, 4)

    # every clip on its own NLA track, so the exporter writes them all
    arm.animation_data_create()
    for act in clips:
        tr = arm.animation_data.nla_tracks.new()
        tr.name = act.name
        strip = tr.strips.new(act.name, int(act.frame_range[0]), act)
        if hasattr(strip, 'action_slot') and act.slots:
            strip.action_slot = act.slots[0]
    arm.animation_data.action = None

    out = path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    glb = out / f'{a.id}.glb'
    for o in bpy.context.view_layer.objects:
        o.select_set(o == arm or o.parent == arm or o in meshes)
    # WebP textures and Draco geometry keep a full-detail fighter (50k triangles, 2K maps) under 3 MB;
    # the game's GLTFLoader decodes Draco with the decoder in public/draco/
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_skins=True,
                              export_animation_mode='NLA_TRACKS', export_force_sampling=False, export_yup=True, export_image_format='WEBP',
                              export_image_quality=85, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=12, export_draco_color_quantization=10,
                              export_draco_generic_quantization=12)
    manifest = {
        'id': a.id, 'file': f'models/{a.id}.glb', 'height': height, 'triangles': triangles(meshes),
        'bones': len(arm.data.bones), 'cloth': [c['name'] for c in made], 'clips': info,
        'facing': '+Z', 'source': f'tools/blender/prepare_character.py from {Path(a.model).name}', 'bytes': glb.stat().st_size,
    }
    (out / f'{a.id}.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
