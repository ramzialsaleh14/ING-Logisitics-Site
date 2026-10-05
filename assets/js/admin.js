/* ==========================================================================
   admin.html — sign in, edit the site's text and photos, keep a draft in this
   browser and push the changes to the repository.

   The draft is written to localStorage (photos to IndexedDB, via
   draft-store.js) as soon as something changes, so nothing is lost if the tab
   is closed before the changes are pushed. "Push changes" sends the draft to
   netlify/functions/publish.js, which checks the same credentials and commits
   assets/js/content.js plus any new photos to GitHub.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     The password is stored only as its SHA-256, so the plaintext is not in
     this repository. The same credentials are enforced server-side by the
     publish function (ADMIN_PASSWORD), and that check is what protects the
     site - this gate only decides who sees the dashboard.
     ------------------------------------------------------------------------ */
  var ADMIN_USER = "ing-logistics";
  var ADMIN_SHA256 = "80c063e7a251c840f80e84ef7f2d53b51c3625031e8670f760620f4bfd609086";

  var PUBLISH_URL = "/.netlify/functions/publish";
  var DRAFT_KEY = "ing-admin-draft";
  var BASELINE_KEY = "ing-admin-published";
  var SESSION_KEY = "ing-admin-session";
  var SESSION_HOURS = 8;
  var MAX_IMAGE_WIDTH = 1920;
  var UPLOAD_DIR = "assets/img/uploads/";

  var MANIFEST = window.ING_ADMIN_FIELDS || { pages: [], groups: [], fields: {}, images: {}, numbers: {} };
  var PAGE_LABEL = {};
  (MANIFEST.pages || []).forEach(function (page) { PAGE_LABEL[page.file] = page.label; });

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var draft = readDraft();
  var blobs = {};               // image key -> { blob, url, name, size, width, height }
  var baseline = publishedContent();
  var currentGroup = MANIFEST.groups.length ? MANIFEST.groups[0].id : null;
  var currentPage = (MANIFEST.pages[0] || {}).file || "index.html";
  var answerDialog = null;      // resolves the open confirm/notice dialog
  var previewTimer = null;
  var quota = null;             // { used, limit, remaining, resetAt } from the publish function

  /* -------------------------------------------------------------- storage -- */

  function emptyDraft() { return { text: {}, hrefs: {}, numbers: {}, images: {} }; }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function readJSON(storage, key, fallback) {
    try {
      var raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false; // private mode, or no room left
    }
  }

  function remove(storage, key) {
    try { storage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* This shape is also written by hand and by earlier versions, so check it. */
  function readDraft() {
    var stored = readJSON(window.localStorage, DRAFT_KEY, null);
    var clean = emptyDraft();
    if (!stored) return clean;
    ["text", "hrefs", "numbers", "images"].forEach(function (name) {
      if (stored[name] && typeof stored[name] === "object") clean[name] = stored[name];
    });
    return clean;
  }

  /* The published content, preferring the copy cached after the last push so
     this screen keeps showing the new values until Netlify has rebuilt. */
  function publishedContent() {
    var published = window.ING_CONTENT || {};
    var cached = readJSON(window.localStorage, BASELINE_KEY, null);
    if (cached && String(cached.updated || "") > String(published.updated || "")) return cached;
    return published;
  }

  function session() {
    var stored = readJSON(window.sessionStorage, SESSION_KEY, null);
    if (!stored || !stored.at || !stored.password) return null;
    if ((Date.now() - stored.at) / 3600000 > SESSION_HOURS) return null;
    return stored;
  }

  /* ------------------------------------------------------------ resolving -- */

  function baselineText(key, lang) {
    var entry = (baseline.text || {})[key] || {};
    if (entry[lang] !== undefined) return entry[lang];
    return (MANIFEST.fields[key] || {})[lang] || "";
  }

  function textValue(key, lang) {
    var entry = (draft.text[key] || {})[lang];
    return entry !== undefined ? entry : baselineText(key, lang);
  }

  function baselineHref(key) {
    return (baseline.hrefs || {})[key] !== undefined
      ? baseline.hrefs[key]
      : (MANIFEST.fields[key] || {}).href || "";
  }

  function hrefValue(key) {
    return draft.hrefs[key] !== undefined ? draft.hrefs[key] : baselineHref(key);
  }

  function baselineNumber(key, part) {
    var published = ((baseline.numbers || {})[key] || {})[part];
    return published !== undefined ? published : (MANIFEST.numbers[key] || {})[part] || "";
  }

  function numberValue(key, part) {
    var fromDraft = (draft.numbers[key] || {})[part];
    return fromDraft !== undefined ? fromDraft : baselineNumber(key, part);
  }

  function imageSrc(key) {
    if (blobs[key]) return blobs[key].url;
    var entry = draft.images[key];
    if (entry && entry.path) return entry.path;
    return (baseline.images || {})[key] || (MANIFEST.images[key] || {}).default || "";
  }

  function isChanged(kind, key) {
    if (kind === "image") return Boolean(draft.images[key]);
    if (kind === "href") return hrefValue(key) !== baselineHref(key);
    if (kind === "number") {
      return numberValue(key, "value") !== baselineNumber(key, "value")
        || numberValue(key, "suffix") !== baselineNumber(key, "suffix");
    }
    return textValue(key, "en") !== baselineText(key, "en")
      || textValue(key, "ar") !== baselineText(key, "ar");
  }

  function changeCount() {
    var total = Object.keys(draft.images).length;
    Object.keys(draft.text).forEach(function (key) { if (isChanged("text", key)) total += 1; });
    Object.keys(draft.hrefs).forEach(function (key) { if (isChanged("href", key)) total += 1; });
    Object.keys(draft.numbers).forEach(function (key) { if (isChanged("number", key)) total += 1; });
    return total;
  }

  /* Only differences from the published content are worth keeping. */
  function prune(source) {
    var out = emptyDraft();
    Object.keys(source.text).forEach(function (key) {
      var entry = {}, value = source.text[key] || {};
      ["en", "ar"].forEach(function (lang) {
        if (value[lang] !== undefined && value[lang] !== baselineText(key, lang)) entry[lang] = value[lang];
      });
      if (Object.keys(entry).length) out.text[key] = entry;
    });
    Object.keys(source.hrefs).forEach(function (key) {
      if (source.hrefs[key] !== baselineHref(key)) out.hrefs[key] = source.hrefs[key];
    });
    Object.keys(source.numbers).forEach(function (key) {
      var entry = {}, value = source.numbers[key] || {};
      ["value", "suffix"].forEach(function (part) {
        if (value[part] !== undefined && value[part] !== baselineNumber(key, part)) entry[part] = value[part];
      });
      if (Object.keys(entry).length) out.numbers[key] = entry;
    });
    out.images = clone(source.images);
    return out;
  }

  function saveDraft() {
    var stored = writeJSON(window.localStorage, DRAFT_KEY, prune(draft));
    var count = changeCount();
    var stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!stored) {
      setState("This browser is not saving the draft", "is-error");
    } else if (count) {
      setState(count + (count === 1 ? " change" : " changes") + " not pushed \u00b7 kept " + stamp, "is-dirty");
    } else {
      setState("Everything is pushed \u00b7 " + stamp, "");
    }
  }

  function discardDraft() {
    draft = emptyDraft();
    remove(window.localStorage, DRAFT_KEY);
    Object.keys(blobs).forEach(function (key) {
      URL.revokeObjectURL(blobs[key].url);
      delete blobs[key];
    });
    return window.INGDraftImages.clear().catch(function () { /* nothing stored */ });
  }

  function setText(key, lang, value) {
    draft.text[key] = draft.text[key] || {};
    draft.text[key][lang] = value;
    changed(key, "text");
  }

  function setHref(key, value) {
    draft.hrefs[key] = value;
    changed(key, "href");
  }

  function setNumber(key, part, value) {
    draft.numbers[key] = draft.numbers[key] || {};
    draft.numbers[key][part] = value;
    changed(key, "number");
  }

  function changed(key, kind) {
    saveDraft();
    var card = $('.field[data-key="' + key + '"]');
    if (card) {
      var isDirty = isChanged(kind, key);
      card.classList.toggle("is-changed", isDirty);
      $(".field__tag", card).hidden = !isDirty;
    }
    schedulePreview();
  }

  function setState(text, className) {
    $("#state").textContent = text;
    $("#state").className = "bar__state " + (className || "");
  }

  /* --------------------------------------------------------------- sign in -- */

  function sha256Hex(text) {
    if (!(window.crypto && window.crypto.subtle)) {
      return Promise.reject(new Error(
        "Signing in needs a secure address. Open the https:// site, or http://localhost while testing."));
    }
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
      .then(function (buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
          return ("0" + byte.toString(16)).slice(-2);
        }).join("");
      });
  }

  function showGate() {
    $("#gate").hidden = false;
    $("#dash").hidden = true;
    $("#user").focus();
  }

  function start() {
    $("#gate").hidden = true;
    $("#dash").hidden = false;
    restoreBlobs().then(function () {
      renderGroups();
      renderFields();
      renderPreviewTabs();
      saveDraft();
      refreshQuota();
    });
  }

  $("#signin").addEventListener("submit", function (event) {
    event.preventDefault();
    var button = $(".gate__submit");
    var error = $("#signin-error");
    var user = $("#user").value.trim();
    var password = $("#password").value;

    error.hidden = true;
    button.disabled = true;
    button.textContent = "Checking\u2026";

    sha256Hex(password).then(function (hash) {
      if (user !== ADMIN_USER || hash !== ADMIN_SHA256) {
        throw new Error("That user name or password is not correct.");
      }
      writeJSON(window.sessionStorage, SESSION_KEY, { user: user, password: password, at: Date.now() });
      start();
    }).catch(function (problem) {
      error.textContent = problem.message;
      error.hidden = false;
    }).then(function () {
      button.disabled = false;
      button.textContent = "Sign in";
    });
  });

  $("#signout").addEventListener("click", function () {
    confirmDialog("Sign out?", "Your draft stays in this browser, so you can sign back in and carry on.", "Sign out")
      .then(function (yes) {
        if (!yes) return;
        remove(window.sessionStorage, SESSION_KEY);
        window.location.reload();
      });
  });

  /* Photos saved in an earlier session are loaded back as object URLs. */
  function restoreBlobs() {
    return Promise.all(Object.keys(draft.images).map(function (key) {
      return window.INGDraftImages.get(key).then(function (blob) {
        if (blob) {
          blobs[key] = {
            blob: blob, url: URL.createObjectURL(blob),
            size: blob.size, name: (draft.images[key] || {}).name,
          };
        }
      });
    }));
  }

  /* ---------------------------------------------------------------- render -- */

  function renderGroups() {
    var nav = $("#groups");
    nav.textContent = "";
    addGroupHeading(nav, "Every page");
    MANIFEST.groups.filter(isChrome).forEach(function (group) { nav.appendChild(groupButton(group)); });
    addGroupHeading(nav, "Page sections");
    MANIFEST.groups.filter(function (group) { return !isChrome(group); })
      .forEach(function (group) { nav.appendChild(groupButton(group)); });
  }

  function isChrome(group) { return group.id.indexOf("site") === 0; }

  function addGroupHeading(nav, text) {
    var heading = document.createElement("p");
    heading.className = "side__title";
    heading.textContent = text;
    nav.appendChild(heading);
  }

  function groupButton(group) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "side__item" + (group.id === currentGroup ? " is-current" : "");
    button.appendChild(document.createTextNode(group.label));
    var where = document.createElement("span");
    where.textContent = pagesLabel(group.where);
    button.appendChild(where);
    button.addEventListener("click", function () {
      currentGroup = group.id;
      renderGroups();
      renderFields();
    });
    return button;
  }

  function pagesLabel(pages) {
    if (!pages || !pages.length) return "";
    if (pages.length === MANIFEST.pages.length) return "every page";
    return pages.map(function (page) { return PAGE_LABEL[page] || page; }).join(", ");
  }

  function keysWhere(source, group) {
    return Object.keys(source).filter(function (key) { return source[key].group === group; });
  }

  function renderFields() {
    var group = null;
    MANIFEST.groups.forEach(function (item) { if (item.id === currentGroup) group = item; });
    var host = $("#fields");
    host.textContent = "";
    if (!group) return;

    $("#group-title").textContent = group.label;

    var head = document.createElement("h1");
    head.className = "fields__head";
    head.textContent = group.label;
    host.appendChild(head);

    var lead = document.createElement("p");
    lead.className = "fields__lead";
    lead.textContent = "Shown on " + pagesLabel(group.where)
      + ". Changes stay in this browser until you push them.";
    host.appendChild(lead);

    keysWhere(MANIFEST.fields, group.id).forEach(function (key) { host.appendChild(textField(key)); });
    keysWhere(MANIFEST.numbers, group.id).forEach(function (key) { host.appendChild(numberField(key)); });
    keysWhere(MANIFEST.images, group.id).forEach(function (key) { host.appendChild(photoField(key)); });
  }

  function fieldShell(kind, key, label) {
    var card = document.createElement("article");
    card.className = "field" + (isChanged(kind, key) ? " is-changed" : "");
    card.setAttribute("data-kind", kind);
    card.setAttribute("data-key", key);

    var head = document.createElement("div");
    head.className = "field__head";
    var name = document.createElement("span");
    name.className = "field__label";
    name.textContent = label;
    var id = document.createElement("span");
    id.className = "field__key";
    id.textContent = key;
    var tag = document.createElement("span");
    tag.className = "field__tag";
    tag.textContent = "Changed";
    tag.hidden = !isChanged(kind, key);

    head.appendChild(name);
    head.appendChild(id);
    head.appendChild(tag);
    card.appendChild(head);
    return card;
  }

  function hint(text) {
    var note = document.createElement("p");
    note.className = "field__hint";
    note.textContent = text;
    return note;
  }

  function box(label, control) {
    var wrapper = document.createElement("label");
    wrapper.className = "field__box";
    var caption = document.createElement("span");
    caption.textContent = label;
    wrapper.appendChild(caption);
    wrapper.appendChild(control);
    return wrapper;
  }

  function textField(key) {
    var info = MANIFEST.fields[key];
    var langs = info.langs || ["en", "ar"];
    var card = fieldShell("text", key, info.label);
    var row = document.createElement("div");
    row.className = "field__row";

    [["English", "en"], ["Arabic", "ar"]].filter(function (pair) {
      return langs.indexOf(pair[1]) !== -1;
    }).forEach(function (pair) {
      var value = textValue(key, pair[1]);
      var control;
      if (value.length <= 48 && value.indexOf("\n") === -1) {
        control = document.createElement("input");
        control.type = "text";
      } else {
        control = document.createElement("textarea");
        control.rows = Math.min(8, Math.max(2, Math.ceil(value.length / 72)));
      }
      control.value = value;
      if (pair[1] === "ar") control.dir = "rtl";
      control.addEventListener("input", function () { setText(key, pair[1], control.value); });

      var wrapper = box(pair[0], control);
      if (pair[1] === "ar") wrapper.className += " field__box--ar";
      row.appendChild(wrapper);
    });
    card.appendChild(row);

    if (info.href) {
      var link = document.createElement("input");
      link.type = "text";
      link.value = hrefValue(key);
      link.addEventListener("input", function () { setHref(key, link.value); });
      card.appendChild(box("Link (where clicking it goes)", link));
    }

    card.appendChild(hint(langs.indexOf("ar") === -1
      ? "Used on " + pagesLabel(info.where) + ", in English and Arabic alike."
      : "Used on " + pagesLabel(info.where) + "."));
    return card;
  }

  function numberField(key) {
    var info = MANIFEST.numbers[key];
    var card = fieldShell("number", key, info.label);
    var row = document.createElement("div");
    row.className = "number";

    [["Number", "value"], ["After the number", "suffix"]].forEach(function (pair) {
      var control = document.createElement("input");
      control.type = "text";
      control.value = numberValue(key, pair[1]);
      control.addEventListener("input", function () { setNumber(key, pair[1], control.value); });
      row.appendChild(box(pair[0], control));
    });
    card.appendChild(row);
    card.appendChild(hint("The figure that counts up on " + pagesLabel(info.where) + "."));
    return card;
  }

  function photoField(key) {
    var info = MANIFEST.images[key];
    var card = fieldShell("image", key, info.label);
    var layout = document.createElement("div");
    layout.className = "photo";

    var thumb = document.createElement("div");
    thumb.className = "photo__thumb";
    layout.appendChild(thumb);

    var body = document.createElement("div");
    body.className = "photo__body";
    var meta = document.createElement("p");
    meta.className = "photo__meta";
    body.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "photo__actions";

    var pick = document.createElement("label");
    pick.className = "photo__pick";
    pick.textContent = "Choose photo";
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    pick.appendChild(input);
    actions.appendChild(pick);

    var revert = document.createElement("button");
    revert.type = "button";
    revert.className = "photo__revert";
    revert.textContent = "Back to the original photo";
    revert.addEventListener("click", function () {
      delete draft.images[key];
      if (blobs[key]) {
        URL.revokeObjectURL(blobs[key].url);
        delete blobs[key];
      }
      window.INGDraftImages.remove(key).catch(function () { /* nothing stored */ });
      paintPhoto(card, key);
      changed(key, "image");
      renderPreview();
    });
    actions.appendChild(revert);

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (file) pickImage(key, file, card);
    });

    body.appendChild(actions);
    layout.appendChild(body);
    card.appendChild(layout);
    card.appendChild(hint("Used on " + pagesLabel(info.where) + "."));
    paintPhoto(card, key);
    return card;
  }

  function paintPhoto(card, key) {
    var info = MANIFEST.images[key];
    var source = imageSrc(key);
    $(".photo__thumb", card).style.backgroundImage = source ? "url('" + source + "')" : "none";

    var meta = $(".photo__meta", card);
    meta.textContent = "";

    var chosen = blobs[key];
    var title = document.createElement("strong");
    title.textContent = (chosen && chosen.name) || source.split("/").pop() || "No photo";
    var detail = document.createElement("em");
    if (chosen && chosen.width) {
      detail.textContent = chosen.width + " \u00d7 " + chosen.height + " px \u00b7 "
        + Math.round(chosen.size / 1024) + " KB \u00b7 new photo";
    } else if (chosen) {
      detail.textContent = Math.round(chosen.size / 1024) + " KB \u00b7 new photo";
    } else {
      detail.textContent = info.default;
    }
    meta.appendChild(title);
    meta.appendChild(detail);
    $(".photo__revert", card).hidden = !isChanged("image", key);
  }

  /* ---------------------------------------------------------------- photos -- */

  /* Big camera photos are shrunk before they are stored or uploaded. PNGs stay
     PNG so transparency (the logos) survives; everything else becomes JPEG. */
  function prepareImage(file) {
    var type = file.type === "image/png" ? "image/png" : "image/jpeg";
    return readImage(file).then(function (image) {
      var scale = Math.min(1, MAX_IMAGE_WIDTH / image.naturalWidth);
      var smallEnough = file.size <= (type === "image/png" ? 1024 : 400) * 1024;
      if (scale === 1 && smallEnough) {
        return digestHex(file).then(function (hash) {
          return { blob: file, type: type, hash: hash, width: image.naturalWidth, height: image.naturalHeight };
        });
      }
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return toBlob(canvas, type).then(function (blob) {
        return digestHex(blob).then(function (hash) {
          return { blob: blob, type: type, hash: hash, width: canvas.width, height: canvas.height };
        });
      });
    });
  }

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("That image file could not be read."));
      };
      image.src = url;
    });
  }

  function toBlob(canvas, type) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("This browser could not prepare the image."));
      }, type, 0.85);
    });
  }

  /* A short content hash keeps a photo's file name stable, so re-picking the
     same picture does not add a second copy to the repository. */
  function digestHex(blob) {
    if (!(window.crypto && window.crypto.subtle)) return Promise.resolve(String(Date.now()).slice(-8));
    return blob.arrayBuffer()
      .then(function (bytes) { return window.crypto.subtle.digest("SHA-256", bytes); })
      .then(function (buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer).slice(0, 4), function (byte) {
          return ("0" + byte.toString(16)).slice(-2);
        }).join("");
      });
  }

  function fileName(key, hash, type) {
    var extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    return key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-" + hash + "." + extension;
  }

  function pickImage(key, file, card) {
    if (!/^image\//.test(file.type)) {
      notice("That file is not an image", "Choose a JPG, PNG or WebP picture.", "Close");
      return;
    }
    prepareImage(file).then(function (prepared) {
      var name = fileName(key, prepared.hash, prepared.type);
      draft.images[key] = { path: UPLOAD_DIR + name, name: name };
      if (blobs[key]) URL.revokeObjectURL(blobs[key].url);
      blobs[key] = {
        blob: prepared.blob,
        url: URL.createObjectURL(prepared.blob),
        size: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
        name: name,
      };
      return window.INGDraftImages.put(key, prepared.blob).then(function () {
        paintPhoto(card, key);
        changed(key, "image");
        renderPreview();
      });
    }).catch(function (problem) {
      notice("That photo could not be used", escapeHtml(problem.message), "Close");
    });
  }

  /* --------------------------------------------------------------- preview -- */

  function renderPreviewTabs() {
    var host = $("#preview-tabs");
    host.textContent = "";
    MANIFEST.pages.forEach(function (page) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "preview__tab" + (page.file === currentPage ? " is-current" : "");
      tab.textContent = page.label;
      tab.addEventListener("click", function () {
        currentPage = page.file;
        renderPreviewTabs();
        renderPreview();
      });
      host.appendChild(tab);
    });
  }

  function renderPreview() {
    if ($("#preview").hidden) return;
    $("#preview-frame").src = currentPage + "?preview=draft&ts=" + Date.now();
  }

  function schedulePreview() {
    if ($("#preview").hidden) return;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 500);
  }

  $("#preview-toggle").addEventListener("click", function () {
    var panel = $("#preview");
    panel.hidden = !panel.hidden;
    $(".dash__body").classList.toggle("is-previewing", !panel.hidden);
    if (!panel.hidden) renderPreview();
  });

  /* --------------------------------------------------------------- dialogs -- */

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function dialog(title, html, okLabel, withCancel) {
    $("#notice-title").textContent = title;
    $("#notice-text").innerHTML = html;
    $("#notice-ok").textContent = okLabel || "OK";
    $("#notice-cancel").hidden = !withCancel;
    $("#notice").hidden = false;
    $("#notice-ok").focus();
    return new Promise(function (resolve) { answerDialog = resolve; });
  }

  function confirmDialog(title, html, okLabel) { return dialog(title, html, okLabel, true); }
  function notice(title, html, okLabel) { return dialog(title, html, okLabel, false); }

  $("#notice-ok").addEventListener("click", function () { closeDialog(true); });
  $("#notice-cancel").addEventListener("click", function () { closeDialog(false); });

  function closeDialog(answer) {
    $("#notice").hidden = true;
    var resolve = answerDialog;
    answerDialog = null;
    if (resolve) resolve(answer);
  }

  /* ------------------------------------------------------------ allowance -- */

  /* How many pushes are left today, straight from the publish function - it is
     the only place that can see the whole picture, so it is the only place
     that decides. This just shows what it says. */
  function refreshQuota() {
    var auth = session();
    if (!auth) return Promise.resolve();
    return api({ action: "status", user: auth.user, password: auth.password })
      .then(function (result) { applyQuota(result.quota); })
      .catch(function () { applyQuota(null); });   // not connected: the push attempt will explain
  }

  function applyQuota(next) {
    quota = next || null;
    renderQuota();
  }

  function whenText(iso) {
    var when = new Date(iso);
    if (isNaN(when.getTime())) return iso;
    return when.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }

  function renderQuota() {
    var badge = $("#quota");
    var button = $("#publish");
    if (!quota) {
      badge.hidden = true;
      button.disabled = false;
      button.removeAttribute("title");
      return;
    }

    badge.hidden = false;
    badge.classList.toggle("is-empty", quota.remaining <= 0);
    if (quota.remaining > 0) {
      badge.textContent = quota.remaining === 1 ? "1 push left today" : quota.remaining + " pushes left today";
      button.disabled = false;
      button.title = "This screen can push changes " + quota.limit + " times a day.";
    } else {
      badge.textContent = "No pushes left today"
        + (quota.resetAt ? " \u00b7 next " + whenText(quota.resetAt) : "");
      button.disabled = true;
      button.title = "Changes can be pushed " + quota.limit
        + " times a day, and that allowance is used up.";
    }
  }

  /* --------------------------------------------------------------- pushing -- */

  function api(payload) {
    return fetch(PUBLISH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = {};
        try { body = JSON.parse(text); } catch (e) { /* not JSON: fall back to the status */ }
        if (response.status === 404 || response.status === 405 || response.status === 501) {
          throw new Error("Publishing is not connected yet: " + PUBLISH_URL + " was not found. See the "
            + "\u201cPublishing changes\u201d section of README.md.");
        }
        if (!response.ok || !body.ok) {
          var refused = new Error(body.error
            || ("The publish function refused the request (HTTP " + response.status + ")."));
          if (body.quota) refused.quota = body.quota;
          throw refused;
        }
        return body;
      });
    }, function () {
      throw new Error("Could not reach " + PUBLISH_URL + ". Check the connection and try again.");
    });
  }

  /* The whole of content.js: everything already published, with the draft
     changes applied on top. */
  function contentToPublish() {
    var content = {
      version: 1,
      updated: baseline.updated || "",
      text: clone(baseline.text || {}),
      hrefs: clone(baseline.hrefs || {}),
      numbers: clone(baseline.numbers || {}),
      images: clone(baseline.images || {}),
    };

    Object.keys(draft.text).forEach(function (key) {
      var entry = content.text[key] || {};
      ["en", "ar"].forEach(function (lang) {
        var value = (draft.text[key] || {})[lang];
        if (value === undefined) return;
        if (value === baselineText(key, lang)) delete entry[lang];
        else entry[lang] = value;
      });
      if (Object.keys(entry).length) content.text[key] = entry;
      else delete content.text[key];
    });

    Object.keys(draft.hrefs).forEach(function (key) {
      if (draft.hrefs[key] === baselineHref(key)) delete content.hrefs[key];
      else content.hrefs[key] = draft.hrefs[key];
    });

    Object.keys(draft.numbers).forEach(function (key) {
      var entry = content.numbers[key] || {};
      ["value", "suffix"].forEach(function (part) {
        var value = (draft.numbers[key] || {})[part];
        if (value === undefined) return;
        if (value === baselineNumber(key, part)) delete entry[part];
        else entry[part] = value;
      });
      if (Object.keys(entry).length) content.numbers[key] = entry;
      else delete content.numbers[key];
    });

    Object.keys(draft.images).forEach(function (key) {
      content.images[key] = draft.images[key].path;
    });

    return content;
  }

  function imagesToUpload() {
    return Object.keys(draft.images).map(function (key) {
      var path = draft.images[key].path;
      return { key: key, path: path, alreadyLive: (baseline.images || {})[key] === path };
    }).filter(function (image) { return !image.alreadyLive; });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result);
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = function () { reject(new Error("The photo could not be read for uploading.")); };
      reader.readAsDataURL(blob);
    });
  }

  function publish() {
    if (quota && quota.remaining <= 0) {
      notice("No pushes left today",
        "Changes can be pushed " + quota.limit + " times a day, and that allowance is used up."
        + (quota.resetAt ? " The next push becomes available " + escapeHtml(whenText(quota.resetAt)) + "." : "")
        + "<br><br>Nothing is lost \u2014 your draft stays saved in this browser, and you can push it later.",
        "Close");
      return;
    }

    var count = changeCount();
    if (!count) {
      notice("Nothing to push", "Change something first, or use \u201cDiscard draft\u201d to clear the draft.", "Close");
      return;
    }

    var uploads = imagesToUpload();
    var missing = uploads.filter(function (image) { return !blobs[image.key]; });
    if (missing.length) {
      notice("A photo is missing from this browser",
        "Please choose the photo again for: " + escapeHtml(missing.map(function (image) {
          return MANIFEST.images[image.key].label;
        }).join(", ")) + ".", "Close");
      return;
    }

    var about = uploads.length
      ? "This saves " + uploads.length + (uploads.length === 1 ? " new photo" : " new photos")
        + " and the text changes to the website\u2019s repository. "
      : "This saves the text changes to the website\u2019s repository. ";
    about += "Netlify then rebuilds the site, which usually takes about a minute.";

    confirmDialog("Push " + count + (count === 1 ? " change" : " changes") + "?", about, "Push changes")
      .then(function (yes) { if (yes) runPublish(uploads); });
  }

  function runPublish(uploads) {
    var auth = session();
    if (!auth) { showGate(); return; }

    $("#publish").disabled = true;
    setState("Pushing\u2026", "");

    var chain = Promise.resolve();
    uploads.forEach(function (image, index) {
      chain = chain.then(function () {
        setState("Uploading photo " + (index + 1) + " of " + uploads.length + "\u2026", "");
        return blobToBase64(blobs[image.key].blob).then(function (base64) {
          return api({
            action: "image",
            user: auth.user,
            password: auth.password,
            path: image.path,
            base64: base64,
          });
        });
      });
    });

    chain.then(function () {
      setState("Saving the text changes\u2026", "");
      var content = contentToPublish();
      content.updated = new Date().toISOString();
      return api({ action: "content", user: auth.user, password: auth.password, content: content })
        .then(function (result) {
          baseline = content;
          window.ING_CONTENT = content;
          writeJSON(window.localStorage, BASELINE_KEY, content);
          applyQuota(result.quota);
          return discardDraft().then(function () {
            renderFields();
            renderPreview();
            saveDraft();
            setState("Pushed \u00b7 the site updates in about a minute", "is-ok");
            return notice("Changes pushed",
              "The website is rebuilding now and usually updates within a minute. "
              + (result.commit
                ? '<a href="' + escapeHtml(result.commit) + '" target="_blank" rel="noopener">See the commit</a>.'
                : ""),
              "Close");
          });
        });
    }).catch(function (problem) {
      saveDraft();
      applyQuota(problem.quota);
      setState("Nothing was pushed", "is-error");
      notice("The changes were not pushed",
        escapeHtml(problem.message)
        + "<br><br>Your draft is still saved in this browser \u2014 fix the problem and press \u201cPush changes\u201d again.",
        "Close");
    }).then(function () {
      renderQuota();
    });
  }

  $("#publish").addEventListener("click", publish);

  $("#discard").addEventListener("click", function () {
    if (!changeCount()) {
      notice("Nothing to discard", "The draft has no changes in it.", "Close");
      return;
    }
    confirmDialog("Discard the draft?",
      "Every change you have not pushed is thrown away and the original text and photos come back.",
      "Discard draft").then(function (yes) {
      if (!yes) return;
      discardDraft().then(function () {
        renderFields();
        renderPreview();
        saveDraft();
      });
    });
  });

  /* ------------------------------------------------------------------ boot -- */

  window.addEventListener("beforeunload", function () {
    if (changeCount()) saveDraft();
  });

  if (!MANIFEST.groups.length) {
    // admin-fields.js did not load: say so rather than show an empty screen
    $("#gate").hidden = true;
    $("#dash").hidden = false;
    $("#fields").textContent = "The list of editable fields (assets/js/admin-fields.js) could not be loaded. "
      + "Run: python tools/build_admin_manifest.py";
  } else if (session()) {
    start();
  } else {
    showGate();
  }
})();
