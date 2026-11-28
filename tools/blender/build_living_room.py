"""Builds frontend-starter/public/models/ps1-setup.glb from tools/blender/ps1-base.glb.

Keeps the PS1 console and the controller buttons from the base model, rebuilds the
controller shell, replaces the desk monitor-like TV with a living-room CRT TV, and
adds a 90s living room around it (cabinet, rug, floor, walls, window, lamp, plant,
posters, jewel cases).

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_living_room.py -- \
      tools/blender/ps1-base.glb frontend-starter/public/models/ps1-setup.glb [preview.png [name=view ...]]

Each view is hero, tv, pad or cam:x,y,z:tx,ty,tz; several views write preview_<name>.png.

Blender frame: Z up, -Y towards the viewer (glTF +Z). Units are metres.
"""

import math
import random
import os
import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
SRC, DST = ARGS[0], ARGS[1]
PREVIEW = ARGS[2] if len(ARGS) > 2 else None
rng = random.Random(24)

bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
OBJ = bpy.data.objects


PARTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")
NS = {"__name__": "living_room", "ARGS": ARGS, "rng": rng}


def run_part(name):
    path = os.path.join(PARTS, name + ".py")
    exec(compile(open(path).read(), path, "exec"), NS)


run_part("common")
run_part("base")

# one asset per part, in dependency order (the TV and cables sit on the cabinet)
for part in ("room", "tv", "controller"):  # one file per asset
    run_part(part)
globals().update(NS)

# ---------------------------------------------------------------- export

for ob in OBJ:
    ob.select_set(ob.type == "MESH" or ob.type == "EMPTY")
bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB", use_selection=False, export_apply=True,
                          export_yup=True, export_lights=False, export_cameras=False,
                          export_draco_mesh_compression_enable=False, export_extras=True)
print("EXPORTED", DST, len([o for o in OBJ if o.type == "MESH"]), "meshes")

# ---------------------------------------------------------------- optional preview render

if PREVIEW:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 760
    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.08
    scene.world = w
    def light(kind, loc, energy, color, size=0.2):
        L = bpy.data.lights.new(kind + str(loc), kind)
        L.energy, L.color = energy, color
        if kind == "AREA":
            L.size = size
        o = bpy.data.objects.new(L.name, L)
        o.location = loc
        scene.collection.objects.link(o)
        return o
    light("POINT", (lx, ly, CAB_H + 0.33), 25, (1, 0.75, 0.5))
    a = light("AREA", (0, tv_y0 - 0.3, open_cz), 30, (0.6, 0.7, 1.0), size=0.5)
    a.rotation_euler = (math.radians(90), 0, 0)
    a.rotation_euler = (-math.radians(90), 0, 0)
    light("POINT", (0.6, -1.4, 1.6), 40, (1, 1, 1))
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle = math.radians(37)
    cam.data.clip_end = 100
    views = ARGS[3:] or ["hero"]
    for i, view in enumerate(views):
        name, _, view = view.rpartition("=")
        if view.startswith("cam:"):
            # cam:x,y,z:tx,ty,tz  (Blender coords) for ad-hoc previews
            _, c, t = view.split(":")
            cam.location, target = Vector(map(float, c.split(","))), Vector(map(float, t.split(",")))
        elif view == "tv":
            target, cam.location = Vector((0, tv_y0, open_cz - 0.08)), Vector((-0.35, tv_y0 - 0.9, open_cz + 0.05))
        elif view == "pad":
            target, cam.location = world(pad, (0, -0.01, 0.01)), world(pad, (0.06, -0.2, 0.14))
        else:
            target = Vector((0.0, 0.05, 0.5))
            cam.location = Vector((0.75, -2.5, 1.15))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        stem, ext = os.path.splitext(PREVIEW)
        scene.render.filepath = PREVIEW if len(views) == 1 else f"{stem}_{name or i}{ext}"
        bpy.ops.render.render(write_still=True)
