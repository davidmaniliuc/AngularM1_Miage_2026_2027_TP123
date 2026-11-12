"""Génère les pochettes de démonstration (PNG 400×400) : python3 generate.py (Pillow requis)."""
from PIL import Image, ImageDraw, ImageFont

SIZE = 400
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"

# (fichier, titre sur deux lignes, couleur haute, couleur basse, forme)
COVERS = [
    ("neon-drift", ("NEON", "DRIFT"), (24, 20, 80), (214, 51, 132), "triangle"),
    ("pixel-quest", ("PIXEL", "QUEST"), (20, 78, 60), (120, 200, 90), "square"),
    ("crystal-hopper", ("CRYSTAL", "HOPPER"), (30, 90, 160), (120, 220, 240), "diamond"),
    ("void-raiders", ("VOID", "RAIDERS"), (10, 10, 20), (90, 40, 160), "circle"),
    ("lost-lighthouse", ("LOST", "LIGHTHOUSE"), (20, 40, 70), (240, 170, 60), "triangle"),
    ("brawl-arena-97", ("BRAWL", "ARENA 97"), (120, 20, 20), (240, 110, 50), "cross"),
    ("striker-cup", ("STRIKER", "CUP"), (20, 110, 50), (190, 235, 120), "circle"),
    ("block-matrix", ("BLOCK", "MATRIX"), (40, 40, 60), (70, 130, 220), "square"),
    ("tactics-nova", ("TACTICS", "NOVA"), (70, 30, 90), (230, 90, 120), "diamond"),
]


def gradient(top, bottom):
    image = Image.new("RGB", (SIZE, SIZE))
    draw = ImageDraw.Draw(image)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        draw.line([(0, y), (SIZE, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return image


def shape(draw, kind, cx, cy, r, fill):
    if kind == "circle":
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    elif kind == "square":
        draw.rectangle([cx - r, cy - r, cx + r, cy + r], fill=fill)
    elif kind == "triangle":
        draw.polygon([(cx, cy - r), (cx + r, cy + r), (cx - r, cy + r)], fill=fill)
    elif kind == "diamond":
        draw.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=fill)
    elif kind == "cross":
        w = r // 3
        draw.rectangle([cx - w, cy - r, cx + w, cy + r], fill=fill)
        draw.rectangle([cx - r, cy - w, cx + r, cy + w], fill=fill)


for name, lines, top, bottom, kind in COVERS:
    image = gradient(top, bottom)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shape(ImageDraw.Draw(overlay), kind, 270, 140, 110, (255, 255, 255, 60))
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, SIZE - 1, 28], fill=(20, 20, 24))  # bandeau façon boîtier PS1
    draw.text((14, 6), "HOMEBREW DEMO", font=ImageFont.truetype(FONT, 14, index=1), fill=(220, 220, 225))
    for i, line in enumerate(lines):
        size = 64 if len(line) <= 7 else 44
        font = ImageFont.truetype(FONT, size, index=1)
        draw.text((24, 230 + i * 72 if size == 64 else 240 + i * 72), line, font=font, fill="white",
                  stroke_width=2, stroke_fill=(0, 0, 0))
    image.save(f"{name}.png", optimize=True)
    print(name)
