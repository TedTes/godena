"""
Generates docs/godena_feature_graphic.png  (1024 × 500 px)
for the Google Play Console feature graphic slot.

Run:  python3 docs/make_feature_graphic.py
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1024, 500
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR   = os.path.dirname(SCRIPT_DIR)
OUT_PATH   = os.path.join(SCRIPT_DIR, "godena_feature_graphic.png")

# ── Palette ───────────────────────────────────────────────
CREAM  = (250, 248, 244)
WARM   = (240, 229, 213)
INK    = (30,  21,  16)
MUTED  = (118, 102, 92)
TERRA  = (196, 98,  45)
OLIVE  = (122, 140, 92)

# ── Helpers ───────────────────────────────────────────────

def make_glow(cx, cy, rx, ry, color, alpha_max, blur_r):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld    = ImageDraw.Draw(layer)
    for i in range(5):
        s = 1.0 - i * 0.16
        a = int(alpha_max * (1.0 - i * 0.20))
        ld.ellipse([cx - rx*s, cy - ry*s, cx + rx*s, cy + ry*s], fill=(*color, a))
    return layer.filter(ImageFilter.GaussianBlur(radius=blur_r))


def load_font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.load_default()


def remove_white_bg(img: Image.Image, threshold=245) -> Image.Image:
    """Replace near-white pixels with transparency."""
    img = img.convert("RGBA")
    data = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = data[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                data[x, y] = (r, g, b, 0)
    return img


# ════════════════════════════════════════════════════════════
# 1. Background — warm horizontal gradient
# ════════════════════════════════════════════════════════════
canvas = Image.new("RGBA", (W, H))
draw   = ImageDraw.Draw(canvas)

for x in range(W):
    t = x / (W - 1)
    r = int(CREAM[0] + (WARM[0] - CREAM[0]) * t)
    g = int(CREAM[1] + (WARM[1] - CREAM[1]) * t)
    b = int(CREAM[2] + (WARM[2] - CREAM[2]) * t)
    draw.line([(x, 0), (x, H)], fill=(r, g, b, 255))

# ════════════════════════════════════════════════════════════
# 2. Atmospheric glows
# ════════════════════════════════════════════════════════════
canvas = Image.alpha_composite(canvas, make_glow(210, 230, 280, 240, TERRA, 28, 70))
canvas = Image.alpha_composite(canvas, make_glow(870, 430, 200, 170, OLIVE, 20, 58))
canvas = Image.alpha_composite(canvas, make_glow(512, 260, 400, 280, TERRA,  7, 80))

# ════════════════════════════════════════════════════════════
# 3. Godena logo icon
# ════════════════════════════════════════════════════════════
icon_src  = Image.open(os.path.join(ROOT_DIR, "assets", "icon.png"))
icon_rgba = remove_white_bg(icon_src, threshold=246)

# Scale icon to fit neatly on left — height-dominant
ICON_H  = 310
scale   = ICON_H / icon_rgba.height
ICON_W  = int(icon_rgba.width * scale)
icon_sm = icon_rgba.resize((ICON_W, ICON_H), Image.LANCZOS)

# Centre icon in left 44% of banner
left_section_cx = int(W * 0.22)
icon_x = left_section_cx - ICON_W // 2
icon_y = (H - ICON_H) // 2

canvas.paste(icon_sm, (icon_x, icon_y), icon_sm)

# Soft drop-shadow under icon (behind it — add before pasting in real pipeline,
# but Pillow compositing requires we add glow then paste icon on top)
shadow = make_glow(
    left_section_cx, H // 2 + 30,
    ICON_W * 0.38, 28,
    (30, 21, 16), 30, 18,
)
# Re-composite: background → shadow → icon
canvas2 = Image.new("RGBA", (W, H))
draw2   = ImageDraw.Draw(canvas2)
for x in range(W):
    t = x / (W - 1)
    r = int(CREAM[0] + (WARM[0] - CREAM[0]) * t)
    g = int(CREAM[1] + (WARM[1] - CREAM[1]) * t)
    b = int(CREAM[2] + (WARM[2] - CREAM[2]) * t)
    draw2.line([(x, 0), (x, H)], fill=(r, g, b, 255))

canvas2 = Image.alpha_composite(canvas2, make_glow(210, 230, 280, 240, TERRA, 28, 70))
canvas2 = Image.alpha_composite(canvas2, make_glow(870, 430, 200, 170, OLIVE, 20, 58))
canvas2 = Image.alpha_composite(canvas2, make_glow(512, 260, 400, 280, TERRA,  7, 80))
canvas2 = Image.alpha_composite(canvas2, shadow)
canvas2.paste(icon_sm, (icon_x, icon_y), icon_sm)
canvas = canvas2

# ════════════════════════════════════════════════════════════
# 4. Load fonts
# ════════════════════════════════════════════════════════════
HELVETICA = "/System/Library/Fonts/HelveticaNeue.ttc"
NEWYORK   = "/System/Library/Fonts/NewYork.ttf"

f_wordmark = load_font(NEWYORK,   92)
f_tagline  = load_font(HELVETICA, 17, index=0)
f_label    = load_font(HELVETICA, 11, index=0)

# ════════════════════════════════════════════════════════════
# 5. Right-side text block
# ════════════════════════════════════════════════════════════
draw = ImageDraw.Draw(canvas)

TX = 468   # left edge of text column

# Measure wordmark
word   = "Godena"
wm_bb  = f_wordmark.getbbox(word)
wm_h   = wm_bb[3] - wm_bb[1]

tag_text = "Find your community. Meet your people."
tag_bb   = f_tagline.getbbox(tag_text)
tag_h    = tag_bb[3] - tag_bb[1]

label_h = 10

# Vertical centering: rule + label + wordmark + tagline
block_h = 2 + 6 + label_h + 16 + wm_h + 14 + tag_h
block_y = (H - block_h) // 2

rule_y  = block_y
label_y = rule_y + 2 + 6
wm_y    = label_y + label_h + 16
tag_y   = wm_y + wm_h + 14

# Accent rule
draw.rectangle([TX, rule_y, TX + 28, rule_y + 2], fill=(*TERRA, 210))

# "GODENA" label with manual letter-spacing
spacing = 4.5
cx_cur  = TX
for ch in "GODENA":
    draw.text((cx_cur, label_y), ch, font=f_label, fill=(*TERRA, 210))
    bb      = f_label.getbbox(ch)
    cx_cur += (bb[2] - bb[0]) + spacing

# Wordmark — offset by bb[1] to align glyph tops precisely
draw.text((TX, wm_y - wm_bb[1]), word, font=f_wordmark, fill=(*INK, 255))

# Tagline
draw.text((TX, tag_y), tag_text, font=f_tagline, fill=(*MUTED, 195))

# Hairline divider between icon and text columns
div_x = int(W * 0.44)
draw.line([(div_x, 72), (div_x, H - 72)], fill=(*TERRA, 13), width=1)

# ════════════════════════════════════════════════════════════
# 6. Save
# ════════════════════════════════════════════════════════════
canvas.convert("RGB").save(OUT_PATH, "PNG")
print(f"✓  Saved → {OUT_PATH}  ({W}×{H} px)")
