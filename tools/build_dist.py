"""Assemble dist/ - the deployable subset of the project.

Only the pages and assets/ are runtime files. tools/ (capture and validation
scripts) and .verify/ (screenshots from verify.py) are development-only, so
keeping them out of dist/ means they are never uploaded or served.

usage: python tools/build_dist.py
"""
import glob
import os
import shutil

OUT = "dist"
RUNTIME = ["assets"]


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    pages = sorted(glob.glob("*.html"))
    for page in pages:
        shutil.copy2(page, OUT)
    for name in RUNTIME:
        shutil.copytree(name, os.path.join(OUT, name))

    files = [os.path.join(root, f)
             for root, _, names in os.walk(OUT) for f in names]
    size = sum(os.path.getsize(f) for f in files) / 1024
    print(f"dist/  {len(pages)} pages, {len(files) - len(pages)} assets, "
          f"{size:.0f} KB")
    for page in pages:
        print(f"  {os.path.getsize(os.path.join(OUT, page)) / 1024:7.1f} KB  {page}")


if __name__ == "__main__":
    main()
