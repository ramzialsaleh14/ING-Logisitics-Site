"""Describe each PDF page deterministically: text spans (font, size, colour,
position) and placed images (xref, size, position). This is how we map brochure
content and artwork onto site sections without guessing.

usage: python tools/pdf_layout.py raw/pdf-layout.txt
"""
import sys

import pymupdf

PDF = r"c:\Users\Ramzi\OneDrive\Desktop\ing_company_profile_updated0.pdf"


def hexcol(c):
    return "#%06x" % (c & 0xFFFFFF)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "raw/pdf-layout.txt"
    doc = pymupdf.open(PDF)
    w = open(out, "w", encoding="utf-8")

    def p(*a):
        print(*a, file=w)

    for pno, page in enumerate(doc, 1):
        p(f"\n{'=' * 78}\nPAGE {pno}  ({page.rect.width:.0f}x{page.rect.height:.0f})\n{'=' * 78}")

        # page background: sample the top-left pixel of the rendered page
        pix = page.get_pixmap(matrix=pymupdf.Matrix(0.1, 0.1))
        px = pix.pixel(2, 2)
        px = px[:3] if isinstance(px, (tuple, list)) else (
            (px >> 16) & 255, (px >> 8) & 255, px & 255)
        p(f"page-background(sampled): #{px[0]:02x}{px[1]:02x}{px[2]:02x}")

        p("\n-- IMAGES --")
        for info in page.get_images(full=True):
            xref = info[0]
            for r in page.get_image_rects(xref):
                p(f"  xref={xref:<5} {info[2]}x{info[3]}px  placed at "
                  f"x={r.x0:7.1f} y={r.y0:7.1f} w={r.width:7.1f} h={r.height:7.1f}")

        p("\n-- TEXT --")
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for line in b["lines"]:
                for s in line["spans"]:
                    t = s["text"].strip()
                    if not t:
                        continue
                    p(f"  x={s['bbox'][0]:7.1f} y={s['bbox'][1]:7.1f} "
                      f"size={s['size']:5.1f} color={hexcol(s['color'])} "
                      f"font={s['font'][:26]:28s} | {t}")
    w.close()
    print("wrote", out)


if __name__ == "__main__":
    main()
