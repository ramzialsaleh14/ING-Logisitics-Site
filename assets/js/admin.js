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
     Passwords are stored only as their SHA-256, so no plaintext is in this
     repository. The same accounts are enforced server-side by the publish
     function (ADMIN_USER / ADMIN_PASSWORD, plus the extra pairs in
     ADMIN_USERS), and that check is what protects the site - this gate only
     decides who sees the dashboard. Add an account in both places at once, or
     the new sign-in will open the dashboard and then be refused on push.
     ------------------------------------------------------------------------ */
  var ADMIN_ACCOUNTS = [
    { user: "ing-logistics", sha256: "80c063e7a251c840f80e84ef7f2d53b51c3625031e8670f760620f4bfd609086" },
    { user: "ramzialsaleh14", sha256: "51260f0d9d5fdcc286a12b0ee5587ca62e9b79c561d7ba8b9d95511e2a5c9f78" }
  ];

  var PUBLISH_URL = "/.netlify/functions/publish";
  var DRAFT_KEY = "ing-admin-draft";
  var BASELINE_KEY = "ing-admin-published";
  var SESSION_KEY = "ing-admin-session";
  var SESSION_HOURS = 8;
  var MAX_IMAGE_WIDTH = 1920;
  var UPLOAD_DIR = "assets/img/uploads/";
  /* The hero slider keeps at least this many slides, matching the publish
     function. There are three in index.html to begin with. */
  var MIN_SLIDES = 3;

  var MANIFEST = window.ING_ADMIN_FIELDS
    || { pages: [], groups: [], fields: {}, images: {}, numbers: {}, members: {}, slides: {} };

  /* The screen's own words are translated by admin-i18n.js. English is the
     default and anything missing falls back to the English it was written as. */
  var TEXT = window.ING_ADMIN_TEXT || {
    isArabic: function () { return false; },
    lang: function () { return "en"; },
    t: function (text) { return text; },
    setLang: function () {},
    applyScreen: function () {},
  };
  var t = function (text, values) { return TEXT.t(text, values); };

  var PAGE_LABEL = {};
  var PAGE_LABEL_AR = {};
  (MANIFEST.pages || []).forEach(function (page) {
    PAGE_LABEL[page.file] = page.label;
    PAGE_LABEL_AR[page.file] = page.labelAr || page.label;
  });

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var draft = readDraft();
  var blobs = {};               // image key -> { blob, url, name, size, width, height }
  var baseline = publishedContent();
  var currentGroup = MANIFEST.groups.length ? MANIFEST.groups[0].id : null;
  var currentPage = (MANIFEST.pages[0] || {}).file || "index.html";
  var answerDialog = null;      // resolves the open confirm/notice dialog
  var previewTimer = null;
  var quota = null;             // { used, limit, remaining, resetAt } from the publish function
  var photoInfo = {};           // photos the manifest does not know about, e.g. a new member's

  normaliseMembers();
  normaliseSlides();

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
    // the member lists are a whole state rather than an edit per key, so an
    // absent list means "nothing changed" and is filled from the published one
    if (Array.isArray(stored.hidden)) clean.hidden = stored.hidden;
    if (Array.isArray(stored.added)) clean.added = stored.added;
    if (Array.isArray(stored.slidesHidden)) clean.slidesHidden = stored.slidesHidden;
    if (Array.isArray(stored.slidesAdded)) clean.slidesAdded = stored.slidesAdded;
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
    if (kind === "member") return isMemberChanged(String(key).replace(/^member:/, ""));
    if (kind === "slide") return isSlideChanged(String(key).replace(/^slide:/, ""));
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
    return total + memberChangeCount() + slideChangeCount();
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
    // the member lists are kept only when they differ from the published ones;
    // readDraft() fills them back from the published content when they are absent
    if (membersChanged()) {
      out.hidden = source.hidden.slice();
      out.added = clone(source.added);
    }
    if (slidesChanged()) {
      out.slidesHidden = source.slidesHidden.slice();
      out.slidesAdded = clone(source.slidesAdded);
    }
    return out;
  }

  function saveDraft() {
    var stored = writeJSON(window.localStorage, DRAFT_KEY, prune(draft));
    var count = changeCount();
    var stamp = new Date().toLocaleTimeString(TEXT.isArabic() ? "ar" : [], { hour: "2-digit", minute: "2-digit" });
    if (!stored) {
      setState(t("This browser is not saving the draft"), "is-error");
    } else if (count) {
      setState(count === 1
        ? t("1 change not pushed · kept {time}", { time: stamp })
        : t("{n} changes not pushed · kept {time}", { n: count, time: stamp }), "is-dirty");
    } else {
      setState(t("Everything is pushed · {time}", { time: stamp }), "");
    }
  }

  function discardDraft() {
    draft = emptyDraft();
    normaliseMembers();
    normaliseSlides();
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

  /* --------------------------------------------------------------- members -- */

  /* The member lists the markup declares, one per team grid, with the fields of
     the members already on the page. */
  function memberSets() {
    var sets = MANIFEST.members || {};
    return Object.keys(sets).map(function (name) { return sets[name]; });
  }

  function primaryMemberSet() { return memberSets()[0] || null; }

  function manifestMember(id) {
    var found = null;
    memberSets().forEach(function (set) {
      (set.items || []).forEach(function (item) { if (item.id === id) found = item; });
    });
    return found;
  }

  /* The keys a member's role, description and photo live under. For the members
     in the markup the manifest names them; a member added in this screen uses
     the "<id>.role" / "<id>.desc" / "<id>.photo" names that the site reads when
     it builds the extra cards. */
  function memberKeys(id) {
    var item = manifestMember(id);
    return item
      ? { role: item.role, desc: item.desc, photo: item.photo, initials: item.initials }
      : { role: id + ".role", desc: id + ".desc", photo: id + ".photo", initials: "" };
  }

  /* Every key the member cards own, so the group's plain list does not offer
     the same fields a second time. */
  function memberOwnedKeys() {
    var owned = {};
    memberSets().forEach(function (set) {
      (set.items || []).forEach(function (item) {
        [item.role, item.desc, item.photo].forEach(function (key) { if (key) owned[key] = true; });
      });
    });
    return owned;
  }

  function isRemoved(id) { return draft.hidden.indexOf(id) !== -1; }
  function wasRemoved(id) { return (baseline.hidden || []).indexOf(id) !== -1; }
  function isAdded(id) { return Boolean(addedEntry(id)); }
  function wasAdded(id) {
    return (baseline.added || []).some(function (member) { return member.id === id; });
  }

  function addedEntry(id) {
    var found = null;
    draft.added.forEach(function (member) { if (member.id === id) found = member; });
    return found;
  }

  function memberInitials(id) {
    var entry = addedEntry(id);
    return entry ? entry.initials || "" : memberKeys(id).initials;
  }

  function memberTitle(id) {
    var keys = memberKeys(id);
    var first = TEXT.isArabic() ? "ar" : "en";
    var second = TEXT.isArabic() ? "en" : "ar";
    var role = textValue(keys.role, first) || textValue(keys.role, second);
    if (role) return role;
    return t(isAdded(id) ? "New member" : "Member");
  }

  /* The published member lists, used as the starting point of the draft. */
  function memberStateFromBaseline() {
    return { hidden: (baseline.hidden || []).slice(), added: clone(baseline.added || []) };
  }

  function memberState(source) {
    return { hidden: (source.hidden || []).slice(), added: clone(source.added || []) };
  }

  function membersChanged() {
    return JSON.stringify(memberState(draft)) !== JSON.stringify(memberState(baseline));
  }

  function normaliseMembers() {
    var state = memberStateFromBaseline();
    if (Array.isArray(draft.hidden)) state.hidden = draft.hidden.slice();
    if (Array.isArray(draft.added)) state.added = clone(draft.added);
    draft.hidden = state.hidden;
    draft.added = state.added;
    return state;
  }

  /* The "N changes not pushed" count for the member cards. Role, description
     and photo edits are counted by their own keys, so only membership and
     initials are counted here. */
  function memberChangeCount() {
    var total = 0;
    draft.hidden.forEach(function (id) { if (!wasRemoved(id)) total += 1; });
    (baseline.hidden || []).forEach(function (id) { if (!isRemoved(id)) total += 1; });
    draft.added.forEach(function (member) {
      if (!wasAdded(member.id)) total += 1;
      else if (member.initials !== publishedInitials(member.id)) total += 1;
    });
    (baseline.added || []).forEach(function (member) { if (!isAdded(member.id)) total += 1; });
    return total;
  }

  function publishedInitials(id) {
    var found = "";
    (baseline.added || []).forEach(function (member) { if (member.id === id) found = member.initials || ""; });
    return found;
  }

  function isMemberChanged(id) {
    if (memberKeys(id).role && isChanged("text", memberKeys(id).role)) return true;
    if (memberKeys(id).desc && isChanged("text", memberKeys(id).desc)) return true;
    if (memberKeys(id).photo && isChanged("image", memberKeys(id).photo)) return true;
    if (isRemoved(id) !== wasRemoved(id)) return true;
    if (isAdded(id) !== wasAdded(id)) return true;
    if (isAdded(id) && addedEntry(id).initials !== publishedInitials(id)) return true;
    return false;
  }

  /* The initials a card falls back to when it has no photo. */
  function initialsFrom(text) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(function (word) { return Array.from(word)[0] || ""; }).join("").toUpperCase();
  }

  function autoInitials(id) {
    var entry = addedEntry(id);
    if (!entry || entry.initials) return; // the admin typed their own, or already derived
    entry.initials = initialsFrom(textValue(memberKeys(id).role, "en"));
  }

  function setMemberRemoved(id, removed) {
    var at = draft.hidden.indexOf(id);
    if (removed && at === -1) draft.hidden.push(id);
    if (!removed && at !== -1) draft.hidden.splice(at, 1);
    saveDraft();
    renderFields();
    schedulePreview();
  }

  /* A member is added by naming a card; its role, description and photo are
     ordinary edits, which is what makes the new card render like the others. */
  function nextMemberId() {
    var set = primaryMemberSet();
    var prefix = (set && set.items.length ? set.items[0].id : "team").split(".")[0];
    var taken = {};
    ((set && set.items) || []).forEach(function (item) { taken[item.id] = true; });
    (baseline.added || []).forEach(function (member) { taken[member.id] = true; });
    draft.added.forEach(function (member) { taken[member.id] = true; });
    var number = 1;
    while (taken[prefix + ".new" + number]) number += 1;
    return prefix + ".new" + number;
  }

  function addMember() {
    var id = nextMemberId();
    draft.added.push({ id: id, initials: "" });
    saveDraft();
    renderFields();
    schedulePreview();
    var role = $('.field[data-key="' + memberKey(id) + '"] .field__row input');
    if (role) {
      role.focus();
      role.scrollIntoView({ block: "nearest" });
    }
  }

  function deleteMember(id) {
    var keys = memberKeys(id);
    draft.added = draft.added.filter(function (member) { return member.id !== id; });
    draft.hidden = draft.hidden.filter(function (name) { return name !== id; });
    delete draft.text[keys.role];
    delete draft.text[keys.desc];
    delete draft.images[keys.photo];
    if (blobs[keys.photo]) {
      URL.revokeObjectURL(blobs[keys.photo].url);
      delete blobs[keys.photo];
    }
    window.INGDraftImages.remove(keys.photo).catch(function () { /* nothing stored */ });
    saveDraft();
    renderFields();
    schedulePreview();
  }

  function memberKey(id) { return "member:" + id; }

  /* ---------------------------------------------------------------- slides -- */

  /* The hero sliders the markup declares, one per banner, with the fields of
     the slides already on the page. */
  function slideSets() {
    var sets = MANIFEST.slides || {};
    return Object.keys(sets).map(function (name) { return sets[name]; });
  }

  function primarySlideSet() { return slideSets()[0] || null; }

  function manifestSlide(id) {
    var found = null;
    slideSets().forEach(function (set) {
      (set.items || []).forEach(function (item) { if (item.id === id) found = item; });
    });
    return found;
  }

  /* The keys a slide's eyebrow, headline, intro text and photo live under. For
     the slides in the markup the manifest names them; a slide added in this
     screen uses the "<id>.eyebrow" / "<id>.title" / "<id>.text" / "<id>.photo"
     names that the site reads when it builds the extra slides. */
  function slideKeys(id) {
    var item = manifestSlide(id);
    return item
      ? { eyebrow: item.eyebrow, title: item.title, text: item.text, photo: item.photo }
      : { eyebrow: id + ".eyebrow", title: id + ".title", text: id + ".text", photo: id + ".photo" };
  }

  /* Every key the slide cards own, so the group's plain list does not offer the
     same fields a second time. */
  function slideOwnedKeys() {
    var owned = {};
    slideSets().forEach(function (set) {
      (set.items || []).forEach(function (item) {
        [item.eyebrow, item.title, item.text, item.photo].forEach(function (key) {
          if (key) owned[key] = true;
        });
      });
    });
    return owned;
  }

  /* How many slides the banner shows with the draft applied. */
  function activeSlideCount() {
    var total = 0;
    slideSets().forEach(function (set) { total += (set.items || []).length; });
    return total - draft.slidesHidden.length + draft.slidesAdded.length;
  }

  function isSlideRemoved(id) { return draft.slidesHidden.indexOf(id) !== -1; }
  function wasSlideRemoved(id) { return (baseline.slidesHidden || []).indexOf(id) !== -1; }
  function isSlideAdded(id) { return Boolean(addedSlideEntry(id)); }
  function wasSlideAdded(id) {
    return (baseline.slidesAdded || []).some(function (slide) { return slide.id === id; });
  }

  function addedSlideEntry(id) {
    var found = null;
    draft.slidesAdded.forEach(function (slide) { if (slide.id === id) found = slide; });
    return found;
  }

  function slideTitle(id) {
    var keys = slideKeys(id);
    var first = TEXT.isArabic() ? "ar" : "en";
    var second = TEXT.isArabic() ? "en" : "ar";
    var headline = textValue(keys.title, first) || textValue(keys.title, second);
    if (headline) {
      headline = headline.replace(/<[^>]*>/g, "").trim();
      return headline.length > 42 ? headline.slice(0, 39).trim() + "\u2026" : headline;
    }
    var item = manifestSlide(id);
    return (item && label(item)) || t(isSlideAdded(id) ? "New slide" : "Slide");
  }

  /* The published slide lists, used as the starting point of the draft. */
  function slideStateFromBaseline() {
    return { slidesHidden: (baseline.slidesHidden || []).slice(), slidesAdded: clone(baseline.slidesAdded || []) };
  }

  function slideState(source) {
    return { slidesHidden: (source.slidesHidden || []).slice(), slidesAdded: clone(source.slidesAdded || []) };
  }

  function slidesChanged() {
    return JSON.stringify(slideState(draft)) !== JSON.stringify(slideState(baseline));
  }

  function normaliseSlides() {
    var state = slideStateFromBaseline();
    if (Array.isArray(draft.slidesHidden)) state.slidesHidden = draft.slidesHidden.slice();
    if (Array.isArray(draft.slidesAdded)) state.slidesAdded = clone(draft.slidesAdded);
    draft.slidesHidden = state.slidesHidden;
    draft.slidesAdded = state.slidesAdded;
    return state;
  }

  function slideChangeCount() {
    var total = 0;
    draft.slidesHidden.forEach(function (id) { if (!wasSlideRemoved(id)) total += 1; });
    (baseline.slidesHidden || []).forEach(function (id) { if (!isSlideRemoved(id)) total += 1; });
    draft.slidesAdded.forEach(function (slide) { if (!wasSlideAdded(slide.id)) total += 1; });
    (baseline.slidesAdded || []).forEach(function (slide) { if (!isSlideAdded(slide.id)) total += 1; });
    return total;
  }

  function isSlideChanged(id) {
    var keys = slideKeys(id);
    if (keys.eyebrow && isChanged("text", keys.eyebrow)) return true;
    if (keys.title && isChanged("text", keys.title)) return true;
    if (keys.text && isChanged("text", keys.text)) return true;
    if (keys.photo && isChanged("image", keys.photo)) return true;
    if (isSlideRemoved(id) !== wasSlideRemoved(id)) return true;
    if (isSlideAdded(id) !== wasSlideAdded(id)) return true;
    return false;
  }

  /* A slide only comes off the banner while at least MIN_SLIDES would be left. */
  function setSlideRemoved(id, removed) {
    if (removed && activeSlideCount() <= MIN_SLIDES) {
      notice(t("The slider must keep at least {n} slides", { n: MIN_SLIDES }),
        t("Add a new slide first, then you can take this one off the banner."), t("Close"));
      return;
    }
    var at = draft.slidesHidden.indexOf(id);
    if (removed && at === -1) draft.slidesHidden.push(id);
    if (!removed && at !== -1) draft.slidesHidden.splice(at, 1);
    saveDraft();
    renderFields();
    schedulePreview();
  }

  /* A slide is added by naming it; its text and photo are ordinary edits, which
     is what makes the new slide render like the others. */
  function nextSlideId() {
    var taken = {};
    slideSets().forEach(function (set) {
      (set.items || []).forEach(function (item) { taken[item.id] = true; });
    });
    (baseline.slidesAdded || []).forEach(function (slide) { taken[slide.id] = true; });
    draft.slidesAdded.forEach(function (slide) { taken[slide.id] = true; });
    var number = 1;
    while (taken["slide.new" + number]) number += 1;
    return "slide.new" + number;
  }

  function addSlide() {
    var id = nextSlideId();
    draft.slidesAdded.push({ id: id });
    saveDraft();
    renderFields();
    schedulePreview();
    var headline = $('.field[data-key="' + slideKey(id) + '"] .field__row input');
    if (headline) {
      headline.focus();
      headline.scrollIntoView({ block: "nearest" });
    }
  }

  function deleteSlide(id) {
    if (!isSlideRemoved(id) && activeSlideCount() <= MIN_SLIDES) {
      notice(t("The slider must keep at least {n} slides", { n: MIN_SLIDES }),
        t("Bring another slide back before deleting this one."), t("Close"));
      return;
    }
    var keys = slideKeys(id);
    draft.slidesAdded = draft.slidesAdded.filter(function (slide) { return slide.id !== id; });
    draft.slidesHidden = draft.slidesHidden.filter(function (name) { return name !== id; });
    [keys.eyebrow, keys.title, keys.text].forEach(function (key) { if (key) delete draft.text[key]; });
    if (keys.photo) {
      delete draft.images[keys.photo];
      if (blobs[keys.photo]) {
        URL.revokeObjectURL(blobs[keys.photo].url);
        delete blobs[keys.photo];
      }
      window.INGDraftImages.remove(keys.photo).catch(function () { /* nothing stored */ });
    }
    saveDraft();
    renderFields();
    schedulePreview();
  }

  function slideKey(id) { return "slide:" + id; }

  function slideWhere() {
    var set = primarySlideSet();
    return (set && set.where) || [];
  }

  function imageInfo(key) {
    if (MANIFEST.images[key]) return MANIFEST.images[key];
    if (!photoInfo[key]) {
      var slide = null;
      draft.slidesAdded.forEach(function (added) {
        if (slideKeys(added.id).photo === key) slide = added.id;
      });
      if (slide) {
        photoInfo[key] = { label: "Slide photo", labelAr: t("Slide photo"), where: slideWhere(), default: "" };
      } else {
        var set = primaryMemberSet();
        photoInfo[key] = { label: "Member photo", labelAr: t("Member photo"), where: (set && set.where) || [], default: "" };
      }
    }
    return photoInfo[key];
  }

  /* --------------------------------------------------------------- sign in -- */

  function sha256Hex(text) {
    if (!(window.crypto && window.crypto.subtle)) {
      return Promise.reject(new Error(t(
        "Signing in needs a secure address. Open the https:// site, or http://localhost while testing.")));
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
    button.textContent = t("Checking\u2026");

    sha256Hex(password).then(function (hash) {
      var known = ADMIN_ACCOUNTS.some(function (account) {
        return account.user === user && account.sha256 === hash;
      });
      if (!known) {
        throw new Error(t("That user name or password is not correct."));
      }
      writeJSON(window.sessionStorage, SESSION_KEY, { user: user, password: password, at: Date.now() });
      start();
    }).catch(function (problem) {
      error.textContent = problem.message;
      error.hidden = false;
    }).then(function () {
      button.disabled = false;
      button.textContent = t("Sign in");
    });
  });

  $("#signout").addEventListener("click", function () {
    confirmDialog(t("Sign out?"), t("Your draft stays in this browser, so you can sign back in and carry on."), t("Sign out"))
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
    addGroupHeading(nav, t("Every page"));
    MANIFEST.groups.filter(isChrome).forEach(function (group) { nav.appendChild(groupButton(group)); });
    addGroupHeading(nav, t("Page sections"));
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
    button.appendChild(document.createTextNode(label(group)));
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

  /* A label from the manifest (a group, a field, a photo, a page), in the
     language the screen is in. The generator writes the Arabic next to the
     English, taking it from the site's own dictionary wherever the label is
     real page content. */
  function label(entry) {
    if (!entry) return "";
    return TEXT.isArabic() && entry.labelAr ? entry.labelAr : entry.label;
  }

  function pagesLabel(pages) {
    if (!pages || !pages.length) return "";
    if (pages.length === MANIFEST.pages.length) return t("every page");
    var names = TEXT.isArabic() ? PAGE_LABEL_AR : PAGE_LABEL;
    return pages.map(function (page) { return names[page] || page; })
      .join(TEXT.isArabic() ? "، " : ", ");
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

    $("#group-title").textContent = label(group);

    var head = document.createElement("h1");
    head.className = "fields__head";
    head.textContent = label(group);
    host.appendChild(head);

    var lead = document.createElement("p");
    lead.className = "fields__lead";
    lead.textContent = t("Shown on {pages}. Changes stay in this browser until you push them.",
      { pages: pagesLabel(group.where) });
    host.appendChild(lead);

    var owned = memberOwnedKeys();
    var slideOwned = slideOwnedKeys();
    keysWhere(MANIFEST.fields, group.id).forEach(function (key) {
      if (!owned[key] && !slideOwned[key]) host.appendChild(textField(key));
    });
    keysWhere(MANIFEST.numbers, group.id).forEach(function (key) { host.appendChild(numberField(key)); });
    keysWhere(MANIFEST.images, group.id).forEach(function (key) {
      if (!owned[key] && !slideOwned[key]) host.appendChild(photoField(key));
    });
    memberSets().forEach(function (set) {
      if (set.group === group.id) host.appendChild(memberSection(set));
    });
    slideSets().forEach(function (set) {
      if (set.group === group.id) host.appendChild(slideSection(set));
    });
  }

  /* ------------------------------------------------------------ members UI -- */

  function memberSection(set) {
    var wrapper = document.createElement("section");
    wrapper.className = "members";

    var head = document.createElement("h2");
    head.className = "members__head";
    head.textContent = label(set) || t("Members");
    wrapper.appendChild(head);

    var lead = document.createElement("p");
    lead.className = "fields__lead";
    lead.textContent = t("A card with a photo, a role and a description each, on {pages}. "
      + "Removing a member takes it off every page it appears on; nothing changes on the site "
      + "until you push.", { pages: pagesLabel(set.where) });
    wrapper.appendChild(lead);

    set.items.forEach(function (item) { wrapper.appendChild(memberCard(item.id)); });
    draft.added.forEach(function (member) { wrapper.appendChild(memberCard(member.id)); });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "members__add";
    add.textContent = t("Add a member");
    add.addEventListener("click", addMember);
    wrapper.appendChild(add);
    return wrapper;
  }

  function memberCard(id) {
    var keys = memberKeys(id);
    var card = document.createElement("article");
    card.className = "field field--member" + (isMemberChanged(id) ? " is-changed" : "")
      + (isRemoved(id) ? " is-removed" : "");
    card.setAttribute("data-kind", "member");
    card.setAttribute("data-key", memberKey(id));

    var head = document.createElement("div");
    head.className = "field__head";
    var name = document.createElement("span");
    name.className = "field__label";
    name.textContent = memberTitle(id);
    var tag = document.createElement("span");
    tag.className = "field__tag";
    tag.textContent = t(isRemoved(id) ? "Removed" : "Changed");
    tag.hidden = !isMemberChanged(id);
    head.appendChild(name);
    head.appendChild(tag);
    card.appendChild(head);

    card.appendChild(photoBlock(keys.photo, card, t("Back to no photo")));

    card.appendChild(memberTextBox(id, keys.role, t("Role"), false));
    card.appendChild(memberTextBox(id, keys.desc, t("Description"), true));

    var warn = document.createElement("p");
    warn.className = "field__warn";
    warn.textContent = t("The Arabic side is empty, so the Arabic site shows the English text.");
    warn.hidden = !(isAdded(id) && missingArabic(id));
    card.appendChild(warn);

    card.appendChild(memberFoot(id));

    var note = document.createElement("p");
    note.className = "field__hint";
    note.textContent = isAdded(id)
      ? t("The initials {initials} are used when the member has no photo.",
        { initials: memberInitials(id) || "\u2014" })
      : t("This card is in the page, so it can be removed but not deleted. "
        + "The initials {initials} are used when it has no photo.",
        { initials: memberInitials(id) || "\u2014" });
    card.appendChild(note);
    return card;
  }

  /* The initials an added member falls back to, and the actions on the card. */
  function memberFoot(id) {
    var foot = document.createElement("div");
    foot.className = "member__foot";

    if (isAdded(id)) {
      var entry = addedEntry(id);
      var initials = document.createElement("input");
      initials.type = "text";
      initials.maxLength = 4;
      initials.value = (entry && entry.initials) || "";
      initials.setAttribute("data-initials", id);
      initials.addEventListener("input", function () {
        var current = addedEntry(id);
        if (current) current.initials = initials.value.trim().slice(0, 4);
        changed(memberKey(id), "member");
        refreshMember(id);
      });
      foot.appendChild(box(t("Initials"), initials));
    }

    var actions = document.createElement("div");
    actions.className = "member__actions";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "member__toggle";
    toggle.textContent = t(isRemoved(id) ? "Bring this member back" : "Remove this member");
    toggle.addEventListener("click", function () {
      setMemberRemoved(id, !isRemoved(id));
      changed(memberKey(id), "member");
    });
    actions.appendChild(toggle);

    if (isAdded(id)) {
      var drop = document.createElement("button");
      drop.type = "button";
      drop.className = "member__delete";
      drop.textContent = t("Delete this member");
      drop.addEventListener("click", function () {
        confirmDialog(t("Delete this member?"),
          t("Its card, text and photo are dropped from the site the next time you push. "
            + "Removing it instead keeps the text, so you can bring it back later."), t("Delete"))
          .then(function (yes) { if (yes) deleteMember(id); });
      });
      actions.appendChild(drop);
    }

    foot.appendChild(actions);
    return foot;
  }

  function missingArabic(id) {
    var keys = memberKeys(id);
    return !textValue(keys.role, "ar") || !textValue(keys.desc, "ar");
  }

  function memberTextBox(id, key, labelText, multiline) {
    var row = document.createElement("div");
    row.className = "field__row";

    [[t("English"), "en"], [t("Arabic"), "ar"]].forEach(function (pair) {
      var control = document.createElement(multiline ? "textarea" : "input");
      if (multiline) control.rows = 3;
      else control.type = "text";
      control.value = textValue(key, pair[1]);
      if (pair[1] === "ar") control.dir = "rtl";
      control.addEventListener("input", function () {
        setText(key, pair[1], control.value);
        if (!multiline && pair[1] === "en") autoInitials(id);
        refreshMember(id);
      });

      var wrapper = box(labelText + " (" + pair[0] + ")", control);
      if (pair[1] === "ar") wrapper.className += " field__box--ar";
      row.appendChild(wrapper);
    });
    return row;
  }

  /* ------------------------------------------------------------- slides UI -- */

  function slideSection(set) {
    var wrapper = document.createElement("section");
    wrapper.className = "members";

    var head = document.createElement("h2");
    head.className = "members__head";
    head.textContent = label(set) || t("Slides");
    wrapper.appendChild(head);

    var lead = document.createElement("p");
    lead.className = "fields__lead";
    lead.textContent = t("Each slide has a background photo, an eyebrow, a headline and an "
      + "intro line, on {pages}. The slider keeps at least {n} slides, so add one before "
      + "taking one off.", { pages: pagesLabel(set.where), n: MIN_SLIDES });
    wrapper.appendChild(lead);

    set.items.forEach(function (item) { wrapper.appendChild(slideCard(item.id)); });
    draft.slidesAdded.forEach(function (slide) { wrapper.appendChild(slideCard(slide.id)); });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "members__add";
    add.textContent = t("Add a slide");
    add.addEventListener("click", addSlide);
    wrapper.appendChild(add);

    var count = document.createElement("p");
    count.className = "field__hint";
    count.textContent = t("The banner shows {n} slides as things stand.", { n: activeSlideCount() });
    wrapper.appendChild(count);
    return wrapper;
  }

  function slideCard(id) {
    var keys = slideKeys(id);
    var card = document.createElement("article");
    card.className = "field field--slide" + (isSlideChanged(id) ? " is-changed" : "")
      + (isSlideRemoved(id) ? " is-removed" : "");
    card.setAttribute("data-kind", "slide");
    card.setAttribute("data-key", slideKey(id));
    card.setAttribute("data-slide", id);

    var head = document.createElement("div");
    head.className = "field__head";
    var name = document.createElement("span");
    name.className = "field__label";
    name.textContent = slideTitle(id);
    var tag = document.createElement("span");
    tag.className = "field__tag";
    tag.textContent = t(isSlideRemoved(id) ? "Removed" : "Changed");
    tag.hidden = !isSlideChanged(id);
    head.appendChild(name);
    head.appendChild(tag);
    card.appendChild(head);

    card.appendChild(photoBlock(keys.photo, card, t("Back to no photo")));
    paintPhoto(card, keys.photo);

    card.appendChild(slideTextBox(id, keys.eyebrow, t("Eyebrow"), false));
    card.appendChild(slideTextBox(id, keys.title, t("Headline"), false));
    card.appendChild(slideTextBox(id, keys.text, t("Intro text"), true));

    var warn = document.createElement("p");
    warn.className = "field__warn";
    warn.textContent = t("The Arabic side is empty, so the Arabic site shows the English text.");
    warn.hidden = !(isSlideAdded(id) && missingSlideArabic(id));
    card.appendChild(warn);

    card.appendChild(slideFoot(id));

    var note = document.createElement("p");
    note.className = "field__hint";
    note.textContent = isSlideAdded(id)
      ? t("A new slide is built from the last slide on the page and carries no buttons of its own.")
      : t("This slide is in the page, so it can be removed but not deleted.");
    card.appendChild(note);
    return card;
  }

  function slideFoot(id) {
    var foot = document.createElement("div");
    foot.className = "member__foot";
    var actions = document.createElement("div");
    actions.className = "member__actions";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "member__toggle";
    toggle.textContent = t(isSlideRemoved(id) ? "Bring this slide back" : "Remove this slide");
    toggle.addEventListener("click", function () {
      setSlideRemoved(id, !isSlideRemoved(id));
      changed(slideKey(id), "slide");
    });
    actions.appendChild(toggle);

    if (isSlideAdded(id)) {
      var drop = document.createElement("button");
      drop.type = "button";
      drop.className = "member__delete";
      drop.textContent = t("Delete this slide");
      drop.addEventListener("click", function () {
        confirmDialog(t("Delete this slide?"),
          t("Its slide, text and photo are dropped from the site the next time you push. "
            + "Removing it instead keeps the text, so you can bring it back later."), t("Delete"))
          .then(function (yes) { if (yes) deleteSlide(id); });
      });
      actions.appendChild(drop);
    }

    foot.appendChild(actions);
    return foot;
  }

  function missingSlideArabic(id) {
    var keys = slideKeys(id);
    return !textValue(keys.title, "ar") || !textValue(keys.text, "ar");
  }

  function slideTextBox(id, key, labelText, multiline) {
    var row = document.createElement("div");
    row.className = "field__row";
    if (!key) return row;

    [[t("English"), "en"], [t("Arabic"), "ar"]].forEach(function (pair) {
      var control = document.createElement(multiline ? "textarea" : "input");
      if (multiline) control.rows = 3;
      else control.type = "text";
      control.value = textValue(key, pair[1]);
      if (pair[1] === "ar") control.dir = "rtl";
      control.addEventListener("input", function () {
        setText(key, pair[1], control.value);
        refreshSlide(id);
      });

      var wrapper = box(labelText + " (" + pair[0] + ")", control);
      if (pair[1] === "ar") wrapper.className += " field__box--ar";
      row.appendChild(wrapper);
    });
    return row;
  }

  /* The parts of a slide card that change while it is being edited. */
  function refreshSlide(id) {
    var card = $('.field[data-key="' + slideKey(id) + '"]');
    if (!card) return;
    var isChangedNow = isSlideChanged(id);
    card.classList.toggle("is-changed", isChangedNow);
    card.classList.toggle("is-removed", isSlideRemoved(id));
    $(".field__tag", card).hidden = !isChangedNow;
    $(".field__tag", card).textContent = t(isSlideRemoved(id) ? "Removed" : "Changed");
    $(".field__warn", card).hidden = !(isSlideAdded(id) && missingSlideArabic(id));
    var toggle = $(".member__toggle", card);
    if (toggle) toggle.textContent = t(isSlideRemoved(id) ? "Bring this slide back" : "Remove this slide");
    $(".field__label", card).textContent = slideTitle(id);
  }

  /* A member photo belongs to a member card, which has to be told when it
     changes so its "Changed" chip keeps up. */
  function refreshPhotoOwner(key) {
    var owner = null;
    memberSets().forEach(function (set) {
      (set.items || []).forEach(function (item) { if (item.photo === key) owner = item.id; });
    });
    draft.added.forEach(function (member) {
      var memberPhoto = memberKeys(member.id).photo;
      if (memberPhoto === key) owner = member.id;
    });
    if (owner) refreshMember(owner);

    var slideOwner = null;
    draft.slidesAdded.forEach(function (slide) {
      if (slideKeys(slide.id).photo === key) slideOwner = slide.id;
    });
    if (slideOwner) refreshSlide(slideOwner);
  }

  /* The parts of a member card that change while it is being edited. */
  function refreshMember(id) {
    var card = $('.field[data-key="' + memberKey(id) + '"]');
    if (!card) return;
    var changed = isMemberChanged(id);
    card.classList.toggle("is-changed", changed);
    card.classList.toggle("is-removed", isRemoved(id));
    $(".field__label", card).textContent = memberTitle(id);
    var tag = $(".field__tag", card);
    tag.textContent = t(isRemoved(id) ? "Removed" : "Changed");
    tag.hidden = !changed;
    $(".field__warn", card).hidden = !(isAdded(id) && missingArabic(id));
    var toggle = $(".member__toggle", card);
    if (toggle) toggle.textContent = t(isRemoved(id) ? "Bring this member back" : "Remove this member");
    var initials = $("input[data-initials]", card);
    if (initials && !initials.value) initials.value = memberInitials(id);
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
    tag.textContent = t("Changed");
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
    var card = fieldShell("text", key, label(info));
    var row = document.createElement("div");
    row.className = "field__row";

    [[t("English"), "en"], [t("Arabic"), "ar"]].filter(function (pair) {
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
      card.appendChild(box(t("Link (where clicking it goes)"), link));
    }

    card.appendChild(hint(langs.indexOf("ar") === -1
      ? t("Used on {pages}, in English and Arabic alike.", { pages: pagesLabel(info.where) })
      : t("Used on {pages}.", { pages: pagesLabel(info.where) })));
    return card;
  }

  function numberField(key) {
    var info = MANIFEST.numbers[key];
    var card = fieldShell("number", key, label(info));
    var row = document.createElement("div");
    row.className = "number";

    [[t("Number"), "value"], [t("After the number"), "suffix"]].forEach(function (pair) {
      var control = document.createElement("input");
      control.type = "text";
      control.value = numberValue(key, pair[1]);
      control.addEventListener("input", function () { setNumber(key, pair[1], control.value); });
      row.appendChild(box(pair[0], control));
    });
    card.appendChild(row);
    card.appendChild(hint(t("The figure that counts up on {pages}.", { pages: pagesLabel(info.where) })));
    return card;
  }

  function photoField(key) {
    var info = imageInfo(key);
    var card = fieldShell("image", key, label(info));
    card.appendChild(photoBlock(key, card, t("Back to the original photo")));
    card.appendChild(hint(t("Used on {pages}.", { pages: pagesLabel(info.where) })));
    paintPhoto(card, key);
    return card;
  }

  /* The thumbnail, its caption and the buttons that change it. Used for a photo
     on its own and inside a member card. */
  function photoBlock(key, card, revertLabel) {
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
    pick.textContent = t("Choose photo");
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    pick.appendChild(input);
    actions.appendChild(pick);

    var revert = document.createElement("button");
    revert.type = "button";
    revert.className = "photo__revert";
    revert.textContent = revertLabel;
    revert.addEventListener("click", function () {
      delete draft.images[key];
      if (blobs[key]) {
        URL.revokeObjectURL(blobs[key].url);
        delete blobs[key];
      }
      window.INGDraftImages.remove(key).catch(function () { /* nothing stored */ });
      paintPhoto(card, key);
      changed(key, "image");
      refreshPhotoOwner(key);
      renderPreview();
    });
    actions.appendChild(revert);

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (file) pickImage(key, file, card).then(function () { refreshPhotoOwner(key); });
    });

    body.appendChild(actions);
    layout.appendChild(body);
    return layout;
  }

  function paintPhoto(card, key) {
    var info = imageInfo(key);
    var source = imageSrc(key);
    $(".photo__thumb", card).style.backgroundImage = source ? "url('" + source + "')" : "none";

    var meta = $(".photo__meta", card);
    meta.textContent = "";

    var chosen = blobs[key];
    var title = document.createElement("strong");
    title.textContent = (chosen && chosen.name) || source.split("/").pop() || t("No photo");
    var detail = document.createElement("em");
    if (chosen && chosen.width) {
      detail.textContent = chosen.width + " \u00d7 " + chosen.height + " px \u00b7 "
        + Math.round(chosen.size / 1024) + " KB \u00b7 " + t("new photo");
    } else if (chosen) {
      detail.textContent = Math.round(chosen.size / 1024) + " KB \u00b7 " + t("new photo");
    } else {
      detail.textContent = info.default || t("the fallback in the page is used");
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
        reject(new Error(t("That image file could not be read.")));
      };
      image.src = url;
    });
  }

  function toBlob(canvas, type) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error(t("This browser could not prepare the image.")));
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
      notice(t("That file is not an image"), t("Choose a JPG, PNG or WebP picture."), t("Close"));
      return Promise.resolve();
    }
    return prepareImage(file).then(function (prepared) {
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
      notice(t("That photo could not be used"), escapeHtml(problem.message), t("Close"));
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
    $("#notice-ok").textContent = t(okLabel || "Continue");
    $("#notice-cancel").textContent = t("Cancel");
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
    return when.toLocaleString(TEXT.isArabic() ? "ar" : [], { weekday: "short", hour: "2-digit", minute: "2-digit" });
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
      badge.textContent = quota.remaining === 1
        ? t("1 push left today")
        : t("{n} pushes left today", { n: quota.remaining });
      button.disabled = false;
      button.title = t("This screen can push changes {n} times a day.", { n: quota.limit });
    } else {
      badge.textContent = quota.resetAt
        ? t("No pushes left today · next {when}", { when: whenText(quota.resetAt) })
        : t("No pushes left today");
      button.disabled = true;
      button.title = t("Changes can be pushed {n} times a day, and that allowance is used up.",
        { n: quota.limit });
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
          throw new Error(t("Publishing is not connected yet: {url} was not found. "
            + "See the “Publishing changes” section of README.md.", { url: PUBLISH_URL }));
        }
        if (!response.ok || !body.ok) {
          var refused = new Error(body.error
            || t("The publish function refused the request (HTTP {code}).", { code: response.status }));
          if (body.quota) refused.quota = body.quota;
          throw refused;
        }
        return body;
      });
    }, function () {
      throw new Error(t("Could not reach {url}. Check the connection and try again.", { url: PUBLISH_URL }));
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

    content.hidden = draft.hidden.slice();
    content.added = clone(draft.added);
    content.slidesHidden = draft.slidesHidden.slice();
    content.slidesAdded = clone(draft.slidesAdded);
    forgetDeletedMembers(content);
    forgetDeletedSlides(content);
    return content;
  }

  /* The text and photo of a member that has been deleted stay in the published
     file unless they are taken out here. */
  function forgetDeletedMembers(content) {
    var live = {};
    memberSets().forEach(function (set) {
      (set.items || []).forEach(function (item) { live[item.id] = true; });
    });
    draft.added.forEach(function (member) { live[member.id] = true; });

    [["text", ["role", "desc"]], ["images", ["photo"]]].forEach(function (bucket) {
      Object.keys(content[bucket[0]]).forEach(function (key) {
        var match = /^(.*)\.(role|desc|photo)$/.exec(key);
        if (!match) return;
        var id = match[1];
        if (bucket[1].indexOf(match[2]) === -1 || live[id]) return;
        // only a member that was published and has since been deleted qualifies
        if (!wasAdded(id)) return;
        delete content[bucket[0]][key];
      });
    });
  }

  /* The text and photo of a slide that has been deleted stay in the published
     file unless they are taken out here. */
  function forgetDeletedSlides(content) {
    var live = {};
    slideSets().forEach(function (set) {
      (set.items || []).forEach(function (item) { live[item.id] = true; });
    });
    draft.slidesAdded.forEach(function (slide) { live[slide.id] = true; });

    [["text", ["eyebrow", "title", "text"]], ["images", ["photo"]]].forEach(function (bucket) {
      Object.keys(content[bucket[0]]).forEach(function (key) {
        var match = /^(.*)\.(eyebrow|title|text|photo)$/.exec(key);
        if (!match) return;
        var id = match[1];
        if (bucket[1].indexOf(match[2]) === -1 || live[id]) return;
        // only a slide that was published and has since been deleted qualifies
        if (!wasSlideAdded(id)) return;
        delete content[bucket[0]][key];
      });
    });
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
      reader.onerror = function () { reject(new Error(t("The photo could not be read for uploading."))); };
      reader.readAsDataURL(blob);
    });
  }

  function publish() {
    if (quota && quota.remaining <= 0) {
      notice(t("No pushes left today"),
        t("Changes can be pushed {n} times a day, and that allowance is used up.", { n: quota.limit })
        + (quota.resetAt ? " " + t("The next push becomes available {when}.",
          { when: escapeHtml(whenText(quota.resetAt)) }) : "")
        + "<br><br>" + t("Nothing is lost — your draft stays saved in this browser, and you can push it later."),
        t("Close"));
      return;
    }

    var count = changeCount();
    if (!count) {
      notice(t("Nothing to push"), t("Change something first, or use “Discard draft” to clear the draft."),
        t("Close"));
      return;
    }

    var uploads = imagesToUpload();
    var missing = uploads.filter(function (image) { return !blobs[image.key]; });
    if (missing.length) {
      notice(t("A photo is missing from this browser"),
        t("Please choose the photo again for: {list}.", { list: escapeHtml(missing.map(function (image) {
          return label(imageInfo(image.key));
        }).join(TEXT.isArabic() ? "، " : ", ")) }), t("Close"));
      return;
    }

    var about = uploads.length
      ? (uploads.length === 1
        ? t("This saves 1 new photo and the text changes to the website’s repository. "
          + "Netlify then rebuilds the site, which usually takes about a minute.")
        : t("This saves {n} new photos and the text changes to the website’s repository. "
          + "Netlify then rebuilds the site, which usually takes about a minute.", { n: uploads.length }))
      : t("This saves the text changes to the website’s repository. "
        + "Netlify then rebuilds the site, which usually takes about a minute.");

    confirmDialog(count === 1 ? t("Push 1 change?") : t("Push {n} changes?", { n: count }),
      about, t("Push changes"))
      .then(function (yes) { if (yes) runPublish(uploads); });
  }

  function runPublish(uploads) {
    var auth = session();
    if (!auth) { showGate(); return; }

    $("#publish").disabled = true;
    setState(t("Pushing…"), "");

    var chain = Promise.resolve();
    uploads.forEach(function (image, index) {
      chain = chain.then(function () {
        setState(t("Uploading photo {n} of {total}…", { n: index + 1, total: uploads.length }), "");
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
      setState(t("Saving the text changes…"), "");
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
            setState(t("Pushed · the site updates in about a minute"), "is-ok");
            return notice(t("Changes pushed"),
              t("The website is rebuilding now and usually updates within a minute."),
              t("Close"));
          });
        });
    }).catch(function (problem) {
      saveDraft();
      applyQuota(problem.quota);
      setState(t("Nothing was pushed"), "is-error");
      notice(t("The changes were not pushed"),
        escapeHtml(problem.message)
        + "<br><br>" + t("Your draft is still saved in this browser — fix the problem and "
          + "press “Push changes” again."),
        t("Close"));
    }).then(function () {
      renderQuota();
    });
  }

  $("#publish").addEventListener("click", publish);

  $("#discard").addEventListener("click", function () {
    if (!changeCount()) {
      notice(t("Nothing to discard"), t("The draft has no changes in it."), t("Close"));
      return;
    }
    confirmDialog(t("Discard the draft?"),
      t("Every change you have not pushed is thrown away and the original text and photos come back."),
      t("Discard")).then(function (yes) {
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

  /* The EN / ع buttons in the sign-in card and in the bar. The choice is kept
     in this browser, and everything the screen says is redrawn in it. */
  function renderLangButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-admin-lang]"), function (button) {
      var isCurrent = button.getAttribute("data-admin-lang") === TEXT.lang();
      button.setAttribute("aria-pressed", isCurrent ? "true" : "false");
    });
  }

  function setScreenLang(next) {
    if (next === TEXT.lang()) return;
    TEXT.setLang(next);
    TEXT.applyScreen();
    renderLangButtons();
    renderGroups();
    renderFields();
    renderPreviewTabs();
    renderQuota();
    saveDraft();
    // the preview shows the site, and the site reads its language from the same
    // preference, so the two stay in step
    try { window.localStorage.setItem("ing-lang", next); } catch (e) { /* private mode */ }
    renderPreview();
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-admin-lang]"), function (button) {
    button.addEventListener("click", function () {
      setScreenLang(button.getAttribute("data-admin-lang"));
    });
  });

  TEXT.applyScreen();
  renderLangButtons();

  if (!MANIFEST.groups.length) {
    // admin-fields.js did not load: say so rather than show an empty screen
    $("#gate").hidden = true;
    $("#dash").hidden = false;
    $("#fields").textContent = t("The list of editable fields (assets/js/admin-fields.js) could not be loaded.")
      + " Run: python tools/build_admin_manifest.py";
  } else if (session()) {
    start();
  } else {
    showGate();
  }
})();
