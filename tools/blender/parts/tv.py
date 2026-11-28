"""Living-room CRT TV (~25") built around the UV-mapped CRT_Screen glass of the base model.

Executed by build_living_room.py in a shared namespace (helpers, materials M,
layout constants and base objects are already defined)."""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------- local helpers


def _rr_loop(cx, cz, w, h, r, k=4, m=4):
    """Rounded-rectangle outline as (x, z) points. Always k+1 arc points per corner and m-1 inner
    points per straight side, so loops of different sizes have identical topology."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    corners = [(1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)]  # CCW seen from -Y? fixed below
    arcs = []
    for sx, sz, a0 in corners:
        ccx, ccz = cx + sx * (w / 2 - r), cz + sz * (h / 2 - r)
        arcs.append([(ccx + r * math.cos(math.radians(a0 + 90 * i / k)),
                      ccz + r * math.sin(math.radians(a0 + 90 * i / k))) for i in range(k + 1)])
    for n, arc in enumerate(arcs):
        pts.extend(arc)
        a, b = arc[-1], arcs[(n + 1) % 4][0]
        for i in range(1, m):
            t = i / m
            pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return pts


def _bridge(bm, loops, close_a=False, close_b=False):
    """Quad-strips consecutive vertex loops (lists of BMVerts)."""
    for la, lb in zip(loops[:-1], loops[1:]):
        n = len(la)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([la[i], la[j], lb[j], lb[i]])
    if close_a:
        bm.faces.new(loops[0])
    if close_b:
        bm.faces.new(list(reversed(loops[-1])))


def _loop_verts(bm, pts2d, y):
    return [bm.verts.new((x, y(x, z) if callable(y) else y, z)) for x, z in pts2d]


def _done(name, bm, mat, flip=False, smooth_angle=40, uv="box"):
    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return finish(name, bm, mat, smooth_angle=smooth_angle, uv=uv)


def _rod(name, p0, p1, radius, mat, seg=10):
    """Thin cylinder between two points."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    rot = d.to_track_quat("Z", "Y").to_euler()
    return cylinder(name, radius, radius, d.length, (a + b) / 2, mat, seg=seg, rot=rot)


# ---------------------------------------------------------------- dimensions

TV_W, TV_H = 0.68, 0.565
TV_FOOT = 0.014
TV_R = 0.032                        # front corner radius
tv_y0 = cab_front + 0.02
tv_bottom = CAB_H + TV_FOOT
tv_top = tv_bottom + TV_H
tv_cz = tv_bottom + TV_H / 2
OPEN_W, OPEN_H = 0.53, 0.40
open_cz = tv_top - 0.05 - OPEN_H / 2
SCREEN_W = 0.50
glass_y = tv_y0 + 0.022

M_PANEL = material("TV_Panel", (0.05, 0.052, 0.056), 0.5)
M_JACK_Y = material("TV_JackYellow", (0.85, 0.65, 0.05), 0.35)
M_JACK_W = material("TV_JackWhite", (0.8, 0.8, 0.78), 0.35)
M_JACK_R = material("TV_JackRed", (0.7, 0.06, 0.04), 0.35)

# ---------------------------------------------------------------- glass (re-used from the base model)

s = SCREEN_W / 0.36
for ob in (screen, backing):
    ob.scale = (s, s, s)
bpy.context.view_layer.update()
bb = [screen.matrix_world @ Vector(c) for c in screen.bound_box]
front_y = min(v.y for v in bb)
cz_now = sum(v.z for v in bb) / 8
cx_now = sum(v.x for v in bb) / 8
off = Vector((-cx_now, glass_y - front_y, open_cz - cz_now))
screen.location += off
backing.location += off
backing.scale = (s * 1.05, s, s * 1.05)
bpy.context.view_layer.update()


def glass_y_at(x, z):
    """World y of the curved glass front at (x, z), or None outside the glass."""
    inv = screen.matrix_world.inverted()
    o = inv @ Vector((x, tv_y0 - 0.2, z))
    d = (inv.to_3x3() @ Vector((0, 1, 0))).normalized()
    hit, loc, _, _ = screen.ray_cast(o, d)
    return (screen.matrix_world @ loc).y if hit else None


# ---------------------------------------------------------------- cabinet side profile

# Sections front to back as (y, width, height, centre z, corner radius). The moulded front cabinet keeps
# full size for FRONT_D (with a slight moulding draft), rounds over at its back edge, and the rear
# housing steps in by STEP per side before tapering to the tube neck.
RND = 0.012                         # front edge rounding
FRONT_D, DRAFT, BACK_R, STEP = 0.20, 0.004, 0.014, 0.03


def _inset(d, inset, lift=0.0, r=None):
    return (tv_y0 + d, TV_W - 2 * inset, TV_H - 2 * inset, tv_cz + lift, r if r else max(TV_R - inset, 0.012))


# lift=-DRAFT keeps the bottom flat on the feet while the top and sides take the draft
FRONT_SECTIONS = [_inset(RND, 0), _inset(FRONT_D - BACK_R, DRAFT, -DRAFT)] + [
    _inset(FRONT_D - BACK_R + BACK_R * math.sin(a), DRAFT + BACK_R * (1 - math.cos(a)), -DRAFT)
    for a in (math.radians(30), math.radians(60), math.radians(90))
]
REAR_SECTIONS = [
    _inset(FRONT_D - 0.003, STEP, 0, 0.035),
    _inset(FRONT_D + 0.008, STEP + 0.004, 0.002, 0.04),
    (tv_y0 + 0.28, TV_W - 0.12, TV_H - 0.11, tv_cz + 0.008, 0.055),
    (tv_y0 + 0.36, 0.44, 0.36, tv_cz + 0.014, 0.07),
    (tv_y0 + 0.425, 0.33, 0.27, tv_cz + 0.02, 0.08),
    (tv_y0 + 0.445, 0.28, 0.22, tv_cz + 0.022, 0.08),
]
SECTIONS = FRONT_SECTIONS + REAR_SECTIONS


def _along(y, value):
    """Linear interpolation of value(section) along the cabinet depth."""
    for a, b in zip(SECTIONS[:-1], SECTIONS[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / max(b[0] - a[0], 1e-6)
            return value(a) * (1 - t) + value(b) * t
    return value(SECTIONS[0] if y < SECTIONS[0][0] else SECTIONS[-1])


def top_at(y):
    return _along(y, lambda s: s[3] + s[2] / 2)


def half_w_at(y):
    return _along(y, lambda s: s[1] / 2)


# ---------------------------------------------------------------- front cabinet: rounded corners, sharp aperture

bm = bmesh.new()
outer0 = _rr_loop(0, tv_cz, TV_W - 2 * RND, TV_H - 2 * RND, TV_R - RND)
outer1 = _rr_loop(0, tv_cz, TV_W - 0.5 * RND, TV_H - 0.5 * RND, TV_R - 0.5 * RND)
aperture = _rr_loop(0, open_cz, OPEN_W, OPEN_H, 0.03)
L = [
    _loop_verts(bm, aperture, tv_y0),                                  # aperture lip on the front plane
    _loop_verts(bm, outer0, tv_y0),                                    # start of the front rounding
    _loop_verts(bm, outer1, tv_y0 + RND * 0.35),
] + [_loop_verts(bm, _rr_loop(0, cz, w, h, r), y) for y, w, h, cz, r in FRONT_SECTIONS]
_bridge(bm, [L[0], L[1]])
_bridge(bm, L[1:])
# flat back face of the front cabinet; the rear housing grows out of it
bm.faces.new(list(reversed(L[-1])))
fr = _done("TV_FrontFrame", bm, M["tv_shell"], flip=True)

# ---------------------------------------------------------------- sloped bezel following the curved glass

bm = bmesh.new()
RIM_IN = 0.006
rim = _rr_loop(0, open_cz, SCREEN_W - 2 * RIM_IN, SCREEN_W * 0.75 - 2 * RIM_IN, 0.026, m=4)
rim_verts = []
for x, z in rim:
    gy = glass_y_at(x, z)
    if gy is None:
        gy = glass_y + 0.02
    rim_verts.append(bm.verts.new((x, gy - 0.0015, z)))
lip = _loop_verts(bm, aperture, tv_y0 + 0.0004)
_bridge(bm, [lip, rim_verts])
# short return wall behind the rim so the lip has thickness when seen at an angle
back = [bm.verts.new((v.co.x, v.co.y + 0.012, v.co.z)) for v in rim_verts]
_bridge(bm, [rim_verts, back])
# flip so the slope faces the viewer (towards -Y)
_done("TV_BezelSlope", bm, M["tv_bezel"], flip=False, smooth_angle=50)
bz = OBJ["TV_BezelSlope"]

# ---------------------------------------------------------------- deep tapered rear housing

bm = bmesh.new()
rear_loops = [_loop_verts(bm, _rr_loop(0, cz, w, h, r), y) for y, w, h, cz, r in REAR_SECTIONS]
_bridge(bm, rear_loops, close_a=False, close_b=True)
bm.faces.new(rear_loops[0])
_done("TV_RearHousing", bm, M["tv_shell"], smooth_angle=45)


# vent slots on the top of the housing (follow the slope) and on both sides
vi = 0
VENT_Y0 = tv_y0 + FRONT_D + 0.035
for k in range(8):
    y = VENT_Y0 + k * 0.022
    y2 = y + 0.011
    zt = top_at(y)
    slope = math.atan2(top_at(y2) - zt, 0.011)
    rbox(f"TV_Vent_{vi}", (0.30, 0.008, 0.0045), (0, y, zt - 0.0015), M["recess"], rot=(slope, 0, 0), seg=1, bevel=0.001)
    vi += 1
for sx in (-1, 1):
    for k in range(6):
        y = VENT_Y0 + 0.01 + k * 0.022
        zc = tv_cz + 0.01
        x = sx * (half_w_at(y) - 0.004)
        a = math.atan2(half_w_at(y + 0.011) - half_w_at(y), 0.011)
        rbox(f"TV_Vent_{vi}", (0.0045, 0.008, 0.16), (x, y, zc), M["recess"], rot=(0, 0, sx * a), seg=1, bevel=0.001)
        vi += 1

# ---------------------------------------------------------------- lower control band

band_lo = tv_bottom
band_hi = open_cz - OPEN_H / 2 - 0.012          # under the aperture lip
band_z = (band_lo + band_hi) / 2
band_h = band_hi - band_lo
FY = tv_y0 - 0.001

# slightly raised panel plate: the "chin" of the set
rbox("TV_ControlPanel", (0.62, 0.008, band_h - 0.022), (0, FY + 0.0035, band_z), M_PANEL, bevel=0.003, seg=2)
PY = FY - 0.0005   # front of plate

# speaker grilles on the sides of the plate (0..1 planar UVs across each panel)
for sx in (-1, 1):
    gx = sx * 0.225
    rbox(f"TV_GrilleTrim_{'L' if sx < 0 else 'R'}", (0.14, 0.004, band_h - 0.04), (gx, PY, band_z), M["tv_shell"], bevel=0.0018, seg=2)
    rbox(f"TV_Grille_{'L' if sx < 0 else 'R'}", (0.126, 0.003, band_h - 0.054), (gx, PY - 0.0025, band_z), M["tv_grille"],
         bevel=0.0012, seg=1, uv=(0, 2))

# centre: blank badge plate, power button + standby LED, AV door with jacks
cx0 = 0.0
upper_z = band_z + band_h * 0.22
lower_z = band_z - band_h * 0.2
rbox("TV_Badge", (0.075, 0.002, 0.009), (-0.045, PY - 0.0015, upper_z), M["tv_silver"], bevel=0.0008, seg=1)
# recessed AV door
rbox("TV_AVDoor", (0.2, 0.004, 0.036), (0, PY - 0.0005, lower_z), M["tv_shell"], bevel=0.003, seg=2)
rbox("TV_AVRecess", (0.188, 0.003, 0.026), (0, PY - 0.0022, lower_z), M["recess"], bevel=0.002, seg=2)
rbox("TV_AVDoorLip", (0.2, 0.003, 0.004), (0, PY - 0.0035, lower_z + 0.02), M["tv_silver"], bevel=0.001, seg=1)
for i, (mat, nm) in enumerate(((M_JACK_Y, "Yellow"), (M_JACK_W, "White"), (M_JACK_R, "Red"))):
    jx = -0.055 + i * 0.03
    cylinder(f"TV_Jack{nm}", 0.0085, 0.0085, 0.003, (jx, PY - 0.0043, lower_z), mat, seg=16, rot=(math.pi / 2, 0, 0))
    cylinder(f"TV_JackHole{nm}", 0.0035, 0.0035, 0.0035, (jx, PY - 0.0052, lower_z), M["recess"], seg=10, rot=(math.pi / 2, 0, 0))
cylinder("TV_JackSVideo", 0.0085, 0.0085, 0.003, (0.065, PY - 0.0043, lower_z), M["tv_silver"], seg=16, rot=(math.pi / 2, 0, 0))
cylinder("TV_JackSVideoHole", 0.0055, 0.0055, 0.0035, (0.065, PY - 0.0052, lower_z), M["recess"], seg=12, rot=(math.pi / 2, 0, 0))

# channel / volume buttons, left of the badge row
for i in range(5):
    rbox(f"TV_Button_{i}", (0.015, 0.005, 0.0075), (0.02 + i * 0.0185, PY - 0.0035, upper_z), M["tv_shell"], bevel=0.0015, seg=1)
rbox("TV_ButtonStrip", (0.1, 0.002, 0.012), (0.0645, PY - 0.0015, upper_z), M["tv_bezel"], bevel=0.0012, seg=1)

# power button + standby LED
rbox("TV_PowerButton", (0.02, 0.006, 0.011), (-0.1, PY - 0.0033, upper_z), M["tv_bezel"], bevel=0.0015, seg=1)
rbox("TV_PowerBezel", (0.026, 0.002, 0.017), (-0.1, PY - 0.0015, upper_z), M["tv_silver"], bevel=0.001, seg=1)
cylinder("TV_StandbyLED", 0.003, 0.003, 0.004, (-0.14, PY - 0.0025, upper_z), M["tv_led"], seg=16, rot=(math.pi / 2, 0, 0))

# ---------------------------------------------------------------- feet

for sx in (-1, 1):
    for sy in (0, 1):
        rbox(f"TV_Foot_{sx}_{sy}", (0.06, 0.05, TV_FOOT), (sx * 0.25, tv_y0 + 0.045 + sy * 0.11, CAB_H + TV_FOOT / 2), M["recess"], bevel=0.002)

# ---------------------------------------------------------------- rabbit-ear antenna

ant_y = tv_y0 + FRONT_D * 0.6
ant_z = top_at(ant_y)
ant_x = 0.0
cylinder("TV_AntennaBase", 0.04, 0.05, 0.022, (ant_x, ant_y, ant_z + 0.006), M["tv_shell"], seg=24, bevel=0.004)
cylinder("TV_AntennaCap", 0.022, 0.026, 0.012, (ant_x, ant_y, ant_z + 0.02), M["tv_silver"], seg=20, bevel=0.002)
pivot = Vector((ant_x, ant_y, ant_z + 0.028))
for sx in (-1, 1):
    side = "L" if sx < 0 else "R"
    ang = math.radians(33 + (3 if sx > 0 else 0))
    d = Vector((sx * math.sin(ang), 0.05, math.cos(ang))).normalized()
    p = pivot.copy()
    for j, (ln, rad) in enumerate(((0.16, 0.0042), (0.15, 0.0032), (0.13, 0.0023))):
        q = p + d * ln
        _rod(f"TV_Antenna{side}_{j}", p, q, rad, M["tv_silver"])
        if j < 2:
            _rod(f"TV_Antenna{side}_Ring{j}", q - d * 0.006, q + d * 0.006, rad * 1.45, M["tv_silver"])
        p = q
    cylinder(f"TV_Antenna{side}_Tip", 0.0058, 0.0058, 0.0058, p, M["tv_silver"], seg=12,
             rot=d.to_track_quat("Z", "Y").to_euler())
    # hinge knuckle
    cylinder(f"TV_Antenna{side}_Hinge", 0.007, 0.007, 0.014, pivot, M["tv_shell"], seg=12, rot=(0, math.pi / 2, 0))
