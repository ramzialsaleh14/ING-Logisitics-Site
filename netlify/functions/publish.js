/* ==========================================================================
   POST /.netlify/functions/publish

   Called by admin.html's "Push changes" button. It checks the admin
   credentials, then commits to GitHub on the site's behalf:

     { action: "image",   path, base64 }        one new photo
     { action: "content", content }             assets/js/content.js

   Photos go up one request at a time so a large batch never hits the
   function's payload limit. Committing to the branch makes Netlify rebuild
   and publish the site, typically within a minute.

   Environment variables (Site configuration -> Environment variables):

     ADMIN_PASSWORD   required. The same password the admin signs in with.
     GITHUB_TOKEN     required. Fine-grained PAT with "Contents: read/write".
     ADMIN_USER       defaults to "ing-logistics".
     GITHUB_REPO      defaults to "ramzialsaleh14/ING-Logisitics-Site".
     GITHUB_BRANCH    defaults to "main".
   ========================================================================== */
"use strict";

const crypto = require("crypto");

const API = "https://api.github.com";
const CONTENT_PATH = "assets/js/content.js";
const IMAGE_PATH = /^assets\/(img|logo)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(jpe?g|png|webp|svg)$/;
const KEY = /^[A-Za-z0-9._-]{1,80}$/;
const MAX_BASE64 = 4 * 1024 * 1024;
const MAX_TEXT = 4000;
const MAX_HREF = 2000;

/* How many times a day the admin screen may push changes.

   Functions have no storage of their own, so the count of recent pushes is
   kept in content.js and rewritten in the same commit as the change it
   belongs to - the count and the content can never drift apart, and no extra
   commit (or build) is needed to record it. PUBLISH_LIMIT overrides the
   default of two, and the window is a rolling 24 hours, so a burst either
   side of midnight cannot be used to push four times. */
const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const PUBLISH_LOG_FIELD = "publishes";
const PUBLISH_LOG_MAX = 20;
const MAX_HIDDEN = 200;
const MAX_ADDED = 50;
const CONTENT_COMMIT_MESSAGE = "Update site content from the admin screen";

function publishLimit() {
  const configured = Number(process.env.PUBLISH_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : 2;
}

const CONTENT_HEADER = `/* ==========================================================================
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
`;

class Refused extends Error {
  constructor(status, message, quota) {
    super(message);
    this.status = status;
    this.quota = quota;
  }
}

function reply(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
    body: JSON.stringify(body),
  };
}

/* Constant-time comparison of the credentials, hashed first so both sides are
   always the same length. */
function sameSecret(given, expected) {
  const a = crypto.createHash("sha256").update(String(given), "utf8").digest();
  const b = crypto.createHash("sha256").update(String(expected), "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function authorise(event, body) {
  const user = process.env.ADMIN_USER || "ing-logistics";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Refused(500, "Publishing is not set up yet: add ADMIN_PASSWORD in Netlify's environment "
      + "variables (and GITHUB_TOKEN), then redeploy. See README.md.");
  }
  if (typeof body.user !== "string" || typeof body.password !== "string"
      || !sameSecret(body.user, user) || !sameSecret(body.password, password)) {
    throw new Refused(401, "Those admin credentials were not accepted.");
  }

  const proto = String(event.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(event.headers.host || "");
  if (proto !== "https" && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    throw new Refused(403, "Publishing over a plain http:// connection is refused.");
  }

  const origin = event.headers.origin;
  if (origin && host && origin.indexOf("//" + host) === -1) {
    throw new Refused(403, "This request came from another website.");
  }
}

function github() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Refused(500, "Publishing is not set up yet: add GITHUB_TOKEN in Netlify's environment "
      + "variables (a GitHub token with Contents: read/write), then redeploy. See README.md.");
  }
  return {
    token: token,
    repo: process.env.GITHUB_REPO || "ramzialsaleh14/ING-Logisitics-Site",
    branch: process.env.GITHUB_BRANCH || "main",
  };
}

function describe(result) {
  if (result.body && result.body.message) return result.body.message;
  return "HTTP " + result.status;
}

async function apiRequest(config, apiPath, options) {
  if (typeof fetch !== "function") {
    throw new Refused(500, "This function needs Node.js 18 or newer, and the runtime it is running on has "
      + "no fetch(). Set NODE_VERSION to 20 in Netlify's environment variables.");
  }
  const settings = options || {};
  const response = await fetch(API + "/repos/" + config.repo + apiPath, {
    method: settings.method || "GET",
    headers: Object.assign({
      Authorization: "Bearer " + config.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ing-logistics-admin",
    }, settings.headers || {}),
    body: settings.body,
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { /* keep the raw text */ }
  return { ok: response.ok, status: response.status, body: body, text: text };
}

async function fileSha(config, path) {
  const result = await apiRequest(config, `/contents/${path}?ref=${encodeURIComponent(config.branch)}`);
  if (result.status === 404) return null;
  if (!result.ok) throw new Refused(502, "GitHub could not read " + path + ": " + describe(result));
  return result.body.sha;
}

const COMMITTER = { name: "ING Logistics admin", email: "admin@ing-logistics.com" };

async function writeFile(config, path, base64, message, sha) {
  const body = { message: message, content: base64, branch: config.branch, committer: COMMITTER };
  if (sha) body.sha = sha;
  const result = await apiRequest(config, `/contents/${path}`, { method: "PUT", body: JSON.stringify(body) });
  if (!result.ok) throw new Refused(502, "GitHub refused to save " + path + ": " + describe(result));
  return result.body.commit && result.body.commit.html_url;
}

async function commit(config, path, base64, message) {
  return writeFile(config, path, base64, message, await fileSha(config, path));
}

/* ------------------------------------------------------------- push limit -- */

/* The published content file, with the timestamps of recent pushes it carries. */
async function publishedFile(config) {
  const result = await apiRequest(config, `/contents/${CONTENT_PATH}?ref=${encodeURIComponent(config.branch)}`);
  if (result.status === 404) return { sha: null, times: [] };
  if (!result.ok) throw new Refused(502, "GitHub could not read " + CONTENT_PATH + ": " + describe(result));
  const text = result.body && result.body.content
    ? Buffer.from(result.body.content, "base64").toString("utf8")
    : "";
  return { sha: result.body.sha, times: publishTimes(text) };
}

function publishTimes(text) {
  if (!text) return [];
  const marker = "window.ING_CONTENT = ";
  const start = text.indexOf(marker);
  if (start === -1) return [];
  let published;
  try {
    published = JSON.parse(text.slice(start + marker.length).replace(/;\s*$/, ""));
  } catch (e) {
    return []; // hand-edited file: carry on rather than block the owner out
  }
  const times = published && published[PUBLISH_LOG_FIELD];
  return Array.isArray(times) ? times.filter(function (time) { return typeof time === "string"; }) : [];
}

/* The oldest timestamp is what frees the next push, so it is carried along to
   work out when a used-up allowance opens again. */
function quotaFrom(times, now) {
  const recent = times
    .map(function (time) { return Date.parse(time); })
    .filter(function (at) { return !isNaN(at) && now - at < LIMIT_WINDOW_MS; });
  const limit = publishLimit();
  const remaining = Math.max(0, limit - recent.length);
  const oldest = recent.length ? Math.min.apply(null, recent) : null;
  return {
    used: recent.length,
    limit: limit,
    remaining: remaining,
    resetAt: remaining === 0 && oldest !== null ? new Date(oldest + LIMIT_WINDOW_MS).toISOString() : null,
    oldest: oldest,
    times: times,
  };
}

function publicQuota(state) {
  return { used: state.used, limit: state.limit, remaining: state.remaining, resetAt: state.resetAt };
}

function quotaAfterPublish(state, at) {
  const used = state.used + 1;
  const limit = state.limit;
  const oldest = state.oldest === null ? at : state.oldest;
  return {
    used: used,
    limit: limit,
    remaining: Math.max(0, limit - used),
    resetAt: limit - used <= 0 ? new Date(oldest + LIMIT_WINDOW_MS).toISOString() : null,
    oldest: oldest,
    times: state.times,
  };
}

async function currentQuota(config) {
  return quotaFrom((await publishedFile(config)).times, Date.now());
}

function requireQuota(state) {
  if (state.remaining > 0) return state;
  throw new Refused(429,
    "Changes can be pushed " + state.limit + " times per day from this screen, and that has been used."
    + (state.resetAt ? " The next push becomes available at " + state.resetAt + " UTC." : ""),
    publicQuota(state));
}

/* ------------------------------------------------------------- validation -- */

function safePath(path, label) {
  if (typeof path !== "string" || !IMAGE_PATH.test(path)
      || path.indexOf("..") !== -1 || path.indexOf("//") !== -1) {
    throw new Refused(400, "The photo path for " + label + " is not one this site may use.");
  }
  return path;
}

function cleanText(value, label) {
  if (typeof value !== "string") throw new Refused(400, "The text for " + label + " is not text.");
  if (value.length > MAX_TEXT) throw new Refused(400, "The text for " + label + " is too long.");
  // content-apply.js writes overrides as HTML, so refuse the obvious scripts
  if (/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form)\b/i.test(value)
      || /\son\w+\s*=/i.test(value)) {
    throw new Refused(400, "The text for " + label + " contains markup that is not allowed.");
  }
  return value;
}

function cleanHref(value, label) {
  if (typeof value !== "string" || !value) throw new Refused(400, "The link for " + label + " is empty.");
  if (value.length > MAX_HREF) throw new Refused(400, "The link for " + label + " is too long.");
  if (!/^(https?:\/\/|mailto:|tel:|\/|#|[A-Za-z0-9_][A-Za-z0-9_./-]*\.html)/.test(value)) {
    throw new Refused(400, "The link for " + label + " must be an http(s), mailto:, tel: or site address.");
  }
  return value;
}

function cleanMap(source, label, cleanValue) {
  if (source === undefined) return {};
  if (!source || typeof source !== "object") throw new Refused(400, label + " is not an object.");
  const out = {};
  for (const key of Object.keys(source)) {
    if (!KEY.test(key)) throw new Refused(400, "The edit key " + key + " is not allowed.");
    out[key] = cleanValue(source[key], key);
  }
  return out;
}

function cleanContent(input) {
  if (!input || typeof input !== "object") throw new Refused(400, "No content was sent.");

  const text = cleanMap(input.text, "text", function (entry, key) {
    if (!entry || typeof entry !== "object") throw new Refused(400, "The text for " + key + " is malformed.");
    const kept = {};
    if (entry.en !== undefined) kept.en = cleanText(entry.en, key);
    if (entry.ar !== undefined) kept.ar = cleanText(entry.ar, key);
    return kept;
  });

  const numbers = cleanMap(input.numbers, "numbers", function (entry, key) {
    if (!entry || typeof entry !== "object") throw new Refused(400, "The number for " + key + " is malformed.");
    const kept = {};
    if (entry.value !== undefined) kept.value = cleanText(String(entry.value), key).slice(0, 40);
    if (entry.suffix !== undefined) kept.suffix = cleanText(String(entry.suffix), key).slice(0, 40);
    return kept;
  });

  const empty = function (value) { return value && Object.keys(value).length; };
  const content = { version: 1, updated: "", text: {}, hrefs: {}, numbers: {}, images: {}, hidden: [], added: [] };
  content.updated = typeof input.updated === "string" ? input.updated.slice(0, 40) : new Date().toISOString();
  Object.keys(text).forEach(function (key) { if (empty(text[key])) content.text[key] = text[key]; });
  Object.keys(numbers).forEach(function (key) { if (empty(numbers[key])) content.numbers[key] = numbers[key]; });
  content.hrefs = cleanMap(input.hrefs, "hrefs", cleanHref);
  content.images = cleanMap(input.images, "images", function (path, key) { return safePath(path, key); });
  content.hidden = cleanHidden(input.hidden);
  content.added = cleanAdded(input.added, content.text);
  content.added.forEach(function (member) {
    if (content.hidden.indexOf(member.id) !== -1) {
      throw new Refused(400, "The new member " + member.id + " is also on the list of removed cards.");
    }
  });
  return content;
}

/* The cards taken off the page. An unknown name would simply never match
   anything in the markup, so only the shape of the names is checked. */
function cleanHidden(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Refused(400, "The list of hidden cards is malformed.");
  if (input.length > MAX_HIDDEN) {
    throw new Refused(400, "Too many cards are being removed at once (the limit is " + MAX_HIDDEN + ").");
  }
  const seen = [];
  input.forEach(function (id) {
    const name = cleanText(String(id), "a hidden card").slice(0, 80).trim();
    if (!KEY.test(name)) throw new Refused(400, "A hidden card has an unexpected name: " + name);
    if (seen.indexOf(name) === -1) seen.push(name);
  });
  return seen;
}

/* New member cards. A card is only the identity and the initials - its role,
   description and photo are ordinary entries in the text and images above, so
   that they are validated and applied like every other edit. */
function cleanAdded(input, text) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Refused(400, "The list of new members is malformed.");
  if (input.length > MAX_ADDED) {
    throw new Refused(400, "Too many new members are being added at once (the limit is " + MAX_ADDED + ").");
  }
  const seen = [];
  return input.map(function (entry) {
    if (!entry || typeof entry !== "object") throw new Refused(400, "A new member is malformed.");
    const id = String(entry.id || "").trim();
    if (!KEY.test(id) || id.length > 80) throw new Refused(400, "A new member has an unexpected name: " + id);
    if (seen.indexOf(id) !== -1) throw new Refused(400, "Two new members share the name " + id + ".");
    seen.push(id);
    const role = (text[id + ".role"] || {}).en;
    const desc = (text[id + ".desc"] || {}).en;
    if (!role || !desc) {
      throw new Refused(400, "The new member " + id + " needs both a role and a description.");
    }
    return { id: id, initials: cleanText(String(entry.initials || ""), "the initials of a new member").slice(0, 4) };
  });
}

function serialise(content) {
  return CONTENT_HEADER + "window.ING_CONTENT = " + JSON.stringify(content, null, 2) + ";\n";
}

/* --------------------------------------------------------------- handlers -- */

async function saveImage(config, body) {
  const path = safePath(body.path, "that photo");
  const base64 = String(body.base64 || "");
  if (!base64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) {
    throw new Refused(400, "The photo did not arrive in a form that can be saved.");
  }
  if (base64.length > MAX_BASE64) {
    throw new Refused(413, "That photo is too large to send. Try one under 3 MB.");
  }
  const commitUrl = await commit(config, path, base64.replace(/[\r\n]/g, ""),
    "Add photo " + path.split("/").pop() + " from the admin screen");
  return { ok: true, path: path, commit: commitUrl };
}

async function saveContent(config, body, state, file) {
  const content = cleanContent(body.content);
  const now = new Date();
  const published = {
    version: 1,
    updated: content.updated,
    [PUBLISH_LOG_FIELD]: file.times.concat(now.toISOString()).slice(-PUBLISH_LOG_MAX),
    text: content.text,
    hrefs: content.hrefs,
    numbers: content.numbers,
    images: content.images,
    hidden: content.hidden,
    added: content.added,
  };
  const base64 = Buffer.from(serialise(published), "utf8").toString("base64");
  const commitUrl = await writeFile(config, CONTENT_PATH, base64, CONTENT_COMMIT_MESSAGE, file.sha);
  return {
    ok: true,
    commit: commitUrl,
    updated: content.updated,
    quota: publicQuota(quotaAfterPublish(state, now.getTime())),
  };
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") throw new Refused(405, "Use POST.");

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      throw new Refused(400, "The request body was not valid JSON.");
    }

    authorise(event, body);
    const config = github();

    if (body.action === "status") {
      return reply(200, { ok: true, quota: publicQuota(await currentQuota(config)) });
    }

    // Every write is checked against the daily allowance first, so a photo that
    // could never be published is never uploaded.
    const file = await publishedFile(config);
    const state = requireQuota(quotaFrom(file.times, Date.now()));

    let result;
    if (body.action === "image") result = await saveImage(config, body);
    else if (body.action === "content") result = await saveContent(config, body, state, file);
    else throw new Refused(400, "Unknown action.");

    return reply(200, result);
  } catch (problem) {
    const known = problem instanceof Refused;
    const failure = {
      ok: false,
      error: known ? problem.message : "Something went wrong talking to GitHub. Please try again.",
    };
    if (known && problem.quota) failure.quota = problem.quota;
    return reply(known ? problem.status : 500, failure);
  }
};
