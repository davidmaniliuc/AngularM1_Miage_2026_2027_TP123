"""Console placement, PS1 controller shell (buttons come from the base model) and cables.

Executed by build_living_room.py in a shared namespace (helpers, materials M,
layout constants and base objects are already defined)."""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------- console + controller on the rug

console = OBJ["PS1_Console"]
console.location = (-0.12, -0.02, RUG_TOP)
console.rotation_mode = "XYZ"
console.rotation_euler = (0, 0, math.radians(6))
pad = OBJ["PS1_Controller"]
pad.location = (0.2, -0.46, RUG_TOP + 0.0016)
pad.rotation_mode = "XYZ"
pad.rotation_euler = (0, 0, math.radians(-14))
OBJ["Ctrl_DPadDish"].data.materials[0] = M["accent_grey"]

# new controller shell (metaballs, then flat-topped)
mb = bpy.data.metaballs.new("PadMeta")
mb.resolution = mb.render_resolution = 0.0011
mb.threshold = 0.6


def mball(t, co, r, sx=1, sy=1, sz=1, stiff=2.0):
    e = mb.elements.new(type=t)
    e.co, e.radius, e.stiffness = co, r, stiff
    e.size_x, e.size_y, e.size_z = sx, sy, sz


def mcapsule(p0, p1, r, stiff=1.8):
    a, b = Vector(p0), Vector(p1)
    e = mb.elements.new(type="CAPSULE")
    e.co, e.radius, e.stiffness = (a + b) / 2, r, stiff
    e.size_x = (b - a).length / 2
    e.rotation = Vector((1, 0, 0)).rotation_difference((b - a).normalized())


for sx in (-1, 1):
    mball("ELLIPSOID", (sx * 0.044, 0.014, 0.012), 0.0345, 1.0, 1.0, 0.46)
    mball("ELLIPSOID", (sx * 0.043, 0.036, 0.0115), 0.027, 0.95, 0.7, 0.45)
    mcapsule((sx * 0.046, 0.0, 0.0145), (sx * 0.062, -0.038, 0.0115), 0.0205)
    mcapsule((sx * 0.062, -0.038, 0.0115), (sx * 0.072, -0.061, 0.0085), 0.0175)
mball("CUBE", (0, 0.02, 0.0125), 0.013, 0.03, 0.012, 0.0045, stiff=1.8)
mobj = bpy.data.objects.new("PadMetaObj", mb)
scene.collection.objects.link(mobj)
bpy.context.view_layer.update()
me = bpy.data.meshes.new_from_object(mobj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
bpy.data.objects.remove(mobj, do_unlink=True)
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0002)
for _ in range(6):
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
for v in bm.verts:
    v.co.z = min(v.co.z, 0.0246)
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
me.materials.append(M["body_grey"])
body = bpy.data.objects.new("Ctrl_Body", me)
scene.collection.objects.link(body)
body.parent = pad
# flat-topped pucks and bridge so the face discs sit flush, like the real pad
for sx in (-1, 1):
    cylinder(f"Ctrl_PodShell_{'L' if sx < 0 else 'R'}", 0.0262, 0.0298, 0.0215, (sx * 0.044, 0.014, 0.0139),
             M["body_grey"], seg=64, bevel=0.0035, parent=pad, uv=None)
rbox("Ctrl_BridgeShell", (0.062, 0.041, 0.0205), (0, 0.0185, 0.0143), M["body_grey"], bevel=0.005, seg=4,
     parent=pad, uv=None)
for n in ("Btn_L1", "Btn_L2", "Btn_R1", "Btn_R2"):
    OBJ[n].location.y -= 0.002

# controller cable: from the pad's top edge, across the rug, into port 1
bpy.context.view_layer.update()
g = world(pad, (0, 0.047, 0.012))
plug = world(console, (-0.058, -0.134, 0.02))
cz = RUG_TOP + 0.0025
tube("PS1_ControllerCable", [
    g, world(pad, (0.004, 0.075, cz - pad.location.z)),
    Vector((g.x + 0.09, g.y + 0.1, cz)), Vector((g.x - 0.02, g.y + 0.22, cz)),
    Vector((plug.x + 0.07, plug.y - 0.09, cz)), Vector((plug.x + 0.005, plug.y - 0.035, cz + 0.004)), plug,
], 0.0021, M["cable"])
# AV cable from the console's back, under the cabinet
rear = world(console, (0.03, 0.096, 0.022))
tube("PS1_AVCable", [
    rear, rear + Vector((0.005, 0.04, -0.012)), Vector((rear.x + 0.05, cab_front - 0.12, RUG_TOP + 0.003)),
    Vector((rear.x + 0.12, cab_front + 0.05, 0.004)), Vector((rear.x + 0.16, CAB_Y + 0.15, 0.004)),
], 0.0024, M["cable"])

