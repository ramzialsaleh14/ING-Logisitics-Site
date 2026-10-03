"""The PDF's Arabic is stored as Arabic Presentation Forms-B (shaped glyphs).
NFKC normalisation maps those back to base letters so the text is editable and
screen-reader friendly. This prints the normalised Arabic per page for review.

usage: python tools/normalize_arabic.py raw/pdf-text-ar.txt
"""
import re
import sys
import unicodedata

import pymupdf

PDF = r"c:\Users\Ramzi\OneDrive\Desktop\ing_company_profile_updated0.pdf"
ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "raw/pdf-text-ar.txt"
    doc = pymupdf.open(PDF)
    lines = []
    for pno, page in enumerate(doc, 1):
        lines.append(f"\n===== PAGE {pno} =====")
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for line in b["lines"]:
                txt = "".join(s["text"] for s in line["spans"])
                if not ARABIC.search(txt):
                    continue
                norm = unicodedata.normalize("NFKC", txt)
                norm = re.sub(r"\s+", " ", norm).strip()
                lines.append(f"  {norm}")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
