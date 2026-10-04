"""Rebuild the logo assets from the official artwork in the brand guidelines.

The guidelines ship the logo as vectors (p10 primary logomark, p12 iconic
logomark), so the site's logo is re-cut from them instead of resampled from the
old raster: that guarantees the two brand colours are exact and yields the
variants the guidelines prescribe (p11 "2.4 Logo Variation" — two colour, one
colour, one colour reverse). The favicon uses the iconic logomark, which
p10 "2.3 Logo Usage" designates for small sizes.

Outputs (sizes match what the pages already reference):
  ing-logo.png        two-colour master, transparent
  ing-logo-dark.png   two colour, for light backgrounds         389x160
  ing-logo-light.png  one colour reverse (white)                389x160
  ing-mark.png        iconic logomark, two colour, transparent
  favicon.png         iconic logomark reversed on charcoal      192x192

usage: python tools/build_brand.py
"""
import os

import numpy as np
import pymupdf
from PIL import Image, ImageDraw

from brand_source import CHARCOAL, ICONIC_TWO_COLOR, ORANGE, PDF, PRIMARY

LOGO_DIR = "assets/logo"
SCALE = 8                 # PDF points -> pixels for the vector render
HEADER = (389, 160)       # what the header and footer markup reference
MASTER_W = 1576
MARK_W = 640
FAVICON = 192


def rgb(hex_value):
    v = hex_value.lstrip("#")
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def render(spec, colour=None, scale=SCALE):
    """Rasterise a clip from the guidelines as transparent RGBA.

    With `colour` set, every opaque pixel is forced to that colour, which is how
    the one-colour and reverse variants are made.
    """
    page = pymupdf.open(PDF)[spec["page"] - 1]
    clip = pymupdf.Rect(*spec["clip"])
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=True)
    raw = np.array(Image.frombytes("RGBA", (pix.width, pix.height), pix.samples))
    ys, xs = np.nonzero(raw[:, :, 3] > 8)
    raw = raw[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    alpha = raw[:, :, 3]

    out = np.empty_like(raw)
    if colour is None:
        # Keep the artwork's own two colours, snapped to the exact brand values
        # so antialiasing cannot drift the palette.
        orange = (raw[:, :, 0].astype(int) - raw[:, :, 1].astype(int)) > 40
        out[~orange] = rgb(CHARCOAL) + (0,)
        out[orange] = rgb(ORANGE) + (0,)
    else:
        out[:, :] = rgb(colour) + (0,)
    out[:, :, 3] = alpha
    return Image.fromarray(out)


def fit(im, width):
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def place(im, size):
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    return canvas


def build_logo():
    two_colour = render(PRIMARY)
    master = fit(two_colour, MASTER_W)
    master.save(os.path.join(LOGO_DIR, "ing-logo.png"), optimize=True)
    print(f"  ing-logo.png        {master.width}x{master.height}  two colour (master)")

    dark = place(fit(two_colour, HEADER[0]), HEADER)
    dark.save(os.path.join(LOGO_DIR, "ing-logo-dark.png"), optimize=True)
    print(f"  ing-logo-dark.png   {dark.width}x{dark.height}  two colour")

    white = place(fit(render(PRIMARY, colour="#ffffff"), HEADER[0]), HEADER)
    white.save(os.path.join(LOGO_DIR, "ing-logo-light.png"), optimize=True)
    print(f"  ing-logo-light.png  {white.width}x{white.height}  one colour reverse")


def build_mark():
    mark = render(ICONIC_TWO_COLOR)
    master = fit(mark, MARK_W)
    master.save(os.path.join(LOGO_DIR, "ing-mark.png"), optimize=True)
    print(f"  ing-mark.png        {master.width}x{master.height}  iconic logomark, two colour")

    # A two-colour favicon would lose its charcoal half on dark browser chrome,
    # so use the reverse treatment on a charcoal tile instead.
    a = np.array(mark).copy()
    alpha = a[:, :, 3].copy()
    orange = (a[:, :, 0].astype(int) - a[:, :, 1].astype(int)) > 40
    a[~orange] = rgb("#ffffff") + (255,)
    a[orange] = rgb(ORANGE) + (255,)
    a[:, :, 3] = alpha
    reversed_mark = fit(Image.fromarray(a), round(FAVICON * 0.72))

    tile = Image.new("RGBA", (FAVICON, FAVICON), (0, 0, 0, 0))
    mask = Image.new("L", (FAVICON, FAVICON), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, FAVICON - 1, FAVICON - 1), radius=42, fill=255)
    tile.paste(Image.new("RGBA", (FAVICON, FAVICON), rgb(CHARCOAL) + (255,)), (0, 0), mask)
    tile.alpha_composite(reversed_mark, ((FAVICON - reversed_mark.width) // 2,
                                        (FAVICON - reversed_mark.height) // 2))
    tile.save(os.path.join(LOGO_DIR, "favicon.png"), optimize=True)
    print(f"  favicon.png         {FAVICON}x{FAVICON}  reverse mark on charcoal")


if __name__ == "__main__":
    os.makedirs(LOGO_DIR, exist_ok=True)
    print("== logo ==")
    build_logo()
    print("\n== iconic logomark ==")
    build_mark()
