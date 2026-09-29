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
ok(/<footer[\s\S]*href="https:\/\/trig\.trianglebuddy\.com\/"[\s\S]*<\/footer>/.test(html), "crawlable footer links to trig.trianglebuddy.com");
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
  // Wait for React 18's async commit: poll for the result marker (5 s cap) instead
  // of a fixed sleep, then settle so post-mount effects apply.
  for (const t0 = Date.now(); !dom.window.document.querySelector(".fb-result-main") && Date.now() - t0 < 5000; ) await new Promise(r => setTimeout(r, 10));
  await new Promise(r => setTimeout(r, 60));

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
  // v1.3.0 header family menu in the shipped file: closed button; open lists all three.
  const navBtn = doc.querySelector(".fb-head-end button.fb-nav-btn");
  ok(navBtn && navBtn.getAttribute("aria-label") === "More tools" && /Tools/.test(navBtn.textContent) && !!navBtn.querySelector("svg.fb-nav-ico") && navBtn.getAttribute("aria-expanded") === "false" && !doc.querySelector(".fb-nav-menu"), "header has a closed More tools menu");
  if (navBtn) {
    navBtn.click();
    for (const t0 = Date.now(); !doc.querySelector(".fb-nav-menu") && Date.now() - t0 < 2000; ) await new Promise(r => setTimeout(r, 10));
    const items = [...doc.querySelectorAll(".fb-nav-menu .fb-nav-item")];
    ok(items.length === 3 && items[0].href === "https://trianglebuddy.com/" && items[2].href === "https://trig.trianglebuddy.com/"
       && items[1].tagName === "SPAN" && items[1].getAttribute("aria-current") === "page" && /Fraction Buddy/.test(items[1].textContent),
       "menu lists Triangle, Fraction (current), Trig: " + items.map(i => i.outerHTML).join(" | "));
  }
  ok((doc.querySelector(".fb-version") || {}).textContent === "v" + require("../package.json").version, "version label matches package.json");
  const vf = doc.querySelector(".fb-app > .fb-version-foot");
  ok(vf && vf.textContent === "Fraction Buddy v" + require("../package.json").version && vf.nextElementSibling === doc.querySelector(".fb-app > a.fb-family"),
     "bottom version line sits just above the trianglebuddy.com link");
  // v1.1.0 regression: result fraction must NOT inherit the input column's fixed width.
  const sf = main && main.querySelector(".fb-sfrac");
  ok(sf && dom.window.getComputedStyle(sf).width !== "64px", "result fraction not forced to the input column's 64px width");
  const inf = doc.querySelector(".fb-term .fb-infrac");
  ok(inf && dom.window.getComputedStyle(inf).display === "flex", "input fraction column keeps display:flex (no bleed from result rule)");

  console.log(`\n[built-html] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
