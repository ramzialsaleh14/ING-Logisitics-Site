"""Single source of truth for the ING brand guidelines and the values lifted
out of it, so tools/build_brand.py and tools/build_images.py stay in sync.

Everything here comes from `ing logo guideline new.pdf` (Version 1.0, Oct 2026):
  * p4  "1.1 Design Overview"  — brand colour chips + primary typeface
  * p10 "2.3 Logo Usage"       — primary logomark (mark over LOGISTICS)
  * p12 "2.5 ICONIC Logo"      — iconic logomark, three colourways
  * p14 "3.1 Main Logo Colors" — exact colour values
  * p25-28 "Visual Application"— the four photos, laid out as one 2x2 board
"""

PDF = r"c:\Users\Ramzi\OneDrive\Desktop\ing logo guideline new.pdf"

# --- palette (p14 "3.1 Main Logo Colors", p4 "1.1 Design Overview") ---------
ORANGE = "#f36c24"      # orange — HEX f36c24 / RGB 243 108 36
CHARCOAL = "#373839"    # charcoal — HEX 373839 / RGB 55 56 58
NEUTRAL_200 = "#e5e5e5"
NEUTRAL_100 = "#f4f4f4"

# --- logo geometry, in PDF points (page number + clip rect) -----------------
# Primary logomark: the mark with the LOGISTICS wordmark beneath it.
PRIMARY = {"page": 10, "clip": (90, 250, 346, 360)}
# Iconic logomark (the mark alone) in its two-colour and one-colour forms.
ICONIC_TWO_COLOR = {"page": 12, "clip": (88, 285, 209, 363)}
ICONIC_ONE_COLOR = {"page": 12, "clip": (360, 285, 482, 363)}

# --- the 2x2 "Visual Application" board (p25-28), embedded as xref 101 ------
# The board is 1536x1024 with a white gutter at rows 511-513 and columns 767-770.
BOARD = "xref0101_1536x1024.png"
PHOTO_BOXES = {
    "p1": (0, 0, 767, 511),        # industrial interior, warm light
    "p2": (771, 0, 1536, 511),     # wide sky
    "p3": (0, 514, 767, 1024),     # warm dusk
    "p4": (771, 514, 1536, 1024),  # mixed interior / sky
}

# --- where each photo goes --------------------------------------------------
# dst -> (photo, width, height, focus)  — focus is the fractional position of
# the crop window inside the available slack (0 = top/left, 1 = bottom/right).
# Output sizes match the files the site already ships, so no markup changes.
PHOTO_TARGETS = {
    "slide-1.jpg": ("p2", 1920, 1080, (0.50, 0.55)),
    "slide-2.jpg": ("p4", 1920, 1080, (0.50, 0.42)),
    "slide-3.jpg": ("p1", 1920, 1080, (0.42, 0.50)),
    "slide-4.jpg": ("p3", 1920, 1080, (0.50, 0.45)),
    "story.jpg": ("p1", 1400, 1400, (0.62, 0.55)),
    "values.jpg": ("p3", 1920, 1177, (0.50, 0.52)),
    "services-hero.jpg": ("p2", 1920, 1280, (0.50, 0.72)),
    "services-intro.jpg": ("p4", 1600, 1068, (0.45, 0.50)),
    "cta.jpg": ("p1", 1920, 1280, (0.35, 0.62)),
}
