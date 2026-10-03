# ING Logistics — website

A static, dependency-free rebuild of **ing-logistics.com** (a WordPress site running the
commercial **GlobeFarer** theme by Qode), with every piece of content replaced by the
company's own brochure, `ing_company_profile_updated0.pdf`.

No build step, no framework, no CDN: open `index.html` in a browser and it works.
It is deployed at <https://inglogistics.netlify.app> — see [Deploying](#deploying).

```powershell
# simplest
start index.html

# or serve it (needed if you want the browser to treat it as a real origin)
python -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/
```

---

## Pages

| File | Contents |
| --- | --- |
| `index.html` | 3-slide hero, story, services, values, mission & vision, warehouse services, stats, clients, team, FAQ, closing CTA |
| `about-us.html` | Our Story, Mission, Vision, Values, capability stats |
| `our-services.html` | Warehouse Services Management, Delivery & Distribution, Track & Trace, Offices, FAQ |
| `our-clients.html` | Who ING serves |
| `our-team.html` | Team functions and the values behind them |
| `get-in-touch.html` | Contact details and an enquiry form, FAQ |

## Layout

```
assets/
  css/  style.css            design system, components, responsive + RTL
        fonts-sarabun.css    self-hosted Sarabun (Latin)
        fonts-cairo.css      self-hosted Cairo (Arabic)
  js/   i18n.js              Arabic strings, keyed by data-i18n
        main.js              slider, sticky header, nav, accordion, form, counters
  img/  hero-1…3.jpg         slider frames
        band-*.jpg           full-bleed quote / service bands
        page-head-*.jpg      inner-page headers
        story/values/services-*/cta.jpg   section insets
  logo/ ing-logo-{dark,light}.png, favicon.png
  fonts/                    woff2 files
tools/                       capture, extraction and validation scripts (see below)
```

---

## Where the design came from

The original site is WordPress 7.1.2 + Elementor 4.2.3 + Slider Revolution + the
`globefarer` theme (plus `globefarer-core`). It sat behind a Cloudflare challenge that
rate-limits by TLS fingerprint, so the reference capture was made with a real browser
(`tools/scrape_pw.py`) and the design values were read from the rendered page with
`getComputedStyle` (`tools/tokens.py`).

The recreated tokens are those measured values, not guesses:

| Token | Value |
| --- | --- |
| Accent (buttons, links, rules) | `#f7c600` |
| Dark (headings, footer) | `#1b1b1b` |
| Body text | `#5b5b5b` |
| Section band | `#dfdfdf` |
| Latin type | Sarabun — 18px/1.444 body, 45px h2, 22px h4, 17px nav & buttons |
| Content grid | 1400px, header 80px, transparent over the hero and sticky on scroll |

Component shapes follow the theme's own vocabulary: transparent header with logo left /
nav right / "Track Your Order" dropdown, full-height hero slider with progress dots,
160px section rhythm, gold-underlined list markers, dark 4-column footer.

### Arabic mode

`html[data-lang]` drives everything. English lives in the markup; `assets/js/i18n.js`
holds the Arabic for each `data-i18n` key and `main.js` swaps `textContent` while keeping
the original English, so toggling is lossless. Arabic switches the body font to Cairo
(the brochure's Arabic typeface) and mirrors the layout to RTL — the stylesheet uses
logical properties (`margin-inline`, `inset-inline`, …) so no second RTL sheet is needed.
The choice is remembered in `localStorage`.

To edit copy: change the English in the HTML, then update the matching key in `i18n.js`.

---

## Where the content came from

Every text and image comes from `ing_company_profile_updated0.pdf` (17 slides, 1920×1080):

| PDF page | Section on the site |
| --- | --- |
| 2–4 | Hero slider copy (slides 1 and 2) |
| 5 | Our Values (`values.jpg`) |
| 6 | Our Story (`story.jpg`) |
| 7 | Our Mission (hero slide 3) |
| 8 | Our Vision |
| 9 | Our Services divider (`services-hero.jpg`, hero slide 1) |
| 10 | Our Services (`services-intro.jpg`, hero slide 2) |
| 11 | Warehouse Services Management (4 services) |
| 12 | Delivery and Distribution |
| 13 | Track and Trace |
| 14 | Various Offices for Work |
| 15 | Our Clients |
| 16 | Our Team |
| 17 | Closing CTA (`cta.jpg`, hero slide 3) |

### The five photographs

The brochure embeds 32 images, but only five are photographs. The rest carry no artwork
at all: 20 flat black-and-white stencils that sit behind the Arabic text runs, five faint
glow overlays on page 7 (mean opacity 5–44 out of 255), and the ING logo. Those five
photographs are therefore the entire photographic source for the site. The sliders that
used to be here, `slide-1…4.jpg`, were the WordPress site's own uploads; they have been
dropped.

`tools/build_images.py` therefore cuts each photograph more than once: a cinematic 16:9
frame for the slider, a wider letterbox for the full-bleed bands and page headers, and a
taller frame anchored lower down for the section insets. Each cut is fixed by an aspect
ratio and a vertical focus, so no page shows the same framing twice.

| xref | Resolution | Brochure page | Cut into |
| --- | --- | --- | --- |
| `6269` | 5040×3360 | p9 Our Services divider | hero 1, `services-hero.jpg`, `band-quote.jpg`, `page-head-clients.jpg` |
| `6315` | 4026×2687 | p10 Our Services | hero 2, `services-intro.jpg`, `page-head-contact.jpg` |
| `6641` | 4030×2687 | p17 Thank you | hero 3, `cta.jpg` |
| `6040` | 3327×2040 | p5 Our Values | `values.jpg` |
| `6058` | 2292×2292 | p6 Our Story | `story.jpg`, `band-services.jpg`, `page-head-team.jpg` |

Every file is read straight out of the PDF at the resolution it stores, so nothing on the
site is a downscaled copy of anything else — the photography is now up to 5040px wide
where it used to be 1600–1920px. The logo is the site's `cropped-ingLogo.png`, re-cut as
dark and white variants plus a favicon.

### Faithfulness notes

The Arabic in the PDF is stored as *Arabic Presentation Forms-B* (pre-shaped glyphs).
`tools/normalize_arabic.py` runs NFKC over it to recover normal letters, and the PDF's
justification kashida were dropped. Otherwise the wording is the brochure's, including
its own inconsistencies, which you may want to correct at some point:

* **Hero statement 3 (PDF p4)** — its English is a copy-paste of p2 ("An ideal,
  professional and safe logistic environment") while the Arabic says *"we provide
  innovative solutions that serve supply chains and ease their movement"*. The site
  translates the Arabic and uses it as the opening slide's supporting line, so the hero
  now says something new on every slide.
* **Our Services intro (PDF p10)** — the English paragraph there is actually the *Vision*
  text, while the Arabic is the *Mission* text. The site uses the Mission wording in both
  languages so the two languages agree.
* **Our Values (PDF p5)** — the English sentence stops at "…are the values based on";
  the Arabic is complete. The site keeps the brochure's phrasing and finishes the thought
  in the value list below it.
* The word "ing" appears inline inside several Arabic sentences (it is the logo sitting in
  the middle of the line in the PDF); it is rendered as **ING** on the site.
* The brochure's orange (`#ff8906`) is its own brand accent, but the site keeps the
  GlobeFarer gold (`#f7c600`) so the rebuild still reads as the same website. Changing
  `--main` in `assets/css/style.css` switches the whole palette to the brochure orange.

---

## Tools

Capture and extraction (require network access to ing-logistics.com and the PDF):

| Script | Purpose |
| --- | --- |
| `fetch.py` | curl-based fetcher that retries through the Cloudflare 403s |
| `scrape_pw.py` | renders pages in a real browser, saving DOM + screenshots |
| `tokens.py` | measures the live typography/palette via `getComputedStyle` |
| `download_assets.py` | mirrors the logo and the two web fonts |
| `render_pdf.py` | renders brochure pages and builds contact sheets |
| `pdf_layout.py` | dumps per-page text spans (font/size/colour/position) and image placement |
| `classify_images.py` | maps every embedded image to its brochure page/section |
| `normalize_arabic.py` | converts presentation-form Arabic to standard characters |
| `build_images.py` | cuts every site image out of the brochure's five photographs |
| `build_brand.py` | produces the logo variants and favicon |

Build and validation (no network needed):

| Script | Purpose |
| --- | --- |
| `build_pages.py` | regenerates the five inner pages from the header/footer shell in `index.html` |
| `build_dist.py` | assembles `dist/`, the deployable subset (pages + `assets/`) |
| `verify.py` | loads every page in Chromium, fails on console errors/broken requests, screenshots EN + AR + mobile |
| `check_layout.py` | asserts geometry, palette, fonts and zero horizontal overflow in both directions |
| `check_content.py` | asserts i18n key coverage, no dead links, no missing assets, sane headings |

Validation scripts expect the site to be served on `127.0.0.1:8765`:

```powershell
python -m http.server 8765 --bind 127.0.0.1   # in one shell
python tools/verify.py; python tools/check_layout.py; python tools/check_content.py
```

`verify.py` and `check_layout.py` take a `SITE_BASE` environment variable, so the
same suites can be pointed at a deployment (`SITE_SHOTS` keeps the screenshots
they write away from the localhost set).

Requirements: Python 3 with `pymupdf`, `pillow`, `numpy`, `beautifulsoup4`, `lxml`,
`playwright` (plus `playwright install chromium`) and Node.js for `check_content.py`.

---

## Deploying

The site is live on Netlify at **<https://inglogistics.netlify.app>**.

```powershell
python tools/build_dist.py
npx netlify-cli@26 deploy --dir dist --prod --message "…"
```

`build_dist.py` copies only the six pages and `assets/` into `dist/`, so the
capture scripts in `tools/`, the screenshots in `.verify/` and this README are
never uploaded — they 404 on the live site. `netlify.toml` records the same
publish directory and long-lived caching for the woff2 files (everything else
keeps Netlify's revalidating default, which matters while the photography and
stylesheets are still being iterated on).

Two details of the Netlify team defaults are worth knowing:

* New sites inherit the team's **SSO login** gate, which makes every URL answer
  `401` until it is switched off. It is off for this site (`sso_login: false`);
  the other sites in the team are untouched.
* The `command` in `netlify.toml` runs `build_dist.py`, but only so that a future
  Git-connected build produces the same output. The site has no real build step,
  and CLI deploys pass `--no-build`.

The deployment was accepted by the same suites that run locally:

```powershell
$env:SITE_BASE = "https://inglogistics.netlify.app"
$env:SITE_SHOTS = ".verify-live"
python tools/verify.py; python tools/check_layout.py
```

`netlify-cli` 26.x is current here because the CLI 27 line requires Node 22 and
this machine runs Node 20.

---

## Known limitations

* The contact form has **no backend** — it validates in the browser and stops there.
  Point it at your form handler (or a service such as Formspree) before going live.
* Phone number, e-mail address, street address and the statistic figures are **not** in
  the brochure; they are placeholders. Replace them in the footer, on
  `get-in-touch.html`, and in the counters (`data-count-to`) on the home page.
* Social links in the footer are `#` placeholders.
* Team members are shown as functions (executive, operations, warehouse, …) because the
  brochure has no named staff photos.
* The client list is shown as the customer categories named in the brochure, not logos.
