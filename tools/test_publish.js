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

  /* ------------------------------------------------------------ GitHub */
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
