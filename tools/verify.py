"""Verify the built site in a real browser: load every page, fail on console
errors or broken local requests, exercise the EN/AR toggle, and capture
screenshots of both languages plus mobile widths.

usage: python tools/verify.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
PAGES = ["index.html", "about-us.html", "our-services.html",
         "our-clients.html", "our-team.html", "get-in-touch.html"]
SHOTS = ".verify"

problems = []


def check_page(page, name, label):
    errors = []
    failed = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("requestfailed", lambda r: failed.append(f"{r.url} {r.failure}"))
    page.goto(f"{BASE}/{name}", wait_until="load", timeout=45000)
    page.wait_for_timeout(1200)
    title = page.title()
    html_lang = page.get_attribute("html", "lang")
    direction = page.get_attribute("html", "dir")
    return title, html_lang, direction, errors, failed


def main():
    os.makedirs(SHOTS, exist_ok=True)
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = ctx.new_page()
        page.set_default_timeout(20000)

        for name in PAGES:
            slug = name.replace(".html", "")
            title, lang, direction, errors, failed = check_page(page, name, slug)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(900)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(600)
            page.screenshot(path=f"{SHOTS}/{slug}-en.png", full_page=True)

            # ---- switch to Arabic
            page.click('[data-lang-btn="ar"]')
            page.wait_for_timeout(700)
            ar_lang = page.get_attribute("html", "lang")
            ar_dir = page.get_attribute("html", "dir")
            ar_title = page.title()
            body_text = page.inner_text("main")
            has_arabic = any("\u0600" <= ch <= "\u06FF" for ch in body_text)
            leftover_en = page.eval_on_selector_all(
                "[data-i18n]",
                "els => els.filter(e => /[A-Za-z]{4,}/.test(e.textContent) && "
                "e.getAttribute('data-i18n') in window.ING_I18N.ar).map(e => e.getAttribute('data-i18n'))")
            page.screenshot(path=f"{SHOTS}/{slug}-ar.png", full_page=True)

            # back to English
            page.click('[data-lang-btn="en"]')
            page.wait_for_timeout(400)
            en_dir = page.get_attribute("html", "dir")

            row = dict(page=name, title=title, lang=lang, dir=direction,
                       ar_lang=ar_lang, ar_dir=ar_dir, ar_title=ar_title,
                       has_arabic=has_arabic, dir_back=en_dir,
                       untranslated=leftover_en, console_errors=errors,
                       failed_requests=failed)
            rows.append(row)

            flag = "OK "
            if errors:
                flag = "ERR"
                problems.append(f"{name}: console errors {errors}")
            if failed:
                flag = "RQ!"
                problems.append(f"{name}: failed requests {failed}")
            if ar_dir != "rtl" or ar_lang != "ar" or not has_arabic:
                flag = "AR!"
                problems.append(f"{name}: arabic mode wrong (dir={ar_dir} lang={ar_lang} arabic={has_arabic})")
            if leftover_en:
                problems.append(f"{name}: keys not translated: {leftover_en}")
            if en_dir != "ltr":
                problems.append(f"{name}: did not return to LTR")
            print(f"{flag} {name:20s} dir={direction} ar_dir={ar_dir} arabic={has_arabic} "
                  f"err={len(errors)} failedreq={len(failed)} untranslated={len(leftover_en)}")

        # ---- mobile pass
        mob = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mp = mob.new_page()
        for name in ("index.html", "our-services.html"):
            mp.goto(f"{BASE}/{name}", wait_until="load")
            mp.wait_for_timeout(900)
            mp.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            mp.wait_for_timeout(700)
            mp.screenshot(path=f"{SHOTS}/mobile-{name.replace('.html','')}.png", full_page=True)
            # burger should be visible on mobile
            vis = mp.is_visible(".header__burger")
            print(f"    mobile {name}: burger visible={vis}")
            if not vis:
                problems.append(f"{name}: burger not visible on mobile")
        browser.close()

    print("\n================ SUMMARY ================")
    if problems:
        print(f"{len(problems)} PROBLEM(S):")
        for x in problems:
            print("  -", x)
        sys.exit(1)
    print("No console errors, no failed requests, EN/AR toggle OK on all pages.")


if __name__ == "__main__":
    main()
