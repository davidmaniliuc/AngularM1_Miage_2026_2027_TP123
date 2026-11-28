"""Room: floor, walls, rug, walnut TV cabinet, jewel cases, lamp, plant, poster, window, props.

Executed by build_living_room.py in a shared namespace (helpers, materials M,
layout constants and base objects are already defined)."""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------- room

RUG_TOP = 0.008
WALL_Y = 0.78
SIDE_X = -1.88                     # room face of the window wall (the wall itself is built around the opening)
SIDE_T = 0.2
RIGHT_X = 3.5                      # room face of the right wall
ROOM_W, ROOM_CX = RIGHT_X + 0.04 - (SIDE_X - SIDE_T), (RIGHT_X + 0.04 + SIDE_X - SIDE_T) / 2
rbox("Room_Floor", (ROOM_W, 4.0, 0.02), (ROOM_CX, -1.2 + WALL_Y / 2 + 0.6, -0.01), M["oak"], uv_scale=1.0)
rbox("Room_Wall", (ROOM_W, 0.04, 2.6), (ROOM_CX, WALL_Y + 0.02, 1.3), M["wall"])
rbox("Room_WallRight", (0.04, 4.0, 2.6), (RIGHT_X + 0.02, WALL_Y - 2.0, 1.3), M["wall"])
rbox("Room_Baseboard", (RIGHT_X - SIDE_X, 0.016, 0.08), ((RIGHT_X + SIDE_X) / 2, WALL_Y - 0.008, 0.04), M["skirting"], bevel=0.003)
rbox("Room_BaseboardSide", (0.016, 4.0, 0.08), (SIDE_X + 0.008, WALL_Y - 2.0, 0.04), M["skirting"], bevel=0.003)
rbox("Room_BaseboardRight", (0.016, 4.0, 0.08), (RIGHT_X - 0.008, WALL_Y - 2.0, 0.04), M["skirting"], bevel=0.003)
rbox("Rug", (1.7, 1.15, RUG_TOP), (0.05, -0.36, RUG_TOP / 2), M["rug"], bevel=0.002, seg=1, uv=(0, 1))

# ---------------------------------------------------------------- TV cabinet (mid-century walnut)

CAB_W, CAB_D, CAB_H, LEG = 1.36, 0.46, 0.44, 0.1
CAB_Y = WALL_Y - 0.04 - CAB_D / 2
cab_front = CAB_Y - CAB_D / 2
T = 0.024
rbox("Cabinet_Top", (CAB_W, CAB_D, T), (0, CAB_Y, CAB_H - T / 2), M["walnut"], bevel=0.004)
rbox("Cabinet_Bottom", (CAB_W - 2 * T, CAB_D - 0.01, T), (0, CAB_Y, LEG + T / 2), M["walnut"], bevel=0.002)
for s in (-1, 1):
    rbox(f"Cabinet_Side_{'L' if s < 0 else 'R'}", (T, CAB_D, CAB_H - LEG), (s * (CAB_W - T) / 2, CAB_Y, LEG + (CAB_H - LEG) / 2),
         M["walnut"], bevel=0.003)
rbox("Cabinet_Back", (CAB_W - 2 * T, 0.008, CAB_H - LEG - T), (0, CAB_Y + CAB_D / 2 - 0.004, LEG + (CAB_H - LEG - T) / 2), M["walnut"])
rbox("Cabinet_Divider", (T * 0.8, CAB_D - 0.02, CAB_H - LEG - 2 * T), (0.16, CAB_Y + 0.01, LEG + CAB_H / 2 - LEG / 2), M["walnut"])
rbox("Cabinet_Shelf", (0.16 + CAB_W / 2 - T - 0.01, CAB_D - 0.03, 0.016), ((-CAB_W / 2 + T + 0.16) / 2, CAB_Y + 0.01, 0.27), M["walnut"], bevel=0.002)
# Right door with a brass pull
door_w = CAB_W / 2 - T - 0.16 - 0.012
rbox("Cabinet_Door", (door_w, 0.018, CAB_H - LEG - 2 * T - 0.008), (0.16 + 0.008 + door_w / 2, cab_front + 0.009, LEG + (CAB_H - LEG) / 2),
     M["walnut"], bevel=0.003)
rbox("Cabinet_DoorPull", (0.008, 0.014, 0.09), (0.16 + 0.04, cab_front - 0.006, LEG + (CAB_H - LEG) / 2), M["brass"], bevel=0.003)
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * (CAB_W / 2 - 0.07), CAB_Y + sy * (CAB_D / 2 - 0.06)
        cylinder(f"Cabinet_Leg_{sx}_{sy}", 0.012, 0.02, LEG, (x, y, LEG / 2), M["walnut"], seg=16,
                 rot=(sy * 0.12, -sx * 0.12, 0))
        cylinder(f"Cabinet_LegCap_{sx}_{sy}", 0.0125, 0.0125, 0.012, (x + sx * 0.006, y + sy * 0.006, 0.006), M["brass"], seg=16)

# ---------------------------------------------------------------- jewel cases (the app's whole metaphor)

def jewel_case(name, center, rot, lying=False, spine_mat=None):
    """PS1 case 142 x 125 x 10 mm with a black spine strip and a printed label."""
    w, h, t = 0.142, 0.125, 0.0105
    if lying:
        size = (h, w, t)
    else:
        size = (t, w, h)
    ob = rbox(name, size, center, M["case_clear"], bevel=0.0012, seg=1, rot=rot)
    # spine on the -Y edge when standing, on the -X edge when lying
    if lying:
        loc = Vector(center) + Euler(rot).to_matrix() @ Vector((-h / 2 + 0.006, 0, 0.0002))
        rbox(name + "_Spine", (0.012, w + 0.0004, t + 0.0006), tuple(loc), spine_mat or M["case_spine"], rot=rot)
    else:
        loc = Vector(center) + Euler(rot).to_matrix() @ Vector((0, -w / 2 + 0.006, 0))
        rbox(name + "_Spine", (t + 0.0006, 0.0124, h + 0.0004), tuple(loc), spine_mat or M["case_spine"], rot=rot)
        lab = Vector(center) + Euler(rot).to_matrix() @ Vector((0, -w / 2 - 0.0002, 0.01))
        rbox(name + "_Label", (t * 0.7, 0.0006, 0.07), tuple(lab), M["case_label"], rot=rot)
    return ob

# a row of cases standing on the cabinet's open shelf
x0 = -CAB_W / 2 + T + 0.03
shelf_top = 0.27 + 0.008
for i in range(17):
    lean = 0.0 if i < 15 else -0.32
    x = x0 + i * 0.0118 + (0.03 if i >= 15 else 0)
    jewel_case(f"Case_Shelf_{i}", (x, cab_front + 0.012 + 0.071 + 0.004, shelf_top + 0.0625 + (0.0 if i < 15 else -0.008)),
               (0, lean, 0))
# lower compartment: a stack lying flat and a memory-card tin
for i in range(4):
    jewel_case(f"Case_Stack_{i}", (-0.42, cab_front + 0.11, LEG + T + 0.0053 + i * 0.0108), (0, 0, rng.uniform(-0.08, 0.08)), lying=True)
for i in range(3):
    jewel_case(f"Case_StackB_{i}", (-0.22, cab_front + 0.12, LEG + T + 0.0053 + i * 0.0108), (0, 0, rng.uniform(-0.1, 0.1)), lying=True)

# ---------------------------------------------------------------- props on the rug

disc_case = jewel_case("Case_Open", (0.45, -0.16, RUG_TOP + 0.0053), (0, 0, math.radians(28)), lying=True)
cylinder("Game_Disc", 0.06, 0.06, 0.0012, (0.52, -0.32, RUG_TOP + 0.0006), M["disc"], seg=64)
cylinder("Game_DiscHole", 0.0075, 0.0075, 0.0014, (0.52, -0.32, RUG_TOP + 0.0007), M["oak"], seg=24)
jewel_case("Case_Rug_1", (-0.42, -0.42, RUG_TOP + 0.0053), (0, 0, math.radians(-12)), lying=True)
jewel_case("Case_Rug_2", (-0.41, -0.43, RUG_TOP + 0.016), (0, 0, math.radians(-3)), lying=True)
rbox("Magazine_1", (0.21, 0.28, 0.006), (-0.62, -0.2, RUG_TOP + 0.003), M["magazine"], bevel=0.001, seg=1,
     rot=(0, 0, math.radians(20)), uv=(0, 1))
cylinder("Soda_Can", 0.033, 0.033, 0.12, (0.58, 0.12, RUG_TOP + 0.06), M["can"], seg=32, bevel=0.004)
cylinder("Soda_Top", 0.029, 0.029, 0.002, (0.58, 0.12, RUG_TOP + 0.121), M["can_top"], seg=32)

# ---------------------------------------------------------------- table lamp on the cabinet

lx, ly = -0.5, CAB_Y + 0.04
cylinder("Lamp_Base", 0.065, 0.07, 0.022, (lx, ly, CAB_H + 0.011), M["lamp_metal"], seg=40, bevel=0.004)
cylinder("Lamp_Stem", 0.007, 0.007, 0.26, (lx, ly, CAB_H + 0.15), M["brass"], seg=16)
cylinder("Lamp_Shade", 0.12, 0.075, 0.17, (lx, ly, CAB_H + 0.33), M["lamp_shade"], seg=48)

# ---------------------------------------------------------------- local helpers (room only)

class Batch:
    """Many boxes / solids merged into ONE mesh with one material (keeps the GLB light)."""
    def __init__(self):
        self.bm = bmesh.new()

    def box(self, size, center, rot=(0, 0, 0), bevel=0.0):
        before = set(self.bm.verts)
        bmesh.ops.create_cube(self.bm, size=1.0)
        new = [v for v in self.bm.verts if v not in before]
        for v in new:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel > 0:
            es = list({e for v in new for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=es, offset=bevel, offset_type="OFFSET", segments=1,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
            new = [v for v in self.bm.verts if v not in before]
        m = Matrix.Translation(Vector(center)) @ Euler(rot).to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, matrix=m, verts=new)

    def cyl(self, r, depth, center, rot=(0, 0, 0), seg=16, r2=None):
        r_ = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
        m = Matrix.Translation(Vector(center)) @ Euler(rot).to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, matrix=m, verts=r_["verts"])

    def sphere(self, r, center, scale=(1, 1, 1), seg=12):
        r_ = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
        m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal(Vector((*scale, 1)))
        bmesh.ops.transform(self.bm, matrix=m, verts=r_["verts"])

    def done(self, name, mat, **kw):
        return finish(name, self.bm, mat, **kw)


def leaf_into(bm, origin, direction, length, width, droop=0.5, fold=0.25):
    """Pointed leaf blade with a folded midrib, curved down; UV u = along, v = across."""
    uvl = bm.loops.layers.uv.verify()
    d = Vector(direction).normalized()
    q = d.to_track_quat("X", "Z")
    N, K = 8, 3
    rows = []
    for i in range(N + 1):
        u = i / N
        w = width * (math.sin(math.pi * min(1.0, u * 0.95 + 0.04)) ** 0.7) * (1.0 - 0.25 * u)
        row = []
        for j in range(-K, K + 1):
            v = j / K
            loc = Vector((u * length, v * w / 2, -abs(v) * w * fold * 0.5 - droop * (u * length) ** 2 * 1.2))
            row.append((bm.verts.new(origin + q @ loc), u, v))
        rows.append(row)
    for i in range(N):
        for j in range(2 * K):
            c = [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]]
            f = bm.faces.new([x[0] for x in c])
            for lp, x in zip(f.loops, c):
                lp[uvl].uv = (x[1], x[2] * 0.5 + 0.5)


def build_plant(px, py, z0):
    """Rubber-plant: a few woody stems with broad glossy leaves."""
    stems = Batch()
    leaves = bmesh.new()
    n = 9
    for i in range(n):
        ang = i * 2.39996 + 0.3
        lean = 0.12 + 0.28 * (i % 3) / 2 + 0.05 * rng.random()
        h = 0.34 + 0.5 * ((i * 5) % 9) / 8
        base = Vector((px, py, z0))
        d = Vector((math.cos(ang) * math.sin(lean), math.sin(ang) * math.sin(lean), math.cos(lean)))
        tip = base + d * h
        OBJ_ = tube(f"Plant_Stem_{i}", [base, base + d * h * 0.5, tip], 0.004, M["stem"], res=5)
        # 3 leaves per stem: two lower, one terminal
        for k, t in enumerate((0.55, 0.78, 1.0)):
            pos = base + d * h * t
            a2 = ang + (k - 1) * 1.6 + rng.uniform(-0.3, 0.3)
            out = Vector((math.cos(a2), math.sin(a2), 0.35 + 0.25 * k))
            leaf_into(leaves, pos, out, 0.2 + 0.06 * rng.random(), 0.1, droop=0.7, fold=0.35)
    finish("Plant_Leaves", leaves, M["leaf"], uv=None, smooth_angle=60)
    stems.bm.free()
    cylinder("Plant_Soil", 0.118, 0.118, 0.01, (px, py, 0.25), M["soil"], seg=40)


# plant on the floor right of the cabinet
px, py = CAB_W / 2 + 0.22, CAB_Y - 0.02
cylinder("Plant_Pot", 0.1, 0.13, 0.26, (px, py, 0.13), M["ceramic"], seg=40, bevel=0.006)
build_plant(px, py, 0.25)

# ---------------------------------------------------------------- wall: poster

def poster(name, w, h, cx, cz, mat):
    y = WALL_Y - 0.012
    ring_frame(name + "_Frame", (w + 0.04, h + 0.04), (w, h), y - 0.012, 0.024, cz, M["frame"], bevel=0.003)
    OBJ[name + "_Frame"].location.x += cx
    rbox(name, (w, 0.004, h), (cx, y, cz), mat, uv=(0, 2))


poster("Poster_B", 0.40, 0.56, 0.98, 1.3, M["poster_b"])




# ================================================================ richer decor

# new materials (Three.js textures them by name)
M["fringe"] = material("Rug_Fringe", (0.5, 0.44, 0.34), 0.95)
M["curtain"] = material("Curtain_Fabric", (0.2, 0.13, 0.14), 0.95)           # box UV, 1 unit = 1 m
M["radiator"] = material("Radiator_Paint", (0.72, 0.71, 0.67), 0.5)
M["vhs"] = material("VHS_Shell", (0.025, 0.025, 0.03), 0.4)
M["vhs_label"] = material("VHS_Label", (0.78, 0.76, 0.7), 0.7)
M["book_a"] = material("Book_Cloth_A", (0.16, 0.14, 0.12), 0.8)
M["book_b"] = material("Book_Cloth_B", (0.3, 0.25, 0.2), 0.8)
M["book_c"] = material("Book_Cloth_C", (0.12, 0.16, 0.2), 0.8)
M["boombox"] = material("Boombox_Plastic", (0.05, 0.05, 0.055), 0.4)
M["fig_white"] = material("Figurine_White", (0.8, 0.78, 0.72), 0.5)
M["fig_dark"] = material("Figurine_Dark", (0.06, 0.06, 0.07), 0.45)
M["chips"] = material("Snack_Chips", (0.7, 0.5, 0.2), 0.7)
M["bowl"] = material("Snack_Bowl", (0.78, 0.76, 0.72), 0.3)
M["card"] = material("Memory_Card", (0.42, 0.43, 0.46), 0.35)
M["switch"] = material("Wall_Switch", (0.85, 0.84, 0.8), 0.4)

# ---- rug: fringes at both short ends
fr = Batch()
rx0, ry0, rw, rd = 0.05, -0.36, 1.7, 1.15
for s in (-1, 1):
    for i in range(46):
        y = ry0 - rd / 2 + 0.02 + i * (rd - 0.04) / 45
        fr.box((0.04, 0.004, 0.003), (rx0 + s * (rw / 2 + 0.018), y + rng.uniform(-0.002, 0.002), 0.0016),
               rot=(0, 0, s * rng.uniform(-0.12, 0.12)))
fr.done("Rug_Fringes", M["fringe"])

# ---- bookshelf / CD tower left of the cabinet
bx, bw, bd, bh = -1.46, 0.66, 0.28, 1.62
by = WALL_Y - 0.04 - bd / 2
front = by - bd / 2
rbox("Shelf_SideL", (0.022, bd, bh), (bx - bw / 2 + 0.011, by, bh / 2), M["walnut"], bevel=0.003)
rbox("Shelf_SideR", (0.022, bd, bh), (bx + bw / 2 - 0.011, by, bh / 2), M["walnut"], bevel=0.003)
rbox("Shelf_Back", (bw, 0.008, bh), (bx, by + bd / 2 - 0.004, bh / 2), M["walnut"])
levels = [0.04, 0.36, 0.68, 1.0, 1.32, bh - 0.011]
for i, z in enumerate(levels):
    rbox(f"Shelf_Board_{i}", (bw, bd, 0.022), (bx, by, z), M["walnut"], bevel=0.003)
inner0, inner1 = bx - bw / 2 + 0.022, bx + bw / 2 - 0.022
ztop = lambda i: levels[i] + 0.011

# row 0: VHS tapes (standing, label on the spine facing out)
v_s, v_l = Batch(), Batch()
x = inner0 + 0.02
while x < inner1 - 0.05:
    tw = 0.025 + 0.001 * rng.random()
    v_s.box((tw, 0.103, 0.187), (x + tw / 2, front + 0.14, ztop(0) + 0.0935), bevel=0.001)
    v_l.box((tw * 0.92, 0.0006, 0.15), (x + tw / 2, front + 0.14 - 0.0517, ztop(0) + 0.095))
    x += tw + 0.0012
v_s.done("Shelf_VHS", M["vhs"])
v_l.done("Shelf_VHS_Labels", M["vhs_label"])

# row 1 and row 4: jewel cases, spines out
def case_row(i, xa, xb, tag):
    cl, sp, lb = Batch(), Batch(), Batch()
    x = xa
    k = 0
    while x < xb - 0.012:
        lean = rng.uniform(-0.05, 0.05) if k % 11 == 7 else 0.0
        cy, cz = front + 0.012 + 0.071, ztop(i) + 0.0625
        cl.box((0.0105, 0.142, 0.125), (x + 0.0053, cy, cz), rot=(0, lean, 0), bevel=0.0012)
        sp.box((0.0111, 0.0124, 0.1254), (x + 0.0053, cy - 0.071 + 0.006, cz), rot=(0, lean, 0))
        lb.box((0.0075, 0.0006, 0.07), (x + 0.0053, cy - 0.0716, cz + 0.01), rot=(0, lean, 0))
        x += 0.0118 + abs(lean) * 0.06
        k += 1
    cl.done(f"Shelf_Cases_{tag}", M["case_clear"])
    sp.done(f"Shelf_Spines_{tag}", M["case_spine"])
    lb.done(f"Shelf_Labels_{tag}", M["case_label"])

case_row(1, inner0 + 0.012, inner1 - 0.012, "A")
case_row(4, inner0 + 0.012, inner0 + 0.42, "B")

# row 2: boombox, row 3: clock radio, books, tapes lying
bb = Batch()
bbx, bbz = bx - 0.02, ztop(2)
bb.box((0.46, 0.16, 0.2), (bbx, front + 0.12, bbz + 0.1), bevel=0.012)
bb.box((0.3, 0.02, 0.02), (bbx, front + 0.12, bbz + 0.215), bevel=0.006)             # handle bar
for s in (-1, 1):
    bb.box((0.014, 0.02, 0.05), (bbx + s * 0.15, front + 0.12, bbz + 0.23), bevel=0.004)
bb.done("Boombox_Body", M["boombox"])
sg = Batch()
for s in (-1, 1):
    sg.cyl(0.058, 0.004, (bbx + s * 0.155, front + 0.12 - 0.081, bbz + 0.1), rot=(math.pi / 2, 0, 0), seg=24)
sg.done("Boombox_Speakers", M["tv_grille"])
tr = Batch()
tr.cyl(0.032, 0.006, (bbx + 0.155 * 0 - 0.0, front + 0.12 - 0.081, bbz + 0.075), rot=(math.pi / 2, 0, 0), seg=16)
tr.box((0.11, 0.004, 0.05), (bbx, front + 0.12 - 0.081, bbz + 0.135))
tr.done("Boombox_Trim", M["tv_silver"])
rbox("Boombox_Tape", (0.09, 0.003, 0.04), (bbx, front + 0.12 - 0.0825, bbz + 0.16), M["case_clear"])
# clock radio
rbox("ClockRadio_Body", (0.17, 0.08, 0.075), (bx + 0.2, front + 0.12, ztop(3) + 0.0375), M["boombox"], bevel=0.008)
rbox("ClockRadio_Display", (0.06, 0.002, 0.026), (bx + 0.2 - 0.03, front + 0.12 - 0.041, ztop(3) + 0.04), M["tv_led"])
# books on row 3
bk = {"book_a": Batch(), "book_b": Batch(), "book_c": Batch()}
x = inner0 + 0.015
names = list(bk)
k = 0
while x < bx + 0.07:
    t = rng.uniform(0.02, 0.04)
    h = rng.uniform(0.2, 0.27)
    bk[names[k % 3]].box((t, 0.19, h), (x + t / 2, front + 0.13, ztop(3) + h / 2), bevel=0.002)
    x += t + 0.001
    k += 1
for n, b in bk.items():
    b.done("Shelf_Books_" + n[-1].upper(), M[n])
# row 4 remainder: small figurines + a lying stack of cases
jewel_case("Case_ShelfStack_0", (bx + 0.2, front + 0.11, ztop(4) + 0.0053), (0, 0, 0.05), lying=True)
jewel_case("Case_ShelfStack_1", (bx + 0.2, front + 0.11, ztop(4) + 0.016), (0, 0, -0.04), lying=True)
fg = Batch()
fg.cyl(0.03, 0.08, (bx + 0.12, front + 0.1, ztop(4) + 0.04), seg=16, r2=0.016)
fg.sphere(0.022, (bx + 0.12, front + 0.1, ztop(4) + 0.1))
fg.done("Shelf_FigureA", M["fig_white"])
# row 5 (top): small plant
cylinder("Shelf_Pot", 0.05, 0.04, 0.09, (bx, by, ztop(5) + 0.045), M["ceramic"], seg=24, bevel=0.003)
cylinder("Shelf_PotSoil", 0.046, 0.046, 0.006, (bx, by, ztop(5) + 0.088), M["soil"], seg=24)
sl = bmesh.new()
for i in range(9):
    a = i * 2.39996
    leaf_into(sl, Vector((bx, by, ztop(5) + 0.09)), Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1.0)),
              0.2 + 0.1 * (i % 3) / 2, 0.035, droop=0.35, fold=0.4)
finish("Shelf_PlantLeaves", sl, M["leaf"], uv=None, smooth_angle=60)

# ---- window wall: a real opening with venetian blinds, and the city outside at true distance
WIN_Y, WIN_Z, WIN_W, WIN_H = -0.55, 1.35, 0.9, 1.0
wy = WIN_Y
win_a, win_b = WIN_Y - WIN_W / 2, WIN_Y + WIN_W / 2
win_lo, win_hi = WIN_Z - WIN_H / 2, WIN_Z + WIN_H / 2
WALL_H = 2.6

M["glass"] = material("Window_Glass", (0.75, 0.8, 0.88), 0.04)
M["glass"].node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.1
M["glass"].surface_render_method = "BLENDED"
M["blind_cord"] = material("Blind_Cord", (0.82, 0.8, 0.74), 0.9)

wall = Batch()
xc, y0, y1 = SIDE_X - SIDE_T / 2, WALL_Y - 4.0, WALL_Y + 0.04
wall.box((SIDE_T, win_a - y0, WALL_H), (xc, (y0 + win_a) / 2, WALL_H / 2))
wall.box((SIDE_T, y1 - win_b, WALL_H), (xc, (win_b + y1) / 2, WALL_H / 2))
wall.box((SIDE_T, WIN_W, win_lo), (xc, WIN_Y, win_lo / 2))
wall.box((SIDE_T, WIN_W, WALL_H - win_hi), (xc, WIN_Y, (win_hi + WALL_H) / 2))
wall.done("Room_WallSide", M["wall"])

# sash and glass sit in the middle of the reveal
SASH_X = SIDE_X - 0.12
fr = Batch()
fr.box((0.06, WIN_W, 0.05), (SASH_X, WIN_Y, win_hi - 0.025), bevel=0.004)
fr.box((0.06, WIN_W, 0.05), (SASH_X, WIN_Y, win_lo + 0.025), bevel=0.004)
for yy in (win_a + 0.025, win_b - 0.025):
    fr.box((0.06, 0.05, WIN_H - 0.1), (SASH_X, yy, WIN_Z), bevel=0.004)
fr.box((0.06, 0.04, WIN_H - 0.1), (SASH_X, WIN_Y, WIN_Z), bevel=0.004)
fr.done("Window_Frame", M["window_frame"])
rbox("Window_Glass", (0.006, WIN_W - 0.04, WIN_H - 0.04), (SASH_X, WIN_Y, WIN_Z), M["glass"])
casing = Batch()
casing.box((0.015, WIN_W + 0.14, 0.07), (SIDE_X + 0.0075, WIN_Y, win_hi + 0.035), bevel=0.003)
for yy in (win_a - 0.035, win_b + 0.035):
    casing.box((0.015, 0.07, WIN_H + 0.07), (SIDE_X + 0.0075, yy, WIN_Z + 0.035), bevel=0.003)
casing.box((0.015, WIN_W + 0.1, 0.06), (SIDE_X + 0.0075, WIN_Y, win_lo - 0.06), bevel=0.003)
casing.done("Window_Casing", M["window_frame"])
rbox("Window_Sill", (SASH_X + 0.03 - (SIDE_X + 0.08), WIN_W + 0.16, 0.03), ((SASH_X + 0.03 + SIDE_X + 0.08) / 2, WIN_Y, win_lo - 0.015),
     M["window_frame"], bevel=0.004)

# Venetian blind, inside mount, raised to the top third. Slats tilt about Y, the wall's horizontal axis.
BL_X = SIDE_X - 0.045
slat_l = WIN_W - 0.02
rbox("Blind_Headrail", (0.035, WIN_W - 0.01, 0.03), (BL_X, WIN_Y, win_hi - 0.015), M["blind"], bevel=0.003)
slats = Batch()
z = win_hi - 0.045
for i in range(7):
    slats.box((0.025, slat_l, 0.0015), (BL_X, WIN_Y, z), rot=(0, math.radians(38), 0))
    z -= 0.022
z += 0.01
for i in range(30):
    slats.box((0.025, slat_l, 0.0015), (BL_X + rng.uniform(-0.001, 0.001), WIN_Y, z), rot=(rng.uniform(-0.01, 0.01), rng.uniform(-0.04, 0.04), 0))
    z -= 0.0034
slats.done("Blind_Slats", M["blind"])
rail_z = z - 0.006
rbox("Blind_BottomRail", (0.028, slat_l, 0.012), (BL_X, WIN_Y, rail_z), M["blind"], bevel=0.003)
cords = Batch()
for yy in (WIN_Y - 0.3, WIN_Y + 0.3):
    for sx in (-1, 1):
        cords.box((0.0012, 0.004, win_hi - 0.03 - rail_z), (BL_X + sx * 0.0125, yy, (win_hi - 0.03 + rail_z) / 2))
cord_y = win_b - 0.06
cords.cyl(0.0012, win_hi - 0.03 - 1.02, (BL_X - 0.016, cord_y, (win_hi - 0.03 + 1.02) / 2), seg=6)
cords.cyl(0.0012, win_hi - 0.03 - 1.06, (BL_X - 0.016, cord_y - 0.008, (win_hi - 0.03 + 1.06) / 2), seg=6)
cords.cyl(0.008, 0.035, (BL_X - 0.016, cord_y - 0.004, 1.02), seg=12, r2=0.004)
cords.done("Blind_Cords", M["blind_cord"])
cylinder("Blind_Wand", 0.004, 0.004, 0.5, (BL_X - 0.016, win_a + 0.05, win_hi - 0.03 - 0.25), M["case_clear"], seg=8)

# Outside: the flat is high up, so the street is far below and the skyline sits around eye level.
# Three.js swaps every Outside_* material for an unlit, fog-free one and animates some of them (room-life.ts).
def outside_mat(name, emit, strength=1.0, alpha=None):
    m = material(name, (0, 0, 0), 1.0, emit=emit, emit_strength=strength)
    if alpha is not None:
        m.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m

GROUND_Z = -24.0
rbox("Outside_Sky", (0.05, 140, 90), (-52, 10, 15), outside_mat("Outside_Sky", (0.03, 0.05, 0.12)), uv=(1, 2))
MOON = (-50.0, -9.0, 10.0)
cylinder("Outside_Moon", 1.3, 1.3, 0.05, MOON, outside_mat("Outside_Moon", (0.9, 0.88, 0.8), 2.0), seg=48,
         rot=(0, math.pi / 2, 0), uv=(1, 2))
cylinder("Outside_MoonHalo", 6.0, 6.0, 0.02, (MOON[0] - 0.5, MOON[1], MOON[2]), outside_mat("Outside_MoonHalo", (0.3, 0.35, 0.5), alpha=0.3),
         seg=48, rot=(0, math.pi / 2, 0), uv=(1, 2))
rbox("Outside_Clouds", (0.02, 110, 36), (-44, 5, 12), outside_mat("Outside_Clouds", (0.1, 0.12, 0.18), alpha=0.25), uv=(1, 2))


def skyline(name, x_front, depth, tops, widths, gap, emit, y_from=-30.0, y_to=24.0, extra=()):
    b = Batch()
    y = y_from
    while y < y_to:
        w = rng.uniform(*widths)
        d = rng.uniform(*depth)
        top = rng.uniform(*tops)
        xf = x_front + rng.uniform(-1.5, 1.5)
        b.box((d, w, top - GROUND_Z), (xf - d / 2, y + w / 2, (top + GROUND_Z) / 2))
        y += w + rng.uniform(*gap)
    for size, center in extra:
        b.box(size, center)
    return b.done(name, outside_mat(name.replace("Buildings", "Facade"), emit), uv_scale=1.0)


skyline("Outside_Buildings_Near", -13.0, (5, 9), (-3.5, 1.2), (3.0, 7.0), (1.0, 4.0), (0.02, 0.022, 0.03))
TOWER = (-25.0, -4.0)
TOWER_TOP = 5.6
skyline("Outside_Buildings_Mid", -24.0, (5, 8), (0.0, 4.2), (3.5, 8.0), (0.3, 2.0), (0.03, 0.035, 0.05),
        y_from=-40.0, y_to=30.0,
        extra=[((4.0, 3.4, TOWER_TOP - GROUND_Z), (TOWER[0], TOWER[1], (TOWER_TOP + GROUND_Z) / 2)),
               ((0.15, 0.15, 1.4), (TOWER[0], TOWER[1], TOWER_TOP + 0.7))])
cylinder("Outside_AviationLight", 0.22, 0.22, 0.22, (TOWER[0], TOWER[1], TOWER_TOP + 1.45),
         outside_mat("Outside_AviationLight", (1.0, 0.06, 0.03), 6.0), seg=12)
skyline("Outside_Buildings_Far", -35.0, (6, 10), (1.5, 7.0), (4.0, 10.0), (0.0, 1.5), (0.04, 0.05, 0.08),
        y_from=-50.0, y_to=40.0)

# ---- curtains + rod on the window wall, radiator under the window
cx = -1.78
rod = Batch()
rod.cyl(0.011, 2.0, (cx, wy, 2.08), rot=(math.pi / 2, 0, 0))
for s in (-1, 1):
    rod.sphere(0.02, (cx, wy + s * 1.0, 2.08))
    rod.box((0.03, 0.02, 0.03), (-1.87, wy + s * 0.8, 2.08))
rod.done("Curtain_Rod", M["brass"])
for tag, y0, y1 in (("A", wy + 0.52, wy + 1.02), ("B", wy - 1.02, wy - 0.52)):
    bm = bmesh.new()
    NY, NZ = 40, 6
    grid = []
    for iy in range(NY + 1):
        t = iy / NY
        y = y0 + (y1 - y0) * t
        col = []
        for iz in range(NZ + 1):
            z = 2.05 - iz * (2.05 - 0.03) / NZ
            col.append(bm.verts.new((cx + 0.024 * math.sin(t * 2 * math.pi * 4.5 + (0.4 if tag == "A" else 1.1)) * (1 - 0.15 * iz / NZ), y, z)))
        grid.append(col)
    for iy in range(NY):
        for iz in range(NZ):
            bm.faces.new([grid[iy][iz], grid[iy + 1][iz], grid[iy + 1][iz + 1], grid[iy][iz + 1]])
    # two-sided: duplicate flipped, slightly behind
    geom = bm.faces[:]
    dup = bmesh.ops.duplicate(bm, geom=geom)["geom"]
    dv = [e for e in dup if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=dv, vec=(-0.006, 0, 0))
    bmesh.ops.reverse_faces(bm, faces=[e for e in dup if isinstance(e, bmesh.types.BMFace)])
    finish("Curtain_" + tag, bm, M["curtain"], smooth_angle=80)
# radiator: fins + top and bottom pipes
rad = Batch()
for i in range(12):
    rad.box((0.05, 0.05, 0.5), (-1.83, wy - 0.4 + i * 0.0727, 0.4), bevel=0.012)
rad.box((0.05, 0.9, 0.04), (-1.83, wy, 0.66), bevel=0.01)
rad.box((0.05, 0.9, 0.04), (-1.83, wy, 0.16), bevel=0.01)
rad.done("Radiator", M["radiator"])

# ---- right wall: shelf with figurines, light switch
shx, shz = 1.66, 1.22
rbox("WallShelf_Board", (0.64, 0.14, 0.022), (shx, WALL_Y - 0.07, shz), M["walnut"], bevel=0.003)
for s in (-1, 1):
    rbox(f"WallShelf_Bracket_{s}", (0.012, 0.1, 0.07), (shx + s * 0.26, WALL_Y - 0.052, shz - 0.045), M["lamp_metal"])
fa, fb, fc = Batch(), Batch(), Batch()
zt = shz + 0.011
# robot
fa.box((0.04, 0.03, 0.05), (shx - 0.2, WALL_Y - 0.07, zt + 0.045), bevel=0.004)
fa.box((0.03, 0.026, 0.03), (shx - 0.2, WALL_Y - 0.07, zt + 0.09), bevel=0.004)
fa.cyl(0.002, 0.03, (shx - 0.2, WALL_Y - 0.07, zt + 0.12), seg=6)
fa.box((0.01, 0.01, 0.03), (shx - 0.228, WALL_Y - 0.07, zt + 0.04))
fa.box((0.01, 0.01, 0.03), (shx - 0.172, WALL_Y - 0.07, zt + 0.04))
fa.box((0.012, 0.012, 0.03), (shx - 0.208, WALL_Y - 0.07, zt + 0.015))
fa.box((0.012, 0.012, 0.03), (shx - 0.192, WALL_Y - 0.07, zt + 0.015))
fa.done("Wall_FigureRobot", M["tv_silver"])
# bear-ish blob
fb.sphere(0.035, (shx - 0.02, WALL_Y - 0.07, zt + 0.035), (1, 1, 1.0))
fb.sphere(0.026, (shx - 0.02, WALL_Y - 0.07, zt + 0.09))
for s in (-1, 1):
    fb.sphere(0.011, (shx - 0.02 + s * 0.02, WALL_Y - 0.07, zt + 0.113))
fb.done("Wall_FigureBlob", M["fig_white"])
# tall dark statuette
fc.cyl(0.03, 0.012, (shx + 0.17, WALL_Y - 0.07, zt + 0.006), seg=20)
fc.cyl(0.018, 0.1, (shx + 0.17, WALL_Y - 0.07, zt + 0.062), seg=16, r2=0.008)
fc.sphere(0.014, (shx + 0.17, WALL_Y - 0.07, zt + 0.125))
fc.done("Wall_FigureDark", M["fig_dark"])
# a few cases standing on the wall shelf, leaning
for i in range(3):
    jewel_case(f"Case_WallShelf_{i}", (shx + 0.21 + 0.0118 * i - 0.0, WALL_Y - 0.07, zt + 0.0625 + 0.0), (0, 0, 0))
rbox("Switch_Plate", (0.08, 0.008, 0.12), (2.15, WALL_Y - 0.004, 1.1), M["switch"], bevel=0.003)
rbox("Switch_Rocker", (0.026, 0.006, 0.05), (2.15, WALL_Y - 0.01, 1.105), M["switch"], bevel=0.003, rot=(0.15, 0, 0))

# ---- floor: snack bowl, memory card
# bowl by revolve
bm = bmesh.new()
prof = [(0.0, 0.0), (0.05, 0.0), (0.075, 0.03), (0.09, 0.052), (0.092, 0.056), (0.085, 0.056), (0.07, 0.034), (0.0, 0.006)]
pv = [bm.verts.new((r, 0, z)) for r, z in prof]
pe = [bm.edges.new((pv[i], pv[i + 1])) for i in range(len(pv) - 1)]
bmesh.ops.spin(bm, geom=pv + pe, axis=(0, 0, 1), cent=(0, 0, 0), angle=2 * math.pi, steps=24)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
bmesh.ops.transform(bm, matrix=Matrix.Translation((0.62, -0.72, RUG_TOP)), verts=bm.verts[:])
finish("Snack_Bowl", bm, M["bowl"], smooth_angle=60)
ch = Batch()
for i in range(14):
    a, r = rng.uniform(0, 6.28), rng.uniform(0, 0.055)
    ch.sphere(0.017, (0.62 + math.cos(a) * r, -0.72 + math.sin(a) * r, RUG_TOP + 0.03 + 0.012 * rng.random()),
              scale=(1, 1, 0.3), seg=8)
ch.done("Snack_Chips", M["chips"])
rbox("Memory_Card", (0.058, 0.04, 0.004), (-0.52, -0.1, RUG_TOP + 0.002), M["card"], bevel=0.002, seg=1,
     rot=(0, 0, math.radians(25)), uv=(0, 1))
