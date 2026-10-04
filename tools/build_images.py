"""Build the site's photography from the brand guidelines.

The guidelines carry their photography as a single 2x2 board (`p25-28` "Visual
Application", embedded as one 1536x1024 image with white gutters at row 511 and
column 767). Each quarter is only ~767x511, so every photo is passed through
EDSR (super-resolution) first and cropped to the exact size the site already
ships — that keeps the markup's width/height attributes valid while recovering
as much detail as the source allows.

EDSR model files ship in tools/models/ (38 MB, not used by the site itself).
Re-fetch if missing:
  curl -L -o tools/models/EDSR_x4.pb https://github.com/Saafke/EDSR_Tensorflow/raw/master/models/EDSR_x4.pb
Without it the script falls back to a plain Lanczos upscale.

usage: python tools/build_images.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter

from brand_source import BOARD, PDF, PHOTO_BOXES, PHOTO_TARGETS

OUT = "assets/img"
RAW = "raw/pdf-images"
MODEL = "tools/models/EDSR_x4.pb"
EDSR_SCALE = 4


def extract_board():
    """Pull the shared 2x2 board image out of the guidelines (cached in raw/)."""
    os.makedirs(RAW, exist_ok=True)
    dst = os.path.join(RAW, BOARD)
    if os.path.exists(dst):
        return dst
    import pymupdf

    doc = pymupdf.open(PDF)
    for page in doc:
        for info in page.get_images(full=True):
            if info[0] == 101:
                pix = pymupdf.Pixmap(doc, 101)
                if pix.n - pix.alpha >= 4:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                pix.save(dst)
                return dst
    raise SystemExit(f"image xref 101 not found in {PDF}")


def upscale(im, model=MODEL, scale=EDSR_SCALE):
    """Run EDSR over an image; falls back to Lanczos when the model is absent."""
    if not os.path.exists(model):
        print(f"  ! {model} missing - falling back to Lanczos ({scale}x)")
        return im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    import cv2

    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(model)
    sr.setModel("edsr", scale)
    return Image.fromarray(sr.upsample(np.array(im.convert("RGB"))))


def cover_crop(im, width, height, focus):
    """Scale to cover width x height, then slide the crop window to `focus`."""
    scale = max(width / im.width, height / im.height)
    resized = im.resize((max(width, round(im.width * scale)),
                         max(height, round(im.height * scale))), Image.LANCZOS)
    x = round((resized.width - width) * focus[0])
    y = round((resized.height - height) * focus[1])
    return resized.crop((x, y, x + width, y + height))


def main():
    os.makedirs(OUT, exist_ok=True)
    board = Image.open(extract_board()).convert("RGB")
    print(f"board {board.width}x{board.height} <- {os.path.basename(BOARD)}")

    cache = {}
    for dst, (photo, width, height, focus) in PHOTO_TARGETS.items():
        src = board.crop(PHOTO_BOXES[photo])
        if photo not in cache:
            print(f"  upscaling {photo} {src.width}x{src.height} ...")
            cache[photo] = upscale(src)
        # Crop the tight format out of the super-resolved pixels (not the source)
        # so the tighter aspect ratios still sample real detail.
        im = cover_crop(cache[photo], width * EDSR_SCALE, height * EDSR_SCALE, focus)
        im = im.resize((width, height), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=1.3, percent=55, threshold=3))
        path = os.path.join(OUT, dst)
        im.save(path, "JPEG", quality=82, optimize=True, progressive=True)
        print(f"  {dst:22s} {width}x{height}  {os.path.getsize(path) / 1024:6.0f} KB"
              f"  <- {photo} {PHOTO_BOXES[photo]}")


if __name__ == "__main__":
    main()
