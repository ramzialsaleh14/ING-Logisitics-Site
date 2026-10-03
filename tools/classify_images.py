"""Classify each extracted PDF image so we can place it on the right section:
dominant colours, colour count (photo vs flat graphic), transparency and aspect.

usage: python tools/classify_images.py raw/image-report.txt
"""
import glob
import os
import sys

from PIL import Image

# page -> section, from raw/pdf-layout.txt
PAGE_SECTION = {
    1: "Cover", 2: "Hero slide 1", 3: "Hero slide 2", 4: "Hero slide 3",
    5: "Our Values", 6: "Our Story", 7: "Our Mission", 8: "Our Vision",
    9: "Our Services (divider)", 10: "Our Services (intro)",
    11: "Warehouse Services Management", 12: "Delivery and Distribution",
    13: "Track and Trace", 14: "Various Offices for Work",
    15: "Our Clients", 16: "Our Team", 17: "Thank you",
}


def analyse(path):
    im = Image.open(path)
    alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    rgb = im.convert("RGB")
    small = rgb.copy()
    small.thumbnail((160, 160))
    colors = small.getcolors(maxcolors=1 << 24) or []
    colors.sort(reverse=True)
    total = sum(c for c, _ in colors) or 1
    top = [(c / total, "#%02x%02x%02x" % v) for c, v in colors[:4]]
    # colour diversity: how many distinct colours hold 90% of the pixels
    acc, n = 0, 0
    for c, _ in colors:
        acc += c
        n += 1
        if acc / total >= 0.9:
            break
    kind = "photo" if n > 400 else ("icon/graphic" if n < 40 else "mixed graphic")
    return dict(w=im.width, h=im.height, aspect=round(im.width / max(1, im.height), 2),
                alpha=alpha, distinct90=n, kind=kind, top=top)


def page_of(name):
    import re
    m = re.search(r"_p(\d+)\.png$", name)
    return int(m.group(1)) if m else 0


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "raw/image-report.txt"
    rows = []
    for p in sorted(glob.glob("raw/pdf-images/*.png")):
        name = os.path.basename(p)
        a = analyse(p)
        a["name"] = name
        a["page"] = page_of(name)
        a["section"] = PAGE_SECTION.get(a["page"], "?")
        a["kb"] = os.path.getsize(p) // 1024
        rows.append(a)
    with open(out, "w", encoding="utf-8") as f:
        for a in rows:
            f.write(f"{a['name']}\n")
            f.write(f"   section : p{a['page']} {a['section']}\n")
            f.write(f"   size    : {a['w']}x{a['h']}  aspect={a['aspect']}  {a['kb']}KB  "
                    f"alpha={a['alpha']}  distinct90={a['distinct90']}  kind={a['kind']}\n")
            f.write(f"   colours : {', '.join(f'{p:.0%} {c}' for p, c in a['top'])}\n")
    print(f"wrote {out} ({len(rows)} images)")
    for a in rows:
        print(f"p{a['page']:>2} {a['section'][:26]:28s} {a['name'][:34]:36s} "
              f"{a['w']:>5}x{a['h']:<5} {a['kind']:<15} d90={a['distinct90']:<5} "
              f"{a['top'][0][1] if a['top'] else ''}")


if __name__ == "__main__":
    main()
