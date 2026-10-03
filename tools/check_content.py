"""Audit content integrity across the built pages:
  * every data-i18n key resolves to an Arabic string (and flag unused keys)
  * every internal link points at a file that exists
  * every local asset reference exists on disk
  * every page parses, has exactly one <h1>, and a sensible heading order

usage: python tools/check_content.py
"""
import glob
import json
import os
import re
import subprocess
import sys

from bs4 import BeautifulSoup

PAGES = sorted(glob.glob("*.html"))
failures = []


def node_keys():
    out = subprocess.run(
        ["node", "-e",
         "global.window={};require('./assets/js/i18n.js');"
         "process.stdout.write(JSON.stringify(Object.keys(window.ING_I18N.ar)))"],
        capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit("node failed: " + out.stderr)
    return set(json.loads(out.stdout))


def main():
    ar_keys = node_keys()
    print(f"i18n dictionary: {len(ar_keys)} Arabic keys\n")

    used = set()
    corpus = ""
    for page in PAGES:
        html = open(page, encoding="utf-8").read()
        corpus += html
        soup = BeautifulSoup(html, "lxml")

        # ---- i18n coverage
        for attr in ("data-i18n", "data-i18n-placeholder", "data-i18n-aria"):
            for el in soup.select(f"[{attr}]"):
                used.add(el.get(attr))

        # ---- structure
        h1s = soup.find_all("h1")
        if len(h1s) != 1:
            failures.append(f"{page}: expected exactly 1 <h1>, found {len(h1s)}")
        if not soup.find("main"):
            failures.append(f"{page}: no <main>")
        if not soup.select_one('meta[name="description"]'):
            failures.append(f"{page}: no meta description")
        if not soup.select_one('html[lang]'):
            failures.append(f"{page}: <html> missing lang")

        # ---- links
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#", "javascript:")):
                continue
            path = href.split("#")[0]
            if path and not os.path.exists(path):
                failures.append(f"{page}: dead link -> {href}")

        # ---- assets
        for el in soup.find_all(["img", "script", "link"]):
            url = el.get("src") or el.get("href")
            if not url or url.startswith(("http://", "https://", "//", "data:", "#", "mailto:")):
                continue
            if url.endswith((".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico")):
                if not os.path.exists(url.split("?")[0]):
                    failures.append(f"{page}: missing asset -> {url}")

        # ---- heading order sanity
        levels = [int(h.name[1]) for h in soup.find_all(re.compile(r"^h[1-6]$"))]
        for a, b in zip(levels, levels[1:]):
            if b - a > 1:
                failures.append(f"{page}: heading level jumps h{a} -> h{b}")

        print(f"  {page:22s} h1={len(h1s)} links={len(soup.find_all('a'))} "
              f"i18n={len(soup.select('[data-i18n]'))}")

    print()
    # keys can also be pulled in by JS (form status, <title>, meta description)
    for js in glob.glob("assets/js/*.js"):
        corpus += open(js, encoding="utf-8").read()
    referenced = {k for k in ar_keys if '"%s"' % k in corpus or "'%s'" % k in corpus}

    missing = sorted(used - ar_keys)
    unused = sorted(ar_keys - used - referenced)
    if missing:
        failures.append(f"missing Arabic translations: {missing}")
    print(f"keys used: {len(used)}   missing: {len(missing)}   unused: {len(unused)}")
    if missing:
        print("  MISSING:", missing)
    if unused:
        print("  unused:", unused)

    print("\n================ SUMMARY ================")
    if failures:
        print(f"{len(failures)} PROBLEM(S):")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("Content audit passed: full i18n coverage, no dead links, no missing assets.")


if __name__ == "__main__":
    main()
