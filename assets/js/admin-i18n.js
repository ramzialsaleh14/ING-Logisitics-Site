/* ==========================================================================
   Arabic for the admin screen itself.

   The screen's own words live here rather than in the site's i18n.js, because
   that file is downloaded by every visitor and this screen is not part of the
   site. A phrase is looked up by the English it was written as, so the two sit
   side by side and anything missing simply stays in English - a forgotten
   phrase is never blank.

   Placeholders in {braces} are filled in by t(), for example
   t("{n} changes waiting", { n: 3 }).

   Loaded before admin.js, which calls applyScreen() once the page is ready.
   ========================================================================== */
(function () {
  "use strict";

  var AR = {
    /* sign in */
    "Website admin": "إدارة الموقع",
    "Website admin — ING Logistics": "إدارة الموقع — ING Logistics",
    "Sign in to change the text and photos on the site.": "سجّل الدخول لتغيير النصوص والصور في الموقع.",
    "User name": "اسم المستخدم",
    "Password": "كلمة المرور",
    "Sign in": "تسجيل الدخول",
    "Checking…": "جارٍ التحقق…",
    "Back to the website": "العودة إلى الموقع",
    "That user name or password is not correct.": "اسم المستخدم أو كلمة المرور غير صحيحة.",
    "Signing in needs a secure address. Open the https:// site, or http://localhost while testing.":
      "تسجيل الدخول يحتاج إلى اتصال آمن. افتح الموقع على https://، أو على http://localhost أثناء التجربة.",
    "Sign out": "تسجيل الخروج",
    "Sign out?": "تسجيل الخروج؟",
    "Your draft stays in this browser, so you can sign back in and carry on.":
      "تبقى مسودتك محفوظة في هذا المتصفح، ويمكنك تسجيل الدخول مرة أخرى والمتابعة.",

    /* the bar */
    "ING Logistics — admin": "ING Logistics — الإدارة",
    "Preview": "معاينة",
    "Preview of the website": "معاينة الموقع",
    "every page": "كل الصفحات",
    "Discard draft": "إلغاء المسودة",
    "Push changes": "نشر التغييرات",
    "Parts of the site": "أقسام الموقع",
    "Every page": "كل الصفحات",
    "Page sections": "أقسام الصفحات",
    "Language": "اللغة",

    /* the field list */
    "Shown on {pages}. Changes stay in this browser until you push them.":
      "تظهر في {pages}. تبقى التغييرات في هذا المتصفح حتى تنشرها.",
    "Changed": "مُعدَّل",
    "Removed": "مُزال",
    "English": "الإنجليزية",
    "Arabic": "العربية",
    "Link (where clicking it goes)": "الرابط (إلى أين يؤدي)",
    "Number": "الرقم",
    "After the number": "بعد الرقم",
    "Used on {pages}.": "تُستخدم في {pages}.",
    "Used on {pages}, in English and Arabic alike.": "تُستخدم في {pages}، بالعربية والإنجليزية على السواء.",
    "The figure that counts up on {pages}.": "الرقم الذي يتزايد في {pages}.",
    "The list of editable fields (assets/js/admin-fields.js) could not be loaded.":
      "تعذّر تحميل قائمة الحقول (assets/js/admin-fields.js).",

    /* photos */
    "Choose photo": "اختيار صورة",
    "Back to the original photo": "العودة إلى الصورة الأصلية",
    "Back to no photo": "إزالة الصورة",
    "No photo": "لا توجد صورة",
    "new photo": "صورة جديدة",
    "the fallback in the page is used": "يُستخدم البديل الموجود في الصفحة",
    "That file is not an image": "هذا الملف ليس صورة",
    "Choose a JPG, PNG or WebP picture.": "اختر صورة بصيغة JPG أو PNG أو WebP.",
    "That photo could not be used": "تعذّر استخدام هذه الصورة",
    "That image file could not be read.": "تعذّرت قراءة ملف الصورة.",
    "This browser could not prepare the image.": "تعذّر على هذا المتصفح تجهيز الصورة.",
    "The photo could not be read for uploading.": "تعذّرت قراءة الصورة لرفعها.",
    "Member photo": "صورة العضو",

    /* members */
    "A card with a photo, a role and a description each, on {pages}. Removing a member takes it off every page it appears on; nothing changes on the site until you push.":
      "لكل عضو بطاقة فيها صورة ومسمّى ووصف، وتظهر في {pages}. إزالة العضو تُخرجه من كل صفحة يظهر فيها، ولا يتغيّر شيء في الموقع قبل النشر.",
    "Add a member": "إضافة عضو",
    "Role": "المسمّى",
    "Description": "الوصف",
    "Initials": "الأحرف الأولى",
    "Remove this member": "إزالة هذا العضو",
    "Bring this member back": "إعادة هذا العضو",
    "Delete this member": "حذف هذا العضو",
    "Delete this member?": "حذف هذا العضو؟",
    "Its card, text and photo are dropped from the site the next time you push. Removing it instead keeps the text, so you can bring it back later.":
      "ستُحذف بطاقته ونصّه وصورته من الموقع عند النشر التالي. أما الإزالة فتُبقي النصّ، فيمكنك إعادته لاحقًا.",
    "Delete": "حذف",
    "New member": "عضو جديد",
    "Member": "عضو",
    "The Arabic side is empty, so the Arabic site shows the English text.":
      "الحقل العربي فارغ، لذا سيعرض الموقع العربي النص الإنجليزي.",
    "The initials {initials} are used when the member has no photo.":
      "تُستخدم الأحرف الأولى {initials} عندما لا توجد صورة للعضو.",
    "This card is in the page, so it can be removed but not deleted. The initials {initials} are used when it has no photo.":
      "هذه البطاقة موجودة في الصفحة، لذا يمكن إزالتها لا حذفها. تُستخدم الأحرف الأولى {initials} عندما لا توجد صورة.",

    /* hero slides */
    "Slides": "الشرائح",
    "Slide": "شريحة",
    "New slide": "شريحة جديدة",
    "Slide photo": "صورة الشريحة",
    "Eyebrow": "سطر تمهيدي",
    "Headline": "عنوان رئيسي",
    "Intro text": "نص تمهيدي",
    "Each slide has a background photo, an eyebrow, a headline, an intro line and a button that points at any page or link the site already has, on {pages}. The slider keeps at least {n} slides, so add one before taking one off.":
      "لكل شريحة صورة خلفية وسطر تمهيدي وعنوان رئيسي ونص تمهيدي وزر يشير إلى أي صفحة أو رابط موجود في الموقع، وتظهر في {pages}. يحتفظ الشريط بـ {n} شرائح على الأقل، لذا أضف شريحة قبل إزالة واحدة.",
    "Add a slide": "إضافة شريحة",
    "The banner shows {n} slides as things stand.": "يعرض الشريط {n} شرائح حاليًا.",
    "Remove this slide": "إزالة هذه الشريحة",
    "Bring this slide back": "إعادة هذه الشريحة",
    "Delete this slide": "حذف هذه الشريحة",
    "Delete this slide?": "حذف هذه الشريحة؟",
    "Its slide, text and photo are dropped from the site the next time you push. Removing it instead keeps the text, so you can bring it back later.":
      "ستُحذف الشريحة والنص والصورة من الموقع عند النشر التالي. أما الإزالة فتُبقي النصّ، فيمكنك إعادتها لاحقًا.",
    "The slider must keep at least {n} slides": "يجب أن يحتفظ الشريط بـ {n} شرائح على الأقل",
    "Add a new slide first, then you can take this one off the banner.":
      "أضف شريحة جديدة أولًا، ثم يمكنك إزالة هذه من الشريط.",
    "Bring another slide back before deleting this one.": "أعد شريحة أخرى قبل حذف هذه.",
    "A new slide is built from the last slide on the page: give it a headline and a photo, and a button if you want one.":
      "تُبنى الشريحة الجديدة من آخر شريحة في الصفحة: امنحها عنوانًا وصورة، وزرًا إن أردت.",
    "This slide is in the page, so it can be removed but not deleted.":
      "هذه الشريحة موجودة في الصفحة، لذا يمكن إزالتها لا حذفها.",

    /* the call-to-action button on a slide */
    "Call to action": "زر الإجراء",
    "Call to action {n}": "زر الإجراء {n}",
    "Goes to": "يؤدي إلى",
    "No button": "بلا زر",
    "Choose a destination": "اختر وجهة",
    "Pages": "الصفحات",
    "Sections": "أقسام الصفحة",
    "Contact": "التواصل",
    "Current": "الحالي",
    "Phone": "الهاتف",
    "E-mail": "البريد الإلكتروني",
    "External link": "رابط خارجي",
    "A button needs either both its words and where it goes, or neither.":
      "يحتاج الزر إلى نصّه ووجهته معًا، أو لا شيء منهما.",

    /* the state line */
    "This browser is not saving the draft": "هذا المتصفح لا يحفظ المسودة",
    "Everything is pushed · {time}": "تم نشر كل شيء · {time}",
    "{n} changes not pushed · kept {time}": "تغييرات غير منشورة: {n} · محفوظة {time}",
    "1 change not pushed · kept {time}": "تغيير واحد غير منشور · محفوظ {time}",

    /* the allowance */
    "{n} pushes left today": "عمليات النشر المتبقية اليوم: {n}",
    "1 push left today": "بقيت عملية نشر واحدة اليوم",
    "No pushes left today": "لا توجد عمليات نشر متبقية اليوم",
    "No pushes left today · next {when}": "لا توجد عمليات نشر متبقية اليوم · التالي {when}",
    "This screen can push changes {n} times a day.": "يمكن لهذه الشاشة نشر التغييرات {n} مرات في اليوم.",
    "Changes can be pushed {n} times a day, and that allowance is used up.":
      "يُسمح بنشر التغييرات {n} مرات في اليوم، وقد استُخدم هذا الحد.",
    "The next push becomes available {when}.": "تُتاح عملية النشر التالية {when}.",
    "Nothing is lost — your draft stays saved in this browser, and you can push it later.":
      "لا شيء يضيع — تبقى مسودتك محفوظة في هذا المتصفح، ويمكنك نشرها لاحقًا.",

    /* pushing */
    "Nothing to push": "لا يوجد ما يُنشر",
    "Change something first, or use “Discard draft” to clear the draft.":
      "غيّر شيئًا أولًا، أو استخدم «إلغاء المسودة» لتفريغ المسودة.",
    "A photo is missing from this browser": "صورة مفقودة من هذا المتصفح",
    "Please choose the photo again for: {list}.": "يرجى اختيار الصورة مرة أخرى لـ: {list}.",
    "Push {n} changes?": "نشر التغييرات ({n})؟",
    "Push 1 change?": "نشر تغيير واحد؟",
    "This saves {n} new photos and the text changes to the website’s repository. Netlify then rebuilds the site, which usually takes about a minute.":
      "سيُحفظ عدد {n} من الصور الجديدة مع تغييرات النصوص في مستودع الموقع، ثم يعيد Netlify بناء الموقع، ويستغرق ذلك نحو دقيقة.",
    "This saves 1 new photo and the text changes to the website’s repository. Netlify then rebuilds the site, which usually takes about a minute.":
      "ستُحفظ صورة جديدة واحدة مع تغييرات النصوص في مستودع الموقع، ثم يعيد Netlify بناء الموقع، ويستغرق ذلك نحو دقيقة.",
    "This saves the text changes to the website’s repository. Netlify then rebuilds the site, which usually takes about a minute.":
      "ستُحفظ تغييرات النصوص في مستودع الموقع، ثم يعيد Netlify بناء الموقع، ويستغرق ذلك نحو دقيقة.",
    "Pushing…": "جارٍ النشر…",
    "Uploading photo {n} of {total}…": "جارٍ رفع الصورة {n} من {total}…",
    "Saving the text changes…": "جارٍ حفظ تغييرات النصوص…",
    "Pushed · the site updates in about a minute": "تم النشر · يُحدَّث الموقع خلال دقيقة تقريبًا",
    "Changes pushed": "تم نشر التغييرات",
    "The website is rebuilding now and usually updates within a minute.":
      "الموقع قيد إعادة البناء الآن، ويُحدَّث عادة خلال دقيقة.",
    "The changes were not pushed": "لم تُنشر التغييرات",
    "Your draft is still saved in this browser — fix the problem and press “Push changes” again.":
      "لا تزال مسودتك محفوظة في هذا المتصفح — أصلح المشكلة ثم اضغط «نشر التغييرات» مرة أخرى.",
    "Nothing was pushed": "لم يُنشر أي شيء",
    "The publish function refused the request (HTTP {code}).":
      "رفضت دالة النشر الطلب (HTTP {code}).",
    "Publishing is not connected yet: {url} was not found. See the “Publishing changes” section of README.md.":
      "النشر غير مهيّأ بعد: لم يتم العثور على {url}. راجع قسم «Publishing changes» في README.md.",
    "Could not reach {url}. Check the connection and try again.":
      "تعذّر الوصول إلى {url}. تحقّق من الاتصال وحاول مرة أخرى.",
    "Something went wrong talking to GitHub. Please try again.":
      "حدث خطأ أثناء الاتصال بـ GitHub. حاول مرة أخرى.",

    /* clearing the draft */
    "Discard the draft?": "إلغاء المسودة؟",
    "Every change you have not pushed is thrown away and the original text and photos come back.":
      "ستُلغى كل التغييرات غير المنشورة وتعود النصوص والصور الأصلية.",
    "Discard": "إلغاء",
    "Nothing to discard": "لا يوجد ما يمكن إلغاؤه",
    "The draft has no changes in it.": "المسودة لا تحتوي على تغييرات.",

    /* the dialog */
    "Cancel": "رجوع",
    "Continue": "متابعة",
    "Close": "إغلاق",
  };

  var LANG_KEY = "ing-admin-lang";
  var EN_TITLE = document.title;

  function lang() {
    try {
      var stored = window.localStorage.getItem(LANG_KEY);
      if (stored === "ar" || stored === "en") return stored;
    } catch (e) {
      /* private mode: English it is */
    }
    return "en";
  }

  function isArabic() { return lang() === "ar"; }

  /* The Arabic for a phrase, with the placeholders filled in. */
  function t(text, values) {
    var phrase = isArabic() && AR[text] ? AR[text] : text;
    if (!values) return phrase;
    return phrase.replace(/\{(\w+)\}/g, function (whole, name) {
      return values[name] === undefined ? whole : String(values[name]);
    });
  }

  /* Everything the page says for itself: the marked-up words, the labels read
     out by a screen reader, the title, and the direction of the layout. The
     English each element was written with is kept, so switching back is exact. */
  function applyScreen() {
    var arabic = isArabic();
    var html = document.documentElement;
    html.setAttribute("lang", arabic ? "ar" : "en");
    html.setAttribute("dir", arabic ? "rtl" : "ltr");
    html.setAttribute("data-lang", arabic ? "ar" : "en");
    document.title = arabic && AR[EN_TITLE] ? AR[EN_TITLE] : EN_TITLE;

    each("[data-a18n]", function (el) {
      var key = el.getAttribute("data-a18n");
      if (el.getAttribute("data-a18n-en") === null) el.setAttribute("data-a18n-en", el.textContent);
      el.textContent = arabic && AR[key] ? AR[key] : el.getAttribute("data-a18n-en");
    });
    each("[data-a18n-aria]", function (el) {
      var key = el.getAttribute("data-a18n-aria");
      if (el.getAttribute("data-aria-en") === null) el.setAttribute("data-aria-en", el.getAttribute("aria-label") || "");
      el.setAttribute("aria-label", arabic && AR[key] ? AR[key] : el.getAttribute("data-aria-en"));
    });
    each("[data-a18n-title]", function (el) {
      var key = el.getAttribute("data-a18n-title");
      if (el.getAttribute("data-title-en") === null) el.setAttribute("data-title-en", el.getAttribute("title") || "");
      el.setAttribute("title", arabic && AR[key] ? AR[key] : el.getAttribute("data-title-en"));
    });
  }

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function setLang(next) {
    try {
      window.localStorage.setItem(LANG_KEY, next === "ar" ? "ar" : "en");
    } catch (e) {
      /* private mode: the choice lasts for this page only */
    }
  }

  window.ING_ADMIN_TEXT = {
    lang: lang,
    isArabic: isArabic,
    t: t,
    setLang: setLang,
    applyScreen: applyScreen,
    arabic: AR,
  };
})();
