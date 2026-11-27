"""Shared mesh helpers and materials for the living-room build."""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

scene = bpy.context.scene
OBJ = bpy.data.objects

# ---------------------------------------------------------------- helpers

def material(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return mat


def remove(name):
    ob = OBJ.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)


def box_uv(bm, scale=1.0):
    """World-scaled box projection: 1 UV unit = 1/scale metre."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co[a] * scale, loop.vert.co[b] * scale)


def planar_uv(bm, axes=(0, 2)):
    """0..1 UVs across the mesh bounds on two axes (e.g. a poster or grille face)."""
    uv = bm.loops.layers.uv.verify()
    a, b = axes
    lo = [min(v.co[i] for v in bm.verts) for i in range(3)]
    hi = [max(v.co[i] for v in bm.verts) for i in range(3)]
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = ((co[a] - lo[a]) / max(hi[a] - lo[a], 1e-6),
                           (co[b] - lo[b]) / max(hi[b] - lo[b], 1e-6))


def finish(name, bm, mat, smooth_angle=35, parent=None, uv="box", uv_scale=1.0):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if uv == "box":
        box_uv(bm, uv_scale)
    elif uv:
        planar_uv(bm, uv)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def rbox(name, size, center, mat, bevel=0.0, seg=3, rot=(0, 0, 0), **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel, offset_type="OFFSET",
                        segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
    m = Matrix.Translation(Vector(center)) @ Euler(rot).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts[:])
    return finish(name, bm, mat, **kw)


def cylinder(name, r1, r2, depth, center, mat, seg=32, rot=(0, 0, 0), bevel=0.0, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
    if bevel > 0:
        caps = [e for e in bm.edges if not e.is_manifold or abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=caps, offset=bevel, offset_type="OFFSET", segments=2,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    m = Matrix.Translation(Vector(center)) @ Euler(rot).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts[:])
    return finish(name, bm, mat, **kw)


def loft(name, rect_a, rect_b, mat, bevel=0.0, cap_a=True, **kw):
    """Joins two rectangles (lists of 4 corners) into a closed tapered solid."""
    bm = bmesh.new()
    va = [bm.verts.new(c) for c in rect_a]
    vb = [bm.verts.new(c) for c in rect_b]
    if cap_a:
        bm.faces.new(va)
    bm.faces.new(list(reversed(vb)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new([va[i], vb[i], vb[j], va[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel, offset_type="OFFSET",
                        segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    return finish(name, bm, mat, **kw)


def rect_xz(cx, y, cz, w, h):
    return [Vector((cx - w / 2, y, cz - h / 2)), Vector((cx + w / 2, y, cz - h / 2)),
            Vector((cx + w / 2, y, cz + h / 2)), Vector((cx - w / 2, y, cz + h / 2))]


def ring_frame(name, outer, inner, y0, depth, cz, mat, bevel=0.01):
    """Rectangular frame (outer w,h / inner w,h) extruded along +Y from y0."""
    bm = bmesh.new()
    def ring(y):
        o = [bm.verts.new(c) for c in rect_xz(0, y, cz, *outer)]
        i = [bm.verts.new(c) for c in rect_xz(0, y, cz, *inner)]
        return o, i
    fo, fi = ring(y0)
    bo, bi = ring(y0 + depth)
    for k in range(4):
        j = (k + 1) % 4
        bm.faces.new([fo[k], fo[j], fi[j], fi[k]])
        bm.faces.new([bo[k], bi[k], bi[j], bo[j]])
        bm.faces.new([fo[k], bo[k], bo[j], fo[j]])
        bm.faces.new([fi[k], fi[j], bi[j], bi[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel, offset_type="OFFSET",
                    segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    return finish(name, bm, mat)


def tube(name, points, radius, mat, res=12):
    cu = bpy.data.curves.new(name + "_curve", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.resolution_u = res
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.clear()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def world(ob, local):
    bpy.context.view_layer.update()
    return ob.matrix_world @ Vector(local)


# ---------------------------------------------------------------- materials

M = {
    "oak": material("Floor_Oak", (0.36, 0.22, 0.12), 0.55),
    "wall": material("Wall_Paint", (0.55, 0.52, 0.47), 0.9),
    "skirting": material("Baseboard_Paint", (0.62, 0.6, 0.56), 0.6),
    "rug": material("Rug_Fabric", (0.12, 0.09, 0.08), 0.95),
    "walnut": material("Wood_Walnut", (0.13, 0.07, 0.04), 0.5),
    "brass": material("Brass", (0.75, 0.56, 0.3), 0.32, 1.0),
    "tv_shell": material("TV_Shell", (0.018, 0.019, 0.021), 0.42),
    "tv_bezel": material("TV_Bezel", (0.03, 0.031, 0.034), 0.5),
    "tv_grille": material("TV_Grille", (0.012, 0.012, 0.013), 0.7),
    "tv_silver": material("TV_Silver", (0.6, 0.61, 0.63), 0.3, 1.0),
    "tv_led": material("TV_StandbyLED", (0.9, 0.05, 0.04), 0.3, emit=(1.0, 0.08, 0.05), emit_strength=2.0),
    "recess": bpy.data.materials["CRT_RecessBlack"],
    "case_spine": material("Case_Spine", (0.012, 0.012, 0.013), 0.35),
    "case_clear": material("Case_Clear", (0.75, 0.77, 0.8), 0.12),
    "case_label": material("Case_Label", (0.7, 0.7, 0.68), 0.6),
    "disc": material("Disc_Black", (0.02, 0.02, 0.025), 0.15, 0.6),
    "lamp_shade": material("Lamp_Shade", (0.95, 0.82, 0.6), 0.8, emit=(1.0, 0.72, 0.42), emit_strength=3.0),
    "lamp_metal": material("Lamp_Metal", (0.08, 0.08, 0.085), 0.35, 0.8),
    "ceramic": material("Pot_Ceramic", (0.62, 0.36, 0.24), 0.65),
    "soil": material("Pot_Soil", (0.06, 0.04, 0.03), 1.0),
    "leaf": material("Plant_Leaf", (0.07, 0.2, 0.08), 0.55),
    "stem": material("Plant_Stem", (0.18, 0.2, 0.08), 0.6),
    "frame": material("Frame_Black", (0.02, 0.02, 0.02), 0.45),
    "poster_a": material("Poster_A", (0.05, 0.05, 0.06), 0.7),
    "poster_b": material("Poster_B", (0.2, 0.12, 0.2), 0.7),
    "window_frame": material("Window_Frame", (0.75, 0.74, 0.7), 0.55),
    "window_night": material("Window_Night", (0.02, 0.03, 0.08), 1.0, emit=(0.05, 0.08, 0.2), emit_strength=1.0),
    "blind": material("Blind_Slat", (0.7, 0.68, 0.62), 0.6),
    "can": material("Soda_Can", (0.7, 0.12, 0.1), 0.3, 0.9),
    "can_top": material("Soda_Top", (0.75, 0.75, 0.77), 0.25, 1.0),
    "magazine": material("Magazine", (0.2, 0.35, 0.6), 0.5),
    "cushion": material("Cushion_Fabric", (0.22, 0.26, 0.3), 0.95),
    "cable": bpy.data.materials["Cable_MatteRubber"],
    "body_grey": bpy.data.materials["PS1_BodyGrey"],
    "accent_grey": bpy.data.materials["PS1_AccentGrey"],
}

