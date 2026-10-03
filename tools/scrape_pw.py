"""Render pages in a real browser (passes the Cloudflare challenge) and capture
both the settled DOM and full-page screenshots, which we use as the design
reference for the rebuild.

usage: python tools/scrape_pw.py <slug> <url> [--scroll]
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "raw", "pages")
SHOTS = os.path.join(ROOT, "raw", "shots")


def slugify(url):
    s = re.sub(r"^https?://[^/]+", "", url).strip("/")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()) or "home"


def capture(page, url, name, shot=True, full=True):
    page.goto(url, wait_until="domcontentloaded", timeout=90000)
    # Cloudflare interstitial: wait for it to clear before the real DOM.
    for _ in range(20):
        title = page.title()
        if "Just a moment" not in title:
            break
        time.sleep(3)
    page.wait_for_timeout(3500)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass
    # Nudge lazily-loaded images / scroll-triggered animations into view.
    page.evaluate("""async () => {
        const step = Math.max(300, window.innerHeight * 0.8);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
    }""")
    page.wait_for_timeout(1500)

    html = page.content()
    os.makedirs(PAGES, exist_ok=True)
    with open(os.path.join(PAGES, f"{name}.html"), "w", encoding="utf-8") as f:
        f.write(html)
    if shot:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=full)
        page.screenshot(path=os.path.join(SHOTS, f"{name}-viewport.png"))
    print(f"  {name}: title={page.title()!r} html={len(html)}b")


def main():
    urls = {
        "home": "https://ing-logistics.com/",
        "about-us": "https://ing-logistics.com/about-us/",
        "our-services": "https://ing-logistics.com/our-services/",
        "get-in-touch": "https://ing-logistics.com/get-in-touch/",
        "our-clients": "https://ing-logistics.com/our-clients/",
        "what-we-do": "https://ing-logistics.com/what-we-do/",
        "meet-the-crew": "https://ing-logistics.com/meet-the-crew/",
        "global-network": "https://ing-logistics.com/global-network/",
        "faq-page": "https://ing-logistics.com/faq-page/",
        "available-positions": "https://ing-logistics.com/available-positions/",
        "air-freight": "https://ing-logistics.com/air-freight/",
        "cargo-shipping": "https://ing-logistics.com/cargo-shipping/",
        "rail-freight": "https://ing-logistics.com/rail-freight/",
        "maritime-transport": "https://ing-logistics.com/maritime-transport/",
    }
    if len(sys.argv) > 1:
        urls = {k: v for k, v in urls.items() if k in sys.argv[1:]}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
        )
        page = ctx.new_page()
        for name, url in urls.items():
            try:
                capture(page, url, name)
            except Exception as e:
                print(f"  {name}: FAILED {e}")
        browser.close()


if __name__ == "__main__":
    main()
