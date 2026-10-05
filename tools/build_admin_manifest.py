"""Generate assets/js/admin-fields.js - the field list the admin screen shows.

Walks the built pages and collects everything the admin can edit: text keys
(data-i18n / data-i18n-placeholder / data-i18n-aria), photos (data-cimg) and
the animated stats (data-cnum). Group and field labels are derived from the
markup so the admin screen stays in step with the pages - re-run this after
changing a page, or let `python tools/check_content.py` tell you it is stale.

usage: python tools/build_admin_manifest.py [--check]
"""
import json
import os
import subprocess
import sys

from bs4 import BeautifulSoup

OUT = os.path.join("assets", "js", "admin-fields.js")

PAGES = [
    ("index.html", "Home"),
    ("about-us.html", "About Us"),
    ("our-services.html", "Our Services"),
    ("our-clients.html", "Our Clients"),
    ("our-team.html", "Our Team"),
    ("get-in-touch.html", "Contact"),
]

ROLES = {
    "h1": "Heading", "h2": "Heading", "h3": "Heading", "h4": "Heading",
    "p": "Paragraph", "blockquote": "Quote", "cite": "Attribution",
    "strong": "Name", "a": "Link", "button": "Button", "option": "Menu option",
    "span": "Text", "div": "Text", "textarea": "Field label",
}

# classes that name the thing better than the tag does
CLASS_ROLES = {
    "eyebrow": "Eyebrow",
    "nav__link": "Navigation link",
    "link-more": "Link",
    "btn": "Button",
    "stat__label": "Caption",
    "client-name": "Client name",
    "hero__title": "Headline",
    "hero__text": "Intro text",
}

BANNERS = {
    ("section", "hero"): "Hero slider",
    ("section", "page-head"): "Page banner",
    ("section", "band"): "Banner band",
}

# classes that say nothing about what the element is
GENERIC_CLASSES = {
    "section", "section--soft", "section--band", "container", "section-head",
    "section-head--center", "split", "split--reverse", "split__media",
    "split__body", "band", "band__inner", "page-head", "page-head__inner",
    "hero", "hero__slide", "hero__inner", "hero__content", "hero__bg",
    "reveal", "card", "cards", "feature", "member", "stat", "stats",
}


def arabic_keys():
    """The i18n dictionary as the browser sees it."""
    out = subprocess.run(
        ["node", "-e",
         "global.window={};require('./assets/js/i18n.js');"
         "process.stdout.write(JSON.stringify(window.ING_I18N.ar))"],
        capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        sys.exit("node failed: " + out.stderr)
    return json.loads(out.stdout)


def group_of(el):
    """(group id, group label) for an editable element - the id is None for
    sections, which are then identified by their label."""
    if el.find_parent("header"):
        return "site:header", "Every page - header"
    if el.find_parent("footer"):
        return "site:footer", "Every page - footer"

    section = el if el.name == "section" else el.find_parent("section")
    if section is None:
        # page chrome that sits outside <header>, e.g. the skip link
        return "site:header", "Every page - header"

    for cls in section.get("class") or []:
        if (section.name, cls) in BANNERS:
            return None, BANNERS[(section.name, cls)]

    eyebrow = section.select_one(".eyebrow")
    heading = section.find(["h1", "h2", "h3"])
    label = None
    if eyebrow is not None and len(eyebrow.get_text(strip=True)) <= 40:
        label = eyebrow.get_text(strip=True)
    elif heading is not None:
        label = heading.get_text(strip=True)
    if not label:
        label = section.get("id") or first_meaningful_class(section) or "Section"
    label = label.strip()
    if len(label) > 60:
        label = label[:57].rstrip() + "..."
    return None, label


def first_meaningful_class(section):
    """A readable name for a section that has no heading of its own."""
    for node in section.select("[class]"):
        for cls in node.get("class") or []:
            if cls not in ("section", "section--soft", "section--band", "container",
                           "section-head", "section-head--center"):
                return cls.replace("-", " ").replace("__", " ").strip().capitalize()
    return None


def field_label(el):
    """A short description of what the element is."""
    classes = el.get("class") or []
    if "accordion__trigger" in classes or el.find_parent(class_="accordion__trigger"):
        return "Question"
    if el.find_parent(class_="accordion__panel"):
        return "Answer"
    for cls in classes:
        if cls in CLASS_ROLES:
            return CLASS_ROLES[cls]
    return ROLES.get(el.name, "Text")


def humanise(name):
    return name.replace("__", " ").replace("-", " ").strip().capitalize()


def marker_class(el):
    """The element's own class, when it is specific enough to name the thing."""
    for cls in el.get("class") or []:
        if cls not in GENERIC_CLASSES:
            return humanise(cls)
    return None


def pages_label(pages):
    if len(pages) == len(PAGES):
        return "every page"
    names = [{f: n for f, n in PAGES}[page] for page in pages]
    return ", ".join(names)


def slide_prefix(el):
    slide = el.find_parent(class_="hero__slide")
    if slide is None:
        return ""
    parent = slide.find_parent(class_="hero__slides")
    return "Slide %d - " % (list(parent.find_all(class_="hero__slide")).index(slide) + 1)


def text_value(el, attr):
    if attr == "data-i18n-placeholder":
        return (el.get("placeholder") or "").strip()
    if attr == "data-i18n-aria":
        return (el.get("aria-label") or "").strip()
    return el.decode_contents().strip()

def link_href(el):
    """The click target, for the links an admin may want to change. In-page
    jumps (#main) are not worth editing, so they are left out."""
    if el.name != "a":
        return ""
    href = (el.get("href") or "").strip()
    return "" if href.startswith("#") else href


def collect(arabic):
    fields, images, numbers = {}, {}, {}
    groups, order = {}, []

    for page, _ in PAGES:
        soup = BeautifulSoup(open(page, encoding="utf-8").read(), "lxml")
        for el in soup.find_all(True):
            if el.find_parent(["script", "style"]):
                continue
            scope, label = group_of(el)

            # shared sections (the same fragment on several pages) are one
            # group, because the fields inside them are one set of keys
            def group_id(page=page, scope=scope, label=label):
                gid = scope or label
                if gid not in groups:
                    groups[gid] = {"id": gid, "label": label, "where": []}
                    order.append(gid)
                if page not in groups[gid]["where"]:
                    groups[gid]["where"].append(page)
                return gid

            for attr in ("data-i18n", "data-i18n-placeholder", "data-i18n-aria", "data-ctext"):
                key = el.get(attr)
                if key is None:
                    continue
                # data-ctext marks text that reads the same in every language,
                # such as the phone number and email address
                langs = ["en"] if attr == "data-ctext" else ["en", "ar"]
                entry = fields.setdefault(key, {
                    "group": group_id(), "where": [], "label": None,
                    "en": "", "ar": "", "href": "", "langs": langs, "_hrefs": set(),
                })
                if page not in entry["where"]:
                    entry["where"].append(page)
                if entry["label"] is None:
                    entry["label"] = slide_prefix(el) + field_label(el)
                if not entry["en"]:
                    entry["en"] = text_value(el, attr)
                entry["ar"] = entry["ar"] or arabic.get(key, "")
                target = link_href(el)
                if target:
                    entry["_hrefs"].add(target)

            key = el.get("data-cimg")
            if key:
                url = el.get("src") or ""
                if not url:
                    style = el.get("style") or ""
                    start = style.find("url('")
                    if start != -1:
                        url = style[start + 5:style.find("')", start)]
                entry = images.setdefault(key, {
                    "group": group_id(), "where": [], "label": None, "default": url,
                    "named": marker_class(el), "prefix": slide_prefix(el),
                    "kind": "Photo" if el.name == "img" else "Background photo",
                })
                if page not in entry["where"]:
                    entry["where"].append(page)
                if entry["named"] is None:
                    entry["named"] = marker_class(el)

            key = el.get("data-cnum")
            if key:
                entry = numbers.setdefault(key, {"group": group_id(), "where": [], "label": None,
                                                 "value": "", "suffix": ""})
                if page not in entry["where"]:
                    entry["where"].append(page)
                entry["value"] = el.get("data-count-to") or entry["value"]

            key = el.get("data-cnum-suffix")
            if key:
                entry = numbers.setdefault(key, {"group": group_id(), "where": [], "label": None,
                                                 "value": "", "suffix": ""})
                if page not in entry["where"]:
                    entry["where"].append(page)
                entry["suffix"] = el.get_text(strip=True) or entry["suffix"]

    # A key only offers an editable link when every one of its links goes to the
    # same place: the four "Details" links, for instance, each point at their own
    # section, so editing them together would break three of them.
    for entry in fields.values():
        targets = entry.pop("_hrefs")
        entry["href"] = targets.pop() if len(targets) == 1 else ""

    # a stat's caption is the label printed under its number
    captions = {"stats.n1": "stats.value1", "stats.n2": "stats.value2",
                "stats.n3": "stats.value3", "stats.n4": "stats.value4"}
    for key, entry in numbers.items():
        caption = fields.get(captions.get(key, ""))
        entry["label"] = caption["en"] if caption else (entry["label"] or "Number")

    # photos are named after their class when it is descriptive, otherwise after
    # the pages they appear on, so the admin can tell the placements apart
    for entry in images.values():
        named = entry.pop("named")
        prefix = entry.pop("prefix")
        if named:
            entry["label"] = named
        elif prefix:
            entry["label"] = prefix + entry.pop("kind")
        else:
            entry["label"] = "%s - %s" % (entry.pop("kind"), pages_label(entry["where"]))

    return fields, images, numbers, ordered_groups(groups, order)


CHROME_ORDER = ["site:header", "site:footer"]


def ordered_groups(groups, order):
    """The sidebar lists the site-wide chrome first, then the page sections in
    the order they appear down the page."""
    result = [groups[g] for g in order]
    result.sort(key=lambda g: CHROME_ORDER.index(g["id"]) if g["id"] in CHROME_ORDER else len(CHROME_ORDER))
    return result


def render(fields, images, numbers, groups):
    lines = [
        "/* Generated by tools/build_admin_manifest.py - do not edit by hand.",
        "",
        "   Every editable thing on the site, grouped the way the admin screen shows",
        "   it. Re-run the tool after changing a page's markup:",
        "",
        "       python tools/build_admin_manifest.py",
        "*/",
        "window.ING_ADMIN_FIELDS = " + json.dumps(
            {"pages": [{"file": f, "label": n} for f, n in PAGES],
             "groups": groups, "fields": fields, "images": images, "numbers": numbers},
            ensure_ascii=False, indent=2) + ";",
        "",
    ]
    return "\n".join(lines)


def main():
    collected = collect(arabic_keys())
    content = render(*collected)
    if "--check" in sys.argv:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != content:
            sys.exit("%s is out of date - run: python tools/build_admin_manifest.py" % OUT)
        print("%s is up to date" % OUT)
        return
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(content)
    fields, images, numbers, groups = collected
    print("%s  %d groups, %d text fields, %d photos, %d numbers"
          % (OUT, len(groups), len(fields), len(images), len(numbers)))


if __name__ == "__main__":
    main()
