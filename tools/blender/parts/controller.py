"""Console placement, PS1 controller shell (SCPH-1080; buttons come from the base model) and cables.

Executed by build_living_room.py in a shared namespace (helpers, materials M,
layout constants and base objects are already defined)."""

import math
from types import SimpleNamespace

import bmesh
import bpy
from mathutils import Vector

# ---------------------------------------------------------------- console + controller on the rug

console = OBJ["PS1_Console"]
console.location = (-0.12, -0.02, RUG_TOP)
console.rotation_mode = "XYZ"
console.rotation_euler = (0, 0, math.radians(6))

# the base model's flat discs and panels sit inside the new shell
for n in ("Ctrl_DPadDish", "Ctrl_PodFace_L", "Ctrl_PodFace_R", "Ctrl_PodTrim_L", "Ctrl_PodTrim_R",
          "Ctrl_CenterPanel", "Ctrl_CenterPanelInlay"):
    remove(n)

# Pad frame: +X right, +Y away from the player (shoulder buttons), Z up.
# Pod centres, button heights and the shoulder slot match the Btn_* meshes of the base model.
PAD = SimpleNamespace(
    pod_x=0.044, pod_y=0.014, pod_r=0.026,
    top=0.0288,                 # flat pod tops: D-pad ~1.4 mm, face buttons ~2.3 mm proud
    pod_edge=0.0048, pod_bottom=0.0055,
    well_floor=0.026,           # Btn_* bottoms rest here
    dpad_arm=0.0128, dpad_reach=0.0205,
    face_ring=0.0148, seat_r=0.0077,
    bridge_y=(0.002, 0.039), bridge_top=0.0262, bridge_bottom=0.0075, bridge_round=0.0055,
    grip_root=(0.044, 0.014), grip_len=0.057, grip_splay=math.radians(20),
    grip_w=(0.0185, 0.014), grip_h=(0.0118, 0.0108), grip_tip_round=0.013, grip_drop=0.014,
    shoulder_w=0.04, shoulder_y=(0.026, 0.0485), shoulder_z=(0.0058, 0.0268),
    grommet_y=0.046,
    # the drooping grips lift the front: lying on the rug, the pad rests on its grip tips and back edge
    rest_tilt=math.radians(-7),
)
SEG = 72

pad = OBJ["PS1_Controller"]
pad.location = (0.2, -0.46, RUG_TOP)
pad.rotation_mode = "XYZ"
pad.rotation_euler = (PAD.rest_tilt, 0, math.radians(-14))


def _lathe(name, profile, cx, cy, mat, seg=SEG):
    """Solid of revolution around the vertical axis at (cx, cy); profile is (radius, z) from top centre down."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((cx, cy, z))])
            continue
        rings.append([bm.verts.new((cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z))
                      for i in range(seg)])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(a) == 1:
                bm.faces.new([a[0], b[i], b[j]])
            elif len(b) == 1:
                bm.faces.new([a[i], b[0], a[j]])
            else:
                bm.faces.new([a[i], b[i], b[j], a[j]])
    return finish(name, bm, mat, smooth_angle=50, parent=pad, uv_scale=40)


def _prism(name, outline, z0, z1, mat):
    """Vertical prism over a 2D outline (x, y), used for recess cutters and floor plates."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z1)) for x, y in outline]
    bm.faces.new(lo)
    bm.faces.new(list(reversed(hi)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
    return finish(name, bm, mat, smooth_angle=30, parent=pad, uv_scale=40)


def _cross_outline(cx, cy, arm, reach, corner=0.0012, k=3):
    """Plus-sign outline with rounded outer corners."""
    a, r = arm / 2, reach
    sharp = [(a, a), (a, r), (-a, r), (-a, a), (-r, a), (-r, -a), (-a, -a), (-a, -r), (a, -r), (a, -a), (r, -a), (r, a)]
    pts = []
    for n, (x, y) in enumerate(sharp):
        if abs(x) < r and abs(y) < r:
            pts.append((x, y))
            continue
        px, py = sharp[n - 1]
        a0 = math.atan2(-(x - px), y - py)  # outward normal of the incoming edge (CCW outline)
        ccx, ccy = x - math.copysign(corner, x), y - math.copysign(corner, y)
        pts.extend((ccx + corner * math.cos(a0 + math.pi / 2 * i / k), ccy + corner * math.sin(a0 + math.pi / 2 * i / k))
                   for i in range(k + 1))
    return [(cx + x, cy + y) for x, y in pts]


def _circle_outline(cx, cy, r, seg=32):
    return [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]


def _carve(ob, cutters):
    """Boolean-subtracts the cutter objects from ob, then deletes them and re-projects box UVs."""
    for c in cutters:
        mod = ob.modifiers.new("cut", "BOOLEAN")
        mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", c
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(me)
    box_uv(bm, 40)
    bm.to_mesh(me)
    bm.free()
    me.set_sharp_from_angle(angle=math.radians(50))
    me.name = ob.name


def _grip(name, sx):
    """Lofted grip: superellipse sections along a drooping axis that splays outward, closed by a dome."""
    root = Vector((sx * PAD.grip_root[0], PAD.grip_root[1], PAD.top - 0.0009 - PAD.grip_h[0]))
    heading = Vector((sx * math.sin(PAD.grip_splay), -math.cos(PAD.grip_splay), 0))
    n_len, n_around, n_dome, expo = 18, 40, 7, 2.5

    def centre(t):
        return root + heading * (PAD.grip_len * t) - Vector((0, 0, PAD.grip_drop * t ** 1.4))

    def ring(c, tangent, hw, hh):
        lat = tangent.cross(Vector((0, 0, 1))).normalized()
        up = lat.cross(tangent).normalized()
        pts = []
        for i in range(n_around):
            a = 2 * math.pi * i / n_around
            ca, sa = math.cos(a), math.sin(a)
            # superellipse: flatter flanks than a capsule, like the moulded grip
            x = math.copysign(abs(ca) ** (2 / expo), ca) * hw
            z = math.copysign(abs(sa) ** (2 / expo), sa) * hh
            pts.append(c + lat * x + up * z)
        return pts

    bm = bmesh.new()
    loops = []
    for i in range(n_len + 1):
        t = i / n_len
        tan = (centre(min(t + 0.01, 1)) - centre(max(t - 0.01, 0))).normalized()
        hw = PAD.grip_w[0] + (PAD.grip_w[1] - PAD.grip_w[0]) * t
        hh = PAD.grip_h[0] + (PAD.grip_h[1] - PAD.grip_h[0]) * t
        loops.append([bm.verts.new(p) for p in ring(centre(t), tan, hw, hh)])
    tan = (centre(1) - centre(0.98)).normalized()
    for k in range(1, n_dome + 1):
        th = math.pi / 2 * k / (n_dome + 1)
        c = centre(1) + tan * (PAD.grip_tip_round * math.sin(th))
        loops.append([bm.verts.new(p) for p in ring(c, tan, PAD.grip_w[1] * math.cos(th), PAD.grip_h[1] * math.cos(th))])
    pole = bm.verts.new(centre(1) + tan * PAD.grip_tip_round)
    for a, b in zip(loops[:-1], loops[1:]):
        for i in range(n_around):
            j = (i + 1) % n_around
            bm.faces.new([a[i], a[j], b[j], b[i]])
    last = loops[-1]
    for i in range(n_around):
        bm.faces.new([last[i], last[(i + 1) % n_around], pole])
    bm.faces.new(list(reversed(loops[0])))
    return finish(name, bm, M["body_grey"], smooth_angle=60, parent=pad, uv_scale=40)


body, well, dark = M["body_grey"], M["accent_grey"], bpy.data.materials["PS1_DarkRecess"]

for sx, side in ((-1, "L"), (1, "R")):
    cx = sx * PAD.pod_x
    e = PAD.pod_edge
    # flat top, rounded lip, then the wall tucks under like a bowl
    profile = [(0, PAD.top)] + [
        (PAD.pod_r - e + e * math.sin(math.pi / 2 * i / 5), PAD.top - e + e * math.cos(math.pi / 2 * i / 5)) for i in range(6)
    ] + [(PAD.pod_r + 0.0004, 0.019), (PAD.pod_r - 0.0008, 0.0125), (PAD.pod_r - 0.0045, 0.0078),
         (PAD.pod_r - 0.011, PAD.pod_bottom), (0, PAD.pod_bottom)]
    pod = _lathe(f"Ctrl_Pod_{side}", profile, cx, PAD.pod_y, body)
    # cut deeper than the floor plates so the plates alone show (no z-fighting with the cut floor)
    cut_floor, cut_top = PAD.well_floor - 0.0015, PAD.top + 0.003
    if side == "L":
        outline = _cross_outline(cx, PAD.pod_y, PAD.dpad_arm, PAD.dpad_reach)
        cutters = [_prism("cut", outline, cut_floor, cut_top, body)]
        _prism("Ctrl_DPadWell", _cross_outline(cx, PAD.pod_y, PAD.dpad_arm - 0.0002, PAD.dpad_reach - 0.0001),
               cut_floor, PAD.well_floor, well)
    else:
        seats = [(cx + dx * PAD.face_ring, PAD.pod_y + dy * PAD.face_ring) for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0))]
        cutters = [_prism("cut", _circle_outline(x, y, PAD.seat_r), cut_floor, cut_top, body) for x, y in seats]
        for k, (x, y) in enumerate(seats):
            _prism(f"Ctrl_FaceSeat_{k}", _circle_outline(x, y, PAD.seat_r - 0.0001), cut_floor, PAD.well_floor, well)
    _carve(pod, cutters)
    _grip(f"Ctrl_Grip_{side}", sx)
    # shoulder housing behind the pod; its flat back face carries the L1/L2 (R1/R2) slot
    sw, (sy0, sy1), (sz0, sz1) = PAD.shoulder_w, PAD.shoulder_y, PAD.shoulder_z
    rbox(f"Ctrl_Shoulder_{side}", (sw, sy1 - sy0, sz1 - sz0), (cx, (sy0 + sy1) / 2, (sz0 + sz1) / 2), body,
         bevel=0.008, seg=5, parent=pad, uv_scale=40)
    rbox(f"Ctrl_ShoulderSlot_{side}", (0.027, 0.001, 0.0175), (cx, sy1 + 0.0001, 0.0153), dark,
         bevel=0.0012, seg=2, parent=pad, uv=None)

(by0, by1) = PAD.bridge_y
rbox("Ctrl_Bridge", (2 * PAD.pod_x, by1 - by0, PAD.bridge_top - PAD.bridge_bottom),
     (0, (by0 + by1) / 2, (PAD.bridge_top + PAD.bridge_bottom) / 2), body,
     bevel=PAD.bridge_round, seg=5, parent=pad, uv_scale=40)

grommet = OBJ["Ctrl_CableGrommet"]
grommet.location.y = PAD.grommet_y

bpy.context.view_layer.update()
lowest = min((o.matrix_world @ v.co).z for o in pad.children if o.name.startswith("Ctrl_") for v in o.data.vertices)
pad.location.z += RUG_TOP + 0.0002 - lowest

# controller cable: from the grommet on the pad's back edge, across the rug, into port 1
bpy.context.view_layer.update()
g = world(pad, (0, PAD.grommet_y + 0.007, grommet.location.z))
plug = world(console, (-0.058, -0.134, 0.02))
cz = RUG_TOP + 0.0025
tube("PS1_ControllerCable", [
    g, world(pad, (0.004, PAD.grommet_y + 0.03, 0)).to_2d().to_3d() + Vector((0, 0, cz)),
    Vector((g.x + 0.09, g.y + 0.1, cz)), Vector((g.x - 0.02, g.y + 0.22, cz)),
    Vector((plug.x + 0.07, plug.y - 0.09, cz)), Vector((plug.x + 0.005, plug.y - 0.035, cz + 0.004)), plug,
], 0.0021, M["cable"])
# AV cable from the console's back, under the cabinet
rear = world(console, (0.03, 0.096, 0.022))
tube("PS1_AVCable", [
    rear, rear + Vector((0.005, 0.04, -0.012)), Vector((rear.x + 0.05, cab_front - 0.12, RUG_TOP + 0.003)),
    Vector((rear.x + 0.12, cab_front + 0.05, 0.004)), Vector((rear.x + 0.16, CAB_Y + 0.15, 0.004)),
], 0.0024, M["cable"])
