#!/usr/bin/env node
// Drives the BUILT index.html in jsdom through every mode on a phone (coarse
// pointer, 390x844, keypad sheet) and a desktop (fine pointer, popover).
// Run: node core/interaction-test.js
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}  ${d}`); } };
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));
const M = "−";

async function boot(phone) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.stack || e.message).split("\n")[0]));
  vc.on("error", (...a) => errors.push("console.error: " + a.map(String).join(" ").slice(0, 200)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://trig.trianglebuddy.com/", virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({ matches: phone ? /coarse|hover:\s*none/.test(q) : false, media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      Object.defineProperty(win, "innerWidth", { configurable: true, value: phone ? 390 : 1440 });
      Object.defineProperty(win, "innerHeight", { configurable: true, value: phone ? 844 : 900 });
    },
  });
  await tick(150);
  const win = dom.window, doc = win.document;
  const Ctor = win.PointerEvent || win.MouseEvent;
  const fire = (el, type, x = 100, y = 100, id = 1) => {
    const ev = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    try { Object.defineProperty(ev, "pointerId", { value: id }); } catch {}
    el.dispatchEvent(ev);
  };
  const $ = (s) => doc.querySelector(s);
  const all = (s) => [...doc.querySelectorAll(s)];
  const tap = async (el, dx = 0) => { fire(el, "pointerdown", 100, 100); await tick(); fire(el, "pointerup", 100 + dx, 100); await tick(); };
  const key = async (k) => { const b = all(".tg-key").find((x) => x.textContent === k); if (!b) throw new Error("no key " + k); fire(b, "pointerdown"); await tick(5); };
  const keys = async (ks) => { for (const k of ks) await key(k); };
  const click = async (sel, txt) => { const b = all(sel).find((x) => txt == null || x.textContent.trim() === txt || x.textContent.includes(txt)); if (!b) throw new Error(`no ${sel} ${txt || ""}`); b.click(); await tick(); };
  const status = () => ($(".tg-status") || {}).textContent;
  const tile = (fn) => ($(`.tg-tile[data-fn="${fn}"] .tg-tile-main`) || {}).textContent;
  const field = (t) => ($(`[data-field="${t}"]`) || {}).textContent;
  const cv = (t) => $(`svg.tg-svg [data-ed="${t}"]`);
  const drag = async (pts) => { const svg = $("svg.tg-svg"); fire(svg, "pointerdown", pts[0][0], pts[0][1], 7); await tick(5); for (const [x, y] of pts.slice(1)) { fire(svg, "pointermove", x, y, 7); await tick(5); } fire(svg, "pointerup", pts[pts.length - 1][0], pts[pts.length - 1][1], 7); await tick(); };
  const open = async (t) => { const b = $(`[data-field="${t}"]`); if (!b) throw new Error("no field " + t); b.click(); await tick(); };
  return { win, doc, errors, fire, $, all, tap, key, keys, click, status, tile, field, cv, drag, open };
}

(async () => {
  // =================== PHONE ===================
  const P = await boot(true);
  ok("phone: initial status", P.status() === "θ = 30° · Quadrant I", P.status());
  ok("phone: sin 30° exact 1/2", P.tile("sin") === "12", P.tile("sin"));
  ok("phone: no Both view on a narrow canvas", !P.all(".tg-seg-btn").some((b) => b.textContent === "Both"));

  await P.tap(P.cv("theta"), 40);
  ok("phone: dragging off the θ label does NOT open the sheet", !P.$(".tg-sheet"));
  await P.tap(P.cv("theta"));
  ok("phone: tap θ label opens keypad sheet", !!P.$(".tg-sheet") && P.$(".tg-ed-title").textContent === "Angle θ");
  ok("phone: coffee button hidden while sheet open", P.doc.body.classList.contains("tg-sheet-open"));
  ok("phone: keypad has π √ ° keys", ["π", "√", "°", "/", M].every((k) => P.all(".tg-key").some((b) => b.textContent === k)));
  await P.keys(["1", "5", "0"]);
  ok("phone: keypad types into field", P.$(".tg-ed-field").textContent === "150");
  await P.click(".tg-set");
  ok("phone: Set closes sheet", !P.$(".tg-sheet") && !P.doc.body.classList.contains("tg-sheet-open"));
  ok("phone: θ = 150° Quadrant II", P.status() === "θ = 150° · Quadrant II", P.status());
  ok("phone: cos 150° = −√3/2 exact", P.tile("cos") === `${M}√32`, P.tile("cos"));
  ok("phone: tan 150° = −√3/3 exact", P.tile("tan") === `${M}√33`, P.tile("tan"));

  await P.tap(P.cv("theta"));
  await P.keys(["5", "/", "0"]);
  await P.click(".tg-set");
  ok("phone: 5/0 flagged, sheet stays open", !!P.$(".tg-ed-field.is-err") && /zero/.test(P.$(".tg-ed-err").textContent));
  await P.key("C");
  await P.keys(["7", "π", "/", "4"]);
  ok("phone: π entry drafted", P.$(".tg-ed-field").textContent === "7π/4");
  await P.click(".tg-set");
  ok("phone: 7π/4 → 315° Quadrant IV", P.status() === "θ = 315° · Quadrant IV", P.status());
  ok("phone: sin 315° = −√2/2", P.tile("sin") === `${M}√22`, P.tile("sin"));
  await P.click(".tg-seg-btn", "RAD");
  ok("phone: RAD shows π form", P.status() === "θ = 7π/4 · Quadrant IV", P.status());
  await P.click(".tg-seg-btn", "DEG");

  // quick chip + tan undefined
  await P.click(".tg-quick .tg-chip", "90°");
  ok("phone: quick chip 90° → tan undefined", P.tile("tan") === "undefined" && P.status().includes("+y axis"), P.tile("tan") + " / " + P.status());

  // canvas drag in the circle view (jsdom canvas is the 640x420 fallback: circle at 320,210 R 180)
  const at = (d, r = 180) => [320 + r * Math.cos((d * Math.PI) / 180), 210 - r * Math.sin((d * Math.PI) / 180)];
  await P.drag([at(10, 120), at(61, 120)]);
  ok("phone: drag on circle lands on 60° (magnetic snap)", P.status() === "θ = 60° · Quadrant I", P.status());
  await P.drag([at(100, 150), at(200.3, 150)]);
  ok("phone: free drag off special angles stays free", /^θ = 200\.3\d*° · Quadrant III$/.test(P.status()), P.status());

  // ---- Inverse ----
  await P.click(".tg-mode", "Inverse");
  ok("phone: inverse keeps θ, v = sin θ", P.status().startsWith("sin θ = " + M + "0.34"), P.status());
  await P.open('inv');
  ok("phone: value sheet opens", P.$(".tg-ed-title") && P.$(".tg-ed-title").textContent === "Value");
  await P.keys([M, "1", "/", "2"]);
  await P.click(".tg-set");
  ok("phone: sin θ = −1/2 → 2 solutions", P.status() === `sin θ = ${M}1/2 · 2 solutions`, P.status());
  ok("phone: solutions 210°, 330°", P.all(".tg-sol").map((b) => b.textContent).join(",") === "210°,330°");
  ok("phone: θ jumps to principal −30°", P.cv("theta") === null && /arcsin\(−1\/2\) = −30°/.test(P.doc.body.textContent));
  await P.click(".tg-sol", "210°");
  ok("phone: picking 210° selects it", P.$(".tg-sol.is-on") && P.$(".tg-sol.is-on").textContent === "210°");
  await P.click(".tg-fnchip", "cos");
  ok("phone: switching to cos keeps θ = 210°, v = −√3/2", P.status() === `cos θ = ${M}√3/2 · 2 solutions`, P.status());
  ok("phone: cos solutions 150°, 210°", P.all(".tg-sol").map((b) => b.textContent).join(",") === "150°,210°");
  await P.open('inv');
  await P.keys(["2"]);
  await P.click(".tg-set");
  ok("phone: cos θ = 2 → no solution warning", /between −1 and 1/.test(P.status()) && !!P.$(".tg-warn"), P.status());
  ok("phone: solution circle markers gone when no solution", P.all("svg [data-sol]").length === 0);
  await P.open('inv');
  await P.keys(["√", "3", "/", "2"]);
  await P.click(".tg-set");
  ok("phone: cos θ = √3/2 → 30°, 330° markers on circle", P.all("svg [data-sol]").length === 2);

  // ---- Triangle ----
  await P.click(".tg-mode", "Triangle");
  ok("phone: triangle mode starts solved (θ, hyp)", P.status() === "Solved", P.status());
  ok("phone: θ coerced into (0°,90°)", P.field("theta") === "30°", P.field("theta"));
  ok("phone: opp computed 5", P.field("opp") === "5", P.field("opp"));
  await P.tap(P.cv("opp"));
  ok("phone: computed field sheet warns what it frees", /frees angle θ/.test(P.$(".tg-ed-hint").textContent), P.$(".tg-ed-hint") && P.$(".tg-ed-hint").textContent);
  await P.keys(["3"]);
  await P.click(".tg-next");
  ok("phone: Next closes once two are known", !P.$(".tg-sheet"));
  ok("phone: opp 3 + hyp 10 → θ 17.4576°", P.field("theta") === "17.4576°", P.field("theta"));
  ok("phone: adj = √91", P.field("adj") === "9.5394", P.field("adj"));
  await P.click(".tg-row-end .tg-flat", "Clear");
  ok("phone: cleared", P.status() === "Set any two values", P.status());
  await P.open('theta');
  await P.keys(["1", "2", "0"]);
  await P.click(".tg-next");
  ok("phone: θ 120 rejected in triangle mode", !!P.$(".tg-ed-field.is-err") && /between 0° and 90°/.test(P.$(".tg-ed-err").textContent));
  await P.key("C"); await P.keys(["3", "0"]);
  await P.click(".tg-next");
  ok("phone: Next jumps to the next free field", P.$(".tg-ed-title") && P.$(".tg-ed-title").textContent === "Opposite", P.$(".tg-ed-title") && P.$(".tg-ed-title").textContent);
  ok("phone: status 1 of 2 known", P.status() === "1 of 2 known", P.status());
  await P.keys(["5"]);
  await P.click(".tg-next");
  ok("phone: θ30 + opp5 → hyp 10, adj 8.6603", !P.$(".tg-sheet") && P.field("hyp") === "10" && P.field("adj") === "8.6603", `${P.field("hyp")} ${P.field("adj")}`);

  // ---- Sinusoid ----
  await P.click(".tg-mode", "Sinusoid");
  ok("phone: sinusoid defaults to the wave view", P.$(".tg-seg-btn.is-on[aria-pressed]") && P.all(".tg-seg-btn.is-on").some((b) => b.textContent === "Wave"));
  await P.open('A');
  await P.keys(["3"]); await P.click(".tg-next");
  ok("phone: Next A → B", P.$(".tg-ed-title").textContent === "Frequency B");
  await P.keys(["2"]); await P.click(".tg-next");
  await P.keys(["π", "/", "4"]); await P.click(".tg-next");
  ok("phone: Next C → D", P.$(".tg-ed-title").textContent === "Vertical shift D");
  await P.keys([M, "1"]); await P.click(".tg-next");
  ok("phone: Next after D closes", !P.$(".tg-sheet"));
  ok("phone: equation", P.status() === `y = 3 sin(2(x ${M} 45°)) ${M} 1`, P.status());
  ok("phone: period 180°, range −4 to 2", /Period 360°\/\|B\|180°/.test(P.doc.body.textContent) && P.doc.body.textContent.includes(`${M}4 to 2`));
  await P.open('B');
  await P.keys(["0"]); await P.click(".tg-set");
  ok("phone: B = 0 rejected", !!P.$(".tg-ed-field.is-err"));
  await P.click(".tg-ed-x");
  ok("phone: × closes the sheet", !P.$(".tg-sheet"));
  await P.click(".tg-flat", "Reset");
  ok("phone: Reset restores defaults", P.status() === `y = 2 sin(2(x ${M} 30°)) + 1`, P.status());
  ok("phone: no runtime errors", P.errors.length === 0, P.errors.join(" | "));

  // =================== DESKTOP ===================
  const D = await boot(false);
  const setVal = (el, v) => { Object.getOwnPropertyDescriptor(D.win.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new D.win.Event("input", { bubbles: true })); };
  const kd = (el, k, shift = false) => el.dispatchEvent(new D.win.KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  await D.tap(D.cv("theta"));
  ok("desktop: popover with native input, no sheet", !!D.$(".tg-pop input.tg-ed-in") && !D.$(".tg-sheet"));
  setVal(D.$(".tg-pop input"), "5pi/6"); await tick();
  kd(D.$(".tg-pop input"), "Enter"); await tick();
  ok("desktop: Enter sets + closes (5pi/6 → 150°)", !D.$(".tg-pop") && D.status() === "θ = 150° · Quadrant II", D.status());
  await D.open('theta');
  setVal(D.$(".tg-pop input"), "abc"); await tick();
  kd(D.$(".tg-pop input"), "Enter"); await tick();
  ok("desktop: bad input keeps popover with error", !!D.$(".tg-pop .tg-ed-err") && /Unexpected/.test(D.$(".tg-ed-err").textContent));
  kd(D.doc.body, "Escape"); await tick();
  ok("desktop: Esc closes popover", !D.$(".tg-pop"));
  ok("desktop: θ unchanged after cancel", D.status() === "θ = 150° · Quadrant II");
  // arrow-key nudge on the canvas
  const svg = D.$("svg.tg-svg");
  kd(svg, "ArrowRight"); await tick();
  ok("desktop: → nudges 1°", D.status() === "θ = 151° · Quadrant II", D.status());
  kd(svg, "ArrowLeft", true); await tick();
  ok("desktop: Shift+← nudges 15°", D.status() === "θ = 136° · Quadrant II", D.status());
  // sinusoid Tab flow
  await D.click(".tg-mode", "Sinusoid");
  await D.open('A');
  setVal(D.$(".tg-pop input"), "-1"); await tick();
  kd(D.$(".tg-pop input"), "Tab"); await tick();
  ok("desktop: Tab applies A and moves to B", D.$(".tg-ed-title").textContent === "Frequency B");
  setVal(D.$(".tg-pop input"), "1/2"); await tick();
  kd(D.$(".tg-pop input"), "Tab", true); await tick();
  ok("desktop: Shift+Tab goes back to A", D.$(".tg-ed-title").textContent === "Amplitude A");
  kd(D.doc.body, "Escape"); await tick();
  ok("desktop: A = −1, B = 1/2 applied", D.status() === `y = ${M}sin(0.5(x ${M} 30°)) + 1`, D.status());
  ok("desktop: period 720°", /Period 360°\/\|B\|720°/.test(D.doc.body.textContent));
  // outside click closes
  await D.open('D');
  ok("desktop: popover open for D", !!D.$(".tg-pop"));
  D.fire(D.$(".tg-section-title"), "pointerdown"); await tick();
  ok("desktop: outside click closes popover", !D.$(".tg-pop"));
  // inverse on desktop: canvas θ label is not editable there
  await D.click(".tg-mode", "Inverse");
  ok("desktop: no editable θ label in inverse mode", D.cv("theta") === null);
  ok("desktop: no runtime errors", D.errors.length === 0, D.errors.join(" | "));

  console.log(`\nINTERACTION TESTS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR", e.stack); process.exit(2); });
