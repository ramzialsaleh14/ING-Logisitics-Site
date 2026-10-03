"""Download the site's own assets, then self-host the two web fonts.

Sarabun is the GlobeFarer theme font (Latin); Cairo is its closest match for the
Arabic side of the PDF. Fetching the Google Fonts CSS with a modern UA yields
woff2 URLs, which we mirror locally and rewrite to relative paths so the site
works fully offline.

usage: python tools/download_assets.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch import fetch  # noqa: E402

IMG = "https://ing-logistics.com/wp-content/uploads/2026/10"
SITE_ASSETS = {
    "assets/logo/ing-logo.png": f"{IMG}/cropped-ingLogo.png",
    "raw/user/ING-slide-02.png": f"{IMG}/ING-slide-02.png",
    "raw/user/ING-slide-03.png": f"{IMG}/ING-slide-03.png",
    "raw/user/ING-slide-04.png": f"{IMG}/ING-slide-04.png",
    "raw/user/ING-slide-05.png": f"{IMG}/ING-slide-05.png",
}

FONTS = [
    ("sarabun", "https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap"),
    ("cairo", "https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap"),
]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print(f"  {path}  ({len(data) / 1024:.1f} KB)")


def main():
    print("== site assets ==")
    for path, url in SITE_ASSETS.items():
        try:
            save(path, fetch(url))
        except Exception as e:
            print(f"  FAILED {url}: {e}")

    print("\n== fonts ==")
    for name, css_url in FONTS:
        req_css = fetch_plain(css_url)
        css = req_css.decode("utf-8")
        faces = re.findall(r"@font-face\s*\{[^}]*\}", css)
        out_css, count = [], 0
        for face in faces:
            m = re.search(r"url\((https://[^)]+\.woff2)\)", face)
            if not m:
                continue
            url = m.group(1)
            font_dir = f"assets/fonts/{name}"
            fname = f"{name}-{count:02d}.woff2"
            if not os.path.exists(os.path.join(font_dir, fname)):
                save(os.path.join(font_dir, fname), fetch_raw(url))
            out_css.append(face.replace(url, f"../fonts/{name}/{fname}"))
            count += 1
        os.makedirs("assets/css", exist_ok=True)
        with open(f"assets/css/fonts-{name}.css", "w", encoding="utf-8") as f:
            f.write("\n".join(out_css))
        print(f"  fonts-{name}.css: {count} faces")


def fetch_plain(url):
    import subprocess
    p = subprocess.run(["curl.exe", "-s", "-L", "--max-time", "40", "-A", UA, url],
                       capture_output=True)
    return p.stdout


def fetch_raw(url):
    import subprocess
    p = subprocess.run(["curl.exe", "-s", "-L", "--max-time", "60", "-A", UA, url],
                       capture_output=True)
    return p.stdout


if __name__ == "__main__":
    main()
