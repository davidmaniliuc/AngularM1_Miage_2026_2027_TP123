"""Cleans the base model: drops the desk monitor-like TV, the desk, old cables and the old pad shell.

Keeps the UV-mapped CRT_Screen glass (re-used by tv.py), the console and the pad buttons."""

old_tv = [o.name for o in OBJ if o.parent and o.parent.name == "CRT_TV"]
screen = OBJ["CRT_Screen"]
backing = OBJ["CRT_TubeBacking"]
for keep in (screen, backing):
    mw = keep.matrix_world.copy()
    keep.parent = None
    keep.matrix_world = mw
for n in old_tv:
    if n not in ("CRT_Screen", "CRT_TubeBacking"):
        remove(n)
for n in ("CRT_TV", "Desk_Surface", "PS1_AVCable", "PS1_ControllerCable",
          "Ctrl_Bridge", "Ctrl_Grip_L", "Ctrl_Grip_R", "Ctrl_Pod_L", "Ctrl_Pod_R",
          "Ctrl_ShoulderCowl_L", "Ctrl_ShoulderCowl_R"):
    remove(n)
