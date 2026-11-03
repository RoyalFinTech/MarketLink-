#!/usr/bin/env python3
"""Generate correctly sized MarketLink PWA, Apple and social-preview images from the official logo.

The source artwork is never stretched, recoloured or redrawn. All outputs use contain-fit
placement on a branded square or social canvas.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "frontend" / "assets"
SOURCE = ASSETS / "marketlink-logo.png"
NAVY_TOP = (19, 55, 73)
NAVY_BOTTOM = (6, 24, 37)
TEAL = (19, 111, 116)
GOLD = (220, 174, 77)

def gradient(size, top=NAVY_TOP, bottom=NAVY_BOTTOM):
    w, h = size
    image = Image.new("RGB", size)
    pixels = image.load()
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(w):
            pixels[x, y] = color
    return image.convert("RGBA")

def load_logo():
    image = Image.open(SOURCE).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        image = image.crop(bbox)
    if image.width == 0 or image.height == 0:
        raise RuntimeError("Official MarketLink logo has empty transparent bounds")
    return image

LOGO = load_logo()

def contained_logo(max_width, max_height):
    # Unlike thumbnail(), calculate a contain-fit scale that also enlarges the
    # 220x177 source for high-resolution canvases. This keeps the ratio exact.
    scale = min(max_width / LOGO.width, max_height / LOGO.height)
    width = max(1, round(LOGO.width * scale))
    height = max(1, round(LOGO.height * scale))
    return LOGO.resize((width, height), Image.Resampling.LANCZOS)

def make_icon(size, maskable=False):
    canvas = gradient((size, size))
    draw = ImageDraw.Draw(canvas, "RGBA")
    # A subtle central glow; no extra symbol or substitute logo is introduced.
    draw.ellipse(
        (size * .12, size * .08, size * .88, size * .88),
        fill=(TEAL[0], TEAL[1], TEAL[2], 26)
    )
    factor = .54 if maskable else .76
    logo = contained_logo(round(size * factor), round(size * factor))
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    # Preserve the original mark while giving it a restrained branded base.
    draw = ImageDraw.Draw(canvas)
    draw.line(
        (size * .22, size * .86, size * .78, size * .86),
        fill=(*GOLD, 180), width=max(1, round(size / 170))
    )
    return canvas.convert("RGB")

for size in (192, 512):
    make_icon(size, maskable=False).save(
        ASSETS / f"marketlink-app-icon-{size}.png",
        format="PNG", optimize=True
    )
    make_icon(size, maskable=True).save(
        ASSETS / f"marketlink-app-icon-maskable-{size}.png",
        format="PNG", optimize=True
    )

# Apple Home Screen icon: square, opaque background, no pre-rounded corners.
apple = make_icon(180, maskable=False)
apple.save(ASSETS / "apple-touch-icon-180.png", format="PNG", optimize=True)

favicon = make_icon(48, maskable=False)
favicon.resize((32, 32), Image.Resampling.LANCZOS).save(
    ASSETS / "favicon-32.png", format="PNG", optimize=True
)

# WhatsApp/social share card: recommended 1200 x 630 raster image.
W, H = 1200, 630
social = gradient((W, H), top=(18, 51, 69), bottom=(5, 22, 34))
draw = ImageDraw.Draw(social, "RGBA")
# Restrained accent glow stays behind the logo and does not obstruct text.
draw.ellipse((-120, -190, 610, 540), fill=(22, 114, 119, 32))
draw.rounded_rectangle((58, 58, 1142, 572), radius=34, outline=(214, 173, 91, 110), width=2)

logo = contained_logo(430, 360)
logo_x = 95 + (430 - logo.width) // 2
logo_y = (H - logo.height) // 2
social.alpha_composite(logo, (logo_x, logo_y))
draw = ImageDraw.Draw(social)
draw.rounded_rectangle((590, 142, 596, 488), radius=3, fill=GOLD)

font_bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
font_regular_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
try:
    title_font = ImageFont.truetype(font_bold_path, 46)
    sub_font = ImageFont.truetype(font_regular_path, 27)
    label_font = ImageFont.truetype(font_bold_path, 19)
except OSError:
    title_font = ImageFont.load_default()
    sub_font = ImageFont.load_default()
    label_font = ImageFont.load_default()

text_x = 650
draw.text((text_x, 205), "MarketLink Gambia", font=title_font, fill=(250, 252, 253))
draw.text((text_x + 2, 285), "Your Local Marketplace in The Gambia", font=sub_font, fill=(221, 231, 235))
draw.text((text_x + 2, 350), "SHOP  •  SELL  •  DELIVER", font=label_font, fill=(232, 189, 98))
draw.text((text_x + 2, 411), "Local vendors  •  Secure ordering  •  Delivery", font=label_font, fill=(185, 204, 212))

social.convert("RGB").save(
    ASSETS / "marketlink-og-preview.jpg",
    format="JPEG", quality=88, optimize=True, progressive=True
)

# Guard against accidentally shipping malformed dimensions or an oversized preview.
expected = {
    "marketlink-app-icon-192.png": (192, 192),
    "marketlink-app-icon-512.png": (512, 512),
    "marketlink-app-icon-maskable-192.png": (192, 192),
    "marketlink-app-icon-maskable-512.png": (512, 512),
    "apple-touch-icon-180.png": (180, 180),
    "favicon-32.png": (32, 32),
    "marketlink-og-preview.jpg": (1200, 630),
}
for name, dimensions in expected.items():
    path = ASSETS / name
    with Image.open(path) as output:
        if output.size != dimensions:
            raise RuntimeError(f"{name}: expected {dimensions}, got {output.size}")
if (ASSETS / "marketlink-og-preview.jpg").stat().st_size > 600 * 1024:
    raise RuntimeError("Open Graph image exceeds the 600 KB WhatsApp-friendly target")
print("Generated MarketLink PNG/JPEG assets from the unchanged official logo:")
for name in expected:
    path = ASSETS / name
    with Image.open(path) as output:
        print(f" - {name}: {output.width}x{output.height}, {path.stat().st_size} bytes")
