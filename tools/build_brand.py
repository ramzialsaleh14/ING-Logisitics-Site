"""Prepare the user's own slider artwork and the ING logo variants:
 - the four uploaded slides become optimised JPEG hero backgrounds
 - the PNG logo is trimmed of transparent padding and re-exported in a dark
   variant (light backgrounds) and a white variant (dark backgrounds/footer)

usage: python tools/build_brand.py
"""
import glob
import os
import subprocess

from PIL import Image

OUT = "assets/img"
LOGO_DIR = "assets/logo"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def build_slides():
    slides = sorted(glob.glob("raw/user/ING-slide-*.png"))
    for i, p in enumerate(slides, 1):
        im = Image.open(p).convert("RGB")
        dst = os.path.join(OUT, f"slide-{i}.jpg")
        im.save(dst, "JPEG", quality=80, optimize=True, progressive=True)
        print(f"  slide-{i}.jpg  {im.width}x{im.height}  {os.path.getsize(dst) / 1024:6.0f} KB"
              f"  <- {os.path.basename(p)}")
    return len(slides)


def build_logo():
    src = os.path.join(LOGO_DIR, "ing-logo.png")
    im = Image.open(src).convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if bbox:
        im = im.crop(bbox)
    # header/light-background logo: keep original colours, referenced at ~52px tall
    h = 160
    dark = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    dark.save(os.path.join(LOGO_DIR, "ing-logo-dark.png"), optimize=True)
    print(f"  ing-logo-dark.png  {dark.width}x{dark.height}")

    # footer/dark-background logo: alpha preserved, RGB forced white
    white = Image.new("RGBA", im.size, (255, 255, 255, 0))
    white.putalpha(im.getchannel("A"))
    white = white.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    white.save(os.path.join(LOGO_DIR, "ing-logo-light.png"), optimize=True)
    print(f"  ing-logo-light.png {white.width}x{white.height}")

    # favicon
    sq = im.copy()
    side = max(sq.size)
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    canvas.paste(sq, ((side - sq.width) // 2, (side - sq.height) // 2))
    canvas.resize((192, 192), Image.LANCZOS).save(
        os.path.join(LOGO_DIR, "favicon.png"), optimize=True)
    print("  favicon.png        192x192")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("== slides ==")
    build_slides()
    print("\n== logo ==")
    build_logo()
