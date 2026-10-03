"""Extract the live theme's design tokens: computed typography, colours and
box metrics for the elements we need to recreate. Run against the rendered
homepage so we inherit Elementor's resolved values.

usage: python tools/tokens.py raw/tokens.txt
"""
import json
import sys

from playwright.sync_api import sync_playwright

TARGETS = {
    "body": "body",
    "h1": "h1",
    "h2": "h2",
    "h3": "h3",
    "h4": "h4",
    "p": "#qodef-content p",
    "a": "#qodef-content a",
    "header": "header",
    "header-nav-link": "header nav.qodef-header-navigation > ul > li > a",
    "footer": "footer",
    "footer-link": "footer a",
    "button": ".qodef-button, .elementor-button, input[type=submit]",
    "section": ".elementor-top-section",
    "content-grid": ".qodef-content-grid",
    "track-widget": ".qodef-order-tracking",
    "side-opener": ".widget_globefarer_core_side_area_opener",
}

PROPS = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
         "color", "backgroundColor", "textTransform", "textDecorationLine",
         "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
         "marginTop", "marginBottom", "borderRadius", "borderTopWidth",
         "borderTopColor", "textAlign", "display", "gap", "maxWidth", "width",
         "height", "zIndex", "position", "boxShadow", "backgroundImage"]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "raw/tokens.txt"
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1920, "height": 1080},
                            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"))
        page = ctx.new_page()
        page.goto("https://ing-logistics.com/", wait_until="domcontentloaded", timeout=90000)
        for _ in range(20):
            if "Just a moment" not in page.title():
                break
            page.wait_for_timeout(3000)
        page.wait_for_timeout(4000)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight/2)")
        page.wait_for_timeout(1500)

        res = page.evaluate(
            """([targets, props]) => {
                const out = {};
                for (const [name, sel] of Object.entries(targets)) {
                    const el = document.querySelector(sel);
                    if (!el) { out[name] = null; continue; }
                    const cs = getComputedStyle(el);
                    const o = { _sel: sel, _tag: el.tagName,
                                _text: (el.innerText || '').slice(0, 70) };
                    for (const pr of props) o[pr] = cs[pr];
                    const r = el.getBoundingClientRect();
                    o._rect = [Math.round(r.width), Math.round(r.height)];
                    out[name] = o;
                }
                // Theme CSS custom properties
                const vars = {};
                const rs = getComputedStyle(document.documentElement);
                for (const sheet of document.styleSheets) {
                    let rules; try { rules = sheet.cssRules; } catch(e) { continue; }
                    if (!rules) continue;
                    for (const rule of rules) {
                        if (rule.selectorText === ':root' || rule.selectorText === 'html') {
                            for (const prop of rule.style) {
                                if (prop.startsWith('--')) vars[prop] = rs.getPropertyValue(prop).trim() || rule.style.getPropertyValue(prop).trim();
                            }
                        }
                    }
                }
                return { elems: out, vars };
            }""",
            [TARGETS, PROPS],
        )
        b.close()

    with open(out, "w", encoding="utf-8") as f:
        f.write(json.dumps(res, indent=1, ensure_ascii=False))
    print("wrote", out)
    for k, v in res["elems"].items():
        if not v:
            print(f"{k:18s} MISSING")
            continue
        print(f"{k:18s} {v['fontFamily'][:38]:40s} {v['fontSize']:>7s} {v['fontWeight']:>4s} "
              f"lh={v['lineHeight']:>8s} ls={v['letterSpacing']:>8s} color={v['color']:<22s} "
              f"bg={v['backgroundColor']:<22s} {v['textTransform']}")


if __name__ == "__main__":
    main()
