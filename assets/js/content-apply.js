/* ==========================================================================
   Applies saved content overrides to the page.

   Loaded after i18n.js/content.js and before main.js. English overrides
   replace the copy in the markup, Arabic overrides are merged into the
   dictionary main.js reads, and image/number overrides are applied to the
   elements carrying data-cimg / data-cnum. Nothing here changes a page until
   an override exists, so the site is byte-for-byte the same when empty.

   Adding ?preview=draft to a URL overlays the unpublished draft that
   admin.html keeps in this browser, which is how the admin previews edits
   before pushing them live.
   ========================================================================== */
(function () {
  "use strict";

  var DRAFT_KEY = "ing-admin-draft";
  var buckets = { text: {}, hrefs: {}, numbers: {}, images: {} };

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
    Object.keys(buckets).forEach(function (name) {
      var values = source[name];
      if (!values) return;
      Object.keys(values).forEach(function (key) {
        if (values[key] !== null && values[key] !== undefined) buckets[name][key] = values[key];
      });
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
      }
    });
  }

  function applyImages() {
    Object.keys(buckets.images).forEach(function (key) {
      var value = buckets.images[key];
      if (typeof value === "string" && value) paint(key, value);
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

  applyText();
  applyHrefs();
  applyNumbers();
  applyImages();
  applyDraftImages();
})();
