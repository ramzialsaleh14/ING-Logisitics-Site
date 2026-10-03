"""Extract the embedded artwork from the brochure into raw/pdf-images/.

Each file is named xref<id>_<w>x<h>_p<page>.png, where the page number is the
brochure slide the image is placed on — that naming is what lets
tools/classify_images.py and tools/build_images.py map artwork to site sections.

usage: python tools/extract_pdf_images.py
"""
import os

import pymupdf

PDF = r"c:\Users\Ramzi\OneDrive\Desktop\ing_company_profile_updated0.pdf"
OUT = "raw/pdf-images"


def main():
    os.makedirs(OUT, exist_ok=True)
    doc = pymupdf.open(PDF)
    seen = set()
    rows = []
    for pno, page in enumerate(doc, 1):
        for info in page.get_images(full=True):
            xref = info[0]
            if xref in seen:
                continue
            seen.add(xref)
            pix = pymupdf.Pixmap(doc, xref)
            if pix.n - pix.alpha >= 4:          # CMYK or similar -> sRGB
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            name = f"xref{xref:04d}_{pix.width}x{pix.height}_p{pno}.png"
            path = os.path.join(OUT, name)
            pix.save(path)
            rows.append((name, os.path.getsize(path)))

    for name, size in sorted(rows, key=lambda r: -r[1]):
        print(f"  {name:52s} {size / 1024:9.1f} KB")
    print(f"{len(rows)} images -> {OUT}")


if __name__ == "__main__":
    main()
