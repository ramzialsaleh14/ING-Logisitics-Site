/* ==========================================================================
   ING Logistics — site behaviour
   Vanilla ES2019, no dependencies. Every block bails out when its markup is
   absent, so the same file can be loaded on every page.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------ i18n */
  var I18N = (window.ING_I18N && window.ING_I18N.ar) || {};
  var STORE_KEY = "ing-lang";

  function applyLang(lang) {
    var html = document.documentElement;
    var isAr = lang === "ar";

    $$("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (isAr) {
        if (!I18N[key]) return;
        if (el.getAttribute("data-i18n-en") === null) {
          el.setAttribute("data-i18n-en", el.innerHTML);
        }
        el.innerHTML = I18N[key];
      } else if (el.getAttribute("data-i18n-en") !== null) {
        el.innerHTML = el.getAttribute("data-i18n-en");
      }
    });

    // attribute-level strings: placeholders, aria-labels, option labels
    $$("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (isAr) {
        if (el.getAttribute("data-ph-en") === null) el.setAttribute("data-ph-en", el.placeholder || "");
        if (I18N[key]) el.placeholder = I18N[key];
      } else if (el.getAttribute("data-ph-en") !== null) {
        el.placeholder = el.getAttribute("data-ph-en");
      }
    });

    $$("[data-i18n-aria]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria");
      if (isAr) {
        if (el.getAttribute("data-aria-en") === null) el.setAttribute("data-aria-en", el.getAttribute("aria-label") || "");
        if (I18N[key]) el.setAttribute("aria-label", I18N[key]);
      } else if (el.getAttribute("data-aria-en") !== null) {
        el.setAttribute("aria-label", el.getAttribute("data-aria-en"));
      }
    });

    var metaTitle = $("title");
    if (metaTitle) {
      if (isAr) {
        if (metaTitle.getAttribute("data-title-en") === null) metaTitle.setAttribute("data-title-en", metaTitle.textContent);
        if (I18N["meta.title"]) metaTitle.textContent = I18N["meta.title"];
      } else if (metaTitle.getAttribute("data-title-en") !== null) {
        metaTitle.textContent = metaTitle.getAttribute("data-title-en");
      }
    }

    var desc = $('meta[name="description"]');
    if (desc) {
      if (isAr) {
        if (desc.getAttribute("data-desc-en") === null) desc.setAttribute("data-desc-en", desc.getAttribute("content") || "");
        if (I18N["meta.description"]) desc.setAttribute("content", I18N["meta.description"]);
      } else if (desc.getAttribute("data-desc-en") !== null) {
        desc.setAttribute("content", desc.getAttribute("data-desc-en"));
      }
    }

    html.setAttribute("data-lang", isAr ? "ar" : "en");
    html.setAttribute("lang", isAr ? "ar" : "en");
    html.setAttribute("dir", isAr ? "rtl" : "ltr");

    $$("[data-lang-btn]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang-btn") === (isAr ? "ar" : "en")));
    });

    try { localStorage.setItem(STORE_KEY, isAr ? "ar" : "en"); } catch (e) { /* private mode */ }
  }

  $$("[data-lang-btn]").forEach(function (btn) {
    btn.addEventListener("click", function () { applyLang(btn.getAttribute("data-lang-btn")); });
  });

  var saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* ignore */ }
  applyLang(saved === "ar" ? "ar" : "en");

  /* -------------------------------------------------------------- header */
  var header = $(".header");
  var toTop = $(".to-top");

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (header) header.classList.toggle("is-stuck", y > 60);
    if (toTop) toTop.classList.toggle("is-visible", y > 500);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* mobile nav */
  var burger = $(".header__burger");
  var nav = $(".nav");
  if (burger && nav) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("is-locked", open);
    });
    $$(".nav__link", nav).forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
        document.body.classList.remove("is-locked");
      });
    });
  }

  /* track-your-order panel (hover on desktop, click everywhere) */
  var trackBtn = $(".header__action--track");
  var trackPanel = $(".track-panel");
  if (trackBtn && trackPanel) {
    trackBtn.addEventListener("click", function (e) {
      if (e.target.closest("a, button, input")) return;
      e.preventDefault();
      trackPanel.classList.toggle("is-open");
    });
    document.addEventListener("click", function (e) {
      if (!trackBtn.contains(e.target)) trackPanel.classList.remove("is-open");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") trackPanel.classList.remove("is-open");
    });
  }

  /* --------------------------------------------------------------- hero */
  var hero = $("[data-slider]");
  if (hero) {
    var slides = $$(".hero__slide", hero);
    var dots = $$(".hero__dot", hero);
    var counter = $(".hero__counter", hero);
    var index = 0;
    var timer = null;
    var DURATION = 6000;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function show(n) {
      index = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle("is-active", i === index); });
      dots.forEach(function (d, i) {
        d.classList.remove("is-active");
        var fill = d.querySelector("span");
        if (fill) fill.style.width = "";
      });
      var active = dots[index];
      if (active) {
        active.classList.add("is-active");
        var fill = active.querySelector("span");
        // restart the CSS width transition from 0
        if (fill && !reduced) {
          fill.style.transition = "none";
          fill.style.width = "0";
          // force reflow so the next width change animates
          void fill.offsetWidth;
          fill.style.transition = "";
          fill.style.width = "100%";
        } else if (fill) {
          fill.style.width = "100%";
        }
      }
      if (counter) counter.textContent = String(index + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    }

    function next() { show(index + 1); }
    function prev() { show(index - 1); }

    function start() {
      if (reduced || slides.length < 2) return;
      stop();
      timer = window.setInterval(next, DURATION);
    }
    function stop() { if (timer) { window.clearInterval(timer); timer = null; } }

    dots.forEach(function (d, i) {
      d.addEventListener("click", function () { show(i); start(); });
    });
    var nextBtn = $("[data-slide-next]", hero);
    var prevBtn = $("[data-slide-prev]", hero);
    if (nextBtn) nextBtn.addEventListener("click", function () { next(); start(); });
    if (prevBtn) prevBtn.addEventListener("click", function () { prev(); start(); });

    hero.addEventListener("mouseenter", stop);
    hero.addEventListener("mouseleave", start);

    /* keyboard + swipe */
    hero.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    });
    var startX = null;
    hero.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) { dx < 0 ? next() : prev(); start(); }
      startX = null;
    });

    document.addEventListener("visibilitychange", function () {
      document.hidden ? stop() : start();
    });

    show(0);
    start();
  }

  /* ------------------------------------------------------------- reveal */
  var revealables = $$("[data-reveal]");
  if (revealables.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var delay = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
            window.setTimeout(function () { el.classList.add("is-visible"); }, delay);
            io.unobserve(el);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      revealables.forEach(function (el) { io.observe(el); });
    } else {
      revealables.forEach(function (el) { el.classList.add("is-visible"); });
    }
  }

  /* ------------------------------------------------------------ counters */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count-to"));
    if (isNaN(target)) return;
    var suffix = el.getAttribute("data-count-suffix") || "";
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { el.textContent = target + suffix; return; }
    var duration = 1400;
    var startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counters = $$("[data-count-to]");
  if (counters.length && "IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { animateCount(entry.target); cio.unobserve(entry.target); }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(animateCount);
  }

  /* ----------------------------------------------------------- accordion */
  $$(".accordion").forEach(function (acc) {
    $$(".accordion__item", acc).forEach(function (item) {
      var trigger = $(".accordion__trigger", item);
      var panel = $(".accordion__panel", item);
      if (!trigger || !panel) return;
      trigger.setAttribute("aria-expanded", "false");
      trigger.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");
        $$(".accordion__item", acc).forEach(function (other) {
          other.classList.remove("is-open");
          var p = $(".accordion__panel", other);
          var t = $(".accordion__trigger", other);
          if (p) p.style.height = "0px";
          if (t) t.setAttribute("aria-expanded", "false");
        });
        if (!isOpen) {
          item.classList.add("is-open");
          panel.style.height = panel.firstElementChild.offsetHeight + "px";
          trigger.setAttribute("aria-expanded", "true");
        }
      });
    });
    var first = $(".accordion__item", acc);
    if (first) $(".accordion__trigger", first).click();
  });

  /* ---------------------------------------------------------------- form */
  var form = $("[data-demo-form]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = $(".form__status", form);
      var required = $$("[required]", form);
      var missing = required.filter(function (f) { return !f.value.trim(); });
      if (missing.length) {
        if (status) {
          status.className = "form__status is-error";
          status.textContent = "";
          status.setAttribute("data-i18n", "contact.formError");
          status.textContent = document.documentElement.getAttribute("data-lang") === "ar" && I18N["contact.formError"]
            ? I18N["contact.formError"]
            : "Please fill in the required fields.";
        }
        missing[0].focus();
        return;
      }
      if (status) {
        status.className = "form__status is-ok";
        var ar = document.documentElement.getAttribute("data-lang") === "ar";
        status.textContent = ar && I18N["contact.formOk"]
          ? I18N["contact.formOk"]
          : "Your message is ready. It is not sent because this demo has no backend.";
      }
      form.reset();
    });
  }

  /* ---------------------------------------------------------------- year */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
