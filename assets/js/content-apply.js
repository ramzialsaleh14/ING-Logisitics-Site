/* ==========================================================================
   Applies saved content overrides to the page.

   Loaded after i18n.js/content.js and before main.js. English overrides
   replace the copy in the markup, Arabic overrides are merged into the
   dictionary main.js reads, image/number overrides are applied to the
   elements carrying data-cimg / data-cnum, the cards named in the hidden list
   are taken off the page and the cards named in the added list are built and
   appended. The hero slides work the same way through slidesHidden and
   slidesAdded, except that the slider is never left with fewer than three
   slides. Nothing here changes a page until an override exists, so the site
   is byte-for-byte the same when empty.

   Adding ?preview=draft to a URL overlays the unpublished draft that
   admin.html keeps in this browser, which is how the admin previews edits
   before pushing them live.
   ========================================================================== */
(function () {
  "use strict";

  var DRAFT_KEY = "ing-admin-draft";
  var MIN_SLIDES = 3;
  var buckets = {
    text: {}, hrefs: {}, numbers: {}, images: {},
    hidden: [], added: [], slidesHidden: [], slidesAdded: []
  };

  function isDraftPreview() {
    return /(^|[?&])preview=draft(&|$)/.test(window.location.search);
  }

  function readDraft() {
    try {
      return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null");
    } catch (e) {
      return null; // private mode, quota, or a corrupt draft: use published content
    }
  }

  function merge(source) {
    if (!source) return;
    ["text", "hrefs", "numbers", "images"].forEach(function (name) {
      var values = source[name];
      if (!values) return;
      Object.keys(values).forEach(function (key) {
        if (values[key] !== null && values[key] !== undefined) buckets[name][key] = values[key];
      });
    });
    // the hidden and added lists are whole states rather than a change per key:
    // in a draft preview the draft's lists already carry the published ones with
    // its own removals, restorations and additions applied
    if (Array.isArray(source.hidden)) buckets.hidden = source.hidden.slice();
    if (Array.isArray(source.added)) buckets.added = source.added.map(function (member) {
      return { id: String(member && member.id || ""), initials: String(member && member.initials || "") };
    });
    if (Array.isArray(source.slidesHidden)) buckets.slidesHidden = source.slidesHidden.slice();
    if (Array.isArray(source.slidesAdded)) buckets.slidesAdded = source.slidesAdded.map(function (slide) {
      return { id: String(slide && slide.id || "") };
    });
  }

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function applyText() {
    var arabic = window.ING_I18N && window.ING_I18N.ar;
    Object.keys(buckets.text).forEach(function (key) {
      var value = buckets.text[key] || {};
      if (arabic && typeof value.ar === "string" && value.ar) arabic[key] = value.ar;
      if (typeof value.en !== "string" || !value.en) return;
      each('[data-i18n="' + key + '"]', function (el) { el.innerHTML = value.en; });
      each('[data-i18n-placeholder="' + key + '"]', function (el) { el.placeholder = value.en; });
      each('[data-i18n-aria="' + key + '"]', function (el) { el.setAttribute("aria-label", value.en); });
      // data-ctext marks text that reads the same in every language
      each('[data-ctext="' + key + '"]', function (el) { el.innerHTML = value.en; });
    });
  }

  function applyHrefs() {
    Object.keys(buckets.hrefs).forEach(function (key) {
      var href = buckets.hrefs[key];
      if (typeof href !== "string" || !href) return;
      each('a[data-i18n="' + key + '"], a[data-ctext="' + key + '"]', function (el) {
        el.setAttribute("href", href);
      });
    });
  }

  function applyNumbers() {
    Object.keys(buckets.numbers).forEach(function (key) {
      var value = buckets.numbers[key] || {};
      if (value.value !== undefined && value.value !== null && value.value !== "") {
        each('[data-cnum="' + key + '"]', function (el) { el.setAttribute("data-count-to", String(value.value)); });
      }
      if (value.suffix !== undefined && value.suffix !== null) {
        each('[data-cnum-suffix="' + key + '"]', function (el) { el.textContent = String(value.suffix); });
      }
    });
  }

  function paint(key, url) {
    each('[data-cimg="' + key + '"]', function (el) {
      if (el.tagName === "IMG") {
        el.removeAttribute("srcset");
        el.src = url;
      } else {
        el.style.backgroundImage = "url('" + url + "')";
        el.classList.add("is-photo");
      }
    });
  }

  function applyImages() {
    Object.keys(buckets.images).forEach(function (key) {
      var value = buckets.images[key];
      if (typeof value === "string" && value) paint(key, value);
    });
  }

  /* Cards the admin took off the page. They are marked in the markup with
     data-cmember, which is also the name used in the hidden list. */
  function applyHidden() {
    if (!buckets.hidden.length) return;
    each("[data-cmember]", function (card) {
      if (buckets.hidden.indexOf(card.getAttribute("data-cmember")) !== -1) card.hidden = true;
    });
  }

  /* New members the admin added: the first card of the grid is copied, pointed
     at the new member's own keys and appended. This runs before applyText() and
     applyImages() so the copy is filled in like any other card, and so main.js
     finds its language keys in the dictionary when the EN/AR toggle runs. */
  function buildAdded() {
    if (!buckets.added.length) return;
    each("[data-cmembers]", function (grid) {
      var template = grid.querySelector("[data-cmember]");
      if (!template) return;
      buckets.added.forEach(function (member) {
        var card = template.cloneNode(true);
        card.hidden = false;
        card.setAttribute("data-cmember", member.id);
        card.removeAttribute("data-reveal-delay");
        var avatar = card.querySelector(".member__avatar");
        var role = card.querySelector("h3");
        var desc = card.querySelector("p");
        avatar.setAttribute("data-cimg", member.id + ".photo");
        avatar.textContent = member.initials || "";
        role.setAttribute("data-i18n", member.id + ".role");
        desc.setAttribute("data-i18n", member.id + ".desc");
        role.textContent = "";
        desc.textContent = "";
        grid.appendChild(card);
      });
    });
  }

  /* New hero slides the admin added: the last slide on the page is copied,
     pointed at the new slide's own keys and appended, so it looks and behaves
     like the rest, including the EN/AR toggle. A new slide carries text and a
     photo but no buttons, and an empty eyebrow or intro line is dropped rather
     than left as a gap. */
  function buildSlides() {
    if (!buckets.slidesAdded.length) return;
    var grid = document.querySelector("[data-cslides]");
    if (!grid) return;
    var slides = grid.querySelectorAll(".hero__slide");
    var template = slides[slides.length - 1];
    if (!template) return;

    buckets.slidesAdded.forEach(function (slide) {
      var card = template.cloneNode(true);
      card.classList.remove("is-active");
      card.setAttribute("data-cslide", slide.id);

      var bg = card.querySelector(".hero__bg");
      if (bg) {
        bg.setAttribute("data-cimg", slide.id + ".photo");
        bg.style.backgroundImage = "";
      }
      fill(card.querySelector(".eyebrow"), slide.id + ".eyebrow", hasText(slide.id + ".eyebrow"));
      fill(card.querySelector(".hero__title"), slide.id + ".title", true);
      fill(card.querySelector(".hero__text"), slide.id + ".text", hasText(slide.id + ".text"));

      var actions = card.querySelector(".hero__actions");
      if (actions) actions.parentNode.removeChild(actions);
      grid.appendChild(card);
    });
  }

  /* Points one piece of a new slide's copy at its own key, or drops it when it
     has no text. applyText()/applyImages() fill it in like any other element. */
  function fill(el, key, keep) {
    if (!el) return;
    if (!keep) {
      el.parentNode.removeChild(el);
      return;
    }
    el.setAttribute("data-i18n", key);
    el.textContent = "";
  }

  function hasText(key) {
    var entry = buckets.text[key] || {};
    return Boolean(entry.en || entry.ar);
  }

  /* Slides the admin took off the hero, and the dot for each one that goes with
     them. The slider is never left with fewer than three slides, so a list that
     would go too far stops at three rather than emptying the banner. */
  function applySlides() {
    if (!buckets.slidesAdded.length && !buckets.slidesHidden.length) return;
    var grid = document.querySelector("[data-cslides]");
    if (!grid) return;

    var slides = Array.prototype.slice.call(grid.querySelectorAll(".hero__slide"));
    var removable = slides.filter(function (slide) {
      return buckets.slidesHidden.indexOf(slide.getAttribute("data-cslide")) !== -1;
    });
    removable.slice(0, Math.max(0, slides.length - MIN_SLIDES)).forEach(function (slide) {
      grid.removeChild(slide);
    });

    rebuildDots(Array.prototype.slice.call(grid.querySelectorAll(".hero__slide")));
  }

  /* The dots are rebuilt from the slides that are left, so one button always
     points at one slide. main.js binds them by position after this runs. */
  function rebuildDots(slides) {
    var dots = document.querySelector(".hero__dots");
    if (!dots) return;
    dots.textContent = "";
    slides.forEach(function (slide, index) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero__dot" + (index === 0 ? " is-active" : "");
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", "Slide " + (index + 1));
      dot.appendChild(document.createElement("span"));
      dots.appendChild(dot);
    });
  }

  /* Draft photos live in IndexedDB (they can be megabytes), so they are
     painted once the blobs arrive, after the published content above. */
  function applyDraftImages() {
    var names = Object.keys(buckets.images).filter(function (key) {
      return buckets.images[key] && typeof buckets.images[key] === "object";
    });
    if (!names.length) return;

    var script = document.createElement("script");
    script.src = "assets/js/draft-store.js";
    script.onload = function () {
      names.forEach(function (key) {
        window.INGDraftImages.get(key).then(function (blob) {
          if (blob) paint(key, URL.createObjectURL(blob));
        });
      });
    };
    document.head.appendChild(script);
  }

  merge(window.ING_CONTENT);
  if (isDraftPreview()) merge(readDraft());

  buildAdded();
  buildSlides();
  applyText();
  applyHrefs();
  applyNumbers();
  applyImages();
  applyDraftImages();
  applyHidden();
  applySlides();
})();
