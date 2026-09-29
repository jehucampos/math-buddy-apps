import React, { useState, useRef, useMemo, useEffect, useLayoutEffect } from "react";

/* ============================================================
   TRIG BUDDY  v0.1.1
   ------------------------------------------------------------
   NAVIGATION MAP (search these tags to jump to a section):
     [SEC:CORE]      pure logic. Tested straight from this file by
                     core/test-core.js (no separate logic file to
                     keep in sync). Spans num→parse→angle→exact→
                     trig→inverse→triangle→sinusoid→plot→edit.
     [SEC:UI-CONST]  UI-only constants (colors, fonts, labels).
     [SEC:COMPONENT] the React component (state, gestures, editor,
                     canvas render, panels). All churn happens here.
     [SEC:PRESENT]   small presentational helpers (Section, Row,
                     Exact, FnTile…).
   ------------------------------------------------------------
   CONVENTIONS: angles are carried in DEGREES internally, so the
   special angles stay exact integers; radians are a display and
   parse layer. In typed expressions π is carried symbolically as
   a degree term (π ≡ 180), so "5π/6" parses to exactly 150.
   ------------------------------------------------------------
   CHANGELOG:
   v0.1.0 first build. Angle → six functions with exact forms at
         multiples of 15°; Inverse (value → all angles); right-
         triangle any-two solver; sinusoid A·f(B(x−C))+D. Circle ⇄
         Wave switch, plus a linked "Both" view on wide canvases.
         Keypad sheet on touch, popover on desktop.
   v0.1.1 fixes from the first iPhone test:
         * canvas no longer rescales while scrolling. Touch browsers
           change innerHeight as their toolbars slide in and out; the
           stacked canvas height followed it. Touch devices now re-read
           the height only when the width changes (rotation).
         * tapped-off chips no longer keep a brass border. WebKit keeps
           :hover on the last tapped element; hover styling now lives
           inside @media (hover:hover).
         * circle ring labels skip spots crossed by the Inverse guide
           line (e.g. 60°/120° under the sin θ = 1 line).
   ============================================================ */

// ===================== [SEC:CORE] =====================
// ---- [SEC:CORE/num] numbers & formatting ----
const DEG = Math.PI / 180;
const TOL = 1e-9;
const MINUS = "−";

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
// true modulo into [0, n); values within TOL of n or 0 fold to 0
function mod(a, n) { const r = ((a % n) + n) % n; return (Math.abs(r - n) < TOL || Math.abs(r) < TOL) ? 0 : r; }
// integer k when deg is (within TOL) k·step, else null
function snapK(deg, step) { const k = Math.round(deg / step); return Math.abs(deg - k * step) < TOL ? k : null; }
// collapse float noise on special angles (multiples of 15°)
function clean(deg) { const k = snapK(deg, 15); return k == null ? deg : k * 15 + 0; }
function trimDec(s) { return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s; }
// display a number: fixed dp, trailing zeros trimmed, U+2212 minus, exponent when huge
function fmtNum(v, dp = 4) {
  if (v == null || !Number.isFinite(v)) return "undefined";
  const a = Math.abs(v);
  if (a < 0.5 * Math.pow(10, -dp)) return "0";
  let s;
  if (a >= 1e7) { const [m, e] = a.toExponential(Math.min(dp, 6)).split("e"); s = `${trimDec(m)}e${e.replace("+", "")}`; }
  else s = trimDec(a.toFixed(dp));
  return (v < 0 ? MINUS : "") + s;
}

// ---- [SEC:CORE/parse] expression parser ----
// expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary | <implicit> primary)*
// unary := ('-'|'+') unary | primary ; primary := number | π | √ radicand | '(' expr ')'
// A trailing ° or "rad" tags the unit. Values are {c, d}: c is a plain number,
// d is a π-term already in degrees (π ≡ 180). Squaring π falls back to plain c.
function tokenize(src) {
  const s = String(src == null ? "" : src)
    .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/")
    .replace(/pi/gi, "π").replace(/sqrt|root/gi, "√").replace(/deg(rees?)?|º/gi, "°")
    .replace(/rad(ians?)?/gi, "ʳ").replace(/\s+/g, "");
  const out = [];
  for (let i = 0; i < s.length;) {
    const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
    if (m) { out.push({ t: "n", v: parseFloat(m[1]) }); i += m[1].length; continue; }
    const ch = s[i];
    if ("+-*/()π√°ʳ".includes(ch)) { out.push({ t: ch }); i++; continue; }
    return { err: `Unexpected “${ch}”` };
  }
  return { tokens: out };
}
function evalExpr(src) {
  const tk = tokenize(src);
  if (tk.err) return { err: tk.err };
  const T = tk.tokens;
  if (!T.length) return { err: "Enter a value" };
  let i = 0;
  const peek = () => (T[i] ? T[i].t : undefined);
  const sym = (t) => (t === "n" ? "number" : t === "ʳ" ? "rad" : t);
  const fail = (msg) => { throw new Error(msg); };
  const V = (c, d = 0) => ({ c, d });
  const num = (a) => a.c + a.d * DEG;
  const add = (a, b) => V(a.c + b.c, a.d + b.d);
  const neg = (a) => V(-a.c, -a.d);
  const mul = (a, b) => (a.d === 0 ? V(a.c * b.c, a.c * b.d) : b.d === 0 ? V(a.c * b.c, a.d * b.c) : V(num(a) * num(b)));
  const div = (a, b) => {
    if (num(b) === 0) fail("Can’t divide by zero");
    if (b.d === 0) return V(a.c / b.c, a.d / b.c);
    if (a.c === 0 && b.c === 0) return V(a.d / b.d);
    return V(num(a) / num(b));
  };
  const sqrt = (a) => { const v = num(a); if (v < -1e-12) fail("√ of a negative number"); return V(Math.sqrt(Math.max(0, v))); };
  const startsPrimary = (t) => t === "n" || t === "π" || t === "√" || t === "(";
  function expr() {
    let a = term();
    while (peek() === "+" || peek() === "-") { const op = T[i++].t; const b = term(); a = op === "+" ? add(a, b) : add(a, neg(b)); }
    return a;
  }
  function term() {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t === "*" || t === "/") { i++; const b = unary(); a = t === "*" ? mul(a, b) : div(a, b); }
      else if (startsPrimary(t)) a = mul(a, primary());
      else return a;
    }
  }
  function unary() {
    const t = peek();
    if (t === "-") { i++; return neg(unary()); }
    if (t === "+") { i++; return unary(); }
    return primary();
  }
  function radicand() {
    const t = peek();
    if (t === "-") { i++; return neg(radicand()); }
    if (t === "n" || t === "π" || t === "√" || t === "(") return primary();
    return fail("√ needs a number after it");
  }
  function primary() {
    const t = peek();
    if (t === "n") return V(T[i++].v);
    if (t === "π") { i++; return V(0, 180); }
    if (t === "√") { i++; return sqrt(radicand()); }
    if (t === "(") {
      i++; const a = expr();
      if (peek() === ")") i++; else if (i < T.length) fail("Missing )");
      return a;
    }
    if (t === undefined) return fail("Incomplete expression");
    return fail(`Unexpected “${sym(t)}”`);
  }
  try {
    const val = expr();
    let unit = null;
    if (peek() === "°") { i++; unit = "deg"; } else if (peek() === "ʳ") { i++; unit = "rad"; }
    if (i < T.length) fail(`Unexpected “${sym(T[i].t)}”`);
    if (!Number.isFinite(val.c) || !Number.isFinite(val.d)) fail("Number too large");
    return { c: val.c, d: val.d, unit };
  } catch (e) { return { err: e.message }; }
}
// angle text → { deg } | { err }. A π term or trailing "rad" means radians;
// a trailing ° means degrees; otherwise the number is in the selected unit.
function parseAngle(src, unit) {
  const r = evalExpr(src);
  if (r.err) return { err: r.err };
  let deg;
  if (r.unit === "deg") deg = r.c + r.d * DEG;
  else if (r.unit === "rad" || r.d !== 0 || unit === "rad") deg = r.c / DEG + r.d;
  else deg = r.c;
  if (!Number.isFinite(deg) || Math.abs(deg) > 1e7) return { err: "Angle too large" };
  return { deg: clean(deg) };
}
// plain value text → { v } | { err }
function parseValue(src) {
  const r = evalExpr(src);
  if (r.err) return { err: r.err };
  if (r.unit) return { err: "Angle units don’t belong here" };
  const v = r.c + r.d * DEG;
  if (!Number.isFinite(v)) return { err: "Number too large" };
  return { v };
}

// ---- [SEC:CORE/angle] angle facts & display ----
function norm360(deg) { return mod(deg, 360); }
// quadrant 1–4, or 0 with an axis name; reference angle in [0, 90]
function quadrantOf(deg) {
  const n = norm360(clean(deg));
  if (n === 0) return { n, q: 0, axis: "+x", ref: 0 };
  if (n === 90) return { n, q: 0, axis: "+y", ref: 90 };
  if (n === 180) return { n, q: 0, axis: MINUS + "x", ref: 0 };
  if (n === 270) return { n, q: 0, axis: MINUS + "y", ref: 90 };
  if (n < 90) return { n, q: 1, axis: null, ref: n };
  if (n < 180) return { n, q: 2, axis: null, ref: 180 - n };
  if (n < 270) return { n, q: 3, axis: null, ref: n - 180 };
  return { n, q: 4, axis: null, ref: 360 - n };
}
// deg/180 as a reduced fraction num/den with den ≤ maxDen, else null
function piParts(deg, maxDen = 24) {
  for (let q = 1; q <= maxDen; q++) {
    const p = (deg * q) / 180, k = Math.round(p);
    if (Math.abs(p - k) < 1e-9 * q) { const g = gcd(k, q); return { num: k / g, den: q / g }; }
  }
  return null;
}
function formatPi(deg, maxDen = 24) {
  const f = piParts(deg, maxDen);
  if (!f) return null;
  if (f.num === 0) return "0";
  const a = Math.abs(f.num), top = (a === 1 ? "" : a) + "π";
  return (f.num < 0 ? MINUS : "") + (f.den === 1 ? top : `${top}/${f.den}`);
}
function formatDeg(deg, dp = 4) { return fmtNum(deg, dp) + "°"; }
function formatRad(deg, dp = 4) { return fmtNum(deg * DEG, dp); }
function formatAngle(deg, unit, dp = 4) { return unit === "rad" ? (formatPi(deg, 24) ?? formatRad(deg, dp)) : formatDeg(deg, dp); }
function formatDMS(deg) {
  let t = Math.round(Math.abs(deg) * 3600);
  const d = Math.floor(t / 3600); t -= d * 3600;
  const m = Math.floor(t / 60), s = t - m * 60;
  return (deg < 0 && (d || m || s) ? MINUS : "") + `${d}° ${m}′ ${s}″`;
}

// ---- [SEC:CORE/exact] exact values at multiples of 15° ----
// A form is { neg, terms: [[coef, radicand], …], den }: value = ±(Σ coef·√radicand) / den.
// Tables are indexed by reference angle / 15 (0…6); null = undefined.
const EX = (terms, den = 1) => ({ terms, den });
const SIN_T = [EX([[0, 1]]), EX([[1, 6], [-1, 2]], 4), EX([[1, 1]], 2), EX([[1, 2]], 2), EX([[1, 3]], 2), EX([[1, 6], [1, 2]], 4), EX([[1, 1]])];
const TAN_T = [EX([[0, 1]]), EX([[2, 1], [-1, 3]]), EX([[1, 3]], 3), EX([[1, 1]]), EX([[1, 3]]), EX([[2, 1], [1, 3]]), null];
const CSC_T = [null, EX([[1, 6], [1, 2]]), EX([[2, 1]]), EX([[1, 2]]), EX([[2, 3]], 3), EX([[1, 6], [-1, 2]]), EX([[1, 1]])];
const FNS = ["sin", "cos", "tan", "csc", "sec", "cot"];
// false = not a special angle (no exact form); null = undefined; else a form
function exactTrig(fn, deg) {
  const k = snapK(deg, 15);
  if (k == null) return false;
  const { n, ref } = quadrantOf(k * 15);
  const r = Math.round(ref / 15);
  const sS = n > 180 ? -1 : 1;                         // sign of sin (magnitude is 0 on the x-axis)
  const sC = n > 90 && n < 270 ? -1 : 1;               // sign of cos (magnitude is 0 on the y-axis)
  const pick = {
    sin: [SIN_T[r], sS], cos: [SIN_T[6 - r], sC], tan: [TAN_T[r], sS * sC],
    cot: [TAN_T[6 - r], sS * sC], csc: [CSC_T[r], sS], sec: [CSC_T[6 - r], sC],
  }[fn];
  if (!pick[0]) return null;
  const f = pick[0], zero = f.terms.length === 1 && f.terms[0][0] === 0;
  return { neg: !zero && pick[1] < 0, terms: f.terms, den: f.den };
}
function exactNum(f) {
  if (!f) return null;
  const s = f.terms.reduce((t, [c, r]) => t + c * Math.sqrt(r), 0) / f.den;
  return f.neg ? -s : s;
}
// pieces for rendering: sign, numerator text, denominator text ("" when 1)
function exactParts(f) {
  const num = f.terms.map(([c, r], i) => {
    const a = Math.abs(c), body = r === 1 ? String(a) : (a === 1 ? "" : a) + "√" + r;
    return i === 0 ? (c < 0 ? MINUS : "") + body : (c < 0 ? ` ${MINUS} ` : " + ") + body;
  }).join("");
  return { sign: f.neg ? MINUS : "", num, den: f.den === 1 ? "" : String(f.den), multi: f.terms.length > 1 };
}
function formatExact(f) {
  if (f === null) return "undefined";
  if (!f) return null;
  const p = exactParts(f);
  const body = p.multi && (p.den || p.sign) ? `(${p.num})` : p.num;
  return p.sign + body + (p.den ? "/" + p.den : "");
}
// does the exact form need a decimal beside it? (fractions / radicals)
function exactIsSimple(f) { return !!f && f.den === 1 && f.terms.length === 1 && f.terms[0][1] === 1; }

// ---- [SEC:CORE/trig] the six functions ----
// { v: number | null (undefined), ex: form | null | false (no exact form) }
function trigAt(fn, deg) {
  const ex = exactTrig(fn, deg);
  if (ex === null) return { v: null, ex: null };
  if (ex) return { v: exactNum(ex), ex };
  const r = deg * DEG, s = Math.sin(r), c = Math.cos(r);
  const v = { sin: s, cos: c, tan: s / c, csc: 1 / s, sec: 1 / c, cot: c / s }[fn];
  return { v: Number.isFinite(v) ? v : null, ex: false };
}
function trigAll(deg) { const o = {}; for (const f of FNS) o[f] = trigAt(f, deg); return o; }
// functions that are positive in the quadrant (ASTC)
function positiveFns(q) { return q === 1 ? FNS : q === 2 ? ["sin", "csc"] : q === 3 ? ["tan", "cot"] : q === 4 ? ["cos", "sec"] : []; }

// ---- [SEC:CORE/inverse] value → angles ----
// principal value (standard ranges; arccot uses (0°,180°)), every solution in
// [0°, 360°), and the period of the general solution.
function inverseSolve(fn, v) {
  if (!Number.isFinite(v)) return { err: "Enter a number" };
  let base = fn, w = v;
  if (fn === "csc" || fn === "sec") {
    if (Math.abs(v) < 1 - 1e-12) return { err: `${fn} θ is never between ${MINUS}1 and 1` };
    base = fn === "csc" ? "sin" : "cos"; w = 1 / v;
  }
  if ((base === "sin" || base === "cos") && Math.abs(w) > 1 + 1e-12) return { err: `${base} θ is always between ${MINUS}1 and 1` };
  w = Math.max(-1, Math.min(1, w));
  let p, raw, period;
  if (base === "sin") { p = clean(Math.asin(w) / DEG); raw = [p, 180 - p]; period = 360; }
  else if (base === "cos") { p = clean(Math.acos(w) / DEG); raw = [p, -p]; period = 360; }
  else if (fn === "tan") { p = clean(Math.atan(v) / DEG); raw = [p, p + 180]; period = 180; }
  else { p = clean(Math.atan2(1, v) / DEG); raw = [p, p + 180]; period = 180; }
  const sols = [...new Set(raw.map((s) => clean(norm360(s))))].sort((a, b) => a - b);
  const bases = period === 180 ? [clean(mod(p, 180))] : sols;
  return { principal: p, sols, period, bases };
}

// ---- [SEC:CORE/triangle] right-triangle any-two solver ----
const TRI_ORDER = ["theta", "opp", "adj", "hyp"];
// most-recent-last list of user-set fields, capped at two (oldest drops)
function triPush(order, field) { const o = order.filter((f) => f !== field); o.push(field); return o.length > 2 ? o.slice(o.length - 2) : o; }
function solveRight(known) {
  const ks = TRI_ORDER.filter((f) => known[f] != null);
  if (ks.length < 2) return { status: "need", count: ks.length };
  if (ks.length > 2) return { status: "error", err: "Set only two values" };
  let t = known.theta, o = known.opp, a = known.adj, h = known.hyp;
  if (t != null && !(t > 0 && t < 90)) return { status: "error", err: "Angle must be between 0° and 90°" };
  for (const f of ["opp", "adj", "hyp"]) if (known[f] != null && !(known[f] > 0)) return { status: "error", err: "Lengths must be greater than 0" };
  switch (ks.join("+")) {
    case "theta+hyp": o = h * trigAt("sin", t).v; a = h * trigAt("cos", t).v; break;
    case "theta+opp": h = o * trigAt("csc", t).v; a = o * trigAt("cot", t).v; break;
    case "theta+adj": h = a * trigAt("sec", t).v; o = a * trigAt("tan", t).v; break;
    case "opp+adj": h = Math.hypot(o, a); t = clean(Math.atan2(o, a) / DEG); break;
    case "opp+hyp":
      if (o >= h) return { status: "error", err: "Opposite must be shorter than the hypotenuse" };
      a = Math.sqrt(h * h - o * o); t = clean(Math.asin(o / h) / DEG); break;
    default: // adj+hyp
      if (a >= h) return { status: "error", err: "Adjacent must be shorter than the hypotenuse" };
      o = Math.sqrt(h * h - a * a); t = clean(Math.acos(a / h) / DEG);
  }
  return { status: "solved", theta: t, opp: o, adj: a, hyp: h, beta: clean(90 - t), area: (o * a) / 2, perim: o + a + h };
}

// ---- [SEC:CORE/sinusoid] y = A·f(B(x − C)) + D ----
// x, C in degrees; B is dimensionless (same in degree and radian mode).
function sinusoidInfo(p) {
  const { f, A, B, C, D } = p;
  if (![A, B, C, D].every(Number.isFinite)) return { err: "Enter all four values" };
  if (A === 0) return { err: "A can’t be 0 (the wave would be a flat line)" };
  if (B === 0) return { err: "B can’t be 0 (the period would be infinite)" };
  const P = 360 / Math.abs(B), amp = Math.abs(A);
  const key = [0, 1, 2, 3, 4].map((i) => ({ x: C + (i * P) / 4, y: A * trigAt(f, Math.sign(B) * i * 90).v + D }));
  return { amp, period: P, max: D + amp, min: D - amp, reflected: A < 0, key };
}
function sinusoidY(p, x) { const r = trigAt(p.f, p.B * (x - p.C)).v; return r == null ? null : p.A * r + p.D; }
// the sinusoid is the height of a point turning on a circle of radius |A|
// centered at y = D; phasorStart is that point's angle when x = C
function phasorStart(p) { return (p.f === "cos" ? 90 : 0) + (p.A < 0 ? 180 : 0); }
function sinusoidEq(p, unit, dp = 4) {
  const a = p.A === 1 ? "" : p.A === -1 ? MINUS : fmtNum(p.A, dp) + " ";
  const b = p.B === 1 ? "" : p.B === -1 ? MINUS : fmtNum(p.B, dp);
  const cAbs = formatAngle(Math.abs(p.C), unit, dp);
  const inner = p.C === 0 ? `${b}x` : `${b}${b ? "(" : ""}x ${p.C > 0 ? MINUS : "+"} ${cAbs}${b ? ")" : ""}`;
  const d = p.D === 0 ? "" : ` ${p.D > 0 ? "+" : MINUS} ${fmtNum(Math.abs(p.D), dp)}`;
  return `y = ${a}${p.f}(${inner})${d}`;
}

// ---- [SEC:CORE/plot] windows, ticks, sampling, layout ----
// x-axis tiled into windows of width span·period from `start`; the one holding deg
function waveWindow(deg, period = 360, start = 0, span = 1) {
  const w = period * span;
  const k = deg >= start && deg <= start + w ? 0 : Math.floor((deg - start) / w);
  return { x0: start + k * w, x1: start + (k + 1) * w };
}
const X_STEPS_DEG = [1, 2, 5, 10, 15, 30, 45, 90, 180, 360, 720, 1440, 3600, 7200, 14400, 36000, 72000];
const X_STEPS_RAD = [7.5, 15, 30, 45, 90, 180, 360, 720, 1440, 2880, 5760, 11520, 23040, 46080]; // π/24 … 256π
function xTicks(x0, x1, unit, maxTicks) {
  const steps = unit === "rad" ? X_STEPS_RAD : X_STEPS_DEG;
  const step = steps.find((s) => (x1 - x0) / s <= Math.max(2, maxTicks)) || steps[steps.length - 1];
  const ticks = [];
  for (let k = Math.ceil(x0 / step - 1e-9); k * step <= x1 + 1e-9; k++) {
    const x = k * step + 0;
    ticks.push({ x, label: unit === "rad" ? (formatPi(x, 24) ?? fmtNum(x * DEG, 2)) : fmtNum(x, 1) + "°" });
  }
  if (ticks.length >= 3) return { step, ticks };
  // very short windows (large B): nice decimal steps in the display unit
  const k = unit === "rad" ? DEG : 1, t = yTicks(x0 * k, x1 * k, maxTicks);
  return { step: t.step / k, ticks: t.ticks.map((v) => ({ x: v / k, label: fmtNum(v, 4) + (unit === "rad" ? "" : "°") })) };
}
function yTicks(y0, y1, maxTicks) {
  const span = y1 - y0;
  if (!(span > 0)) return { step: 1, ticks: [] };
  const raw = span / Math.max(2, maxTicks), mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw - 1e-12);
  const ticks = [];
  for (let k = Math.ceil(y0 / step - 1e-9); k * step <= y1 + 1e-9; k++) ticks.push(+(k * step).toFixed(10) + 0);
  return { step, ticks };
}
// where fn is undefined inside (x0, x1)
function asymptotes(fn, x0, x1) {
  const off = fn === "tan" || fn === "sec" ? 90 : fn === "cot" || fn === "csc" ? 0 : null;
  if (off == null) return [];
  const out = [];
  for (let k = Math.ceil((x0 - off) / 180); off + k * 180 < x1; k++) { const x = off + k * 180; if (x > x0) out.push(x); }
  return out;
}
// polylines [[x,y],…] of fy over [x0,x1], split at `breaks` (never drawn across)
function sampleCurve(fy, x0, x1, n, breaks = []) {
  const cuts = [x0, ...breaks.filter((b) => b > x0 && b < x1), x1];
  const segs = [];
  for (let s = 0; s < cuts.length - 1; s++) {
    const a = cuts[s], b = cuts[s + 1], eps = (b - a) * 1e-4;
    const lo = s > 0 ? a + eps : a, hi = s < cuts.length - 2 ? b - eps : b;
    const m = Math.max(2, Math.ceil((n * (b - a)) / (x1 - x0)));
    let cur = [];
    for (let i = 0; i <= m; i++) {
      const x = lo + ((hi - lo) * i) / m, y = fy(x);
      if (y == null || !Number.isFinite(y)) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
      cur.push([x, y]);
    }
    if (cur.length > 1) segs.push(cur);
  }
  return segs;
}
// canvas regions in px: circle {cx, cy, R} and/or wave plot {left, right, top, bottom}
function layoutCanvas(view, W, H) {
  if (view === "wave") return { circle: null, wave: { left: 48, right: W - 14, top: 14, bottom: H - 26 } };
  if (view === "circle") {
    const R = Math.max(40, Math.min(W / 2 - 46, H / 2 - 30));
    return { circle: { cx: W / 2, cy: H / 2, R }, wave: null };
  }
  const R = Math.max(40, Math.min(H / 2 - 30, W * 0.22));
  const cx = 46 + R;
  return { circle: { cx, cy: H / 2, R }, wave: { left: cx + R + 58, right: W - 14, top: 14, bottom: H - 26 } };
}

// ---- [SEC:CORE/edit] keypad, targets, input validation ----
const KEYPAD = ["7", "8", "9", "⌫", "4", "5", "6", "/", "1", "2", "3", "√", "0", ".", MINUS, "π", "(", ")", "°", "C"];
function keypadApply(d, k) {
  if (k === "C") return "";
  if (k === "⌫") return d.slice(0, -1);
  if (d.length >= 24) return d;
  if (k === ".") { const m = d.match(/[\d.]*$/); return m && m[0].includes(".") ? d : d + "."; }
  return d + k;
}
const EDIT_ORDER = { angle: ["theta"], inverse: ["inv"], triangle: ["theta", "opp", "adj", "hyp"], sinusoid: ["A", "B", "C", "D"] };
function nextTarget(order, cur, ok, dir = 1) {
  const n = order.length, i0 = order.indexOf(cur);
  for (let s = 1; s < n; s++) { const t = order[(((i0 + dir * s) % n) + n) % n]; if (ok(t)) return t; }
  return null;
}
// validate typed text for an edit target → { value } | { err }
function readTarget(target, src, unit, mode) {
  const isAngle = target === "theta" || target === "C";
  const r = isAngle ? parseAngle(src, unit) : parseValue(src);
  if (r.err) return { err: r.err };
  const v = isAngle ? r.deg : r.v;
  if (target === "theta" && mode === "triangle" && !(v > 0 && v < 90))
    return { err: unit === "rad" ? "Angle must be between 0 and π/2" : "Angle must be between 0° and 90°" };
  if ((target === "opp" || target === "adj" || target === "hyp") && !(v > 0)) return { err: "Length must be greater than 0" };
  if (target === "A" && v === 0) return { err: "A can’t be 0" };
  if (target === "B" && v === 0) return { err: "B can’t be 0" };
  return { value: v };
}


/* ===================== [SEC:UI-CONST] =====================
   UI-only constants. C is byte-identical to the family's token
   object; Trig-only additions live in TG so C stays shared. */
const C = {
  bg: "#0b0e13", panel: "#11151c", panel2: "#161b24", line: "#2a3344",
  ink: "#f0ece2", dim: "#aab4c5", faint: "#7f8a9d",
  brass: "#e0b46a", brassDim: "#5a4a28", cyan: "#7fe3d3", red: "#e8838c",
};
const TG = {
  violet: "#b69cf7", muted: "#5f9e95", canvas: "#0d1117", grid: "#19202b",
  axis: "#3a4556", ring: "#46546b", ghost: "#56627a",
};
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
const FONT_DISP = "'Fraunces', Georgia, serif";
const VERSION = "v0.1.1";
const FN_COLOR = { sin: C.brass, cos: C.cyan, tan: TG.violet, csc: C.brass, sec: C.cyan, cot: TG.violet };
const RECIP = { csc: true, sec: true, cot: true };
const MODES = [["angle", "Angle"], ["inverse", "Inverse"], ["triangle", "Triangle"], ["sinusoid", "Sinusoid"]];
const MODE_SUB = { angle: "ANGLE → FUNCTIONS", inverse: "VALUE → ANGLES", triangle: "RIGHT TRIANGLE", sinusoid: "SINUSOID" };
const VIEWS = [["circle", "Circle"], ["wave", "Wave"], ["both", "Both"]];
const BOTH_MIN_W = 700;             // canvas px needed for the linked side-by-side view
const ROMAN = ["", "I", "II", "III", "IV"];
const QUICK = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const TARGET_LABEL = { theta: "Angle θ", inv: "Value", opp: "Opposite", adj: "Adjacent", hyp: "Hypotenuse", A: "Amplitude A", B: "Frequency B", C: "Phase shift C", D: "Vertical shift D" };
const TRI_LABEL = { theta: "Angle θ", opp: "Opposite", adj: "Adjacent", hyp: "Hypotenuse" };
const TRI_SHORT = { theta: "θ", opp: "opp", adj: "adj", hyp: "hyp" };
const SW_LABEL = { A: "Amplitude", B: "Frequency", C: "Phase shift", D: "Vertical shift" };
const SHOW0 = { sin: true, cos: true, tan: false, csc: false, sec: false, cot: false };
const TRI0 = { order: ["theta", "hyp"], opp: null, adj: null, hyp: 10 };
const SW0 = { f: "sin", A: 2, B: 2, C: 30, D: 1 };
const INV0 = { v: 0.5, src: "1/2" };
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// ===================== [SEC:COMPONENT] =====================
// Optional props exist for the smoke-render / test gates; the deployed page
// mounts <TrigCalculator /> with defaults.
export default function TrigCalculator({
  initialMode = "angle", initialView = null, initialDeg = 30, initialUnit = "deg",
  initialCanvas = null, initialTouch = false, initialEdit = null,
} = {}) {
  // ---- state ----
  const [mode, setModeRaw] = useState(initialMode);
  const [viewPref, setViewPref] = useState(initialView);   // null = auto
  const [deg, setDeg] = useState(initialDeg);               // θ, degrees (canonical)
  const [unit, setUnitRaw] = useState(initialUnit);         // "deg" | "rad"
  const [dp, setDp] = useState(4);
  const [snap, setSnap] = useState(false);
  const [show, setShow] = useState(SHOW0);
  const [invFn, setInvFn] = useState("sin");
  const [inv, setInv] = useState(INV0);
  const [tri, setTri] = useState(TRI0);
  const [sw, setSw] = useState(SW0);
  const [ed, setEd] = useState(initialEdit ? { target: initialEdit, draft: "", err: null, anchor: null } : null);
  const [isTouch, setIsTouch] = useState(initialTouch);
  const [viewport, setViewport] = useState({ w: 1280, h: 900 });
  const [cv, setCv] = useState(initialCanvas || { w: 640, h: 420 });
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef(null);
  const inputRef = useRef(null);
  const dragRef = useRef(null);
  const edRef = useRef(ed); edRef.current = ed;
  const touchRef = useRef(isTouch); touchRef.current = isTouch;

  // ---- environment: pointer type, viewport, measured canvas ----
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(!!mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener("change", update) : mq.addListener(update);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", update) : mq.removeListener(update); };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Phone browsers change innerHeight as their toolbars slide in and out while
    // scrolling; following it rescaled the canvas mid-scroll (reported on iPhone,
    // v0.1.0). Touch devices re-read the height only when the width changes
    // (rotation); desktop windows follow every resize.
    const coarse = () => !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    let first = true;
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight, init = first;
      first = false;
      setViewport((v) => (!init && coarse() && v.w === w ? v : { w, h }));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // viewBox = the SVG's own pixel size, so text and hit targets stay real px on every screen
  useIsoLayoutEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const w = Math.round(r.width), h = Math.round(r.height);
      setCv((c) => (c.w === w && c.h === h ? c : { w, h }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // hide the coffee button while the keypad sheet covers the bottom of the screen
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("tg-sheet-open", !!ed && isTouch);
    return () => document.body.classList.remove("tg-sheet-open");
  }, [ed, isTouch]);

  // ---- derived: math ----
  const swInfo = useMemo(() => sinusoidInfo(sw), [sw]);
  const swOK = !swInfo.err;
  const invRes = useMemo(() => inverseSolve(invFn, inv.v), [invFn, inv.v]);
  const knownOf = (t, d) => { const k = {}; for (const f of t.order) k[f] = f === "theta" ? d : t[f]; return k; };
  const triRes = useMemo(() => solveRight(knownOf(tri, deg)), [tri, deg]);
  const triSolved = triRes.status === "solved";
  const thetaShown = mode === "triangle" ? (triSolved ? triRes.theta : (deg > 0 && deg < 90 ? deg : 45)) : deg;
  const vals = useMemo(() => trigAll(thetaShown), [thetaShown]);
  const qd = quadrantOf(thetaShown);
  const invText = inv.src != null ? inv.src : fmtNum(inv.v, dp);

  // ---- derived: layout & mappings ----
  const fitMode = !isTouch && viewport.w >= 900;
  const pad = 14;
  const canvasH = fitMode
    ? Math.max(320, viewport.h - 2 * pad - 262)
    : Math.max(270, Math.min(460, Math.round(viewport.h * 0.46)));
  const bothOK = cv.w >= BOTH_MIN_W;
  const fallbackView = mode === "sinusoid" ? "wave" : "circle";
  const view = viewPref == null ? (bothOK ? "both" : fallbackView) : (viewPref === "both" && !bothOK ? fallbackView : viewPref);
  const W = cv.w, H = cv.h;
  const L = layoutCanvas(view, W, H);
  const shownFns = FNS.filter((f) => show[f] || (mode === "inverse" && f === invFn));
  // vertical mapping shared by circle and wave: V(y) = midPx − (y − midY)·s
  const circR = mode === "sinusoid" && swOK ? Math.abs(sw.A) : 1;
  const circY = mode === "sinusoid" && swOK ? sw.D : 0;
  let vmap;
  if (L.circle) vmap = { s: L.circle.R / circR, midPx: L.circle.cy, midY: circY };
  else {
    let lo, hi;
    if (mode === "sinusoid" && swOK) {
      lo = Math.min(sw.D - Math.abs(sw.A), -1, 0); hi = Math.max(sw.D + Math.abs(sw.A), 1, 0);
      const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;
    } else {
      let m = shownFns.some((f) => f !== "sin" && f !== "cos") ? 3.5 : 1.25;
      if (mode === "inverse" && Number.isFinite(inv.v) && Math.abs(inv.v) <= 20) m = Math.max(m, Math.abs(inv.v) * 1.25);
      lo = -m; hi = m;
    }
    vmap = { s: (L.wave.bottom - L.wave.top) / (hi - lo), midPx: (L.wave.top + L.wave.bottom) / 2, midY: (lo + hi) / 2 };
  }
  const V = (y) => vmap.midPx - (y - vmap.midY) * vmap.s;
  const Yof = (px) => vmap.midY + (vmap.midPx - px) / vmap.s;
  const win = mode === "sinusoid" && swOK ? waveWindow(thetaShown, swInfo.period, 0, 2) : waveWindow(thetaShown, 360, 0, 1);
  const X = (x) => (L.wave ? L.wave.left + ((x - win.x0) / (win.x1 - win.x0)) * (L.wave.right - L.wave.left) : 0);
  const circleMaxX = L.wave && L.circle ? L.wave.left - 36 : W;   // circle-side labels stay left of the wave

  // ---- actions ----
  const setUnit = (u) => { setEd(null); setUnitRaw(u); };
  const setMode = (m) => {
    setEd(null);
    if (m === "triangle" && mode !== "triangle") {
      if (tri.order.includes("theta") && !(deg > 0 && deg < 90)) { const r = quadrantOf(deg).ref; setDeg(r > 0 && r < 90 ? r : 30); }
      else if (!tri.order.includes("theta")) { const r = solveRight(knownOf(tri, deg)); if (r.status === "solved") setDeg(r.theta); }
    }
    if (m === "inverse" && mode !== "inverse") {
      const t = trigAt(invFn, deg);
      if (t.v != null) setInv({ v: t.v, src: t.ex ? formatExact(t.ex) : null });
      else if (!invRes.err) setDeg(invRes.principal);
    }
    setModeRaw(m);
  };
  // θ from drag / nudge / quick chip — keeps each mode's state consistent
  const setTheta = (d) => {
    setDeg(d);
    if (mode === "inverse") { const t = trigAt(invFn, d); if (t.v != null) setInv({ v: t.v, src: t.ex ? formatExact(t.ex) : null }); }
    if (mode === "triangle") setTri((t) => (t.order.includes("theta") ? t : { ...t, order: triPush(t.order, "theta") }));
  };
  const pickInvFn = (f) => {
    setInvFn(f);
    const t = trigAt(f, deg);
    if (t.v != null) setInv({ v: t.v, src: t.ex ? formatExact(t.ex) : null });
    else { const r = inverseSolve(f, inv.v); if (!r.err) setDeg(r.principal); }
  };
  const selectSolution = (x) => setDeg(x);
  const syncTriTheta = (nt) => {
    if (nt.order.includes("theta")) return;
    const r = solveRight(knownOf(nt, deg));
    if (r.status === "solved") setDeg(r.theta);
  };
  const clearTri = () => { setEd(null); setTri({ order: [], opp: null, adj: null, hyp: null }); };
  const reset = () => {
    setEd(null); setDeg(30); setInvFn("sin"); setInv(INV0); setTri(TRI0); setSw(SW0);
    setViewPref(null); setSnap(false); setShow(SHOW0);
  };
  // apply a validated value; returns the new triangle state when it changed
  const applyValue = (target, v, src) => {
    if (target === "theta") {
      setDeg(v);
      if (mode === "triangle") { const nt = { ...tri, order: triPush(tri.order, "theta") }; setTri(nt); return nt; }
      if (mode === "inverse") { const t = trigAt(invFn, v); if (t.v != null) setInv({ v: t.v, src: t.ex ? formatExact(t.ex) : null }); }
      return null;
    }
    if (target === "inv") {
      setInv({ v, src: src.replace(/-/g, MINUS) });
      const r = inverseSolve(invFn, v);
      if (!r.err) setDeg(r.principal);
      return null;
    }
    if (target === "opp" || target === "adj" || target === "hyp") {
      const nt = { ...tri, [target]: v, order: triPush(tri.order, target) };
      setTri(nt); syncTriTheta(nt);
      return nt;
    }
    setSw((s) => ({ ...s, [target]: v }));
    return null;
  };

  // ---- editor (keypad sheet on touch, popover on desktop) ----
  const anchorOf = (target) => {
    if (typeof document === "undefined") return null;
    const el = document.querySelector(`[data-field="${target}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const openEditor = (target, el) => {
    if (target === "theta" && mode === "inverse") return;   // θ follows the value here
    let anchor = null;
    if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); anchor = { x: r.left, y: r.top, w: r.width, h: r.height }; }
    setEd({ target, draft: "", err: null, anchor });
  };
  const closeEditor = () => setEd(null);
  const order = EDIT_ORDER[mode];
  const hasNext = !!ed && order.length > 1 && order.includes(ed.target);
  const moveEditor = (from, dir, nt) => {
    let t = null;
    if (mode === "triangle") {
      const o = (nt || tri).order;
      if (dir > 0 && o.length >= 2) return setEd(null);   // solved → done
      t = nextTarget(order, from, (f) => !o.includes(f), dir) || nextTarget(order, from, () => true, dir);
    } else if (mode === "sinusoid") {
      if (dir > 0 && order.indexOf(from) === order.length - 1) return setEd(null);
      t = nextTarget(order, from, () => true, dir);
    }
    if (!t) return setEd(null);
    setEd({ target: t, draft: "", err: null, anchor: anchorOf(t) });
  };
  const commit = (how) => {
    const e = edRef.current;
    if (!e) return;
    const src = e.draft.trim();
    if (src === "") { if (how === "set") setEd(null); else moveEditor(e.target, how === "prev" ? -1 : 1, null); return; }
    const r = readTarget(e.target, src, unit, mode);
    if (r.err) { setEd({ ...e, err: r.err }); return; }
    const nt = applyValue(e.target, r.value, src);
    if (how === "set") setEd(null);
    else moveEditor(e.target, how === "prev" ? -1 : 1, nt);
  };
  const commitRef = useRef(commit); commitRef.current = commit;
  // a touch tap fires pointerdown AND a follow-up click; press on pointerdown for
  // speed and let click through only for keyboard activation (no pointerdown)
  const keyDownRef = useRef({ k: null, t: 0 });
  const pressKey = (k) => setEd((e) => (e ? { ...e, draft: keypadApply(e.draft, k), err: null } : e));
  const insertText = (q) => {
    setEd((e) => (e ? { ...e, draft: e.draft + q, err: null } : e));
    if (inputRef.current) inputRef.current.focus();
  };
  // Esc closes; outside click closes the popover; hardware keys drive the sheet
  const edOpen = !!ed;
  useEffect(() => {
    if (!edOpen || typeof window === "undefined") return;
    const onKey = (e) => {
      if (e.key === "Escape") { setEd(null); return; }
      if (!touchRef.current) return;
      const map = { Backspace: "⌫", "-": MINUS, "*": null };
      const k = /^[0-9./()]$/.test(e.key) ? e.key : map[e.key];
      if (k) { e.preventDefault(); pressKey(k); } else if (e.key === "Enter") { e.preventDefault(); commitRef.current("set"); }
    };
    const onDown = (e) => {
      if (touchRef.current) return;
      const t = e.target;
      if (t && t.closest && (t.closest(".tg-pop") || t.closest("[data-field]") || t.closest("[data-ed]"))) return;
      setEd(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown, true); };
  }, [edOpen]);

  // ---- canvas gestures ----
  const toLocal = (e) => {
    const el = svgRef.current;
    const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const sx = r.width ? W / r.width : 1, sy = r.height ? H / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };
  const snapDeg = (a, tol) => { const k = Math.round(a / 15) * 15 + 0; return snap || Math.abs(a - k) <= tol ? k : a; };
  const triClamp = (a, linear) => {
    let d = linear ? a : (a > 0 && a < 90 ? a : (a >= 90 && a <= 225 ? 90 : 0));
    d = snapDeg(d, 2);
    return snap ? Math.min(75, Math.max(15, d)) : Math.min(89, Math.max(1, d));
  };
  const pickPanel = (p) => (L.wave && (!L.circle || p.x >= L.wave.left - 24) ? "wave" : L.circle ? "circle" : null);
  const thetaFromPoint = (p, panel) => {
    if (panel === "circle" && L.circle) {
      const { cx, cy } = L.circle;
      if (Math.hypot(p.x - cx, p.y - cy) < 4) return null;
      const phi = norm360(Math.atan2(cy - p.y, p.x - cx) / DEG);
      if (mode === "sinusoid" && swOK) {
        const u = snapDeg(norm360(phi - phasorStart(sw)), 2);
        const base = sw.C + mod(u / sw.B, swInfo.period);
        return clean(base + Math.round((deg - base) / swInfo.period) * swInfo.period);
      }
      return mode === "triangle" ? triClamp(phi, false) : snapDeg(phi, 2);
    }
    if (panel === "wave" && L.wave) {
      const { left, right } = L.wave;
      const x = win.x0 + ((Math.min(right, Math.max(left, p.x)) - left) / (right - left)) * (win.x1 - win.x0);
      const d = Math.min(win.x1, Math.max(win.x0, snapDeg(x, (8 * (win.x1 - win.x0)) / (right - left))));
      return mode === "triangle" ? triClamp(d, true) : d;
    }
    return null;
  };
  const onSvgDown = (e) => {
    if (e.button != null && e.button > 0) return;
    const hit = e.target && e.target.closest ? e.target.closest("[data-ed],[data-sol],[data-handle]") : null;
    const p = toLocal(e);
    const base = { id: e.pointerId, sx: p.x, sy: p.y, moved: false };
    if (hit && hit.getAttribute("data-ed")) { dragRef.current = { ...base, kind: "label", target: hit.getAttribute("data-ed"), el: hit }; return; }
    if (hit && hit.hasAttribute("data-sol")) { dragRef.current = { ...base, kind: "sol", sol: +hit.getAttribute("data-sol") }; return; }
    const panel = pickPanel(p);
    if (!panel) return;
    e.preventDefault();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (err) { /* jsdom / old browsers */ }
    if (!isTouch) { try { svgRef.current.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }
    dragRef.current = { ...base, kind: hit ? "handle" : "drag", panel, el: hit };
    if (!hit) { const d = thetaFromPoint(p, panel); if (d != null) setTheta(d); }
    setDragging(true);
  };
  const onSvgMove = (e) => {
    const g = dragRef.current;
    if (!g || g.id !== e.pointerId) return;
    const p = toLocal(e);
    if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 6) g.moved = true;
    if (g.kind === "drag" || (g.kind === "handle" && g.moved)) { const d = thetaFromPoint(p, g.panel); if (d != null) setTheta(d); }
  };
  const onSvgUp = (e) => {
    const g = dragRef.current;
    if (!g || g.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const p = toLocal(e);
    const moved = g.moved || Math.hypot(p.x - g.sx, p.y - g.sy) > 6;
    if (moved) return;
    if (g.kind === "label") openEditor(g.target, g.el);
    else if (g.kind === "sol") selectSolution(g.sol);
    else if (g.kind === "handle") openEditor("theta", g.el);
  };
  const onSvgKey = (e) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    let d = clean(thetaShown + dir * (e.shiftKey ? 15 : 1));
    if (mode === "triangle") d = Math.min(89, Math.max(1, d));
    setTheta(d);
  };

  // ---- canvas drawing helpers ----
  const clampBox = (x, y, hw, hh, maxX = W) => ({ x: Math.max(hw + 2, Math.min(maxX - hw - 2, x)), y: Math.max(hh + 2, Math.min(H - hh - 2, y)) });
  const label = (key, x, y, text, color, opt = {}) => {
    const size = opt.size || 12, w = text.length * size * 0.62 + 12, h = size + 10;
    const p = clampBox(x, y, w / 2, h / 2, opt.maxX);
    return (
      <g key={key} data-ed={opt.ed || undefined} className={opt.ed ? "tg-cv-label is-ed" : "tg-cv-label"} pointerEvents={opt.ed ? undefined : "none"}>
        {opt.ed && isTouch && <rect x={p.x - w / 2 - 8} y={p.y - h / 2 - 8} width={w + 16} height={h + 16} fill="transparent" />}
        <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx="5" fill={C.panel2} stroke={opt.ed ? color : C.line} strokeOpacity={opt.ed ? 0.6 : 1} />
        <text x={p.x} y={p.y + 0.5} fill={color} fontSize={size} fontFamily={FONT_MONO} textAnchor="middle" dominantBaseline="middle">{text}</text>
      </g>
    );
  };
  const arrowHead = (key, x, y, dx, dy, color, size = 6) => {
    const L2 = Math.hypot(dx, dy) || 1, ux = dx / L2, uy = dy / L2;
    const bx = x - ux * size, by = y - uy * size;
    return <polygon key={key} points={`${x},${y} ${bx - uy * size * 0.6},${by + ux * size * 0.6} ${bx + uy * size * 0.6},${by - ux * size * 0.6}`} fill={color} />;
  };
  // arc (or spiral past one turn) from angle a0 to a1 (deg, CCW positive) around (cx,cy)
  const arcPath = (cx, cy, r0, a0, a1, gap = 5) => {
    const span = a1 - a0, n = Math.max(2, Math.ceil(Math.abs(span) / 4));
    let d = "";
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n, r = r0 + (gap * Math.abs(a - a0)) / 360;
      d += `${i ? "L" : "M"}${(cx + r * Math.cos(a * DEG)).toFixed(2)} ${(cy - r * Math.sin(a * DEG)).toFixed(2)}`;
    }
    return d;
  };
  const thetaEditable = mode === "angle" || mode === "triangle" || mode === "sinusoid";
  const exactOrNum = (r, d = 3) => (r.v == null ? "undef" : r.ex ? formatExact(r.ex) : fmtNum(r.v, d));

  // ---- circle panel ----
  const renderCircle = () => {
    const { cx, cy, R } = L.circle;
    const out = [];
    const ringLabels = (skipNear, seg) => {
      const angles = R >= 110 ? QUICK : [0, 90, 180, 270];
      const r = R + (unit === "rad" ? 17 : 15);
      const offLine = (a) => {   // keep labels ≥ 10 px from the inverse guide line
        if (!seg) return true;
        const px = cx + r * Math.cos(a * DEG), py = cy - r * Math.sin(a * DEG), dx = seg[2] - seg[0], dy = seg[3] - seg[1];
        return Math.abs(dx * (seg[1] - py) - (seg[0] - px) * dy) / (Math.hypot(dx, dy) || 1) > 10;
      };
      return angles.filter((a) => (skipNear == null || Math.abs(((a - skipNear + 540) % 360) - 180) > 18) && offLine(a)).map((a) => {
        return (
          <text key={"rl" + a} x={cx + r * Math.cos(a * DEG)} y={cy - r * Math.sin(a * DEG)} className="tg-ring-label"
            textAnchor="middle" dominantBaseline="middle">{unit === "rad" ? formatPi(a) : a + "°"}</text>
        );
      });
    };
    const ticks = () => Array.from({ length: 24 }, (_, k) => {
      const a = k * 15, big = a % 30 === 0 || a % 45 === 0, r1 = R - (big ? 7 : 4);
      return <line key={"tk" + k} x1={cx + R * Math.cos(a * DEG)} y1={cy - R * Math.sin(a * DEG)} x2={cx + r1 * Math.cos(a * DEG)} y2={cy - r1 * Math.sin(a * DEG)} className="tg-tick" />;
    });

    if (mode === "triangle") return renderTriangle();

    if (mode === "sinusoid" && swOK) {
      const u = mod(sw.B * (thetaShown - sw.C), 360), ph0 = phasorStart(sw), phi = ph0 + u;
      const Px = cx + R * Math.cos(phi * DEG), Py = cy - R * Math.sin(phi * DEG), y = sinusoidY(sw, thetaShown);
      const y0 = V(0);
      if (y0 > 4 && y0 < H - 4) out.push(<line key="x0" x1={cx - R - 24} y1={y0} x2={Math.min(circleMaxX, cx + R + 24)} y2={y0} className="tg-axis" />);
      out.push(<line key="mid" x1={cx - R - 24} y1={cy} x2={Math.min(circleMaxX, cx + R + 24)} y2={cy} className="tg-midline" />);
      out.push(<circle key="ring" cx={cx} cy={cy} r={R} className="tg-ring" />);
      out.push(<line key="start" x1={cx} y1={cy} x2={cx + R * Math.cos(ph0 * DEG)} y2={cy - R * Math.sin(ph0 * DEG)} className="tg-guide" />);
      const r0 = Math.max(16, R * 0.22);
      if (u > 0.5) {
        out.push(<path key="uarc" d={arcPath(cx, cy, r0, ph0, phi, 0)} className="tg-arc" />);
        if (u > 12) out.push(arrowHead("uah", cx + r0 * Math.cos(phi * DEG), cy - r0 * Math.sin(phi * DEG), -Math.sin(phi * DEG), -Math.cos(phi * DEG), C.dim));
      }
      out.push(<line key="rad" x1={cx} y1={cy} x2={Px} y2={Py} className="tg-ray" />);
      out.push(<line key="leg" x1={Px} y1={Py} x2={Px} y2={cy} stroke={C.brass} strokeWidth="3" strokeLinecap="round" />);
      const ma = ph0 + u / 2;
      if (u > 1) out.push(label("ulab", cx + (r0 + 24) * Math.cos(ma * DEG), cy - (r0 + 24) * Math.sin(ma * DEG), `u = ${formatAngle(u, unit, 1)}`, C.dim, { size: 11, maxX: circleMaxX }));
      out.push(label("rlab", cx - R * 0.55, cy + R + 16 > H - 12 ? cy + R - 10 : cy + R + 14, `radius |A| = ${fmtNum(swInfo.amp, 3)}`, C.faint, { size: 10.5, maxX: circleMaxX }));
      out.push(...handleAt(Px, Py));
      const dirx = Math.cos(phi * DEG), diry = -Math.sin(phi * DEG);
      out.push(label("ylab", Px + dirx * 46, Py + diry * 24, `y = ${fmtNum(y, 3)}`, C.brass, { size: 12, maxX: circleMaxX }));
      return out;
    }

    // base modes: unit circle
    const th = thetaShown, cs = vals.cos.v, sn = vals.sin.v;
    const Px = cx + R * cs, Py = cy - R * sn, Fx = Px;
    out.push(<line key="ax" x1={cx - R - 22} y1={cy} x2={Math.min(circleMaxX + 10, cx + R + 22)} y2={cy} className="tg-axis" />);
    out.push(<line key="ay" x1={cx} y1={cy - R - 22} x2={cx} y2={cy + R + 22} className="tg-axis" />);
    out.push(<circle key="ring" cx={cx} cy={cy} r={R} className="tg-ring" />);
    out.push(...ticks());
    out.push(...ringLabels(norm360(th), mode === "inverse" ? inverseSegment(cx, cy, R) : null));
    // angle arc (spiral when |θ| > 360°)
    const r0 = Math.max(16, R * 0.2);
    if (Math.abs(th) > 0.5) {
      const a0 = Math.abs(th) > 1800 ? th - Math.sign(th) * 1800 : 0;
      out.push(<path key="arc" d={arcPath(cx, cy, r0, a0, th)} className="tg-arc" />);
      if (Math.abs(th) >= 12) {
        const rr = r0 + (5 * Math.abs(th - a0)) / 360, sg = Math.sign(th);
        out.push(arrowHead("ah", cx + rr * Math.cos(th * DEG), cy - rr * Math.sin(th * DEG), -sg * Math.sin(th * DEG), -sg * Math.cos(th * DEG), C.dim));
      }
    }
    // reference angle
    if (qd.q > 1) {
      const axisA = qd.q === 2 ? 180 : qd.q === 3 ? 180 : 360, from = qd.q === 2 ? qd.n : axisA, to = qd.q === 2 ? 180 : qd.n;
      out.push(<path key="refarc" d={arcPath(cx, cy, R * 0.34, from, to, 0)} className="tg-refarc" />);
    }
    // tangent construction
    if (show.tan && vals.tan.v != null) {
      const Ty = Math.max(-4 * H, Math.min(5 * H, cy - R * vals.tan.v));
      const k = Math.max(-5 * H, Math.min(5 * H, R / cs));          // signed distance to T along the ray (R·sec θ)
      out.push(<line key="tline" x1={cx + R} y1={4} x2={cx + R} y2={H - 4} className="tg-guide" />);
      out.push(<line key="tray" x1={cx} y1={cy} x2={cx + k * cs} y2={cy - k * sn} stroke={TG.violet} strokeWidth="1.2" strokeDasharray="4 4" opacity="0.8" />);
      out.push(<line key="tseg" x1={cx + R} y1={cy} x2={cx + R} y2={Ty} stroke={TG.violet} strokeWidth="3" strokeLinecap="round" />);
      if (Ty > 0 && Ty < H) out.push(<circle key="tdot" cx={cx + R} cy={Ty} r="3.5" fill={TG.violet} />);
    }
    // inverse overlays
    if (mode === "inverse") out.push(...inverseCircle(cx, cy, R));
    // reference triangle legs
    const legSin = show.sin || (mode === "inverse" && (invFn === "sin" || invFn === "csc"));
    const legCos = show.cos || (mode === "inverse" && (invFn === "cos" || invFn === "sec"));
    out.push(<line key="ray" x1={cx} y1={cy} x2={Px} y2={Py} className="tg-ray" />);
    if (legCos && Math.abs(cs) > 1e-9) out.push(<line key="lcos" x1={cx} y1={cy} x2={Fx} y2={cy} stroke={C.cyan} strokeWidth="3" strokeLinecap="round" />);
    if (legSin && Math.abs(sn) > 1e-9) out.push(<line key="lsin" x1={Fx} y1={cy} x2={Px} y2={Py} stroke={C.brass} strokeWidth="3" strokeLinecap="round" />);
    if (legSin && legCos && Math.abs(cs) > 0.06 && Math.abs(sn) > 0.06) {
      const hx = -Math.sign(cs) * 8, vy = Math.sign(sn) * -8;
      out.push(<path key="rt" d={`M${Fx + hx} ${cy}L${Fx + hx} ${cy + vy}L${Fx} ${cy + vy}`} className="tg-rtmark" />);
    }
    // θ label
    const la = Math.abs(th) <= 360 ? th / 2 : th - (Math.sign(th) * ((Math.abs(th) % 360) || 360)) / 2;
    const lr = r0 + (Math.abs(th) > 360 ? 5 * Math.min(5, Math.floor(Math.abs(th) / 360)) : 0) + 22;
    out.push(label("thl", cx + lr * Math.cos(la * DEG), cy - lr * Math.sin(la * DEG), formatAngle(th, unit, 2), C.ink, { ed: thetaEditable ? "theta" : null, maxX: circleMaxX }));
    // point + coordinates
    out.push(...handleAt(Px, Py));
    const coord = `(${exactOrNum(vals.cos)}, ${exactOrNum(vals.sin)})`;
    const cw = coord.length * 11 * 0.62 + 12, dirx = cs, diry = -sn;
    const off = 34 + Math.abs(dirx) * cw / 2 + Math.abs(diry) * 10.5;
    out.push(label("coord", Px + dirx * off, Py + diry * off, coord, C.ink, { size: 11, maxX: circleMaxX }));
    return out;
  };
  const handleAt = (x, y) => [
    <circle key="hit" cx={x} cy={y} r={isTouch ? 24 : 14} fill="transparent" data-handle="p" className="tg-handle" />,
    <circle key="pt" cx={x} cy={y} r={isTouch ? 9 : 7} fill={C.brass} stroke={C.bg} strokeWidth="2" pointerEvents="none" />,
  ];
  // the inverse guide on the circle: y = v (sin/csc), x = v (cos/sec), or a line
  // through the center (tan/cot); null when it would sit off the circle
  const inverseSegment = (cx, cy, R) => {
    const v = inv.v, ext = R + 16;
    if (invFn === "sin" || invFn === "csc") {
      if (invFn === "csc" && v === 0) return null;
      const y0 = invFn === "sin" ? v : 1 / v;
      return Math.abs(y0) <= 1.3 ? [cx - ext, cy - R * y0, Math.min(circleMaxX, cx + ext), cy - R * y0] : null;
    }
    if (invFn === "cos" || invFn === "sec") {
      if (invFn === "sec" && v === 0) return null;
      const x0 = invFn === "cos" ? v : 1 / v;
      return Math.abs(x0) <= 1.3 ? [cx + R * x0, cy - ext, cx + R * x0, cy + ext] : null;
    }
    const dx = invFn === "tan" ? 1 : v, dy = invFn === "tan" ? v : 1, n = Math.hypot(dx, dy);
    return [cx - (dx / n) * ext, cy + (dy / n) * ext, cx + (dx / n) * ext, cy - (dy / n) * ext];
  };
  const inverseCircle = (cx, cy, R) => {
    const out = [], col = FN_COLOR[invFn], v = inv.v;
    const seg = inverseSegment(cx, cy, R);
    if (invFn === "tan" && Math.abs(v) <= 1.3) {
      out.push(<line key="itl" x1={cx + R} y1={4} x2={cx + R} y2={H - 4} className="tg-guide" />);
      out.push(<circle key="itd" cx={cx + R} cy={cy - R * v} r="4" fill={col} />);
    }
    if (seg) out.push(<line key="iseg" x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} stroke={col} strokeWidth="1.6" strokeDasharray="6 5" className="tg-invline" />);
    if (!invRes.err) invRes.sols.forEach((s, i) => {
      const x = cx + R * trigAt("cos", s).v, y = cy - R * trigAt("sin", s).v;
      out.push(
        <g key={"sol" + i} data-sol={s} className="tg-solmark">
          <circle cx={x} cy={y} r={isTouch ? 20 : 12} fill="transparent" />
          <circle cx={x} cy={y} r="6.5" fill={C.bg} stroke={col} strokeWidth="2" />
        </g>
      );
    });
    return out;
  };

  // ---- triangle panel (right-triangle mode, circle view) ----
  const renderTriangle = () => {
    const out = [];
    const both = view === "both";
    let ox, oy, R;
    if (both) ({ cx: ox, cy: oy, R } = L.circle);
    else { R = Math.max(80, Math.min(W - 150, H - 64)); ox = Math.max(52, (W - R) / 2 - 24); oy = Math.min(H - 38, (H + R) / 2 + 12); }
    const th = thetaShown, c = vals.cos.v, s = vals.sin.v;
    const Fx = ox + R * c, Px = Fx, Py = oy - R * s;
    const st = (f) => (tri.order.includes(f) ? "set" : triSolved ? "computed" : "free");
    const colOf = (f) => ({ set: C.brass, computed: TG.muted, free: C.faint }[st(f)]);
    const valOf = (f) => (triSolved ? triRes[f] : tri.order.includes(f) ? (f === "theta" ? deg : tri[f]) : null);
    const txt = (f) => { const v = valOf(f); return v == null ? `${TRI_SHORT[f]} = ?` : `${TRI_SHORT[f]} = ${f === "theta" ? formatAngle(v, unit, 2) : fmtNum(v, Math.min(dp, 3))}`; };
    if (both) {
      out.push(<line key="ax" x1={ox - R - 22} y1={oy} x2={Math.min(circleMaxX + 10, ox + R + 22)} y2={oy} className="tg-axis" />);
      out.push(<line key="ay" x1={ox} y1={oy - R - 22} x2={ox} y2={oy + R + 22} className="tg-axis" />);
      out.push(<circle key="ring" cx={ox} cy={oy} r={R} className="tg-ring" opacity="0.6" />);
    } else {
      out.push(<line key="ax" x1={ox - 14} y1={oy} x2={ox + R + 18} y2={oy} className="tg-axis" />);
      out.push(<line key="ay" x1={ox} y1={oy + 14} x2={ox} y2={oy - R - 18} className="tg-axis" />);
      out.push(<path key="qarc" d={`M${ox + R} ${oy}A${R} ${R} 0 0 0 ${ox} ${oy - R}`} className="tg-ring" strokeDasharray="3 5" />);
    }
    out.push(<polygon key="tri" points={`${ox},${oy} ${Fx},${oy} ${Px},${Py}`} fill="url(#tg-tfill)" />);
    out.push(<line key="eadj" x1={ox} y1={oy} x2={Fx} y2={oy} stroke={colOf("adj")} strokeWidth="2.6" strokeLinecap="round" />);
    out.push(<line key="eopp" x1={Fx} y1={oy} x2={Px} y2={Py} stroke={colOf("opp")} strokeWidth="2.6" strokeLinecap="round" />);
    out.push(<line key="ehyp" x1={ox} y1={oy} x2={Px} y2={Py} stroke={colOf("hyp")} strokeWidth="2.6" strokeLinecap="round" />);
    const m = Math.min(10, R * c * 0.3, R * s * 0.3);
    out.push(<path key="rt" d={`M${Fx - m} ${oy}L${Fx - m} ${oy - m}L${Fx} ${oy - m}`} className="tg-rtmark" />);
    out.push(<path key="tarc" d={arcPath(ox, oy, 30, 0, th, 0)} stroke={colOf("theta")} className="tg-arc-tri" />);
    const bR = 22;
    out.push(<path key="barc" d={arcPath(Px, Py, bR, 270, 180 + th, 0)} className="tg-refarc" />);
    const bMid = (270 + 180 + th) / 2;
    if (R * s > 90 && R * c > 90) out.push(<text key="btxt" x={Px + (bR + 14) * Math.cos(bMid * DEG)} y={Py - (bR + 14) * Math.sin(bMid * DEG)} className="tg-ring-label" textAnchor="middle" dominantBaseline="middle">{triSolved ? formatAngle(triRes.beta, unit, 1) : "β"}</text>);
    const maxX = both ? circleMaxX : W;
    out.push(label("lth", ox + 58 * Math.cos((th / 2) * DEG), oy - 58 * Math.sin((th / 2) * DEG), txt("theta"), colOf("theta"), { ed: "theta", size: 11.5, maxX }));
    out.push(label("ladj", (ox + Fx) / 2, oy + 17, txt("adj"), colOf("adj"), { ed: "adj", size: 11.5, maxX }));
    const tw = txt("opp").length * 11.5 * 0.62 + 12;
    out.push(label("lopp", Fx + 10 + tw / 2, (oy + Py) / 2, txt("opp"), colOf("opp"), { ed: "opp", size: 11.5, maxX }));
    const hw = txt("hyp").length * 11.5 * 0.62 + 12, nx = -s, ny = -c;
    const hoff = 12 + Math.abs(nx) * hw / 2 + Math.abs(ny) * 10.75;
    out.push(label("lhyp", (ox + Px) / 2 + nx * hoff, (oy + Py) / 2 + ny * hoff, txt("hyp"), colOf("hyp"), { ed: "hyp", size: 11.5, maxX }));
    out.push(...handleAt(Px, Py));
    return out;
  };

  // ---- wave panel ----
  const curveKey = L.wave ? JSON.stringify([L.wave, win, vmap, mode, show, invFn, sw]) : "";
  const curves = useMemo(() => {
    if (!L.wave) return [];
    const { top, bottom } = L.wave;
    const n = Math.min(900, Math.max(160, Math.round((L.wave.right - L.wave.left) / 1.5)));
    const cl = (py) => Math.max(top - 600, Math.min(bottom + 600, py));
    const toPath = (segs) => segs.map((sg) => sg.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${cl(V(y)).toFixed(1)}`).join("")).join("");
    const list = [];
    if (mode === "sinusoid") {
      if (!swOK) return list;
      if (win.x1 - win.x0 <= 360 * 40) list.push({ key: "base", d: toPath(sampleCurve((x) => trigAt(sw.f, x).v, win.x0, win.x1, n)), stroke: TG.ghost, w: 1.4, dash: "5 5", op: 1 });
      list.push({ key: "wave", d: toPath(sampleCurve((x) => sinusoidY(sw, x), win.x0, win.x1, n)), stroke: C.brass, w: 2.6, op: 1 });
      return list;
    }
    const fns = FNS.filter((f) => show[f] || (mode === "inverse" && f === invFn));
    const primary = (f) => mode !== "inverse" || f === invFn;
    for (const f of [...fns.filter((f) => !primary(f)), ...fns.filter(primary)]) {
      list.push({
        key: f, d: toPath(sampleCurve((x) => trigAt(f, x).v, win.x0, win.x1, n, asymptotes(f, win.x0, win.x1))),
        stroke: FN_COLOR[f], w: primary(f) ? (RECIP[f] ? 1.8 : 2.2) : 1.4, dash: RECIP[f] ? "7 4" : null, op: primary(f) ? 0.95 : 0.35,
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curveKey]);

  const renderWave = () => {
    const { left, right, top, bottom } = L.wave;
    const out = [];
    const xt = xTicks(win.x0, win.x1, unit, Math.max(2, Math.floor((right - left) / 58)));
    const yt = yTicks(Yof(bottom), Yof(top), Math.max(2, Math.floor((bottom - top) / 58)));
    out.push(<rect key="bg" x={left} y={top} width={right - left} height={bottom - top} className="tg-plot-bg" />);
    xt.ticks.forEach((t, i) => out.push(<line key={"gx" + i} x1={X(t.x)} y1={top} x2={X(t.x)} y2={bottom} className="tg-grid" />));
    yt.ticks.forEach((y, i) => out.push(<line key={"gy" + i} x1={left} y1={V(y)} x2={right} y2={V(y)} className="tg-grid" />));
    const y0 = V(0);
    if (y0 >= top && y0 <= bottom) out.push(<line key="xax" x1={left} y1={y0} x2={right} y2={y0} className="tg-axis" />);
    if (win.x0 <= 0 && win.x1 >= 0) out.push(<line key="yax" x1={X(0)} y1={top} x2={X(0)} y2={bottom} className="tg-axis" />);
    xt.ticks.forEach((t, i) => out.push(<text key={"xl" + i} x={X(t.x)} y={bottom + 16} className="tg-tick-label" textAnchor="middle">{t.label}</text>));
    yt.ticks.forEach((y, i) => out.push(<text key={"yl" + i} x={left - 6} y={V(y)} className="tg-tick-label" textAnchor="end" dominantBaseline="middle">{fmtNum(y, 2)}</text>));
    const inner = [];
    if (mode !== "sinusoid") {
      const asy = new Set();
      shownFns.forEach((f) => asymptotes(f, win.x0, win.x1).forEach((x) => asy.add(x)));
      [...asy].forEach((x, i) => inner.push(<line key={"as" + i} x1={X(x)} y1={top} x2={X(x)} y2={bottom} className="tg-asym" />));
    }
    curves.forEach((c) => inner.push(<path key={"cv" + c.key} d={c.d} fill="none" stroke={c.stroke} strokeWidth={c.w} strokeDasharray={c.dash || undefined} opacity={c.op} strokeLinejoin="round" />));
    if (mode === "inverse") inner.push(...inverseWave());
    if (mode === "sinusoid" && swOK) inner.push(...sinusoidWave());
    out.push(<g key="inner" clipPath="url(#tg-wclip)">{inner}</g>);
    out.push(...markerWave());
    return out;
  };
  const inverseWave = () => {
    const { left, right, top, bottom } = L.wave, out = [], col = FN_COLOR[invFn], py = V(inv.v);
    if (!(py > top - 40 && py < bottom + 40)) return out;
    out.push(<line key="ivl" x1={left} y1={py} x2={right} y2={py} stroke={col} strokeWidth="1.5" strokeDasharray="6 5" />);
    if (invRes.err) return out;
    const xs = [];
    invRes.sols.forEach((s) => { for (let k = Math.ceil((win.x0 - s) / 360 - 1e-9); s + 360 * k <= win.x1 + 1e-9; k++) xs.push(clean(s + 360 * k)); });
    xs.forEach((x, i) => {
      const cur = Math.abs(x - thetaShown) < 1e-6;
      out.push(
        <g key={"ws" + i} data-sol={x} className="tg-solmark">
          <circle cx={X(x)} cy={py} r={isTouch ? 18 : 11} fill="transparent" />
          <circle cx={X(x)} cy={py} r={cur ? 6 : 5.5} fill={cur ? col : C.bg} stroke={col} strokeWidth="2" />
        </g>
      );
    });
    return out;
  };
  const sinusoidWave = () => {
    const { left, right, top } = L.wave, out = [], P = swInfo.period, q = P / 4;
    out.push(<line key="mid" x1={left} y1={V(sw.D)} x2={right} y2={V(sw.D)} className="tg-midline" />);
    out.push(<line key="mx" x1={left} y1={V(swInfo.max)} x2={right} y2={V(swInfo.max)} className="tg-extreme" />);
    out.push(<line key="mn" x1={left} y1={V(swInfo.min)} x2={right} y2={V(swInfo.min)} className="tg-extreme" />);
    const i0 = Math.ceil((win.x0 - sw.C) / q - 1e-9), i1 = Math.floor((win.x1 - sw.C) / q + 1e-9);
    for (let i = i0; i <= i1 && i - i0 < 64; i++) {
      const x = sw.C + i * q, y = sinusoidY(sw, x);
      if (y != null) out.push(<circle key={"kp" + i} cx={X(x)} cy={V(y)} r="3.5" className="tg-keypt" />);
    }
    // period bracket over the first whole period in view, amplitude at its peak
    const s0 = sw.C + Math.ceil((win.x0 - sw.C) / P - 1e-9) * P;
    if (s0 + P <= win.x1 + 1e-9) {
      const yb = Math.max(top + 10, V(swInfo.max) - 14);
      out.push(<path key="pb" d={`M${X(s0)} ${yb + 5}V${yb}H${X(s0 + P)}V${yb + 5}`} className="tg-bracket" />);
      out.push(<text key="pbt" x={(X(s0) + X(s0 + P)) / 2} y={yb - 5} className="tg-anno" textAnchor="middle">{`period ${formatAngle(P, unit, 2)}`}</text>);
      const peak = swInfo.key.find((k) => Math.abs(k.y - swInfo.max) < 1e-9);
      if (peak) {
        const xp = X(s0 + (peak.x - sw.C));
        out.push(<line key="amp" x1={xp} y1={V(sw.D)} x2={xp} y2={V(swInfo.max)} className="tg-bracket" />);
        out.push(<text key="ampt" x={xp + 6} y={(V(sw.D) + V(swInfo.max)) / 2} className="tg-anno" dominantBaseline="middle">{`|A| = ${fmtNum(swInfo.amp, 3)}`}</text>);
      }
    }
    if (sw.C !== 0 && win.x0 <= Math.min(0, sw.C) && win.x1 >= Math.max(0, sw.C)) {
      const yc = V(sw.D) + 16;
      out.push(<line key="ph" x1={X(0)} y1={yc} x2={X(sw.C)} y2={yc} className="tg-bracket" />);
      out.push(arrowHead("pha", X(sw.C), yc, sw.C > 0 ? 1 : -1, 0, C.dim, 5));
      out.push(<text key="pht" x={X(sw.C) + (sw.C > 0 ? 6 : -6)} y={yc} className="tg-anno" textAnchor={sw.C > 0 ? "start" : "end"} dominantBaseline="middle">{`C = ${formatAngle(sw.C, unit, 2)}`}</text>);
    }
    return out;
  };
  const markerWave = () => {
    const { left, right, top, bottom } = L.wave, out = [], th = thetaShown;
    if (th < win.x0 - 1e-9 || th > win.x1 + 1e-9) return out;
    const tx = X(th);
    out.push(<line key="mk" x1={tx} y1={top} x2={tx} y2={bottom} className="tg-marker" />);
    const dots = [];
    if (mode === "sinusoid") { if (swOK) { const y = sinusoidY(sw, th); if (y != null) dots.push({ f: "wave", y, col: C.brass, text: fmtNum(y, 3) }); } }
    else shownFns.forEach((f) => { const r = vals[f]; if (r.v != null && (mode !== "inverse" || f === invFn)) dots.push({ f, y: r.v, col: FN_COLOR[f], text: exactOrNum(r) }); });
    const vis = dots.filter((d) => V(d.y) >= top - 2 && V(d.y) <= bottom + 2).sort((a, b) => V(a.y) - V(b.y));
    let lastY = -1e9;
    vis.forEach((d) => {
      out.push(<circle key={"md" + d.f} cx={tx} cy={V(d.y)} r="4.5" fill={d.col} stroke={C.bg} strokeWidth="1.5" pointerEvents="none" />);
      const w = d.text.length * 11 * 0.62 + 12, side = tx + 10 + w + 4 > right ? -1 : 1;
      const ly = Math.max(V(d.y), lastY + 22); lastY = ly;
      out.push(label("ml" + d.f, tx + side * (10 + w / 2), ly, d.text, d.col, { size: 11 }));
    });
    const tl = (mode === "sinusoid" ? "x = " : "θ = ") + formatAngle(th, unit, 2);
    out.push(label("mtl", tx, mode === "sinusoid" ? bottom - 13 : top + 12, tl, C.ink, { ed: thetaEditable ? "theta" : null, size: 11.5 }));
    return out;
  };
  const renderLinks = () => {
    if (view !== "both" || !L.circle || !L.wave) return null;
    const th = thetaShown;
    if (th < win.x0 - 1e-9 || th > win.x1 + 1e-9) return null;
    const { cx, cy, R } = L.circle, tx = X(th), out = [];
    if (mode === "sinusoid") {
      if (!swOK) return null;
      const u = mod(sw.B * (th - sw.C), 360), phi = phasorStart(sw) + u;
      const Px = cx + R * Math.cos(phi * DEG), Py = cy - R * Math.sin(phi * DEG);
      out.push(<line key="lk" x1={Px} y1={Py} x2={tx} y2={Py} className="tg-link" stroke={C.brass} />);
      return out;
    }
    const sinLinked = show.sin || mode === "triangle" || (mode === "inverse" && invFn === "sin");
    if (sinLinked) { const Py = cy - R * vals.sin.v; out.push(<line key="ls" x1={cx + R * vals.cos.v} y1={Py} x2={tx} y2={Py} className="tg-link" stroke={C.brass} />); }
    if ((show.tan || (mode === "inverse" && invFn === "tan")) && vals.tan.v != null && mode !== "triangle") {
      const Ty = cy - R * vals.tan.v;
      if (Ty > L.wave.top && Ty < L.wave.bottom) out.push(<line key="lt" x1={cx + R} y1={Ty} x2={tx} y2={Ty} className="tg-link" stroke={TG.violet} />);
    }
    return out;
  };

  // ---- text bits ----
  const statusText = (() => {
    if (mode === "angle") return `θ = ${formatAngle(deg, unit, dp)} · ${qd.q ? "Quadrant " + ROMAN[qd.q] : "on the " + qd.axis + " axis"}`;
    if (mode === "inverse") return invRes.err ? invRes.err : `${invFn} θ = ${invText} · ${invRes.sols.length} solution${invRes.sols.length === 1 ? "" : "s"}`;
    if (mode === "triangle") return triSolved ? "Solved" : triRes.status === "error" ? triRes.err : triRes.count === 0 ? "Set any two values" : `${triRes.count} of 2 known`;
    return swOK ? sinusoidEq(sw, unit, dp) : swInfo.err;
  })();
  const hint = isTouch
    ? "Drag the point or along the wave to turn θ · tap a value on the canvas to type it"
    : "Drag the point or along the wave · click a value to type it · ←/→ nudge 1° (Shift 15°)";
  const edTitle = ed ? (ed.target === "theta" && mode === "sinusoid" ? "Evaluate at x" : TARGET_LABEL[ed.target]) : "";
  const edPlaceholder = (() => {
    if (!ed) return "";
    const t = ed.target;
    if (t === "theta") return formatAngle(thetaShown, unit, dp);
    if (t === "inv") return invText;
    if (t === "opp" || t === "adj" || t === "hyp") { const v = triSolved ? triRes[t] : tri[t]; return v == null ? "" : fmtNum(v, dp); }
    if (t === "C") return formatAngle(sw.C, unit, dp);
    return fmtNum(sw[t], dp);
  })();
  const edHint = (() => {
    if (!ed) return "";
    const t = ed.target;
    if (t === "theta" && mode === "triangle") return unit === "rad" ? "Between 0 and π/2, e.g. π/6" : "Between 0° and 90°";
    if (t === "theta" || t === "C") return unit === "rad" ? "Radians, e.g. 5π/6 or 2.1 · add ° for degrees" : "Degrees, e.g. 150 · or radians with π, e.g. 5π/6";
    if (t === "inv") return "Any number, e.g. 1/2, √3/2, −0.25";
    if (mode === "triangle" && triSolved && !tri.order.includes(t)) return `Setting this frees ${TRI_LABEL[tri.order[0]].toLowerCase()}`;
    if (t === "B") return "Nonzero; period = 360°/|B|";
    return "Numbers, fractions, √ and π work";
  })();

  // ---- panels ----
  const tiles = (
    <div className="tg-tiles">
      {FNS.map((f) => <FnTile key={f} fn={f} r={vals[f]} dp={dp} />)}
    </div>
  );
  const anglePanel = (
    <>
      <Section title="Angle" hint={unit === "deg" ? "degrees" : "radians"}>
        <Row>
          <span className="tg-row-label">θ</span>
          <FieldBtn target="theta" value={formatAngle(deg, unit, dp)} onOpen={openEditor} big />
        </Row>
        <div className="tg-quick">
          {QUICK.map((d) => (
            <button key={d} className={`tg-btn tg-chip${Math.abs(norm360(deg) - d) < 1e-9 && deg >= 0 && deg < 360 ? " is-on" : ""}`} onClick={() => setTheta(d)}>{formatAngle(d, unit, dp)}</button>
          ))}
        </div>
      </Section>
      <Section title="Functions" hint={vals.sin.ex ? "exact values" : "decimal values"}>{tiles}</Section>
      <Section title="Angle facts">
        <KV k="Degrees" v={formatDeg(deg, dp)} />
        <KV k="Radians" v={(formatPi(deg, 180) ? formatPi(deg, 180) + " ≈ " : "") + formatRad(deg, dp)} />
        <KV k="Deg ° min ′ sec ″" v={formatDMS(deg)} />
        <KV k="Quadrant" v={qd.q ? ROMAN[qd.q] : `on the ${qd.axis} axis`} />
        <KV k="Reference angle" v={qd.q ? formatAngle(qd.ref, unit, dp) : "—"} />
        <KV k="Coterminal" v={`${formatAngle(qd.n, unit, dp)} · ${formatAngle(qd.n - 360, unit, dp)}`} />
        <KV k="Point (cos θ, sin θ)" v={`(${exactOrNum(vals.cos, dp)}, ${exactOrNum(vals.sin, dp)})`} />
        <KV k="Positive here" v={positiveFns(qd.q).join(", ") || "—"} />
      </Section>
    </>
  );
  const generalText = invRes.err ? "" : invRes.bases.map((b) => `${formatAngle(b, unit, dp)} + ${formatAngle(invRes.period, unit, dp)}k`).join("  or  ");
  const inversePanel = (
    <>
      <Section title="Solve" hint="value → angles">
        <div className="tg-row-chips">
          {FNS.map((f) => (
            <button key={f} className={`tg-btn tg-chip tg-fnchip${invFn === f ? " is-on" : ""}`} onClick={() => pickInvFn(f)}>{f}</button>
          ))}
        </div>
        <Row>
          <span className="tg-row-label">{invFn} θ =</span>
          <FieldBtn target="inv" value={invText} onOpen={openEditor} big />
        </Row>
        {invRes.err && <div className="tg-warn">{invRes.err}</div>}
      </Section>
      {!invRes.err && (
        <Section title="Solutions" hint="in one full turn">
          <KV k="Principal value" v={`arc${invFn}(${invText}) = ${formatAngle(invRes.principal, unit, dp)}`} />
          <div className="tg-sols">
            {invRes.sols.map((s) => (
              <button key={s} className={`tg-btn tg-chip tg-sol${Math.abs(norm360(deg) - s) < 1e-6 ? " is-on" : ""}`} onClick={() => selectSolution(s)}>{formatAngle(s, unit, dp)}</button>
            ))}
          </div>
          <div className="tg-general">All solutions: θ = {generalText} <span className="tg-faint">(k any integer)</span></div>
          {invFn === "cot" && <div className="tg-faint tg-note">arccot uses the range 0° to 180°.</div>}
        </Section>
      )}
      <Section title="Functions at θ" hint={formatAngle(deg, unit, dp)}>{tiles}</Section>
    </>
  );
  const triField = (f) => {
    const s = tri.order.includes(f) ? "set" : triSolved ? "computed" : "free";
    const v = triSolved ? triRes[f] : tri.order.includes(f) ? (f === "theta" ? deg : tri[f]) : null;
    const text = v == null ? "—" : f === "theta" ? formatAngle(v, unit, dp) : fmtNum(v, dp);
    return (
      <Row key={f}>
        <Glyph color={s === "set" ? C.brass : s === "computed" ? TG.muted : C.faint}>{f === "theta" ? "θ" : f[0]}</Glyph>
        <span className="tg-row-label">{TRI_LABEL[f]}</span>
        <span className={`tg-tag is-${s}`}>{s === "set" ? "set" : s === "computed" ? "calc" : ""}</span>
        <FieldBtn target={f} value={text} state={s} onOpen={openEditor} />
      </Row>
    );
  };
  const trianglePanel = (
    <>
      <Section title="Right triangle" hint="set any two · one must be a side">
        <div className={`tg-status-line${triRes.status === "error" ? " is-err" : ""}`}>{statusText}</div>
        {TRI_ORDER.map(triField)}
        <div className="tg-row-end"><button className="tg-btn tg-flat" onClick={clearTri}>Clear</button></div>
      </Section>
      {triSolved && (
        <Section title="Results">
          <KV k="Other angle β" v={formatAngle(triRes.beta, unit, dp)} />
          <KV k="Area" v={fmtNum(triRes.area, dp)} />
          <KV k="Perimeter" v={fmtNum(triRes.perim, dp)} />
          <KV k="sin θ = opp / hyp" v={fmtNum(triRes.opp / triRes.hyp, dp)} />
          <KV k="cos θ = adj / hyp" v={fmtNum(triRes.adj / triRes.hyp, dp)} />
          <KV k="tan θ = opp / adj" v={fmtNum(triRes.opp / triRes.adj, dp)} />
        </Section>
      )}
      <Section title="Functions of θ" hint={formatAngle(thetaShown, unit, dp)}>{tiles}</Section>
    </>
  );
  const sinusoidPanel = (
    <>
      <Section title="Sinusoid" hint="y = A·f(B(x − C)) + D">
        <div className="tg-row-chips">
          {["sin", "cos"].map((f) => (
            <button key={f} className={`tg-btn tg-chip tg-fnchip${sw.f === f ? " is-on" : ""}`} onClick={() => setSw((s) => ({ ...s, f }))}>{f}</button>
          ))}
        </div>
        <div className="tg-eq">{swOK ? sinusoidEq(sw, unit, dp) : "—"}</div>
        {["A", "B", "C", "D"].map((k) => (
          <Row key={k}>
            <Glyph color={C.brass}>{k}</Glyph>
            <span className="tg-row-label">{SW_LABEL[k]}</span>
            <FieldBtn target={k} value={k === "C" ? formatAngle(sw.C, unit, dp) : fmtNum(sw[k], dp)} onOpen={openEditor} />
          </Row>
        ))}
        {!swOK && <div className="tg-warn">{swInfo.err}</div>}
      </Section>
      {swOK && (
        <Section title="Features">
          <KV k="Amplitude |A|" v={fmtNum(swInfo.amp, dp)} />
          <KV k="Period 360°/|B|" v={unit === "rad" ? `${formatAngle(swInfo.period, "rad", dp)} ≈ ${formatRad(swInfo.period, dp)}` : formatDeg(swInfo.period, dp)} />
          <KV k="Phase shift C" v={sw.C === 0 ? "none" : `${formatAngle(Math.abs(sw.C), unit, dp)} ${sw.C > 0 ? "right" : "left"}`} />
          <KV k="Vertical shift D" v={sw.D === 0 ? "none" : `${fmtNum(Math.abs(sw.D), dp)} ${sw.D > 0 ? "up" : "down"}`} />
          <KV k="Midline" v={`y = ${fmtNum(sw.D, dp)}`} />
          <KV k="Range" v={`${fmtNum(swInfo.min, dp)} to ${fmtNum(swInfo.max, dp)}`} />
          {swInfo.reflected && <KV k="Reflected" v="A < 0 flips it over the midline" />}
          <KV k={`y at x = ${formatAngle(thetaShown, unit, 2)}`} v={fmtNum(sinusoidY(sw, thetaShown), dp)} />
        </Section>
      )}
      {swOK && (
        <Section title="Key points" hint="one period from x = C">
          {swInfo.key.map((k, i) => <KV key={i} k={formatAngle(k.x, unit, dp)} v={`y = ${fmtNum(k.y, dp)}`} />)}
        </Section>
      )}
    </>
  );
  const settingsPanel = (
    <Section title="Settings">
      <Row>
        <span className="tg-row-label">Angle unit</span>
        <div className="tg-row-chips">
          {[["deg", "Degrees"], ["rad", "Radians"]].map(([u, l]) => (
            <button key={u} className={`tg-btn tg-chip${unit === u ? " is-on" : ""}`} onClick={() => setUnit(u)}>{l}</button>
          ))}
        </div>
      </Row>
      <Row>
        <span className="tg-row-label">Decimals</span>
        <div className="tg-row-chips">
          {[2, 3, 4, 6].map((d) => (
            <button key={d} className={`tg-btn tg-chip${dp === d ? " is-on" : ""}`} onClick={() => setDp(d)}>{d}</button>
          ))}
        </div>
      </Row>
      <div className="tg-family">More free tools: <a href="https://trianglebuddy.com/">Triangle Buddy</a> · <a href="https://fractions.trianglebuddy.com/">Fraction Buddy</a></div>
    </Section>
  );

  // ---- editor UI ----
  let editor = null;
  if (ed && isTouch) {
    editor = (
      <>
        <div className="tg-sheet-backdrop" onPointerDown={closeEditor} />
        <div className="tg-sheet" role="dialog" aria-label={edTitle}>
          <div className="tg-ed-head">
            <span className="tg-ed-title">{edTitle}</span>
            <button className="tg-btn tg-ed-x" onClick={closeEditor} aria-label="Close">×</button>
          </div>
          <div className={`tg-ed-field${ed.err ? " is-err" : ""}`}>{ed.draft || <span className="tg-ed-ph">{edPlaceholder}</span>}</div>
          {ed.err ? <div className="tg-ed-err">{ed.err}</div> : <div className="tg-ed-hint">{edHint}</div>}
          <div className="tg-keypad">
            {KEYPAD.map((k) => (
              <button key={k} className={`tg-key${k === "C" || k === "⌫" ? " is-fn" : ""}`}
                onPointerDown={(e) => { e.preventDefault(); keyDownRef.current = { k, t: Date.now() }; pressKey(k); }}
                onClick={() => { const d = keyDownRef.current; if (d.k === k && Date.now() - d.t < 1000) return; pressKey(k); }}>{k}</button>
            ))}
          </div>
          <div className="tg-ed-actions">
            {hasNext && <button className="tg-btn tg-flat tg-next" onClick={() => commit("next")}>Next</button>}
            <button className="tg-btn tg-flat is-on tg-set" onClick={() => commit("set")}>Set</button>
          </div>
        </div>
      </>
    );
  } else if (ed) {
    const popW = 290, popH = 188;
    let left = 16, top = 90;
    if (ed.anchor) {
      left = Math.min(Math.max(8, ed.anchor.x), viewport.w - popW - 8);
      top = ed.anchor.y + ed.anchor.h + 8;
      if (top + popH > viewport.h - 8) top = Math.max(8, ed.anchor.y - popH - 8);
    }
    editor = (
      <div className="tg-pop" style={{ left, top, width: popW }} role="dialog" aria-label={edTitle} key={ed.target}>
        <div className="tg-ed-head">
          <span className="tg-ed-title">{edTitle}</span>
          <button className="tg-btn tg-ed-x" onClick={closeEditor} aria-label="Close">×</button>
        </div>
        <input ref={inputRef} className={`tg-ed-in${ed.err ? " is-err" : ""}`} autoFocus value={ed.draft} placeholder={edPlaceholder}
          spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          onChange={(e) => { const v = e.target.value; setEd((x) => (x ? { ...x, draft: v, err: null } : x)); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit("set"); }
            else if (e.key === "Tab" && hasNext) { e.preventDefault(); commit(e.shiftKey ? "prev" : "next"); }
          }} />
        {ed.err ? <div className="tg-ed-err">{ed.err}</div> : <div className="tg-ed-hint">{edHint}</div>}
        <div className="tg-pop-row">
          {["π", "√", "°"].map((q) => (
            <button key={q} className="tg-btn tg-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => insertText(q)}>{q}</button>
          ))}
          <span style={{ flex: 1 }} />
          {hasNext && <button className="tg-btn tg-flat tg-next" onClick={() => commit("next")}>Next ⇥</button>}
          <button className="tg-btn tg-flat is-on tg-set" onClick={() => commit("set")}>Set ↵</button>
        </div>
      </div>
    );
  }

  const ariaNow = `θ = ${formatAngle(thetaShown, unit, dp)}; sin ${exactOrNum(vals.sin, dp)}, cos ${exactOrNum(vals.cos, dp)}, tan ${exactOrNum(vals.tan, dp)}`;

  return (
    <div className="tg-root" style={{
      background: C.bg, color: C.ink, fontFamily: FONT_MONO, minHeight: "100vh", padding: pad, boxSizing: "border-box",
      backgroundImage: "radial-gradient(circle at 20% 0%, #14202b 0%, rgba(11,14,19,0) 45%)",
      backgroundRepeat: "no-repeat", backgroundAttachment: "fixed",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        html,body{background:${C.bg};margin:0;}
        body.tg-sheet-open #bmc-wbtn{display:none!important}
        .tg-root{min-height:100dvh;}
        .tg-app{max-width:1600px;margin:0 auto;display:flex;flex-direction:column;}
        .tg-header{display:flex;align-items:baseline;gap:6px 14px;margin-bottom:4px;flex-wrap:wrap;}
        .tg-title{font-family:${FONT_DISP};font-weight:600;margin:0;letter-spacing:-0.5px;}
        .tg-subtitle{color:${C.dim};font-size:12px;letter-spacing:1px;}
        .tg-hdr-right{margin-left:auto;display:flex;align-items:center;gap:12px;}
        .tg-version{color:${C.dim};font-size:11px;}
        .tg-rule{height:1px;background:linear-gradient(90deg,${C.brass},transparent);margin:6px 0 12px;opacity:0.5;}
        .tg-modes{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;}
        .tg-mode{padding:7px 16px;border-radius:8px;font-size:12.5px;background:${C.bg};color:${C.dim};border:1px solid ${C.line};font-family:${FONT_MONO};cursor:pointer;}
        .tg-mode.is-on{background:${C.brass};color:${C.bg};border-color:${C.brass};font-weight:600;}
        .tg-cols{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;}
        .tg-canvas-card{background:${C.panel};border:1px solid ${C.line};border-radius:12px;padding:10px;box-shadow:0 18px 40px -20px #000;flex:1 1 520px;min-width:0;display:flex;flex-direction:column;}
        .tg-cbar{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
        .tg-status{flex:1;min-width:0;font-size:12px;color:${C.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .tg-seg{display:inline-flex;border:1px solid ${C.line};border-radius:8px;overflow:hidden;flex:0 0 auto;}
        .tg-seg-btn{background:${C.bg};color:${C.dim};border:none;border-right:1px solid ${C.line};padding:6px 11px;font-family:${FONT_MONO};font-size:12px;cursor:pointer;}
        .tg-seg-btn:last-child{border-right:none;}
        .tg-seg-btn.is-on{background:${C.brass};color:${C.bg};font-weight:600;}
        .tg-svg{display:block;width:100%;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:8px;background:${TG.canvas};}
        .tg-svg:focus{outline:none}.tg-svg:focus-visible{outline:1px solid ${C.brass};}
        .tg-footer{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center;}
        .tg-hint{margin-top:8px;font-size:10.5px;color:${C.faint};line-height:1.6;}
        .tg-legend{font-size:11px;color:${C.faint};display:flex;gap:12px;align-items:center;}
        .tg-btn{cursor:pointer;transition:border-color .15s ease,color .15s ease;user-select:none;-webkit-user-select:none;}
        @media (hover:hover){.tg-btn:hover{border-color:${C.brass}!important;}.tg-family a:hover{text-decoration:underline;}}
        .tg-flat{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:7px;font-size:12px;background:${C.bg};color:${C.dim};border:1px solid ${C.line};font-family:${FONT_MONO};}
        .tg-flat.is-on{background:${C.brass};color:${C.bg};border-color:${C.brass};font-weight:600;}
        .tg-chip{background:${C.bg};color:${C.dim};border:1px solid ${C.line};border-radius:5px;font-size:11px;padding:4px 8px;font-family:${FONT_MONO};}
        .tg-chip.is-on{background:${C.brass};color:${C.bg};border-color:${C.brass};}
        .tg-fn{background:${C.bg};color:${C.faint};border:1px solid ${C.line};border-radius:14px;font-size:11.5px;padding:4px 10px;font-family:${FONT_MONO};}
        .tg-fn.is-on{background:#0c1016;}
        .tg-controls{display:flex;flex-direction:column;gap:12px;}
        .tg-controls > *{flex-shrink:0;}
        .tg-section{background:${C.panel};border:1px solid ${C.line};border-radius:12px;overflow:hidden;box-shadow:0 12px 30px -22px #000;}
        .tg-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:10px 14px;border-bottom:1px solid ${C.line};background:${C.panel2};}
        .tg-section-title{font-family:${FONT_DISP};font-size:16px;font-weight:600;letter-spacing:0.3px;}
        .tg-section-hint{font-size:10.5px;color:${C.faint};letter-spacing:0.5px;text-align:right;}
        .tg-section-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
        .tg-row{display:flex;align-items:center;gap:10px;}
        .tg-row-label{flex:1;color:${C.dim};font-size:12px;}
        .tg-row-chips{display:flex;gap:4px;flex-wrap:wrap;}
        .tg-row-end{display:flex;justify-content:flex-end;}
        .tg-glyph{width:26px;height:26px;flex-shrink:0;border-radius:6px;display:grid;place-items:center;background:#0c1016;border:1px solid ${C.line};font-family:${FONT_DISP};font-style:italic;font-size:15px;}
        .tg-field{background:${C.bg};border:1px solid ${C.line};color:${C.ink};font-family:${FONT_MONO};font-size:13px;border-radius:6px;padding:6px 10px;min-width:118px;text-align:left;}
        .tg-field.is-big{font-size:17px;padding:8px 12px;min-width:150px;}
        .tg-field.is-set{border-color:${C.brassDim};color:${C.brass};}
        .tg-field.is-computed{color:${TG.muted};}
        .tg-field.is-free{color:${C.faint};}
        .tg-tag{font-size:10px;color:${C.faint};min-width:26px;text-align:right;}
        .tg-tag.is-set{color:${C.brass};}.tg-tag.is-computed{color:${TG.muted};}
        .tg-quick{display:flex;flex-wrap:wrap;gap:4px;}
        .tg-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
        .tg-tile{background:#0c1016;border:1px solid ${C.line};border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:3px;min-width:0;}
        .tg-tile-name{font-family:${FONT_DISP};font-style:italic;font-size:14px;}
        .tg-tile-main{font-size:16px;color:${C.ink};min-height:36px;display:flex;align-items:center;flex-wrap:wrap;overflow-wrap:anywhere;}
        .tg-tile-sub{font-size:10.5px;color:${C.faint};min-height:14px;}
        .tg-frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1.12;margin:0 1px;}
        .tg-num{padding:0 3px 1px;border-bottom:1.5px solid currentColor;white-space:nowrap;}
        .tg-den{padding:1px 3px 0;}
        .tg-sqrt{white-space:nowrap;}
        .tg-rad{border-top:1.5px solid currentColor;padding:0 1px;margin-left:1px;}
        .tg-undef{color:${C.faint};font-size:13px;}
        .tg-kv{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:12px;color:${C.dim};}
        .tg-kv b{color:${C.ink};font-weight:500;text-align:right;overflow-wrap:anywhere;}
        .tg-warn{color:${C.red};font-size:11.5px;}
        .tg-status-line{font-size:12px;color:${C.ink};}
        .tg-status-line.is-err{color:${C.red};}
        .tg-sols{display:flex;gap:6px;flex-wrap:wrap;}
        .tg-sols .tg-chip{font-size:13px;padding:6px 12px;}
        .tg-general{font-size:12px;color:${C.ink};line-height:1.6;}
        .tg-faint{color:${C.faint};}
        .tg-note{font-size:11px;}
        .tg-eq{font-family:${FONT_DISP};font-size:18px;color:${C.ink};padding:4px 2px;}
        .tg-family{font-size:11px;color:${C.faint};padding-top:4px;border-top:1px solid ${C.line};}
        .tg-family a{color:${C.cyan};text-decoration:none;}
        /* canvas */
        .tg-axis{stroke:${TG.axis};stroke-width:1;}
        .tg-grid{stroke:${TG.grid};stroke-width:1;}
        .tg-plot-bg{fill:none;}
        .tg-ring{fill:none;stroke:${TG.ring};stroke-width:1.5;}
        .tg-tick{stroke:${TG.ring};stroke-width:1.2;}
        .tg-ring-label{fill:${C.faint};font-size:10px;font-family:${FONT_MONO};}
        .tg-tick-label{fill:${C.faint};font-size:10px;font-family:${FONT_MONO};}
        .tg-arc{fill:none;stroke:${C.dim};stroke-width:1.5;}
        .tg-arc-tri{fill:none;stroke-width:2;}
        .tg-refarc{fill:none;stroke:${C.faint};stroke-width:1.2;stroke-dasharray:3 3;}
        .tg-ray{stroke:${C.ink};stroke-width:1.8;stroke-linecap:round;}
        .tg-guide{stroke:${C.line};stroke-width:1;stroke-dasharray:4 4;}
        .tg-rtmark{fill:none;stroke:${C.dim};stroke-width:1.2;}
        .tg-asym{stroke:${TG.axis};stroke-width:1;stroke-dasharray:3 5;}
        .tg-marker{stroke:${C.dim};stroke-width:1;stroke-dasharray:3 4;opacity:0.7;pointer-events:none;}
        .tg-link{stroke-width:1.2;stroke-dasharray:4 4;opacity:0.6;pointer-events:none;}
        .tg-midline{stroke:${C.faint};stroke-width:1;stroke-dasharray:6 5;}
        .tg-extreme{stroke:${TG.axis};stroke-width:1;stroke-dasharray:2 4;}
        .tg-keypt{fill:${C.bg};stroke:${C.brass};stroke-width:1.5;}
        .tg-bracket{fill:none;stroke:${C.dim};stroke-width:1;}
        .tg-anno{fill:${C.dim};font-size:10.5px;font-family:${FONT_MONO};}
        .tg-handle{cursor:grab;}
        .tg-cv-label.is-ed{cursor:pointer;}
        .tg-solmark{cursor:pointer;}
        /* editor */
        .tg-sheet-backdrop{position:fixed;inset:0;background:rgba(5,7,10,.5);z-index:10000;}
        .tg-sheet{position:fixed;left:0;right:0;bottom:0;z-index:10001;background:${C.panel};border-top:1px solid ${C.line};border-radius:16px 16px 0 0;padding:12px 14px calc(12px + env(safe-area-inset-bottom));box-shadow:0 -20px 40px -20px #000;max-width:560px;margin:0 auto;box-sizing:border-box;}
        .tg-ed-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
        .tg-ed-title{font-family:${FONT_DISP};font-size:17px;font-weight:600;}
        .tg-ed-x{background:${C.bg};border:1px solid ${C.line};color:${C.dim};border-radius:8px;width:34px;height:34px;font-size:18px;line-height:1;font-family:${FONT_MONO};}
        .tg-ed-field{background:${C.bg};border:1px solid ${C.brass};border-radius:8px;padding:10px 12px;font-size:22px;min-height:30px;color:${C.ink};overflow-x:auto;white-space:nowrap;}
        .tg-ed-field.is-err{border-color:${C.red};}
        .tg-ed-ph{color:${C.faint};}
        .tg-ed-err{color:${C.red};font-size:12px;margin:6px 2px;}
        .tg-ed-hint{color:${C.faint};font-size:11.5px;margin:6px 2px;}
        .tg-keypad{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 10px;}
        .tg-key{height:46px;border-radius:9px;background:#0c1016;border:1px solid ${C.line};color:${C.ink};font-family:${FONT_MONO};font-size:19px;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none;}
        .tg-key.is-fn{color:${C.dim};font-size:16px;}
        .tg-key:active{background:${C.panel2};border-color:${C.brass};}
        .tg-ed-actions{display:flex;gap:8px;justify-content:flex-end;}
        .tg-ed-actions .tg-flat{padding:10px 20px;font-size:14px;}
        .tg-pop{position:fixed;z-index:10002;background:${C.panel};border:1px solid ${C.line};border-radius:12px;padding:10px 12px;box-shadow:0 18px 40px -12px #000;box-sizing:border-box;}
        input.tg-ed-in{width:100%;box-sizing:border-box;background:${C.bg};border:1px solid ${C.brass};color:${C.ink};font-family:${FONT_MONO};font-size:15px;border-radius:7px;padding:8px 10px;outline:none;}
        input.tg-ed-in.is-err{border-color:${C.red};}
        .tg-pop-row{display:flex;gap:6px;align-items:center;margin-top:4px;}
        .tg-pop-row .tg-chip{font-size:13px;padding:4px 9px;}
        @media (max-width:600px){
          .tg-mode{flex:1 1 0;padding:8px 2px;text-align:center;}
          .tg-subtitle{font-size:10.5px;order:3;width:100%;}
          .tg-sub-mode{display:none;}
          .tg-header{align-items:center;}
          .tg-tiles{gap:6px;}
          .tg-tile{padding:7px 8px;}
          .tg-tile-main{font-size:15px;}
          .tg-field{min-width:104px;}
          .tg-field.is-big{min-width:120px;}
        }
        @media (pointer:coarse){
          .tg-chip{padding:6px 10px;font-size:12px;}
          .tg-fn{padding:6px 12px;font-size:12.5px;}
          .tg-flat{padding:8px 12px;}
          .tg-field{padding:9px 12px;}
          .tg-seg-btn{padding:8px 12px;}
        }
        ::selection{background:${C.brass};color:${C.bg}}`}</style>

      <div className="tg-app" style={{ minHeight: fitMode ? 0 : "calc(100vh - 40px)" }}>
        <div className="tg-header">
          <h1 className="tg-title" style={{ fontSize: fitMode ? 24 : 30 }}>Trig<span style={{ color: C.brass }}>·</span>Buddy</h1>
          <span className="tg-subtitle">INTERACTIVE TRIGONOMETRY · {unit === "deg" ? "DEGREES" : "RADIANS"}<span className="tg-sub-mode"> · {MODE_SUB[mode]}</span></span>
          <div className="tg-hdr-right">
            <div className="tg-seg" role="group" aria-label="Angle unit">
              {[["deg", "DEG"], ["rad", "RAD"]].map(([u, l]) => (
                <button key={u} className={`tg-btn tg-seg-btn${unit === u ? " is-on" : ""}`} onClick={() => setUnit(u)} aria-pressed={unit === u}>{l}</button>
              ))}
            </div>
            <span className="tg-version">{VERSION}</span>
          </div>
        </div>
        <div className="tg-rule" />
        <div className="tg-modes" role="tablist">
          {MODES.map(([m, l]) => (
            <button key={m} role="tab" aria-selected={mode === m} className={`tg-btn tg-mode${mode === m ? " is-on" : ""}`} onClick={() => setMode(m)}>{l}</button>
          ))}
        </div>

        <div className="tg-cols">
          <div className="tg-canvas-card">
            <div className="tg-cbar">
              <div className="tg-status">{statusText}</div>
              <div className="tg-seg" role="group" aria-label="View">
                {VIEWS.filter(([v]) => v !== "both" || bothOK).map(([v, l]) => (
                  <button key={v} className={`tg-btn tg-seg-btn${view === v ? " is-on" : ""}`} onClick={() => setViewPref(v)} aria-pressed={view === v}>{l}</button>
                ))}
              </div>
            </div>
            <svg ref={svgRef} className="tg-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
              style={{ height: canvasH, cursor: dragging ? "grabbing" : "crosshair" }}
              tabIndex={0} role="slider" aria-label="Angle θ" aria-valuemin={0} aria-valuemax={360}
              aria-valuenow={Math.round(thetaShown * 100) / 100} aria-valuetext={ariaNow}
              onPointerDown={onSvgDown} onPointerMove={onSvgMove} onPointerUp={onSvgUp} onPointerCancel={onSvgUp} onKeyDown={onSvgKey}>
              <defs>
                <linearGradient id="tg-tfill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={C.brass} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={C.cyan} stopOpacity="0.07" />
                </linearGradient>
                {L.wave && <clipPath id="tg-wclip"><rect x={L.wave.left} y={L.wave.top} width={L.wave.right - L.wave.left} height={L.wave.bottom - L.wave.top} /></clipPath>}
                <clipPath id="tg-cclip"><rect x="0" y="0" width={Math.max(10, circleMaxX + (L.wave ? 20 : 0))} height={H} /></clipPath>
              </defs>
              {L.wave && renderWave()}
              {L.circle && <g clipPath="url(#tg-cclip)">{renderCircle()}</g>}
              {renderLinks()}
            </svg>
            <div className="tg-footer">
              {mode === "sinusoid" ? (
                <span className="tg-legend">
                  <span><span style={{ color: C.brass }}>━━</span> transformed</span>
                  <span><span style={{ color: TG.ghost }}>╌╌</span> base {sw.f}</span>
                </span>
              ) : FNS.map((f) => (
                <button key={f} className={`tg-btn tg-fn${show[f] ? " is-on" : ""}`} style={show[f] ? { borderColor: FN_COLOR[f], color: FN_COLOR[f] } : undefined}
                  onClick={() => setShow((s) => ({ ...s, [f]: !s[f] }))} aria-pressed={!!show[f]}>{f}</button>
              ))}
              <span style={{ flex: 1 }} />
              <button className={`tg-btn tg-flat${snap ? " is-on" : ""}`} onClick={() => setSnap((v) => !v)} aria-pressed={snap}>{unit === "rad" ? "π/12 snap" : "15° snap"}</button>
              <button className="tg-btn tg-flat" onClick={reset} title="Reset everything">↺ Reset</button>
            </div>
            <div className="tg-hint">{hint}</div>
          </div>

          <div className="tg-controls" style={fitMode ? {
            flex: "1 1 340px", minWidth: 320, maxWidth: 440, overflowY: "auto", maxHeight: viewport.h - 2 * pad - 100, paddingRight: 2,
          } : { flex: "1 1 300px", minWidth: 0 }}>
            {mode === "angle" && anglePanel}
            {mode === "inverse" && inversePanel}
            {mode === "triangle" && trianglePanel}
            {mode === "sinusoid" && sinusoidPanel}
            {settingsPanel}
          </div>
        </div>
      </div>
      {editor}
    </div>
  );
}

// ===================== [SEC:PRESENT] =====================
// Small presentational helpers. Pure renderers, no business logic.
function Section({ title, hint, children }) {
  return (
    <div className="tg-section">
      <div className="tg-section-head">
        <span className="tg-section-title">{title}</span>
        {hint && <span className="tg-section-hint">{hint}</span>}
      </div>
      <div className="tg-section-body">{children}</div>
    </div>
  );
}
function Row({ children }) { return <div className="tg-row">{children}</div>; }
function Glyph({ children, color }) { return <span className="tg-glyph" style={{ color }}>{children}</span>; }
function KV({ k, v }) { return <div className="tg-kv"><span>{k}</span><b>{v}</b></div>; }
function FieldBtn({ target, value, onOpen, state, big }) {
  return (
    <button className={`tg-btn tg-field${big ? " is-big" : ""}${state ? " is-" + state : ""}`} data-field={target}
      onClick={(e) => onOpen(target, e.currentTarget)}>{value}</button>
  );
}
// exact value with a typographic stacked fraction and overlined radicands
function Exact({ f }) {
  const p = exactParts(f);
  const num = f.terms.map(([c, r], i) => (
    <React.Fragment key={i}>
      {i > 0 ? (c < 0 ? ` ${MINUS} ` : " + ") : c < 0 ? MINUS : ""}
      {r === 1 ? Math.abs(c) : <span className="tg-sqrt">{Math.abs(c) === 1 ? "" : Math.abs(c)}√<span className="tg-rad">{r}</span></span>}
    </React.Fragment>
  ));
  if (!p.den) return <span className="tg-exact">{p.sign}{p.multi && p.sign ? <>({num})</> : num}</span>;
  return <span className="tg-exact">{p.sign}<span className="tg-frac"><span className="tg-num">{num}</span><span className="tg-den">{p.den}</span></span></span>;
}
function FnTile({ fn, r, dp }) {
  const sub = r.v == null ? (fn === "tan" || fn === "sec" ? "cos θ = 0" : "sin θ = 0") : r.ex && !exactIsSimple(r.ex) ? "≈ " + fmtNum(r.v, dp) : r.ex ? "exact" : "";
  return (
    <div className="tg-tile" data-fn={fn}>
      <span className="tg-tile-name" style={{ color: FN_COLOR[fn] }}>{fn} θ</span>
      <span className="tg-tile-main">{r.v == null ? <span className="tg-undef">undefined</span> : r.ex ? <Exact f={r.ex} /> : fmtNum(r.v, dp)}</span>
      <span className="tg-tile-sub">{sub}</span>
    </div>
  );
}
