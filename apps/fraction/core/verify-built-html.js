#!/usr/bin/env node
/*
  Built-HTML verification
  =======================
  Loads the FINAL deployable (../fraction-buddy.html) in jsdom, runs its inlined
  bundle (runScripts:"dangerously"), waits for React 18's async commit, then
  asserts the real, rendered DOM. End-to-end gate: smoke-render proves the
  *component* renders; this proves the *shipped file* — bundle + template +
  mount tail — actually boots in a browser-like DOM and produces correct,
  numeric-keypad-ready inputs.

  Offline: the only external refs are Google Fonts <link>s and the BMC widget
  companion (./widget.js). jsdom is constructed without a resource loader, so
  none are fetched.
*/
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = path.resolve(__dirname, "..", "fraction-buddy.html");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  FAIL:", msg); } }

const html = fs.readFileSync(HTML, "utf8");

// ---- static checks on the file text ------------------------------------
ok(html.includes('<div id="root"></div>'), "has #root mount point");
ok(!html.includes("{{BUNDLE}}"), "placeholder fully replaced");
ok(html.includes('<link rel="canonical" href="https://fractions.trianglebuddy.com/">'), "canonical = fractions.trianglebuddy.com");
ok(html.includes('content="https://fractions.trianglebuddy.com/og-image.png"'), "og:image on the new host");
ok(!html.includes("fractionbuddy.com"), "no stale fractionbuddy.com references");
ok(/<footer[\s\S]*href="https:\/\/trianglebuddy\.com\/"[\s\S]*<\/footer>/.test(html), "crawlable footer links back to trianglebuddy.com");
ok(html.includes("createRoot"), "mount tail present in bundle");
ok(/<script>[\s\S]{1000,}<\/script>/.test(html), "inlined bundle script present");
// Self-contained: the ONLY external script is the BMC widget companion.
const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
ok(srcs.length === 1 && /widget\.js$/.test(srcs[0]),
   "only external script is the BMC companion ./widget.js: " + JSON.stringify(srcs));

// ---- boot the file in jsdom and assert the live DOM --------------------
const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => jsErrors.push(e.message || String(e)));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,   // provides requestAnimationFrame for React's scheduler
  virtualConsole: vc,
});
// Provide matchMedia for completeness (component guards its absence, but a
// desktop-like stub exercises the real coarse-pointer code path).
dom.window.matchMedia = dom.window.matchMedia || function (q) {
  return { matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } };
};

(async () => {
  // Let React 18 flush its async commit (scheduler uses timers/microtasks).
  for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 20)); }

  ok(jsErrors.length === 0, "no JS errors during boot" + (jsErrors.length ? " -> " + jsErrors.join(" | ") : ""));

  const doc = dom.window.document;
  const root = doc.getElementById("root");
  ok(root && root.childElementCount > 0, "bundle mounted into #root (rendered children)");

  const text = (root && root.textContent) || "";
  ok(/Fraction/.test(text), "title text rendered");
  const main = doc.querySelector(".fb-result-main");
  ok(main && main.getAttribute("aria-label") === "3/4", "main result aria-label = '3/4' (1/2 + 1/4)");
  ok(main && !!main.querySelector(".fb-sfrac") && !!main.querySelector(".fb-sfrac-bar"),
     "result renders as a stacked fraction in the shipped file");

  // Mobile requirement, verified on the SHIPPED file's real DOM nodes.
  const valueInputs = [...doc.querySelectorAll('input[type="text"]')];
  ok(valueInputs.length >= 6, `>=6 numeric fields present (got ${valueInputs.length})`);
  const allNumeric = valueInputs.length > 0 && valueInputs.every(i =>
    i.getAttribute("inputmode") === "numeric" &&
    i.getAttribute("pattern") === "[0-9]*"
  );
  ok(allNumeric, "every value input has inputmode=numeric + pattern=[0-9]* (numeric keypad)");
  ok(doc.querySelectorAll(".fb-ops .fb-opbtn").length === 4, "one 4-button operator picker between the 2 default rows");
  ok(!!doc.querySelector('.fb-app a.fb-family[href="https://trianglebuddy.com/"]'), "in-app link back to trianglebuddy.com");
  // v1.1.0 regression: result fraction must NOT inherit the input column's fixed width.
  const sf = main && main.querySelector(".fb-sfrac");
  ok(sf && dom.window.getComputedStyle(sf).width !== "64px", "result fraction not forced to the input column's 64px width");
  const inf = doc.querySelector(".fb-term .fb-infrac");
  ok(inf && dom.window.getComputedStyle(inf).display === "flex", "input fraction column keeps display:flex (no bleed from result rule)");

  console.log(`\n[built-html] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
