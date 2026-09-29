#!/usr/bin/env node
// Verifies the SHIPPED file: head/SEO/asset references are right for
// trig.trianglebuddy.com, nothing external sneaks in, and the page boots and
// mounts in jsdom (phone + desktop) without runtime errors.
// Run: node core/verify-built-html.js
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; } else { fail++; console.log(`FAIL ${n}  ${d}`); } };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = "https://trig.trianglebuddy.com/";
const VERSION = "v" + JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
{
  const m = fs.readFileSync(path.join(ROOT, "TrigCalculator.jsx"), "utf8").match(/const VERSION = "([^"]+)"/);
  ok("JSX VERSION matches package.json", m && m[1] === VERSION, `${m && m[1]} vs ${VERSION}`);
  ok("JSX header banner carries the version", fs.readFileSync(path.join(ROOT, "TrigCalculator.jsx"), "utf8").includes(`TRIG BUDDY  ${VERSION}`));
}

// ---- static checks ----
ok("alias is byte-identical", fs.readFileSync(path.join(ROOT, "trig-buddy.html"), "utf8") === html);
ok("placeholder replaced", !html.includes("{{BUNDLE}}"));
ok("title names Trig Buddy", /<title>Trig Buddy[^<]*<\/title>/.test(html));
ok("canonical", html.includes(`<link rel="canonical" href="${ORIGIN}">`));
ok("og:url + og:image on this origin", html.includes(`og:url" content="${ORIGIN}"`) && html.includes(`og:image" content="${ORIGIN}og-image.png"`));
ok("twitter image", html.includes(`twitter:image" content="${ORIGIN}og-image.png"`));
ok("no stale Triangle Buddy canonical", !html.includes('href="https://trianglebuddy.com/">\n<meta name="theme-color"'));
{
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let j = null; try { j = JSON.parse(m[1]); } catch {}
  ok("JSON-LD parses", !!j);
  const app = j && j["@graph"].find((g) => g["@type"] === "WebApplication");
  const faq = j && j["@graph"].find((g) => g["@type"] === "FAQPage");
  ok("JSON-LD WebApplication url", app && app.url === ORIGIN && app.name === "Trig Buddy");
  ok("JSON-LD FAQ has 6 questions", faq && faq.mainEntity.length === 6);
}
ok("BMC widget loads local ./widget.js", /<script data-name="BMC-Widget"[^>]*src="\.\/widget\.js"/.test(html));
{
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  ok("only external script is ./widget.js", srcs.length === 1 && srcs[0] === "./widget.js", srcs.join(","));
  const urls = [...html.matchAll(/url\((['"]?)(https?:[^'")]+)\1\)|@import url\('([^']+)'\)/g)].map((m) => m[2] || m[3]);
  ok("only Google Fonts is fetched at runtime", urls.every((u) => u.startsWith("https://fonts.googleapis.com/")), urls.join(","));
}
ok("crawlable footer present", html.includes('<footer id="about"') && html.includes("Frequently asked questions"));
ok("family links present", html.includes("https://trianglebuddy.com/") && html.includes("https://fractions.trianglebuddy.com/"));
ok("viewport disables zoom like the family", html.includes("user-scalable=no"));
ok("file size sane (< 400 KB)", html.length < 400 * 1024, `${html.length}`);
// ---- deploy set (all five files, every time) ----
for (const f of ["index.html", "widget.js", "og-image.png", "robots.txt", "sitemap.xml"]) ok(`deploy file present: ${f}`, fs.existsSync(path.join(ROOT, f)));
{
  const png = fs.readFileSync(path.join(ROOT, "og-image.png"));
  ok("og-image.png is a 1200×630 PNG", png.readUInt32BE(0) === 0x89504e47 && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630);
  ok("robots.txt points at this sitemap", fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8").includes(`Sitemap: ${ORIGIN}sitemap.xml`));
  ok("sitemap lists this origin", fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").includes(`<loc>${ORIGIN}</loc>`));
  ok("widget.js is the BMC widget", /bmc-wbtn/.test(fs.readFileSync(path.join(ROOT, "widget.js"), "utf8")));
}

// ---- boot checks ----
async function boot(phone) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.stack || e.message).split("\n")[0]));
  vc.on("error", (...a) => errors.push("console.error: " + a.map(String).join(" ").slice(0, 200)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: ORIGIN, virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({ matches: phone ? /coarse|hover:\s*none/.test(q) : false, media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      if (phone) {
        Object.defineProperty(win, "innerWidth", { configurable: true, value: 390 });
        Object.defineProperty(win, "innerHeight", { configurable: true, value: 844 });
      }
    },
  });
  await tick(150);
  return { doc: dom.window.document, errors };
}
(async () => {
  for (const phone of [true, false]) {
    const tag = phone ? "phone" : "desktop";
    const { doc, errors } = await boot(phone);
    ok(`${tag}: mounted`, !!doc.querySelector("#root .tg-root"));
    ok(`${tag}: version label ${VERSION}`, (doc.querySelector(".tg-version") || {}).textContent === VERSION);
    ok(`${tag}: title Trig·Buddy`, (doc.querySelector(".tg-title") || {}).textContent === "Trig·Buddy");
    ok(`${tag}: canvas svg rendered`, !!doc.querySelector("svg.tg-svg circle.tg-ring"));
    ok(`${tag}: six function tiles`, doc.querySelectorAll(".tg-tile").length === 6);
    ok(`${tag}: sin 30° shows exact 1/2`, /1\s*2/.test((doc.querySelector('.tg-tile[data-fn="sin"] .tg-tile-main') || {}).textContent || ""));
    ok(`${tag}: no runtime errors`, errors.length === 0, errors.join(" | "));
  }
  console.log(`VERIFY BUILT HTML: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR", e.stack); process.exit(2); });
