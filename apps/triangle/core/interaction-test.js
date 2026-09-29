#!/usr/bin/env node
// Drives the BUILT index.html in jsdom through the on-canvas edit + solve flow,
// phone (coarse pointer, 390x844) and desktop. Run: node core/interaction-test.js
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}  ${d}`); } };
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));

async function boot(phone) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.stack || e.message).split("\n")[0]));
  vc.on("error", (...a) => errors.push("console.error: " + a.map(String).join(" ").slice(0, 200)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://trianglebuddy.com/", virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({ matches: phone ? /coarse|hover:\s*none/.test(q) : false, media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      win.Element.prototype.scrollIntoView = function () {};
      if (phone) {
        Object.defineProperty(win, "innerWidth", { configurable: true, value: 390 });
        Object.defineProperty(win, "innerHeight", { configurable: true, value: 844 });
      }
    },
  });
  const win = dom.window, doc = win.document;
  // Wait for the app to mount (9 on-canvas targets) instead of a fixed sleep: a cold
  // first boot measured up to ~180 ms, which lost the race with the old tick(120).
  // Then keep the original 120 ms settle so post-mount effects (pointer, viewport) apply.
  for (const t0 = Date.now(); doc.querySelectorAll("[data-ed]").length < 9 && Date.now() - t0 < 5000; ) await tick(10);
  await tick(120);
  const Ctor = win.PointerEvent || win.MouseEvent;
  const fire = (el, type, x = 100, y = 100, id = 1) => {
    const ev = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    try { Object.defineProperty(ev, "pointerId", { value: id }); } catch {}
    el.dispatchEvent(ev);
  };
  const tap = async (el, dx = 0) => { fire(el, "pointerdown", 100, 100); await tick(); fire(el, "pointerup", 100 + dx, 100); await tick(); };
  const $ = (sel) => doc.querySelector(sel);
  const all = (sel) => [...doc.querySelectorAll(sel)];
  const key = async (label) => { const b = all(".tc-key").find((x) => x.textContent === label); if (!b) throw new Error("no key " + label); fire(b, "pointerdown"); await tick(); };
  const click = async (sel, txt) => { const b = all(sel).find((x) => !txt || x.textContent.includes(txt)); if (!b) throw new Error(`no ${sel} ${txt || ""}`); b.click(); await tick(); };
  const status = () => ($(".tc-status") || {}).textContent;
  const label = (id) => { const t = all(`[data-ed="${id}"] text`); return t.length ? t[t.length - 1].textContent : null; };
  return { win, doc, errors, fire, tap, $, all, key, click, status, label };
}

// Header ToolNav with 3 tools: closed "More tools" button; opening it lists all three,
// current tool (Triangle) marked and not a link, siblings link to their subdomains.
async function checkNav(A, tag) {
  const btn = A.$(".tc-head-end button.tc-nav-btn");
  ok(`${tag}: header has closed More tools menu`, !!btn && btn.getAttribute("aria-label") === "More tools" && btn.textContent.includes("Tools") && !!btn.querySelector("svg.tc-nav-ico") && btn.getAttribute("aria-expanded") === "false" && !A.$(".tc-nav-menu"), btn && btn.outerHTML);
  if (!btn) return;
  btn.click(); await tick();
  const items = A.all(".tc-nav-menu .tc-nav-item");
  ok(`${tag}: menu lists Triangle (current), Fraction, Trig`,
    items.length === 3 && items[0].tagName === "SPAN" && items[0].getAttribute("aria-current") === "page" && items[0].textContent.includes("Triangle Buddy")
    && items[1].href === "https://fractions.trianglebuddy.com/" && items[1].textContent.includes("Fraction Buddy")
    && items[2].href === "https://trig.trianglebuddy.com/" && items[2].textContent.includes("Trig Buddy"),
    items.map((i) => i.outerHTML).join(" | "));
  A.doc.dispatchEvent(new A.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick();
  ok(`${tag}: Esc closes the menu`, !A.$(".tc-nav-menu") && btn.getAttribute("aria-expanded") === "false");
}

(async () => {
  // =================== PHONE ===================
  const P = await boot(true);
  ok("phone: renders 6 value targets + 3 vertices", P.all("[data-ed]").length === 9, `got ${P.all("[data-ed]").length}`);
  ok("phone: idle status", P.status() === "Tap a value to set it", P.status());
  await checkNav(P, "phone");
  ok("phone: version label v1.18.0", (P.$(".tc-version") || {}).textContent === "v1.18.0");
  ok("phone: detail panels collapsed", !!P.$(".tc-details") && !P.all(".tc-section-title").some((e) => e.textContent === "Sides"));
  await P.click(".tc-details");
  ok("phone: Details expands Sides panel", P.all(".tc-section-title").some((e) => e.textContent === "Sides"));

  await P.tap(P.$('[data-ed="edge-a"]'));
  ok("tap label a opens keypad sheet", !!P.$(".tc-sheet") && P.$(".tc-ed-title").textContent.includes("Side a"));
  ok("imperial keypad has feet/inch/fraction keys", ["\u2032", "\u2033", "/", "-"].every((k) => P.all(".tc-key").some((b) => b.textContent === k)));
  await P.key("6");
  ok("keypad types into field", P.$(".tc-ed-field").textContent.includes("6"));
  await P.click(".tc-set");
  ok("Set closes sheet", !P.$(".tc-sheet"));
  ok("status 1 of 3 known", P.status() === "1 of 3 known", P.status());
  ok("label a shows 6", (P.label("edge-a") || "").startsWith("6"), P.label("edge-a"));

  // solve SSS 6-8-10 via Next: b -> (Next jumps to next FREE = c) -> Next closes when solved
  await P.tap(P.$('[data-ed="edge-b"]'));
  await P.key("8");
  await P.click(".tc-next");
  ok("Next jumps to side c", !!P.$(".tc-sheet") && P.$(".tc-ed-title").textContent.includes("Side c"), P.$(".tc-ed-title") && P.$(".tc-ed-title").textContent);
  await P.key("1"); await P.key("0");
  await P.click(".tc-next");
  ok("Next closes sheet once solved", !P.$(".tc-sheet"));
  ok("status Solved", P.status() === "Solved", P.status());
  ok("missing angle C computed = 90.0°", P.label("angle-C") === "90.0\u00B0", P.label("angle-C"));
  ok("missing angle A computed = 36.9°", P.label("angle-A") === "36.9\u00B0", P.label("angle-A"));
  ok("computed angle drawn muted", P.$('[data-ed="angle-C"] text').getAttribute("fill") === "#5f9e95");
  ok("entered side drawn brass", P.$('[data-ed="edge-a"] text:last-of-type').getAttribute("fill") === "#e0b46a");

  // computed value: editor offers unlocks, then becomes editable
  await P.tap(P.$('[data-ed="angle-C"]'));
  ok("tap computed angle shows unlock choices", !!P.$(".tc-ed-computed") && P.all(".tc-ed-chips .tc-chip").length === 3);
  await P.click(".tc-ed-chips .tc-chip", "Unlock a");
  ok("unlocking a input -> 2 of 3 known", P.status() === "2 of 3 known", P.status());
  ok("angle C now editable (keypad shown)", !!P.$(".tc-keypad"));
  ok("angle keypad has no feet/inch keys", !P.all(".tc-key").some((b) => b.textContent === "\u2032"));
  await P.key("2"); await P.key("0"); await P.key("0");
  await P.click(".tc-set");
  ok("invalid angle 200 flagged, sheet stays open", !!P.$(".tc-ed-field.is-err") && !!P.$(".tc-sheet"));
  await P.key("\u232B"); await P.key("\u232B");
  ok("backspace edits draft", P.$(".tc-ed-field").textContent.startsWith("2") && !P.$(".tc-ed-field").textContent.startsWith("20"));
  await P.click(".tc-ed-x");
  ok("close button dismisses", !P.$(".tc-sheet"));

  // vertex: tap opens X/Y + Pin; drag does not open
  await P.tap(P.$('[data-ed="vertex-A"]'), 40);
  ok("vertex drag (40px) does NOT open editor", !P.$(".tc-sheet"));
  await P.tap(P.$('[data-ed="vertex-A"]'));
  ok("vertex tap opens vertex editor", !!P.$(".tc-sheet") && P.$(".tc-ed-title").textContent.includes("Vertex A") && P.all(".tc-ed-xy .tc-ed-field").length === 2);
  await P.click(".tc-pill");
  ok("Pin toggles on", P.$(".tc-pill").textContent.includes("Pinned"));
  ok("coffee button hidden while sheet open", P.doc.body.classList.contains("tc-sheet-open"));
  await P.tap(P.$('[data-ed="vertex-A"]'));
  ok("tapping same vertex again closes", !P.$(".tc-sheet") && !P.doc.body.classList.contains("tc-sheet-open"));
  ok("phone: no runtime errors", P.errors.length === 0, P.errors.join(" | "));

  // =================== DESKTOP ===================
  const D = await boot(false);
  await checkNav(D, "desktop");
  ok("desktop: version label v1.18.0", (D.$(".tc-version") || {}).textContent === "v1.18.0");
  await D.tap(D.$('[data-ed="edge-a"]'));
  ok("desktop: popover with native input, no sheet", !!D.$(".tc-pop input.tc-ed-in") && !D.$(".tc-sheet"));
  const setVal = (el, v) => { Object.getOwnPropertyDescriptor(D.win.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new D.win.Event("input", { bubbles: true })); };
  const kd = (el, k, shift = false) => el.dispatchEvent(new D.win.KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  setVal(D.$(".tc-pop input"), "7"); await tick();
  kd(D.$(".tc-pop input"), "Enter"); await tick();
  ok("desktop: Enter sets + closes", !D.$(".tc-pop") && D.status() === "1 of 3 known", D.status());
  ok("desktop: label a shows 7", (D.label("edge-a") || "").startsWith("7"), D.label("edge-a"));
  await D.tap(D.$('[data-ed="edge-b"]'));
  setVal(D.$(".tc-pop input"), "5-1/2"); await tick();
  kd(D.$(".tc-pop input"), "Tab"); await tick();
  ok("desktop: Tab applies b and moves to c", !!D.$(".tc-pop") && D.$(".tc-ed-title").textContent.includes("Side c") && D.status() === "2 of 3 known", D.status());
  ok("desktop: fraction entry 5-1/2 applied", (D.label("edge-b") || "").startsWith("5"), D.label("edge-b"));
  kd(D.doc.body, "Escape"); await tick();
  ok("desktop: Esc closes popover", !D.$(".tc-pop"));
  ok("desktop: no runtime errors", D.errors.length === 0, D.errors.join(" | "));

  console.log(`\nINTERACTION TESTS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR", e.stack); process.exit(2); });
