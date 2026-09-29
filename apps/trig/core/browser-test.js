#!/usr/bin/env node
// Real-browser gate (Chromium via playwright-core): the BUILT index.html on a
// phone profile (touch, 390x844), a landscape phone, a tablet, and a desktop.
// Checks what jsdom can't: real layout, overflow, label bounds, touch drags,
// keypad sheet geometry, the coffee button hiding, and popover focus.
// Screenshots land in .browser-shots/ for human review.
// Run: node core/browser-test.js   (CHROMIUM=/path/to/chrome to override)
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, ".browser-shots");
const EXE = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}  ${d}`); } };
const M = "−";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain" };
const server = http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]));
  if (p.endsWith("/")) p += "index.html";
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); r.end(b); } });
});

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|ERR_FAILED/.test(m.text())) errors.push("console: " + m.text()); });
  const base = `http://localhost:${server.address().port}/`;
  await page.route("**/*", (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await page.goto(base);
  await page.waitForSelector("svg.tg-svg circle.tg-ring, svg.tg-svg .tg-plot-bg");
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}
const status = (page) => page.$eval(".tg-status", (e) => e.textContent);
// circle geometry in page px from the drawn ring
const ring = (page) => page.$eval("svg.tg-svg circle.tg-ring", (c) => { const r = c.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 }; });
const onRing = (g, d, k = 1) => [g.cx + g.R * k * Math.cos((d * Math.PI) / 180), g.cy - g.R * k * Math.sin((d * Math.PI) / 180)];
const plot = (page) => page.$eval("svg.tg-svg rect.tg-plot-bg", (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
async function touchDrag(page, pts) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const [x, y] of pts.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(60);
}
async function mouseDrag(page, pts) {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.up(); await page.waitForTimeout(60);
}
// every canvas label box sits inside the canvas; no horizontal page overflow
async function layoutChecks(page, tag) {
  const r = await page.evaluate(() => {
    const svg = document.querySelector("svg.tg-svg"), s = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const out = [...svg.querySelectorAll(".tg-cv-label rect:last-of-type")].map((e) => e.getBoundingClientRect())
      .filter((b) => b.left < s.left - 1 || b.right > s.right + 1 || b.top < s.top - 1 || b.bottom > s.bottom + 1).length;
    return { overflowX: document.documentElement.scrollWidth - innerWidth, out, vbW: vb.width, vbH: vb.height, w: Math.round(s.width), h: Math.round(s.height), right: s.right, vw: innerWidth };
  });
  ok(`${tag}: no horizontal page overflow`, r.overflowX <= 0, `overflow ${r.overflowX}px`);
  ok(`${tag}: canvas labels inside the canvas`, r.out === 0, `${r.out} outside`);
  ok(`${tag}: viewBox tracks the element size`, r.vbW === r.w && r.vbH === r.h, `vb ${r.vbW}x${r.vbH} el ${r.w}x${r.h}`);
  ok(`${tag}: canvas within the viewport width`, r.right <= r.vw + 0.5, `${r.right} > ${r.vw}`);
}
async function eachMode(page, tag, fn) {
  for (const m of ["Angle", "Inverse", "Triangle", "Sinusoid"]) {
    await page.click(`.tg-mode:text-is("${m}")`);
    await page.waitForTimeout(120);
    await fn(m);
  }
  await page.click(`.tg-mode:text-is("Angle")`);
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ executablePath: EXE });

  // =================== PHONE (portrait, touch) ===================
  {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await eachMode(page, "phone", async (m) => {
      await layoutChecks(page, `phone ${m}`);
      await page.screenshot({ path: path.join(SHOTS, `phone-${m}.png`) });
    });
    // touch drag the point around the circle
    let g = await ring(page);
    await touchDrag(page, [onRing(g, 30), onRing(g, 70), onRing(g, 110), onRing(g, 134.2)]);
    ok("phone: touch drag the point to 135°", (await status(page)) === "θ = 135° · Quadrant II", await status(page));
    // tap the θ label → keypad sheet
    const lab = await page.$('svg.tg-svg [data-ed="theta"] rect:last-of-type');
    const lb = await lab.boundingBox();
    await page.touchscreen.tap(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.waitForTimeout(120);
    const sheet = await page.$(".tg-sheet");
    ok("phone: tapping the θ label opens the sheet", !!sheet);
    const sb = await sheet.boundingBox();
    ok("phone: sheet fits the screen", sb.y >= 0 && sb.y + sb.height <= 844 + 0.5 && sb.width <= 390 + 0.5, JSON.stringify(sb));
    const keyH = await page.$$eval(".tg-key", (ks) => Math.min(...ks.map((k) => k.getBoundingClientRect().height)));
    ok("phone: keypad keys ≥ 44px tall", keyH >= 44, `${keyH}`);
    const bmcHidden = await page.evaluate(() => { const b = document.getElementById("bmc-wbtn"); return b ? getComputedStyle(b).display === "none" : "absent"; });
    ok("phone: coffee button hidden under the sheet", bmcHidden === true, String(bmcHidden));
    const onTop = await page.evaluate(() => { const s = document.querySelector(".tg-sheet").getBoundingClientRect(); const e = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2); return !!(e && e.closest(".tg-sheet")); });
    ok("phone: sheet is the top layer (above the coffee widget)", onTop);
    await page.screenshot({ path: path.join(SHOTS, "phone-sheet.png") });
    for (const k of ["4", "5"]) await page.tap(`.tg-key:text-is("${k}")`);
    ok("phone: each key tap types once", (await page.$eval(".tg-ed-field", (e) => e.textContent)) === "45", await page.$eval(".tg-ed-field", (e) => e.textContent));
    await page.tap(".tg-set");
    await page.waitForTimeout(100);
    ok("phone: keypad 45 → θ = 45°", (await status(page)) === "θ = 45° · Quadrant I", await status(page));
    const bmcBack = await page.evaluate(() => { const b = document.getElementById("bmc-wbtn"); return b ? getComputedStyle(b).display !== "none" : "absent"; });
    ok("phone: coffee button back after closing", bmcBack === true, String(bmcBack));
    // wave view: scrub along the wave
    await page.tap('.tg-seg-btn:text-is("Wave")');
    await page.waitForTimeout(120);
    const pl = await plot(page);
    const xAt = (d) => pl.left + ((pl.right - pl.left) * d) / 360;
    await touchDrag(page, [[xAt(100), (pl.top + pl.bottom) / 2], [xAt(200), pl.top + 40], [xAt(268), pl.top + 60]]);
    ok("phone: scrub the wave to 270°", (await status(page)).startsWith("θ = 270°"), await status(page));
    await layoutChecks(page, "phone wave");
    // vertical page scroll still works outside the canvas
    await page.evaluate(() => window.scrollTo(0, 600));
    ok("phone: page scrolls", (await page.evaluate(() => window.scrollY)) > 500);
    await page.evaluate(() => window.scrollTo(0, 0));

    // ---- regression (reported on iPhone, v0.1.0): toolbars sliding away while scrolling
    //      change only the viewport HEIGHT; the canvas must not rescale with them ----
    const cvSize = () => page.$eval("svg.tg-svg", (s) => ({ h: Math.round(s.getBoundingClientRect().height), vb: s.getAttribute("viewBox") }));
    const before = await cvSize();
    for (const h of [844 + 60, 844 + 118, 844 + 30]) { await page.setViewportSize({ width: 390, height: h }); await page.waitForTimeout(120); }
    const during = await cvSize();
    ok("phone: toolbar show/hide (height-only resize) leaves the canvas size alone", during.h === before.h && during.vb === before.vb, `${JSON.stringify(before)} → ${JSON.stringify(during)}`);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(150);
    const rotated = await cvSize();
    ok("phone: rotation still re-fits the canvas", rotated.vb !== before.vb, `${before.vb} → ${rotated.vb}`);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
    ok("phone: rotating back restores the size", (await cvSize()).vb === before.vb, `${before.vb} vs ${(await cvSize()).vb}`);

    // ---- regression (reported on iPhone, v0.1.0): a chip tapped OFF must not keep a
    //      highlight border (WebKit keeps :hover on the last tapped element) ----
    await page.tap('.tg-fn:text-is("cos")'); await page.waitForTimeout(350);   // past the .15s border transition
    const cosOff = await page.$eval('.tg-fn:text-is("cos")', (e) => ({ on: e.getAttribute("aria-pressed"), border: getComputedStyle(e).borderTopColor }));
    ok("phone: chip tapped off shows the plain border", cosOff.on === "false" && cosOff.border === "rgb(42, 51, 68)", JSON.stringify(cosOff));
    await page.tap('.tg-fn:text-is("cos")'); await page.waitForTimeout(60);
    const stray = await page.evaluate(() => {
      const out = [];
      for (const ss of document.styleSheets) { let rules; try { rules = ss.cssRules; } catch (e) { continue; }
        for (const r of rules) if (r.selectorText && /:hover/.test(r.selectorText)) out.push(r.selectorText); }
      return out;
    });
    ok("css: every :hover rule sits inside a (hover: hover) media query", stray.length === 0, stray.join(" | "));

    // ---- ring labels never sit on the Inverse guide line (sin θ = 1 crossed 60°/120°) ----
    await page.tap('.tg-mode:text-is("Inverse")'); await page.waitForTimeout(100);
    await page.tap('.tg-seg-btn:text-is("Circle")'); await page.waitForTimeout(100);
    for (const v of ["1", "√3/2", "1/2", "0"]) {
      await page.tap('[data-field="inv"]'); await page.waitForTimeout(60);
      await page.tap('.tg-key:text-is("C")');
      for (const k of v) await page.tap(`.tg-key:text-is("${k}")`);
      await page.tap(".tg-set"); await page.waitForTimeout(100);
      const hit = await page.evaluate(() => {
        const ln = document.querySelector("svg.tg-svg .tg-invline"); if (!ln) return "no guide line";
        const lb = ln.getBoundingClientRect(), y = (lb.top + lb.bottom) / 2;
        return [...document.querySelectorAll("svg.tg-svg .tg-ring-label")].map((t) => [t.textContent, t.getBoundingClientRect()])
          .filter(([, b]) => b.top - 2 < y && b.bottom + 2 > y).map(([s]) => s).join(",");
      });
      ok(`phone: sin θ = ${v} guide line crosses no ring label`, hit === "", hit);
    }
    await page.tap('.tg-mode:text-is("Angle")'); await page.waitForTimeout(80);
    ok("phone: no runtime errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // =================== PHONE LANDSCAPE + TABLET ===================
  for (const [tag, vp] of [["landscape", { width: 844, height: 390 }], ["tablet", { width: 820, height: 1180 }]]) {
    const { ctx, page, errors } = await open(browser, { viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const views = await page.$$eval(".tg-seg-btn", (b) => b.map((x) => x.textContent));
    ok(`${tag}: Both view offered on a wide canvas`, views.includes("Both"), views.join(","));
    await eachMode(page, tag, async (m) => {
      await layoutChecks(page, `${tag} ${m}`);
      await page.screenshot({ path: path.join(SHOTS, `${tag}-${m}.png`) });
    });
    ok(`${tag}: no runtime errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // =================== DESKTOP ===================
  {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } });
    const on = await page.$eval(".tg-seg-btn.is-on[aria-pressed='true']:not(:text-is('DEG'))", (e) => e.textContent).catch(() => null);
    const views = await page.$$eval(".tg-canvas-card .tg-seg-btn.is-on", (b) => b.map((x) => x.textContent));
    ok("desktop: linked Both view is the default", views.includes("Both"), `${on} ${views}`);
    const card = await page.$eval(".tg-canvas-card", (e) => e.getBoundingClientRect().bottom);
    ok("desktop: the tool fits the viewport height", card <= 900, `${card}`);
    await eachMode(page, "desktop", async (m) => {
      await layoutChecks(page, `desktop ${m}`);
      await page.screenshot({ path: path.join(SHOTS, `desk-${m}.png`) });
      const clipped = await page.$$eval(".tg-controls .tg-section", (ss) => ss.filter((s) => s.scrollHeight > s.clientHeight + 1).length);
      ok(`desktop ${m}: no panel section is squashed`, clipped === 0, `${clipped} clipped`);
    });
    let g = await ring(page);
    await mouseDrag(page, [onRing(g, 30, 0.8), onRing(g, 180, 0.8), onRing(g, 225.4, 0.8)]);
    ok("desktop: mouse drag on the circle to 225°", (await status(page)) === "θ = 225° · Quadrant III", await status(page));
    // linked wave: drag along it to 90°
    const pl = await plot(page);
    const xAt = (d) => pl.left + ((pl.right - pl.left) * d) / 360;
    await mouseDrag(page, [[xAt(40), pl.top + 30], [xAt(89.4), pl.top + 30]]);
    ok("desktop: drag the linked wave to 90°", (await status(page)) === "θ = 90° · on the +y axis", await status(page));
    ok("desktop: tan 90° undefined", (await page.$eval('.tg-tile[data-fn="tan"] .tg-tile-main', (e) => e.textContent)) === "undefined");
    // keyboard nudges after a canvas press
    await page.keyboard.press("ArrowRight");
    ok("desktop: → after pressing the canvas nudges 1°", (await status(page)) === "θ = 91° · Quadrant II", await status(page));
    // popover: focus + entry
    const tl = await (await page.$('svg.tg-svg [data-ed="theta"] rect:last-of-type')).boundingBox();
    await page.mouse.click(tl.x + tl.width / 2, tl.y + tl.height / 2);
    await page.waitForTimeout(80);
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("tg-ed-in"));
    ok("desktop: popover input has focus", focused);
    const pb = await (await page.$(".tg-pop")).boundingBox();
    ok("desktop: popover inside the viewport", pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= 1440 && pb.y + pb.height <= 900, JSON.stringify(pb));
    await page.keyboard.type("2pi/3");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    ok("desktop: typed 2pi/3 → 120°", (await status(page)) === "θ = 120° · Quadrant II", await status(page));
    // sinusoid phasor drag: top of the phasor circle → u = 90° → x = C + 90/B = 75°, y = max 3
    await page.click('.tg-mode:text-is("Sinusoid")');
    await page.waitForTimeout(100);
    g = await ring(page);
    await mouseDrag(page, [onRing(g, 20, 0.7), onRing(g, 60, 0.7), onRing(g, 90.8, 0.7)]);
    const yRow = await page.$$eval(".tg-kv", (rows) => { const r = rows.find((x) => x.textContent.startsWith("y at x")); return r && r.textContent; });
    ok("desktop: phasor drag to the top → x = 75°, y = 3", yRow === "y at x = 75°3", yRow);
    await page.screenshot({ path: path.join(SHOTS, "desk-sinusoid-phasor.png") });

    // ---- stress: extreme inputs must render cleanly (no errors, no NaN, labels in bounds) ----
    const typeInto = async (field, text) => {
      await page.click(`[data-field="${field}"]`); await page.waitForTimeout(40);
      await page.keyboard.type(text); await page.keyboard.press("Enter"); await page.waitForTimeout(80);
    };
    const noNaN = async () => !(await page.evaluate(() => document.querySelector("svg.tg-svg").outerHTML.includes("NaN")));
    await typeInto("B", "100");
    ok("stress: B = 100 renders (short window ticks)", (await noNaN()) && (await page.$$eval("svg .tg-tick-label", (e) => e.length)) >= 4);
    await typeInto("B", "0.01");
    ok("stress: B = 0.01 renders", await noNaN());
    await typeInto("A", "1000000");
    ok("stress: A = 1e6 renders", await noNaN());
    await layoutChecks(page, "stress sinusoid");
    await page.click('.tg-flat:has-text("Reset")');
    await page.click('.tg-mode:text-is("Angle")'); await page.waitForTimeout(60);
    await page.click('.tg-fn:text-is("tan")');
    for (const a of ["89.9999999", "-1000000", "1e6"]) {
      await page.click('[data-field="theta"]'); await page.waitForTimeout(40);
      await page.keyboard.type(a); await page.keyboard.press("Enter"); await page.waitForTimeout(80);
      const st = await status(page);
      ok(`stress: θ = ${a} handled`, (await noNaN()) && (a === "1e6" ? !!(await page.$(".tg-pop .tg-ed-err")) : /^θ = /.test(st)), st);
      if (await page.$(".tg-pop")) await page.keyboard.press("Escape");
    }
    await layoutChecks(page, "stress angle");
    const maxCoord = await page.evaluate(() => Math.max(...[...document.querySelectorAll("svg.tg-svg line")].flatMap((l) => ["x1", "y1", "x2", "y2"].map((k) => Math.abs(+l.getAttribute(k) || 0)))));
    ok("stress: tangent geometry stays bounded near 90°", maxCoord < 1e5, `${maxCoord}`);
    await page.click('.tg-mode:text-is("Inverse")'); await page.waitForTimeout(60);
    await page.click('.tg-fnchip:text-is("tan")');
    await typeInto("inv", "1000000000000");
    ok("stress: tan θ = 1e12 → 2 solutions", /· 2 solutions$/.test(await status(page)) && (await noNaN()), await status(page));

    // ---- drag performance: 120 moves through the linked view ----
    await page.click('.tg-mode:text-is("Angle")'); await page.waitForTimeout(60);
    g = await ring(page);
    const ms = await page.evaluate(async (g) => {
      const svg = document.querySelector("svg.tg-svg");
      const ev = (type, d) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, isPrimary: true,
        clientX: g.cx + 0.8 * g.R * Math.cos(d * Math.PI / 180), clientY: g.cy - 0.8 * g.R * Math.sin(d * Math.PI / 180) });
      svg.dispatchEvent(ev("pointerdown", 1));
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) { svg.dispatchEvent(ev("pointermove", 1 + i * 2.9)); await new Promise((r) => setTimeout(r, 0)); }
      await new Promise((r) => requestAnimationFrame(() => r()));
      const t1 = performance.now();
      svg.dispatchEvent(ev("pointerup", 349));
      return (t1 - t0) / 120;
    }, g);
    console.log(`INFO drag cost ≈ ${ms.toFixed(2)} ms per move (Both view, sin+cos+tan shown)`);
    ok("perf: a drag move costs < 16 ms (60 fps budget)", ms < 16, `${ms.toFixed(2)} ms`);
    ok("desktop: no runtime errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\nBROWSER TESTS: ${pass} passed, ${fail} failed (screenshots in .browser-shots/)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR", e.stack); server.close(); process.exit(2); });
