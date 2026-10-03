"""Assert the rendered geometry, palette and fonts against the values measured
from the original GlobeFarer build, and check for horizontal overflow.

usage: python tools/check_layout.py

SITE_BASE overrides the target, so the same suite can also check a deployment:

  $env:SITE_BASE = "https://inglogistics.netlify.app"
  python tools/check_layout.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SITE_BASE", "http://127.0.0.1:8765")
failures = []


def check(label, actual, expected, tolerance=None):
    ok = actual == expected
    if tolerance is not None and isinstance(actual, (int, float)):
        ok = abs(actual - expected) <= tolerance
    print(f"  {'OK ' if ok else 'FAIL'} {label:34s} got={actual!r} want={expected!r}")
    if not ok:
        failures.append(f"{label}: got {actual!r}, want {expected!r}")


def rgb(page, sel, prop, pseudo=None):
    return page.eval_on_selector(
        sel, "(el, a) => getComputedStyle(el, a[1] || null).getPropertyValue(a[0])", [prop, pseudo])


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1920, "height": 1080})
        page = ctx.new_page()
        page.goto(f"{BASE}/index.html", wait_until="load")
        page.wait_for_timeout(2500)

        print("\n--- typography & palette (vs measured GlobeFarer values) ---")
        check("body font-family", rgb(page, "body", "font-family").split(",")[0].strip("'\""), "Sarabun")
        check("body font-size", rgb(page, "body", "font-size"), "18px")
        check("body color", rgb(page, "body", "color"), "rgb(91, 91, 91)")
        check("h2 font-size", rgb(page, ".section-head h2", "font-size"), "45px")
        check("h2 color", rgb(page, ".section-head h2", "color"), "rgb(27, 27, 27)")
        check("btn background", rgb(page, ".hero .btn", "background-color"), "rgb(247, 198, 0)")
        check("main accent var", rgb(page, "html", "--main").strip(), "#f7c600")
        check("section band bg", rgb(page, ".section--band", "background-color"), "rgb(223, 223, 223)")

        print("\n--- layout ---")
        check("container max-width", rgb(page, ".container", "max-width"), "1400px")
        hero_h = page.eval_on_selector(".hero", "el => Math.round(el.getBoundingClientRect().height)")
        check("hero height == viewport", hero_h, 1080, tolerance=2)
        check("hero background image set",
              page.eval_on_selector(".hero__slide.is-active .hero__bg",
                                    "el => getComputedStyle(el).backgroundImage").startswith("url("), True)
        check("header is fixed", rgb(page, ".header", "position"), "fixed")
        check("header transparent at top", rgb(page, ".header", "background-color"), "rgba(0, 0, 0, 0)")

        page.evaluate("window.scrollTo(0, 400)")
        page.wait_for_timeout(700)
        check("sticky header turns white", rgb(page, ".header", "background-color"), "rgb(255, 255, 255)")
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(500)

        print("\n--- fonts actually loaded ---")
        # fonts served by Google are unicode-range subsets, so the probe string
        # must actually contain glyphs from the range being tested. Cairo's
        # Arabic faces only load once Arabic is on screen, so it is asserted in
        # the Arabic block further down.
        loaded = page.evaluate("() => document.fonts.check('16px Sarabun', 'Loading')")
        check("Sarabun (latin)", loaded, True)

        print("\n--- slider ---")
        check("slide count", page.eval_on_selector_all(".hero__slide", "e => e.length"), 3)
        first = page.eval_on_selector(".hero__slide.is-active .hero__title", "e => e.textContent.trim().slice(0, 30)")
        page.click("[data-slide-next]")
        page.wait_for_timeout(1300)
        second = page.eval_on_selector(".hero__slide.is-active .hero__title", "e => e.textContent.trim().slice(0, 30)")
        check("next advances the slider", first != second, True)

        print("\n--- overflow / images ---")
        for name in ("index.html", "about-us.html", "our-services.html", "our-clients.html",
                     "our-team.html", "get-in-touch.html"):
            page.goto(f"{BASE}/{name}", wait_until="load")
            page.wait_for_timeout(900)
            ov = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            print(f"  {'OK ' if ov <= 0 else 'FAIL'} {name:20s} horizontal overflow = {ov}px")
            if ov > 0:
                failures.append(f"{name}: {ov}px horizontal overflow")
            broken = page.eval_on_selector_all(
                "img", "els => els.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src)")
            print(f"  {'OK ' if not broken else 'FAIL'} {name:20s} broken images = {len(broken)} {broken}")
            if broken:
                failures.append(f"{name}: broken images {broken}")
            no_alt = page.eval_on_selector_all("img", "els => els.filter(i => !i.hasAttribute('alt')).length")
            print(f"  {'OK ' if no_alt == 0 else 'FAIL'} {name:20s} images missing alt = {no_alt}")
            if no_alt:
                failures.append(f"{name}: {no_alt} images without alt")

        print("\n--- arabic direction ---")
        page.goto(f"{BASE}/index.html", wait_until="load")
        page.wait_for_timeout(800)
        page.click('[data-lang-btn="ar"]')
        page.wait_for_timeout(700)
        check("html dir", page.get_attribute("html", "dir"), "rtl")
        check("body font switches to Cairo",
              rgb(page, "body", "font-family").split(",")[0].strip("'\""), "Cairo")
        page.wait_for_timeout(1200)
        loaded_faces = page.evaluate("""() => [...document.fonts]
            .filter(f => f.family.indexOf('Cairo') === 0)
            .map(f => f.family + ' ' + f.weight + ':' + f.status)""")
        print(f"  info cairo faces: {loaded_faces[:6]}")
        check("Cairo arabic face loaded",
              any(f.endswith("loaded") for f in loaded_faces), True)
        # In RTL the logo must be on the right of the header row
        logo_x = page.eval_on_selector(".header__logo", "el => el.getBoundingClientRect().left")
        burger_x = page.eval_on_selector(".header__actions", "el => el.getBoundingClientRect().left")
        print(f"  info rtl: logo left={logo_x:.0f} actions left={burger_x:.0f}")
        if logo_x <= burger_x:
            failures.append("RTL: logo should sit to the right of the header actions")
        ov = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        print(f"  {'OK ' if ov <= 0 else 'FAIL'} arabic overflow = {ov}px")
        if ov > 0:
            failures.append(f"arabic: {ov}px horizontal overflow")

        b.close()

    print("\n================ SUMMARY ================")
    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("All layout, palette, font and overflow checks passed.")


if __name__ == "__main__":
    main()
