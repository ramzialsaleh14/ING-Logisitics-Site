"""Render each PDF page to a PNG (for visual reference) and build contact
sheets of the 17 pages and of the 32 embedded images, so the whole brochure can
be reviewed in a couple of glances.

usage: python tools/render_pdf.py
"""
import glob
import os

import pymupdf
from PIL import Image

PDF = r"c:\Users\Ramzi\OneDrive\Desktop\ing_company_profile_updated0.pdf"
PAGES_DIR = "raw/pdf-pages"
IMGS_DIR = "raw/pdf-images"


def render_pages():
    os.makedirs(PAGES_DIR, exist_ok=True)
    doc = pymupdf.open(PDF)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=pymupdf.Matrix(0.55, 0.55))
        pix.save(os.path.join(PAGES_DIR, f"page-{i + 1:02d}.png"))
    print(f"rendered {doc.page_count} pages")


def contact_sheet(paths, out, cols=3, cell=(640, 360), label=True):
    if not paths:
        return
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell[0], rows * cell[1]), (24, 24, 24))
    for i, p in enumerate(paths):
        try:
            im = Image.open(p).convert("RGB")
        except Exception:
            continue
        im.thumbnail(cell, Image.LANCZOS)
        x = (i % cols) * cell[0] + (cell[0] - im.width) // 2
        y = (i // cols) * cell[1] + (cell[1] - im.height) // 2
        sheet.paste(im, (x, y))
    sheet.save(out, quality=88)
    print(f"sheet -> {out} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    render_pages()
    pages = sorted(glob.glob(os.path.join(PAGES_DIR, "*.png")))
    contact_sheet(pages[:9], "raw/sheet-pages-1.png", cols=3)
    contact_sheet(pages[9:], "raw/sheet-pages-2.png", cols=3)
    imgs = sorted(glob.glob(os.path.join(IMGS_DIR, "*.png")))
    contact_sheet(imgs[:16], "raw/sheet-imgs-1.png", cols=4, cell=(420, 300))
    contact_sheet(imgs[16:], "raw/sheet-imgs-2.png", cols=4, cell=(420, 300))
