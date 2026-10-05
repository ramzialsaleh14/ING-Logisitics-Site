/* ==========================================================================
   Published site content - the changes saved from the admin screen.

   text    { "<i18n key>": { "en": "...", "ar": "..." } }
   hrefs   { "<i18n key>": "tel:+962..." }
   numbers { "<counter key>": { "value": "12", "suffix": "+" } }
   images  { "<image key>": "assets/img/uploads/some-photo.jpg" }

   publishes is the list of recent push times, used to enforce the daily
   limit on the admin screen. It is trimmed to the most recent few.

   hidden  [ "team.m3" ]   member cards taken off the page (their data-cmember)
   added   [ { "id": "team.new1", "initials": "SM" } ]
                           extra member cards, built from the first member card
                           on the page. A card's role and description are the
                           text keys "<id>.role" and "<id>.desc", and its photo
                           is the image key "<id>.photo".

   Written by netlify/functions/publish.js when an admin presses "Push
   changes". Anything not listed here falls back to the English copy in the
   markup and the Arabic in i18n.js, so an empty file means "unchanged".
   Generated file - edit the site through admin.html instead.
   ========================================================================== */
window.ING_CONTENT = {
  "version": 1,
  "updated": "2026-10-05T13:00:00.000Z",
  "publishes": [
    "2026-10-05T12:32:53.729Z"
  ],
  "text": {
    "team.new9.role": {
      "en": "Fleet mechanics",
      "ar": "ميكانيكا الأسطول"
    },
    "team.new9.desc": {
      "en": "Keeping every vehicle road ready.",
      "ar": "الحفاظ على جاهزية كل مركبة."
    }
  },
  "hrefs": {},
  "numbers": {},
  "images": {},
  "hidden": [
    "team.m3"
  ],
  "added": [
    {
      "id": "team.new9",
      "initials": "FM"
    }
  ]
};
