/* ==========================================================================
   Published site content - the changes saved from the admin screen.

   text    { "<i18n key>": { "en": "...", "ar": "..." } }
   hrefs   { "<i18n key>": "tel:+962..." }
   numbers { "<counter key>": { "value": "12", "suffix": "+" } }
   images  { "<image key>": "assets/img/uploads/some-photo.jpg" }

   publishes is the list of recent push times, used to enforce the daily
   limit on the admin screen. It is trimmed to the most recent few.

   Written by netlify/functions/publish.js when an admin presses "Push
   changes". Anything not listed here falls back to the English copy in the
   markup and the Arabic in i18n.js, so an empty file means "unchanged".
   Generated file - edit the site through admin.html instead.
   ========================================================================== */
window.ING_CONTENT = {
  "version": 1,
  "updated": "",
  "publishes": [],
  "text": {},
  "hrefs": {},
  "numbers": {},
  "images": {}
};
