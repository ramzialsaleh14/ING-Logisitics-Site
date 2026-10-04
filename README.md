# ING Logistics — website

A static, dependency-free rebuild of **ing-logistics.com** (a WordPress site running the
commercial **GlobeFarer** theme by Qode), with every piece of content replaced by the
company's own brochure, `ing_company_profile_updated0.pdf`.

No build step, no framework, no CDN: open `index.html` in a browser and it works.

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
| `index.html` | Hero slider, story, services, values, mission & vision, warehouse services, stats, clients, team, FAQ, closing CTA |
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
  img/  hero slides + brand photography
  logo/ ing-logo-{dark,light}.png, ing-mark.png, favicon.png
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

**Layout metrics** are those measured values, not guesses:

| Token | Value |
| --- | --- |
| Body text | `#5b5b5b` |
| Latin type | Sarabun — 18px/1.444 body, 45px h2, 22px h4, 17px nav & buttons |
| Content grid | 1400px, header 80px, transparent over the hero and sticky on scroll |

Component shapes follow the theme's own vocabulary: transparent header with logo left /
nav right / "Track Your Order" dropdown, full-height hero slider with progress dots,
160px section rhythm, orange-underlined list markers, dark 4-column footer.

### Brand refresh (Oct 2026)

`ing logo guideline new.pdf` (Brand Identity v1.0) replaced the site's original colours,
logo raster and photography. The palette now comes from the guidelines rather than from
the theme:

| Token | Value | Source |
| --- | --- | --- |
| Accent (buttons, links, rules) | `#f36c24` | p14 "3.1 Main Logo Colors" (RGB 243 108 36) |
| Charcoal (headings, dark bands) | `#373839` | p4 "1.1 Design Overview" |
| Deepest ink (footer) | `#231f20` | logo artwork |
| Section band / soft | `#e5e5e5` / `#f4f4f4` | p4 brand neutrals |
| Muted / hairline | `#939598` / `#dcddde` | pattern artwork strokes |
| Hover tint | `#f78a50` | derived from the orange (not specified) |

The logo is re-cut from the guidelines' *vectors* (p10 primary logomark, p12 iconic
logomark), so the two brand colours are exact and the variants the guidelines prescribe
are available — see `tools/build_brand.py`. Typography is unchanged: the guidelines name
Eurostile Extended and Frutiger LT Arabic, both commercial licences the site cannot
self-host, so Sarabun/Cairo stay.

The logo itself is the same design the site already carried (the mark, proportions and
orange accents match to within a fraction of a percent); what changed is the orange
(`#f16b22` → `#f36c24`), the favicon (now the iconic logomark instead of a squeezed
lockup) and the photography below.

Guidelines' usage rules worth keeping in mind when the logo is placed:

* **Clear space** — 50% of the logomark's height on every side (p9 "2.2 Minimum clear
  space"); the header/footer already clear this.
* **Variants** — two colour on white, one colour where colour is impossible, one colour
  reverse on photography or charcoal (p11 "2.4 Logo Variation"). The header swaps
  `ing-logo-light.png` (reverse, over the hero) for `ing-logo-dark.png` (two colour, once
  the header turns white); the footer uses the reverse mark.
* **Iconic logomark** (`ing-mark.png`) is the small-size variant (p10 "2.3 Logo Usage") —
  it is what the favicon is built from.

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
| 2–4 | Hero slider (3 slides) |
| 5 | Our Values (`values.jpg`) |
| 6 | Our Story (`story.jpg`) |
| 7 | Our Mission |
| 8 | Our Vision |
| 9–10 | Our Services (`services-hero.jpg`, `services-intro.jpg`) |
| 11 | Warehouse Services Management (4 services) |
| 12 | Delivery and Distribution |
| 13 | Track and Trace |
| 14 | Various Offices for Work |
| 15 | Our Clients |
| 16 | Our Team |
| 17 | Closing CTA (`cta.jpg`) |

The brochure supplied the photography for the first build. The brand refresh replaced it:
all nine site photos (`slide-1…4.jpg`, `story.jpg`, `values.jpg`, `services-hero.jpg`,
`services-intro.jpg`, `cta.jpg`) are now cut from the guidelines' four "Visual
Application" photographs (p25-28), and the logo is re-cut from the guideline vectors.
See [Brand refresh](#brand-refresh-oct-2026) and `tools/build_images.py`.

### Faithfulness notes

The Arabic in the PDF is stored as *Arabic Presentation Forms-B* (pre-shaped glyphs).
`tools/normalize_arabic.py` runs NFKC over it to recover normal letters, and the PDF's
justification kashida were dropped. Otherwise the wording is the brochure's, including
its own inconsistencies, which you may want to correct at some point:

* **Hero slide 3** — the brochure's English is a copy-paste of slide 1 ("An ideal,
  professional and safe logistic environment") while the Arabic says *"we provide
  innovative solutions that serve supply chains"*. The site translates the Arabic.
* **Our Services intro (PDF p10)** — the English paragraph there is actually the *Vision*
  text, while the Arabic is the *Mission* text. The site uses the Mission wording in both
  languages so the two languages agree.
* **Our Values (PDF p5)** — the English sentence stops at "…are the values based on";
  the Arabic is complete. The site keeps the brochure's phrasing and finishes the thought
  in the value list below it.
* The word "ing" appears inline inside several Arabic sentences (it is the logo sitting in
  the middle of the line in the PDF); it is rendered as **ING** on the site.
* The brochure's own orange (`#ff8906`) was ignored by the first build, which kept the
  GlobeFarer gold (`#f7c600`). The brand refresh settled this: the site now uses the
  guidelines' orange `#f36c24` for `--main`, so the logo, buttons and rules all match.

---

## Tools

Capture and extraction (require network access to ing-logistics.com and the PDF):

| Script | Purpose |
| --- | --- |
| `fetch.py` | curl-based fetcher that retries through the Cloudflare 403s |
| `scrape_pw.py` | renders pages in a real browser, saving DOM + screenshots |
| `tokens.py` | measures the live typography/palette via `getComputedStyle` |
| `download_assets.py` | mirrors the logo, the uploaded slides and the two web fonts |
| `render_pdf.py` | renders brochure pages and builds contact sheets |
| `pdf_layout.py` | dumps per-page text spans (font/size/colour/position) and image placement |
| `classify_images.py` | maps every embedded image to its brochure page/section |
| `normalize_arabic.py` | converts presentation-form Arabic to standard characters |
| `extract_pdf_images.py`, `classify_images.py` | brochure-era: pull and map the company profile's embedded photos |
| `brand_source.py` | the guidelines' logo geometry, palette and photo crops, shared by the two builders below |
| `build_images.py` | cuts the nine site photos from the guidelines' four photographs (EDSR upscale, then exact-size crop) |
| `build_brand.py` | re-cuts the logo, its reverse variant, the iconic logomark and the favicon from the guideline vectors |

Build and validation (no network needed):

| Script | Purpose |
| --- | --- |
| `build_pages.py` | regenerates the five inner pages from the header/footer shell in `index.html` |
| `verify.py` | loads every page in Chromium, fails on console errors/broken requests, screenshots EN + AR + mobile |
| `check_layout.py` | asserts geometry, palette, fonts and zero horizontal overflow in both directions |
| `check_content.py` | asserts i18n key coverage, no dead links, no missing assets, sane headings |
| `build_dist.py` | assembles `dist/`, the deployable subset (six pages + `assets/`) |

Validation scripts expect the site to be served on `127.0.0.1:8765`:

```powershell
python -m http.server 8765 --bind 127.0.0.1   # in one shell
python tools/verify.py; python tools/check_layout.py; python tools/check_content.py
```

Requirements: Python 3 with `pymupdf`, `pillow`, `numpy`, `beautifulsoup4`, `lxml`,
`playwright` (plus `playwright install chromium`) and Node.js for `check_content.py`.
Rebuilding the photography with `build_images.py` additionally needs
`opencv-contrib-python-headless` and the EDSR model in `tools/models/` (38 MB, kept out
of the site itself and re-downloadable from `Saafke/EDSR_Tensorflow`).

---

## Deploying

The site is live on Netlify at **<https://inglogistics.netlify.app>**.

```powershell
python tools/build_dist.py
npx netlify-cli@26 deploy --dir dist --prod --message "…"
```

`build_dist.py` copies only the six pages and `assets/` into `dist/`, so the capture
scripts in `tools/`, the screenshots in `.verify/` and this README are never uploaded —
they 404 on the live site. `netlify.toml` records the same publish directory plus
long-lived caching for the 45 woff2 files; everything else keeps Netlify's revalidating
default, which matters while the photography and stylesheets are still being iterated on.

The `command` in `netlify.toml` runs `build_dist.py`, but only so that a Git-connected
build would produce the same output. The site has no real build step, so CLI deploys pass
`--no-build`. `netlify-cli` 26.x is the line to use here: 27.x requires Node 22 and this
machine runs Node 20.

---

## Known limitations

* The contact form has **no backend** — it validates in the browser and stops there.
  Point it at your form handler (or a service such as Formspree) before going live.
* Phone number, e-mail address and street address are **not** in the brochure. The phone
  (`0799723777`, i.e. `+962 79 972 3777`), the opening hours (Saturday–Thursday,
  8:00 AM – 5:00 PM) and the location — linked to the company's coordinates
  `32.514226, 35.942958` on Google Maps — are the company's real details. The e-mail
  address, the social links and the statistic figures (`data-count-to`) are still
  placeholders.
* Social links in the footer are `#` placeholders.
* Team members are shown as functions (executive, operations, warehouse, …) because the
  brochure has no named staff photos.
* The client list is shown as the customer categories named in the brochure, not logos.
