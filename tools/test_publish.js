/* Exercise netlify/functions/publish.js against a mocked GitHub API.

   The publish function is the only thing that can write to the repository, so
   its credential check, its validation and the files it commits are worth
   pinning down. Nothing here touches the network or GitHub, and the password
   used is a throwaway, not the real one.

   usage: node tools/test_publish.js
*/
"use strict";

const path = require("path");

const { handler } = require(path.join(__dirname, "..", "netlify", "functions", "publish.js"));

const PASSWORD = "a-test-password";
const USER = "ing-logistics";
const PHOTO = "assets/img/uploads/home-hero1-0123abcd.jpg";

let calls = [];
let reply = () => ({ status: 404, body: { message: "Not Found" } });
let written = null;

global.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
  const answer = reply(url, options);
  return {
    ok: answer.status >= 200 && answer.status < 300,
    status: answer.status,
    text: async () => JSON.stringify(answer.body),
  };
};

const event = (body, headers = {}) => ({
  httpMethod: "POST",
  headers: Object.assign({ host: "ing-logistics.com", "x-forwarded-proto": "https" }, headers),
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const auth = { user: USER, password: PASSWORD };
const results = [];

function check(name, condition, detail) {
  results.push((condition ? "PASS  " : "FAIL  ") + name + (condition ? "" : "\n        -> " + JSON.stringify(detail)));
}

/* A 201 for writes and a 404 for reads: the file does not exist yet. */
const githubAccepts = () => {
  reply = (url, options) => (options.method === "PUT"
    ? { status: 201, body: { commit: { html_url: "https://github.com/ramzialsaleh14/ING-Logisitics-Site/commit/abc" } } }
    : { status: 404, body: { message: "Not Found" } });
};

/* A GitHub that keeps content.js between calls, so the log of pushes builds up
   exactly as it does in the repository. */
let stored = null;
const githubWithMemory = (times) => {
  let revision = 0;
  stored = { sha: "sha-0", text: "" };
  const start = (list) => {
    stored.text = "/* header */\nwindow.ING_CONTENT = " + JSON.stringify({
      version: 1, updated: "2026-10-05T08:00:00.000Z", publishes: list || [],
      text: {}, hrefs: {}, numbers: {}, images: {},
    }) + ";\n";
  };
  start(times);
  reply = (url, options) => {
    if (options.method === "PUT") {
      revision += 1;
      stored = {
        sha: "sha-" + revision,
        text: Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"),
      };
      return { status: 201, body: { commit: { html_url: "https://github.com/commit/abc" } } };
    }
    if (/contents\/assets\/js\/content\.js/.test(url)) {
      return {
        status: 200,
        body: { sha: stored.sha, content: Buffer.from(stored.text, "utf8").toString("base64") },
      };
    }
    return { status: 404, body: { message: "Not Found" } };
  };
};

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

/* The file as it was actually written, so the assertions read what a browser
   would load rather than a copy of the source text. */
const parseContent = (text) => {
  try {
    const scope = {};
    new Function("window", text)(scope);
    return scope.ING_CONTENT;
  } catch (e) {
    return {}; // a file that does not parse: the checks below will say so
  }
};

const writtenContent = () => parseContent(stored.text);

const content = (extra) => Object.assign({
  updated: "2026-10-05T08:00:00.000Z",
  text: { "story.title": { en: "Our Story", ar: "\u0642\u0635\u062a\u0646\u0627" } },
  hrefs: { "contact.phone": "tel:+962799723777" },
  numbers: { "stats.n1": { value: "20", suffix: "+" } },
  images: { "home.hero1": PHOTO },
}, extra || {});

async function run() {
  /* ------------------------------------------------------- configuration */
  delete process.env.ADMIN_PASSWORD;
  process.env.GITHUB_TOKEN = "test-token";
  let response = await handler(event(Object.assign({ action: "content", content: {} }, auth)));
  check("no ADMIN_PASSWORD -> 500 naming the variable",
    response.statusCode === 500 && /ADMIN_PASSWORD/.test(response.body), response);

  delete process.env.GITHUB_TOKEN;
  response = await handler(event(Object.assign({ action: "content", content: {} }, auth)));
  check("no GITHUB_TOKEN -> 500 naming the variable",
    response.statusCode === 500 && /GITHUB_TOKEN/.test(response.body), response);
  process.env.GITHUB_TOKEN = "test-token";

  process.env.ADMIN_PASSWORD = PASSWORD;
  response = await handler(event({ action: "content", content: {}, user: USER, password: "wrong" }));
  check("wrong password -> 401", response.statusCode === 401, response);
  response = await handler(event({ action: "content", content: {}, user: "someone", password: PASSWORD }));
  check("wrong user -> 401", response.statusCode === 401, response);
  response = await handler(event({ action: "content", content: {} }));
  check("missing credentials -> 401", response.statusCode === 401, response);

  /* ------------------------------------------------------------ requests */
  response = await handler({ httpMethod: "GET", headers: {}, body: null });
  check("GET -> 405", response.statusCode === 405, response);
  response = await handler(event("not json"));
  check("body that is not JSON -> 400", response.statusCode === 400, response);
  response = await handler(event(Object.assign({ action: "content", content: {} }, auth),
    { "x-forwarded-proto": "http", host: "ing-logistics.com" }));
  check("plain http -> 403", response.statusCode === 403, response);
  response = await handler(event(Object.assign({ action: "content", content: {} }, auth),
    { origin: "https://evil.example" }));
  check("another site's origin -> 403", response.statusCode === 403, response);
  response = await handler(event(Object.assign({ action: "content", content: {} }, auth),
    { origin: "https://ing-logistics.com" }));
  check("the site's own origin gets past the check", response.statusCode !== 403, response);
  response = await handler(event(Object.assign({ action: "nonsense" }, auth)));
  check("unknown action -> 400", response.statusCode === 400, response);

  /* ------------------------------------------------------------- content */
  githubAccepts();
  calls = [];
  response = await handler(event(Object.assign({ action: "content", content: content() }, auth)));
  check("content is accepted", response.statusCode === 200, response);

  const put = calls.find(call => call.method === "PUT" && /content\.js$/.test(call.url));
  check("content.js is the file committed", Boolean(put), calls.map(call => call.method + " " + call.url));
  written = put ? Buffer.from(put.body.content, "base64").toString("utf8") : "";
  check("content.js keeps its header", written.indexOf("Published site content") !== -1, written.slice(0, 60));
  check("the commit is named", /Update site content/.test(put ? put.body.message : ""), put && put.body.message);
  check("images are stored as paths",
    written.indexOf('"home.hero1": "' + PHOTO + '"') !== -1, written);
  check("content.js is valid JavaScript that loads", (() => {
    try {
      const scope = {};
      new Function("window", written)(scope);
      return scope.ING_CONTENT.text["story.title"].en === "Our Story"
        && scope.ING_CONTENT.numbers["stats.n1"].value === "20"
        && scope.ING_CONTENT.hrefs["contact.phone"] === "tel:+962799723777";
    } catch (e) {
      return false;
    }
  })(), written);

  /* ---------------------------------------------------------- validation */
  const refuse = async (name, body) => {
    const answer = await handler(event(Object.assign({ action: "content", content: body }, auth)));
    check(name + " -> 400", answer.statusCode === 400, answer);
  };
  await refuse("a javascript: link", { hrefs: { "contact.phone": "javascript:alert(1)" } });
  await refuse("a link that is not a URL, mailto, tel or page", { hrefs: { "contact.phone": "ftp://x" } });
  await refuse("a key that is not a plain identifier", { text: { "<img src=x onerror=y>": { en: "x" } } });
  await refuse("a script tag in text", { text: { "story.title": { en: "<script>alert(1)</script>" } } });
  await refuse("an event handler in text", { text: { "story.title": { en: "<b onmouseover=alert(1)>hi</b>" } } });
  await refuse("an iframe in text", { text: { "story.title": { en: "<iframe src=//evil>" } } });
  await refuse("text longer than the limit", { text: { "story.title": { en: "x".repeat(4001) } } });
  await refuse("a photo path outside the asset folders", { images: { "home.hero1": "https://evil.example/x.jpg" } });
  await refuse("a photo path that climbs out of the folder", { images: { "home.hero1": "assets/img/../../secret.txt" } });
  await refuse("text that is not an object", { text: { "story.title": "just a string" } });

  response = await handler(event(Object.assign({ action: "content" }, auth)));
  check("content that is missing entirely -> 400", response.statusCode === 400, response);

  /* --------------------------------------------------------- member cards */
  const memberText = (id) => ({
    [id + ".role"]: { en: "Fleet mechanics", ar: "\u0645\u064a\u0643\u0627\u0646\u064a\u0643\u0627" },
    [id + ".desc"]: { en: "Keeping every vehicle road ready.", ar: "\u0627\u0644\u062d\u0641\u0627\u0638" },
  });
  const member = (extra) => Object.assign({ id: "team.new1", initials: "SM" }, extra || {});
  let published;

  const write = async (extra) => {
    calls = [];
    const answer = await handler(event(Object.assign({ action: "content", content: content(extra) }, auth)));
    const put = calls.find(call => call.method === "PUT" && /content\.js$/.test(call.url));
    published = put ? parseContent(Buffer.from(put.body.content, "base64").toString("utf8")) : null;
    return answer;
  };

  response = await write({ hidden: ["team.m3"] });
  check("a removed member is written into content.js",
    response.statusCode === 200 && published.hidden.join() === "team.m3", published && published.hidden);
  check("the published file always carries both member lists",
    Array.isArray(published.added) && !published.added.length, published && published.added);

  response = await write({ hidden: [] });
  check("bringing a member back clears the list",
    response.statusCode === 200 && published.hidden.length === 0, published && published.hidden);

  response = await write({ hidden: "team.m3" });
  check("a hidden list that is not a list -> 400", response.statusCode === 400, response);
  response = await write({ hidden: ["<script>alert(1)</script>"] });
  check("a hidden name that is not an id -> 400", response.statusCode === 400, response);
  response = await write({ hidden: Array.from({ length: 201 }, (unused, i) => "team.m" + i) });
  check("more removed cards than the limit -> 400", response.statusCode === 400, response);

  response = await write({ added: [member()] });
  check("a new member with no role and no description -> 400", response.statusCode === 400, response);
  response = await write({ added: [member()], text: { "team.new1.role": { en: "Fleet mechanics" } } });
  check("a new member with a role but no description -> 400", response.statusCode === 400, response);

  response = await write({ added: [member({ initials: "SMITH" })], text: memberText("team.new1") });
  check("a new member with a role and a description is kept",
    response.statusCode === 200 && published.added[0].id === "team.new1", published && published.added);
  check("initials are kept to four characters",
    published.added[0].initials === "SMIT", published && published.added[0]);
  check("the new member's text is written like any other",
    published.text["team.new1.role"].en === "Fleet mechanics", published && published.text);

  response = await write({ added: [member(), member()], text: memberText("team.new1") });
  check("two new members with the same name -> 400", response.statusCode === 400, response);
  response = await write({ added: [member({ id: "team.new1.role" })], text: memberText("team.new1") });
  check("a new member named like a text key has no text of its own -> 400",
    response.statusCode === 400, response);
  response = await write({ added: [member()], hidden: ["team.new1"], text: memberText("team.new1") });
  check("a new member that is also on the removed list -> 400", response.statusCode === 400, response);
  response = await write({ added: "team.new1" });
  check("a new member list that is not a list -> 400", response.statusCode === 400, response);

  /* ---------------------------------------------------------- hero slides */
  const slide = (extra) => Object.assign({ id: "slide.new1" }, extra || {});
  const slideText = (id) => ({
    [id + ".title"]: { en: "A new route", ar: "\u0645\u0633\u0627\u0631" },
    [id + ".text"]: { en: "Shipping to new markets.", ar: "\u0634\u062d\u0646" },
  });
  const slideImages = (id) => ({ [id + ".photo"]: PHOTO });

  response = await write({ slidesAdded: [slide()] });
  check("a new slide with no headline -> 400", response.statusCode === 400, response);
  response = await write({ slidesAdded: [slide()], text: slideText("slide.new1") });
  check("a new slide with no photo -> 400", response.statusCode === 400, response);

  response = await write({
    slidesAdded: [slide()], text: slideText("slide.new1"), images: slideImages("slide.new1"),
  });
  check("a new slide with a headline and a photo is kept",
    response.statusCode === 200 && published.slidesAdded[0].id === "slide.new1", published && published.slidesAdded);
  check("the published file always carries both slide lists",
    Array.isArray(published.slidesHidden) && !published.slidesHidden.length, published && published.slidesHidden);

  response = await write({ slidesHidden: ["slide.2"] });
  check("removing a slide with nothing added would leave too few -> 400",
    response.statusCode === 400, response);

  response = await write({
    slidesHidden: ["slide.2"], slidesAdded: [slide()],
    text: slideText("slide.new1"), images: slideImages("slide.new1"),
  });
  check("a slide may come off once another is added",
    response.statusCode === 200 && published.slidesHidden.join() === "slide.2", published && published.slidesHidden);

  response = await write({
    slidesAdded: [slide(), slide()], text: slideText("slide.new1"), images: slideImages("slide.new1"),
  });
  check("two new slides with the same name -> 400", response.statusCode === 400, response);
  response = await write({
    slidesAdded: [slide()], slidesHidden: ["slide.new1"],
    text: slideText("slide.new1"), images: slideImages("slide.new1"),
  });
  check("a new slide that is also on the removed list -> 400", response.statusCode === 400, response);
  response = await write({ slidesHidden: "slide.2" });
  check("a removed slide list that is not a list -> 400", response.statusCode === 400, response);
  response = await write({ slidesAdded: "slide.new1" });
  check("a new slide list that is not a list -> 400", response.statusCode === 400, response);

  /* -------------------------------------------------- the button on a slide */
  const withCta = (extra) => Object.assign({
    slidesAdded: [slide()], text: slideText("slide.new1"), images: slideImages("slide.new1"),
  }, extra);

  response = await write(withCta({ text: Object.assign(slideText("slide.new1"), {
    "slide.new1.cta": { en: "Talk to us" },
  }) }));
  check("a new slide's button with words but nowhere to go -> 400", response.statusCode === 400, response);

  response = await write(withCta({ hrefs: { "slide.new1.cta": "get-in-touch.html" } }));
  check("a new slide's button with a link but no words -> 400", response.statusCode === 400, response);

  response = await write(withCta({
    text: Object.assign(slideText("slide.new1"), { "slide.new1.cta": { en: "Talk to us" } }),
    hrefs: { "slide.new1.cta": "get-in-touch.html" },
  }));
  check("a new slide's button with both words and a link is kept",
    response.statusCode === 200 && published.hrefs["slide.new1.cta"] === "get-in-touch.html",
    published && published.hrefs);

  response = await write(withCta({ hrefs: { "slide.new1.cta": "nowhere.invalid" } }));
  check("a new slide's button pointing somewhere impossible -> 400", response.statusCode === 400, response);

  response = await write({ hrefs: { "slide.cta": "our-clients.html" } });
  check("a slide that is in the page may point its button elsewhere",
    response.statusCode === 200 && published.hrefs["slide.cta"] === "our-clients.html",
    published && published.hrefs);
  response = await write({ hrefs: { "slide.cta": "javascript:alert(1)" } });
  check("a slide button pointing at javascript: -> 400", response.statusCode === 400, response);

  /* -------------------------------------------------------------- photos */
  response = await handler(event(Object.assign({
    action: "image", path: PHOTO, base64: Buffer.from("pretend jpeg bytes").toString("base64"),
  }, auth)));
  check("a photo is committed", response.statusCode === 200 && /github\.com/.test(response.body), response);
  check("the answer names the photo", JSON.parse(response.body).path === PHOTO, response.body);

  response = await handler(event(Object.assign({
    action: "image", path: "assets/img/uploads/x.jpg", base64: "A".repeat(4 * 1024 * 1024 + 8),
  }, auth)));
  check("an oversized photo -> 413", response.statusCode === 413, response);
  response = await handler(event(Object.assign({
    action: "image", path: "assets/img/uploads/x.jpg", base64: "<not base64>",
  }, auth)));
  check("a photo that is not base64 -> 400", response.statusCode === 400, response);
  response = await handler(event(Object.assign({ action: "image", base64: "AAAA" }, auth)));
  check("a photo with no path -> 400", response.statusCode === 400, response);

  /* ------------------------------------------------------- push allowance */
  const push = () => handler(event(Object.assign({ action: "content", content: content() }, auth)));
  const status = () => handler(event(Object.assign({ action: "status" }, auth)));
  const photo = () => handler(event(Object.assign({
    action: "image", path: PHOTO, base64: Buffer.from("pretend jpeg bytes").toString("base64"),
  }, auth)));

  githubWithMemory([]);
  response = await status();
  check("status reports the allowance without changing anything",
    response.statusCode === 200 && JSON.parse(response.body).quota.remaining === 2, response);

  response = await push();
  let quota = JSON.parse(response.body).quota;
  check("a push uses one of the two", quota.remaining === 1 && quota.used === 1, response.body);
  check("a push is not refused while the allowance lasts", response.statusCode === 200, response);
  check("the push time is written into content.js",
    writtenContent().version === 1
    && (writtenContent().publishes || []).length === 1
    && !isNaN(Date.parse(writtenContent().publishes[0])),
    writtenContent().publishes);

  response = await push();
  quota = JSON.parse(response.body).quota;
  check("the second push is the last one", quota.remaining === 0 && quota.used === 2, response.body);
  check("the answer says when the next push opens up",
    typeof quota.resetAt === "string" && !isNaN(Date.parse(quota.resetAt)), quota);
  check("content.js carries both pushes",
    (writtenContent().publishes || []).length === 2, writtenContent().publishes);

  response = await status();
  check("status now reports nothing left",
    response.statusCode === 200 && JSON.parse(response.body).quota.remaining === 0, response);

  response = await push();
  check("a third push -> 429", response.statusCode === 429, response);
  check("the refusal carries the allowance for the screen",
    JSON.parse(response.body).quota.remaining === 0, response.body);
  response = await photo();
  check("a photo is refused once the allowance is spent", response.statusCode === 429, response);

  const before = calls.length;
  githubWithMemory([ago(25 * HOUR), ago(25 * HOUR)]);
  response = await push();
  check("pushes older than 24 hours do not count",
    response.statusCode === 200 && JSON.parse(response.body).quota.remaining === 1, response);
  check("aged-out times are kept as history but do not count",
    (writtenContent().publishes || []).length === 3, writtenContent().publishes);

  githubWithMemory(Array.from({ length: 25 }, () => ago(30 * HOUR)));
  response = await push();
  check("the log is capped so it cannot grow without limit",
    response.statusCode === 200 && writtenContent().publishes.length === 20,
    writtenContent().publishes.length);

  githubWithMemory([ago(2 * HOUR), ago(2 * HOUR)]);
  response = await push();
  check("a fresh pair of pushes -> 429", response.statusCode === 429, response);
  check("the wait is counted from the older of the two",
    Date.parse(JSON.parse(response.body).quota.resetAt) > Date.now() + 21 * HOUR, response.body);

  process.env.PUBLISH_LIMIT = "1";
  githubWithMemory([ago(2 * HOUR)]);
  response = await push();
  check("PUBLISH_LIMIT changes the allowance", response.statusCode === 429, response);
  githubWithMemory([]);
  response = await push();
  check("PUBLISH_LIMIT allows a push when nothing is logged",
    response.statusCode === 200 && JSON.parse(response.body).quota.limit === 1, response);
  process.env.PUBLISH_LIMIT = "not a number";
  githubWithMemory([]);
  response = await status();
  check("a nonsense PUBLISH_LIMIT falls back to two",
    JSON.parse(response.body).quota.limit === 2, response);
  delete process.env.PUBLISH_LIMIT;

  githubWithMemory(["not a date"]);
  calls = [];
  response = await status();
  check("a damaged push log does not lock the owner out",
    response.statusCode === 200 && JSON.parse(response.body).quota.remaining === 2, response);
  check("reading the log writes nothing", calls.every(call => call.method !== "PUT"), calls);

  response = await handler(event({ action: "status", user: USER, password: "wrong" }));
  check("status is behind the password too", response.statusCode === 401, response);

  /* ----------------------------------------------- further sign-ins (ADMIN_USERS) */
  const as = (user, password) => handler(event(
    Object.assign({ action: "content", content: content() }, { user: user, password: password })));

  process.env.ADMIN_USERS = "ramzialsaleh14:858542,helper:second-password";
  githubWithMemory([]);
  response = await as("ramzialsaleh14", "858542");
  check("an ADMIN_USERS sign-in can push", response.statusCode === 200, response);
  response = await as("ing-logistics", PASSWORD);
  check("ADMIN_USERS leaves the main sign-in alone", response.statusCode === 200, response);
  githubWithMemory([]);
  response = await as("helper", "second-password");
  check("a second ADMIN_USERS sign-in is accepted", response.statusCode === 200, response);
  response = await as("ramzialsaleh14", "85854");
  check("a wrong password for an extra sign-in -> 401", response.statusCode === 401, response);
  response = await as("ramzialsaleh14 ", "858542");
  check("a padded user name is not the same user -> 401", response.statusCode === 401, response);
  response = await as("someone", "second-password");
  check("another user's password is not enough -> 401", response.statusCode === 401, response);

  process.env.ADMIN_USERS = "ramzialsaleh14:with:colons,nonsense,helper:";
  githubWithMemory([]);
  response = await as("ramzialsaleh14", "with:colons");
  check("a password may contain a colon", response.statusCode === 200, response);
  response = await as(USER, PASSWORD);
  check("a malformed entry is skipped, not fatal", response.statusCode === 200, response);

  githubWithMemory([]);
  delete process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERS = "ramzialsaleh14:858542";
  response = await as("ramzialsaleh14", "858542");
  check("ADMIN_USERS works without ADMIN_PASSWORD", response.statusCode === 200, response);
  delete process.env.ADMIN_USERS;
  response = await as("ramzialsaleh14", "858542");
  check("with no accounts configured at all -> 500", response.statusCode === 500, response);
  process.env.ADMIN_PASSWORD = PASSWORD;

  /* ------------------------------------------------------------ GitHub */
  const realFetch = global.fetch;
  delete global.fetch;
  response = await handler(event(Object.assign({ action: "content", content: content() }, auth)));
  check("a runtime without fetch() says what to do",
    response.statusCode === 500 && /Node\.js 18/.test(response.body), response);
  global.fetch = realFetch;

  reply = () => ({ status: 401, body: { message: "Bad credentials" } });
  response = await handler(event(Object.assign({ action: "content", content: content() }, auth)));
  check("GitHub's refusal is passed on",
    response.statusCode === 502 && /Bad credentials/.test(response.body), response);

  reply = () => { throw new Error("network down"); };
  response = await handler(event(Object.assign({ action: "content", content: content() }, auth)));
  check("a network failure does not leak as a crash",
    response.statusCode === 500 && /try again/i.test(response.body), response);

  const failed = results.filter(line => line.startsWith("FAIL"));
  console.log(results.join("\n"));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " checks passed");
  process.exit(failed.length ? 1 : 0);
}

run().catch(problem => {
  console.error(problem);
  process.exit(1);
});
