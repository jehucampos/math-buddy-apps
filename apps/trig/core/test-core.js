#!/usr/bin/env node
// Tests [SEC:CORE] straight from the shipped JSX: strip imports + the component,
// bundle with esbuild, require the helpers. No separate logic file to keep in
// sync. Run: node core/test-core.js
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), TMP = path.join(ROOT, ".test-core");
fs.mkdirSync(TMP, { recursive: true });
const src = fs.readFileSync(path.join(ROOT, "TrigCalculator.jsx"), "utf8")
  .replace(/^import (\w+), \{([^}]*)\} from "([^"]+)";?$/gm, 'const $1 = require("$3"); const {$2} = $1;')
  .replace(/^import \{([^}]*)\} from "([^"]+)";?$/gm, 'const {$1} = require("$2");')
  .replace(/^export default function TrigCalculator[\s\S]*$/m, "");
const names = ["fmtNum", "mod", "clean", "evalExpr", "parseAngle", "parseValue", "quadrantOf", "piParts", "formatPi",
  "formatAngle", "formatDMS", "exactTrig", "exactNum", "formatExact", "exactIsSimple", "trigAt", "trigAll", "positiveFns",
  "inverseSolve", "triPush", "solveRight", "sinusoidInfo", "sinusoidY", "phasorStart", "sinusoidEq", "waveWindow",
  "xTicks", "yTicks", "asymptotes", "sampleCurve", "layoutCanvas", "keypadApply", "EDIT_ORDER", "nextTarget",
  "readTarget", "FNS", "KEYPAD", "DEG", "ToolNav", "BUDDY_TOOLS"];
fs.writeFileSync(path.join(TMP, "w.jsx"), src + `\nmodule.exports = { ${names.join(", ")} };\n`);
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [path.join(TMP, "w.jsx"), "--bundle", "--format=cjs",
  "--platform=node", "--jsx=automatic", "--external:react", "--external:react/jsx-runtime",
  `--outfile=${path.join(TMP, "w.cjs")}`, "--log-level=error"]);
const L = require(path.join(TMP, "w.cjs"));
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; console.log(`FAIL ${n} ${d}`); } };
const close = (a, b, t = 1e-9) => a != null && b != null && Math.abs(a - b) <= t;
const M = "−";
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// ---- numbers ----
eq("fmtNum 0.5", L.fmtNum(0.5), "0.5");
eq("fmtNum trims", L.fmtNum(0.86602540378, 4), "0.866");
eq("fmtNum negative uses U+2212", L.fmtNum(-0.25), M + "0.25");
eq("fmtNum tiny negative -> 0", L.fmtNum(-1e-17), "0");
eq("fmtNum null -> undefined", L.fmtNum(null), "undefined");
eq("fmtNum huge -> exponent", L.fmtNum(1.633123935319537e16), "1.6331e16");
eq("mod -30,360", L.mod(-30, 360), 330);
eq("mod folds 359.99999999999", L.mod(359.99999999999, 360), 0);
eq("clean 30.000000000000004", L.clean(30.000000000000004), 30);
eq("clean leaves 22.5", L.clean(22.5), 22.5);

// ---- expression parser ----
const pv = (s) => L.parseValue(s).v;
ok("value 1/2", close(pv("1/2"), 0.5));
ok("value √3/2 = (√3)/2", close(pv("√3/2"), Math.sqrt(3) / 2));
ok("value 2√3/3 implicit ×", close(pv("2√3/3"), 2 * Math.sqrt(3) / 3));
ok("value (√6−√2)/4 with U+2212", close(pv("(√6" + M + "√2)/4"), (Math.sqrt(6) - Math.sqrt(2)) / 4));
ok("value -√2/2", close(pv("-√2/2"), -Math.SQRT2 / 2));
ok("value sqrt(2) word form", close(pv("sqrt(2)"), Math.SQRT2));
ok("value √√16 nested", close(pv("√√16"), 2));
ok("value auto-closes paren", close(pv("(1+2"), 3));
ok("value 2-3 is subtraction", close(pv("2-3"), -1));
ok("value π numeric", close(pv("π"), Math.PI));
ok("value 3×2 and 6÷4", close(pv("3×2"), 6) && close(pv("6÷4"), 1.5));
ok("error: empty", !!L.parseValue("").err);
ok("error: letters", /Unexpected/.test(L.parseValue("abc").err || ""));
ok("error: divide by zero", /zero/.test(L.parseValue("1/0").err || ""));
ok("error: √ negative", /negative/.test(L.parseValue("√-4").err || ""));
ok("error: dangling operator", /Incomplete/.test(L.parseValue("5/").err || ""));
ok("error: ° in value", !!L.parseValue("30°").err);
ok("error: extra )", /Unexpected/.test(L.parseValue("2)").err || ""));

// ---- angle parsing (degrees internal, π exact) ----
const pa = (s, u = "deg") => L.parseAngle(s, u).deg;
eq("angle 150 deg", pa("150"), 150);
eq("angle 5π/6 exact 150", pa("5π/6"), 150);
eq("angle 5pi/6 word form", pa("5pi/6"), 150);
eq("angle π/4 in deg mode", pa("π/4"), 45);
eq("angle 11π/6", pa("11π/6"), 330);
eq("angle 7π/12", pa("7π/12"), 105);
eq("angle -π/4", pa("-π/4"), -45);
eq("angle 0.5π", pa("0.5π"), 90);
eq("angle 30° in rad mode", pa("30°", "rad"), 30);
ok("angle plain 2 in rad mode", close(pa("2", "rad"), 2 / L.DEG));
ok("angle 2 rad suffix in deg mode", close(pa("2rad"), 2 / L.DEG));
eq("angle 22.5", pa("22.5"), 22.5);
eq("angle 390", pa("390"), 390);
ok("angle too large (1e8°) rejected", /too large/.test(L.parseAngle("100000000").err || ""));

// ---- quadrant / reference / π-forms / DMS ----
const q = (d) => { const r = L.quadrantOf(d); return [r.q, r.ref, r.axis]; };
eq("Q 150", q(150), [2, 30, null]);
eq("Q 210", q(210), [3, 30, null]);
eq("Q -45", q(-45), [4, 45, null]);
eq("Q 390", q(390), [1, 30, null]);
eq("Q 270 axis", q(270), [0, 90, M + "y"]);
eq("Q 720 axis +x", q(720), [0, 0, "+x"]);
eq("π 150", L.formatPi(150), "5π/6");
eq("π 180", L.formatPi(180), "π");
eq("π -45", L.formatPi(-45), M + "π/4");
eq("π 360", L.formatPi(360), "2π");
eq("π 0", L.formatPi(0), "0");
eq("π 22.5", L.formatPi(22.5), "π/8");
eq("π 37 (den 24) none", L.formatPi(37), null);
eq("π 37 (den 180)", L.formatPi(37, 180), "37π/180");
eq("formatAngle rad 150", L.formatAngle(150, "rad"), "5π/6");
eq("formatAngle rad 37 falls back to decimal", L.formatAngle(37, "rad", 4), "0.6458");
eq("formatAngle deg", L.formatAngle(36.86989764584402, "deg", 4), "36.8699°");
eq("DMS 37.12", L.formatDMS(37.12), "37° 7′ 12″");
eq("DMS -0.5", L.formatDMS(-0.5), M + "0° 30′ 0″");

// ---- exact values: every multiple of 15° over ±2 turns vs Math ----
{
  let bad = [];
  for (let k = -48; k <= 48; k++) {
    const d = k * 15, r = d * L.DEG, s = Math.sin(r), c = Math.cos(r);
    const ref = { sin: s, cos: c, tan: s / c, csc: 1 / s, sec: 1 / c, cot: c / s };
    for (const fn of L.FNS) {
      const ex = L.exactTrig(fn, d);
      const undef = (fn === "tan" || fn === "sec") ? Math.abs(c) < 1e-12 : (fn === "csc" || fn === "cot") ? Math.abs(s) < 1e-12 : false;
      if (undef) { if (ex !== null) bad.push(`${fn}(${d}) should be undefined`); continue; }
      if (!ex) { bad.push(`${fn}(${d}) missing exact`); continue; }
      if (!close(L.exactNum(ex), ref[fn], 1e-9)) bad.push(`${fn}(${d}) = ${L.exactNum(ex)} vs ${ref[fn]}`);
    }
  }
  ok("exact table matches Math for 97 angles × 6 functions", bad.length === 0, bad.slice(0, 5).join("; "));
}
const fx = (fn, d) => L.formatExact(L.exactTrig(fn, d));
eq("sin 30 = 1/2", fx("sin", 30), "1/2");
eq("cos 150 = −√3/2", fx("cos", 150), M + "√3/2");
eq("tan 15 = 2 − √3", fx("tan", 15), "2 " + M + " √3");
eq("sin 15 = (√6 − √2)/4", fx("sin", 15), "(√6 " + M + " √2)/4");
eq("csc 75 = √6 − √2", fx("csc", 75), "√6 " + M + " √2");
eq("sec 60 = 2", fx("sec", 60), "2");
eq("csc 60 = 2√3/3", fx("csc", 60), "2√3/3");
eq("cot 90 = 0", fx("cot", 90), "0");
eq("tan 90 undefined", fx("tan", 90), "undefined");
eq("tan 345 = −(2 − √3)", fx("tan", 345), M + "(2 " + M + " √3)");
eq("sin 180 = 0 (no −0)", fx("sin", 180), "0");
eq("tan 180 = 0 (no −0)", fx("tan", 180), "0");
eq("cos 180 = −1", fx("cos", 180), M + "1");
eq("sin 37 has no exact form", L.exactTrig("sin", 37), false);
ok("exactIsSimple 1 yes, 1/2 no", L.exactIsSimple(L.exactTrig("sin", 90)) && !L.exactIsSimple(L.exactTrig("sin", 30)));
{
  const t = L.trigAll(30);
  ok("trigAll(30): sin exactly 0.5", t.sin.v === 0.5 && !!t.sin.ex);
  const u = L.trigAll(90);
  ok("trigAll(90): tan, sec undefined", u.tan.v === null && u.sec.v === null && u.cot.v === 0);
  const w = L.trigAll(37);
  ok("trigAll(37): float path, no exact", w.sin.ex === false && close(w.sin.v, Math.sin(37 * L.DEG)));
  ok("trigAll(89.9999): tan large, defined", L.trigAt("tan", 89.9999).v > 5e5);
}
eq("ASTC Q2", L.positiveFns(2), ["sin", "csc"]);

// ---- inverse ----
const inv = (fn, v) => { const r = L.inverseSolve(fn, v); return r.err ? "ERR" : [r.principal, r.sols, r.period]; };
eq("sin 0.5", inv("sin", 0.5), [30, [30, 150], 360]);
eq("sin −0.5", inv("sin", -0.5), [-30, [210, 330], 360]);
eq("sin 1 single", inv("sin", 1), [90, [90], 360]);
eq("sin 0", inv("sin", 0), [0, [0, 180], 360]);
eq("sin 2 no solution", inv("sin", 2), "ERR");
eq("cos 0.5", inv("cos", 0.5), [60, [60, 300], 360]);
eq("cos −1 single", inv("cos", -1), [180, [180], 360]);
eq("cos 1 single", inv("cos", 1), [0, [0], 360]);
eq("tan 1", inv("tan", 1), [45, [45, 225], 180]);
eq("tan −√3", inv("tan", -Math.sqrt(3)), [-60, [120, 300], 180]);
eq("csc 2", inv("csc", 2), [30, [30, 150], 360]);
eq("csc 0.5 none", inv("csc", 0.5), "ERR");
eq("csc 0 none", inv("csc", 0), "ERR");
eq("sec 2", inv("sec", 2), [60, [60, 300], 360]);
eq("sec −2", inv("sec", -2), [120, [120, 240], 360]);
eq("cot 1", inv("cot", 1), [45, [45, 225], 180]);
eq("cot 0", inv("cot", 0), [90, [90, 270], 180]);
eq("cot −1 principal in (0,180)", inv("cot", -1), [135, [135, 315], 180]);
eq("sin √3/2 via parser", inv("sin", L.parseValue("√3/2").v), [60, [60, 120], 360]);
{
  const r = L.inverseSolve("sin", 0.3);
  ok("sin 0.3: both solutions satisfy", r.sols.length === 2 && r.sols.every((s) => close(Math.sin(s * L.DEG), 0.3, 1e-12)));
  eq("tan bases period 180", L.inverseSolve("tan", -1).bases, [135]);
}

// ---- right triangle ----
const tri = (k) => L.solveRight(k);
{
  let r = tri({ theta: 30, hyp: 10 });
  ok("θ30 hyp10 → opp 5 exact, adj 5√3", r.status === "solved" && r.opp === 5 && close(r.adj, 5 * Math.sqrt(3)));
  r = tri({ theta: 30, opp: 5 });
  ok("θ30 opp5 → hyp 10, adj 8.66", close(r.hyp, 10) && close(r.adj, 5 * Math.sqrt(3)));
  r = tri({ theta: 45, adj: 3 });
  ok("θ45 adj3 → opp 3, hyp 3√2", close(r.opp, 3) && close(r.hyp, 3 * Math.SQRT2));
  r = tri({ opp: 3, adj: 4 });
  ok("opp3 adj4 → hyp 5, θ 36.87", close(r.hyp, 5) && close(r.theta, 36.86989764584402, 1e-9) && close(r.beta, 90 - r.theta));
  r = tri({ opp: 1, hyp: 2 });
  ok("opp1 hyp2 → θ exactly 30", r.theta === 30 && close(r.adj, Math.sqrt(3)));
  r = tri({ adj: 1, hyp: 2 });
  ok("adj1 hyp2 → θ exactly 60", r.theta === 60);
  ok("area & perimeter 3-4-5", close(tri({ opp: 3, adj: 4 }).area, 6) && close(tri({ opp: 3, adj: 4 }).perim, 12));
  ok("opp ≥ hyp → error", tri({ opp: 5, hyp: 5 }).status === "error");
  ok("adj ≥ hyp → error", tri({ adj: 6, hyp: 5 }).status === "error");
  ok("θ 90 → error", tri({ theta: 90, hyp: 5 }).status === "error");
  ok("θ 0 → error", tri({ theta: 0, hyp: 5 }).status === "error");
  ok("negative side → error", tri({ theta: 30, opp: -2 }).status === "error");
  ok("one known → need 1", tri({ hyp: 5 }).status === "need" && tri({ hyp: 5 }).count === 1);
  ok("none → need 0", tri({}).count === 0);
}
eq("triPush adds", L.triPush(["theta"], "hyp"), ["theta", "hyp"]);
eq("triPush drops oldest", L.triPush(["theta", "hyp"], "opp"), ["hyp", "opp"]);
eq("triPush re-set moves to end", L.triPush(["theta", "hyp"], "theta"), ["hyp", "theta"]);

// ---- sinusoid ----
{
  const p = { f: "sin", A: 3, B: 2, C: 45, D: 1 };
  const s = L.sinusoidInfo(p);
  ok("amp 3, period 180, max 4, min −2", s.amp === 3 && s.period === 180 && s.max === 4 && s.min === -2 && !s.reflected);
  eq("key points x", s.key.map((k) => k.x), [45, 90, 135, 180, 225]);
  eq("key points y (sin)", s.key.map((k) => k.y), [1, 4, 1, -2, 1]);
  ok("y(90) = 4", close(L.sinusoidY(p, 90), 4));
  ok("y(60) = 3 sin 30 + 1 = 2.5", close(L.sinusoidY(p, 60), 2.5));
  const c = L.sinusoidInfo({ f: "cos", A: -2, B: -1, C: 0, D: 0 });
  eq("cos, A<0, B<0 key y", c.key.map((k) => k.y), [-2, 0, 2, 0, -2]);
  ok("reflected flag", c.reflected && c.period === 360);
  ok("B = 0 → error", !!L.sinusoidInfo({ f: "sin", A: 1, B: 0, C: 0, D: 0 }).err);
  ok("A = 0 → error", !!L.sinusoidInfo({ f: "sin", A: 0, B: 1, C: 0, D: 0 }).err);
  // phasor height equals the formula for mixed params
  let worst = 0;
  for (const f of ["sin", "cos"]) for (const A of [2, -1.5]) for (const B of [1, 3, -0.5]) for (const x of [-100, 0, 17, 250]) {
    const P = { f, A, B, C: 20, D: 0.7 };
    const phi = (L.phasorStart(P) + B * (x - 20)) * L.DEG;
    const h = 0.7 + Math.abs(A) * Math.sin(phi);
    worst = Math.max(worst, Math.abs(h - L.sinusoidY(P, x)));
  }
  ok("phasor height == A·f(B(x−C))+D (48 cases)", worst < 1e-9, `worst ${worst}`);
  eq("eq deg", L.sinusoidEq(p, "deg"), `y = 3 sin(2(x ${M} 45°)) + 1`);
  eq("eq rad", L.sinusoidEq(p, "rad"), `y = 3 sin(2(x ${M} π/4)) + 1`);
  eq("eq plain", L.sinusoidEq({ f: "cos", A: 1, B: 1, C: 0, D: 0 }, "deg"), "y = cos(x)");
  eq("eq negative A, C<0, D<0", L.sinusoidEq({ f: "sin", A: -1, B: 1, C: -30, D: -2 }, "deg"), `y = ${M}sin(x + 30°) ${M} 2`);
}

// ---- plot helpers ----
eq("window 30 → [0,360]", L.waveWindow(30), { x0: 0, x1: 360 });
eq("window 360 → [0,360]", L.waveWindow(360), { x0: 0, x1: 360 });
eq("window 400 → [360,720]", L.waveWindow(400), { x0: 360, x1: 720 });
eq("window −45 → [−360,0]", L.waveWindow(-45), { x0: -360, x1: 0 });
eq("window sinusoid P=180 span 2", L.waveWindow(100, 180, 0, 2), { x0: 0, x1: 360 });
{
  const t = L.xTicks(0, 360, "deg", 6);
  ok("xTicks deg 6 max → 90° step", t.step === 90 && t.ticks.length === 5 && t.ticks[1].label === "90°");
  const r = L.xTicks(0, 360, "rad", 6);
  eq("xTicks rad labels", r.ticks.map((k) => k.label), ["0", "π/2", "π", "3π/2", "2π"]);
  const y = L.yTicks(-1.2, 1.2, 6);
  eq("yTicks ±1.2", y.ticks, [-1, -0.5, 0, 0.5, 1]);
}
{
  const short = L.xTicks(0, 7.2, "rad", 6);
  ok("xTicks short rad window falls back to decimals", short.ticks.length >= 3 && short.ticks.every((t) => /^[\d.]+$/.test(t.label)), JSON.stringify(short.ticks.map((t) => t.label)));
  const shortD = L.xTicks(0, 1.2, "deg", 6);
  ok("xTicks short deg window falls back to decimals", shortD.ticks.length >= 3 && shortD.ticks[1].label.endsWith("°"), JSON.stringify(shortD.ticks.map((t) => t.label)));
  const big = L.xTicks(0, 72000, "deg", 8);
  ok("xTicks huge window stays sparse", big.ticks.length >= 2 && big.ticks.length <= 9, `${big.ticks.length}`);
}
eq("asymptotes tan [0,360]", L.asymptotes("tan", 0, 360), [90, 270]);
eq("asymptotes cot [0,360] excludes ends", L.asymptotes("cot", 0, 360), [180]);
eq("asymptotes sin none", L.asymptotes("sin", 0, 360), []);
{
  const segs = L.sampleCurve((x) => L.trigAt("tan", x).v, 0, 360, 360, L.asymptotes("tan", 0, 360));
  ok("tan sampled as 3 separate branches", segs.length === 3, `got ${segs.length}`);
  const crosses = segs.some((sg) => sg.some(([x], i) => i && Math.floor((sg[i - 1][0] - 90) / 180) !== Math.floor((x - 90) / 180)));
  ok("no tan segment crosses an asymptote", !crosses);
  const sin = L.sampleCurve((x) => L.trigAt("sin", x).v, 0, 360, 100);
  ok("sin one segment, endpoints exact", sin.length === 1 && sin[0][0][0] === 0 && sin[0][sin[0].length - 1][0] === 360);
}
{
  const c = L.layoutCanvas("circle", 334, 380).circle;
  ok("circle view fits phone canvas", c.cx - c.R >= 40 && c.cx + c.R <= 334 - 40 && c.cy - c.R >= 20);
  const b = L.layoutCanvas("both", 900, 520);
  ok("both view: wave right of circle", b.wave.left > b.circle.cx + b.circle.R + 40 && b.wave.right - b.wave.left > 300);
  const w = L.layoutCanvas("wave", 334, 300).wave;
  ok("wave view plot box", w.left < w.right && w.top < w.bottom);
}

// ---- keypad / targets / validation ----
const K = (keys) => keys.reduce((d, k) => L.keypadApply(d, k), "");
eq("keypad 5π/6", K(["5", "π", "/", "6"]), "5π/6");
ok("keypad draft parses exactly", L.parseAngle(K(["5", "π", "/", "6"]), "deg").deg === 150);
eq("keypad one decimal per number", K(["5", ".", "2", "."]), "5.2");
eq("keypad decimal allowed in next number", K(["1", ".", "5", "/", "2", "."]), "1.5/2.");
eq("keypad backspace", K(["√", "3", "⌫"]), "√");
eq("keypad clear", K(["1", "2", "C"]), "");
ok("keypad minus key parses", close(L.parseValue(K([M, "√", "2", "/", "2"])).v, -Math.SQRT2 / 2));
ok("keypad has 20 keys", L.KEYPAD.length === 20);
eq("next A → B", L.nextTarget(L.EDIT_ORDER.sinusoid, "A", () => true), "B");
eq("next D wraps → A", L.nextTarget(L.EDIT_ORDER.sinusoid, "D", () => true), "A");
eq("prev theta wraps → hyp", L.nextTarget(L.EDIT_ORDER.triangle, "theta", () => true, -1), "hyp");
eq("next skips known", L.nextTarget(L.EDIT_ORDER.triangle, "theta", (t) => t === "adj"), "adj");
eq("next none eligible → null", L.nextTarget(L.EDIT_ORDER.triangle, "theta", () => false), null);
ok("read θ triangle 120 rejected", !!L.readTarget("theta", "120", "deg", "triangle").err);
ok("read θ triangle π/6 ok", L.readTarget("theta", "π/6", "rad", "triangle").value === 30);
ok("read side 0 rejected", !!L.readTarget("hyp", "0", "deg", "triangle").err);
ok("read B 0 rejected", !!L.readTarget("B", "0", "deg", "sinusoid").err);
ok("read C π/4 → 45", L.readTarget("C", "π/4", "rad", "sinusoid").value === 45);
ok("read inv √3/2", close(L.readTarget("inv", "√3/2", "deg", "inverse").value, Math.sqrt(3) / 2));

// ---- family navigation: same list as Triangle/Fraction; ToolNav none / link / menu ----
{
  const T = L.BUDDY_TOOLS, ids = T.map((t) => t.id);
  ok("BUDDY_TOOLS = triangle, fractions, trig", ids.join() === "triangle,fractions,trig", ids.join());
  ok("BUDDY_TOOLS urls", T.map((t) => t.url).join() === "https://trianglebuddy.com/,https://fractions.trianglebuddy.com/,https://trig.trianglebuddy.com/");
}
(async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><div id=r></div>", { pretendToBeVisual: true });
  global.window = dom.window; global.document = dom.window.document;
  const React = require("react"), { createRoot } = require("react-dom/client");
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const doc = dom.window.document, root = createRoot(doc.getElementById("r"));
  const mount = async (tools) => { root.render(React.createElement(L.ToolNav, { tools, currentId: "trig" })); await tick(); };
  const down = (el) => el.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));
  const trig = L.BUDDY_TOOLS.find((t) => t.id === "trig"), tri = L.BUDDY_TOOLS.find((t) => t.id === "triangle");

  await mount([trig]);
  ok("ToolNav: no siblings renders nothing", doc.getElementById("r").innerHTML === "");
  await mount([tri, trig]);
  const a = doc.querySelector("a.tg-nav-link");
  ok("ToolNav: one sibling = direct link", !!a && a.href === "https://trianglebuddy.com/" && !doc.querySelector(".tg-nav-btn"));
  await mount(L.BUDDY_TOOLS);
  const btn = doc.querySelector(".tg-nav-btn");
  ok("ToolNav: two+ siblings = closed menu button", !!btn && !doc.querySelector(".tg-nav-menu") && btn.getAttribute("aria-expanded") === "false");
  btn.click(); await tick();
  const items = [...doc.querySelectorAll(".tg-nav-item")];
  ok("ToolNav: menu lists all 3 tools", items.length === 3, `got ${items.length}`);
  ok("ToolNav: current tool (Trig) marked, not a link", items[2].tagName === "SPAN" && items[2].getAttribute("aria-current") === "page" && items[2].textContent.includes("Trig Buddy"));
  ok("ToolNav: siblings are links with right hrefs", items[0].href === "https://trianglebuddy.com/" && items[1].href === "https://fractions.trianglebuddy.com/");
  down(items[0]); await tick();
  ok("ToolNav: press inside menu keeps it open", !!doc.querySelector(".tg-nav-menu"));
  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick();
  ok("ToolNav: Esc closes", !doc.querySelector(".tg-nav-menu"));
  doc.querySelector(".tg-nav-btn").click(); await tick();
  down(doc.body); await tick();
  ok("ToolNav: outside press closes", !doc.querySelector(".tg-nav-menu"));
  root.unmount();

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`CORE TESTS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR", e.stack); process.exit(2); });
