"""Build the site's image set from the brochure's own photography.

Every file is cut from one of the five photographs embedded in
ing_company_profile_updated0.pdf, read straight out of the PDF at the
resolution it stores them (up to 5040x3360) - never from an earlier
downscaled copy.

The brochure holds five photographs but the pages need more image slots than
that, so each photograph is cut more than once. A cut is defined by the aspect
ratio it is destined for and a vertical focus (0 = top, 1 = bottom), which
together pick a visibly different region of the original: the slider takes a
cinematic 16:9 frame, the section insets take a taller frame anchored lower
down, and the full-bleed bands take a wide letterbox anchored somewhere else
again. The result is that no page shows the same framing twice.

usage: python tools/build_images.py
"""
import os

import pymupdf
from PIL import Image

PDF = r"c:\Users\Ramzi\OneDrive\Desktop\ing_company_profile_updated0.pdf"
OUT = "assets/img"

# the brochure's five photographs, by xref -> the page they belong to
PHOTOS = {
    "6040": "p5  Our Values",
    "6058": "p6  Our Story",
    "6269": "p9  Our Services divider",
    "6315": "p10 Our Services",
    "6641": "p17 Thank you",
}

# (xref, output, aspect w:h, max width, vertical focus, jpeg quality)
IMAGES = [
    # ---- home slider: one cinematic frame per photograph used in the hero
    ("6269", "hero-1.jpg", 16 / 9, 1920, 0.32, 84),
    ("6315", "hero-2.jpg", 16 / 9, 1920, 0.26, 84),
    ("6641", "hero-3.jpg", 16 / 9, 1920, 0.38, 84),

    # ---- full-bleed bands and page headers: wide letterbox, heavily overlaid
    ("6269", "band-quote.jpg", 2.4, 1920, 0.74, 82),
    ("6058", "band-services.jpg", 2.4, 1920, 0.70, 82),
    ("6269", "page-head-clients.jpg", 2.4, 1920, 0.12, 82),
    ("6058", "page-head-team.jpg", 2.4, 1920, 0.14, 82),
    ("6315", "page-head-contact.jpg", 2.4, 1920, 0.20, 82),

    # ---- section insets: framed differently from the slider frame above
    ("6058", "story.jpg", 1.0, 1400, 0.82, 84),
    ("6040", "values.jpg", 1.63, 1600, 0.86, 84),
    ("6315", "services-intro.jpg", 1.5, 1600, 0.84, 84),
    ("6269", "services-hero.jpg", 1.5, 1600, 0.80, 84),
    ("6641", "cta.jpg", 1.5, 1600, 0.86, 84),
]


def load(doc, xref):
    pix = pymupdf.Pixmap(doc, int(xref))
    if pix.n != 3:                      # CMYK or RGB+alpha -> plain sRGB
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def cut(im, aspect, max_width, focus):
    w, h = im.size
    if w / h > aspect:                  # wider than needed -> trim the sides
        tw = round(h * aspect)
        left = round((w - tw) / 2)
        im = im.crop((left, 0, left + tw, h))
    else:                               # taller than needed -> trim the ends
        th = round(w / aspect)
        top = round((h - th) * focus)
        im = im.crop((0, top, w, top + th))
    if im.width > max_width:
        im = im.resize((max_width, round(im.height * max_width / im.width)),
                       Image.LANCZOS)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    doc = pymupdf.open(PDF)
    print(f"source: {os.path.basename(PDF)}  ({len(doc)} pages)\n")

    total = 0
    for xref, name, aspect, max_width, focus, quality in IMAGES:
        src = load(doc, xref)
        out = cut(src, aspect, max_width, focus)
        path = os.path.join(OUT, name)
        out.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
        size = os.path.getsize(path)
        total += size
        print(f"  {name:24s} {out.width:5d}x{out.height:<5d}  {size / 1024:7.1f} KB  "
              f"<- {PHOTOS[xref]:24s} focus={focus}")

    print(f"\n{len(IMAGES)} images, {total / 1024 / 1024:.2f} MB -> {OUT}")


if __name__ == "__main__":
    main()
