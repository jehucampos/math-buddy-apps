import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";

/* ============================================================
   FRACTION BUDDY  v1.3.0
   ------------------------------------------------------------
   A small, free, self-contained tool: add, subtract, multiply
   and divide any number of [whole + fraction] terms (standard
   order of operations) and read the EXACT result
   (mixed number, improper fraction, and decimal). Shares the
   Triangle Buddy design system (Fraunces + JetBrains Mono,
   brass/cyan on near-black) for a unified look across apps.

   NAVIGATION MAP (search these tags to jump to a section):
     [SEC:CORE]     pure rational arithmetic — mirrors
                    core/logic.js verbatim. Do NOT edit here;
                    edit core/logic.js, run core/test.js
                    (97 asserts), then sync.
     [SEC:UI-CONST] UI-only constants (shared color/font tokens,
                    field caps). Artifact-only.
     [SEC:UI-CONST/hub] BUDDY_TOOLS + ToolNav: family navigation.
     [SEC:COMPONENT] the React component (state, handlers,
                    platform detection, render).
     [SEC:PRESENT]  small presentational helpers (Section,
                    StackedFraction, MixedResult).
   ------------------------------------------------------------
   WHY EXACT: fractions are stored as integer numerator/
   denominator pairs and combined with integer arithmetic, so
   1/3 + 1/3 = 2/3 (never a rounded 0.667). Any operation that
   would exceed Number.MAX_SAFE_INTEGER returns null and the UI
   shows a "too large for exact mode" notice instead of a
   silently-wrong float.

   PLATFORM TAILORING:
     mobile  — every value field is type=text + inputmode=numeric
               so the numeric keypad opens (no QWERTY); focus
               selects the value so typing replaces it; keypad
               "Next" advances; one-tap operator picker; result
               moves above the rows and stays sticky; larger
               touch targets via @media (pointer: coarse).
     desktop — Enter advances, ↑/↓ nudge the focused field;
               hover states on buttons.

   CHANGELOG:
   v1.3.0  family navigation: BUDDY_TOOLS + ToolNav ([SEC:UI-CONST/hub]),
           copied from Triangle Buddy. The header shows a "More tools"
           menu (Triangle, Fraction, Trig; this tool marked current)
           before the version. Menu z-index 10000 keeps it above the
           Buy Me a Coffee welcome bubble (9999) and the sticky result.
           The menu anchors to .fb-head-end (the header's right edge),
           not the button, so it stays on screen at 320 px. Button
           (aria-label "More tools") reads "Tools ▾"; at <= 600 px it is
           a 44x44 icon and the subtitle takes its own row, so the icon
           shares the title row from 360 px up.
           Crawlable footer now also links Trig Buddy. The in-app
           link to trianglebuddy.com stays.
   v1.2.4  phones (<=480px): row items (sign, whole, fraction,
           delete) are spread with equal spacing, since the centered
           group crowded the delete button; wider screens keep the
           centered group. Remove-term button is now red.
   v1.2.3  layout: term rows are balanced — sign + whole + fraction
           form one cluster centered in the row (under the centered
           operator picker), delete pinned right in a 1fr·auto·1fr
           grid; only the empty left column can shrink (to 0 on
           narrow phones) — the delete column never goes below the
           button's width, so it can't overlap the fraction.
   v1.2.2  fix: the link-back strip was unbalanced (11px above the
           text, 60px below it) because the app's bottom padding and
           the info footer's top padding stacked. Both removed; the
           link now sits centered between the two rules (14px each).
   v1.2.1  fix: empty band between the app and the info section.
           #root and .fb-root had min-height:100vh (carried over
           from Triangle Buddy's full-screen canvas), so the app
           was always at least one screen tall; the leftover
           height showed as blank space (313px at 805x1000).
   v1.2.0  multiply (×) and divide (÷), exact, with standard order
           of operations (× ÷ before + −) and a divide-by-zero
           check. One-tap operator picker between rows; row 1
           keeps a sign toggle. Blank rows are skipped (no error
           or 0 while typing). Mobile speed: focus selects the
           value, Enter/Next advances, new rows get focus, result
           sticks above the rows on touch devices. Fix: result
           fraction shared .fb-frac with the input column and the
           rules bled together (now .fb-sfrac*). Fix: term error
           text wraps under the row instead of widening it. Link
           back to trianglebuddy.com (fractions.trianglebuddy.com).
   v1.1.0  result display now renders the fractional part as a
           STACKED fraction (numerator over a bar over denominator)
           so a mixed number no longer reads as one improper
           fraction ("3 1/4" was reading as "31/4"). Adds the
           mixedParts() core helper and StackedFraction/MixedResult
           presentational components; the result keeps an aria-label
           with the readable text form. No logic/arithmetic change.
   v1.0.0  initial release. Exact add/subtract of N terms,
           mixed/improper/decimal readouts, add/remove terms
           (min 2), reset, numeric-keypad mobile inputs,
           arrow-key nudging on desktop.
   ============================================================ */

// ===================== [SEC:CORE] =====================
// Pure rational arithmetic — generated verbatim from core/logic.js
// (minus test-only negR). Do NOT edit here; edit logic.js and sync.
// gcd — reused verbatim from Triangle Buddy core/logic.js.
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

// Reduce n/d to lowest terms with d > 0. Returns null on overflow
// or zero denominator.
function makeRational(n, d) {
  if (d === 0) return null;
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return null;
  if (d < 0) { n = -n; d = -d; }
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

// Least common multiple, divide-first to delay overflow.
function lcm(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  if (a === 0 || b === 0) return 0;
  return (a / gcd(a, b)) * b;
}

// Exact add. Uses the LCM as the common denominator (smaller than
// the product) and guards every intermediate against overflow.
function addR(a, b) {
  if (!a || !b) return null;
  const L = lcm(a.d, b.d);
  if (!Number.isSafeInteger(L)) return null;
  const na = a.n * (L / a.d);
  const nb = b.n * (L / b.d);
  if (!Number.isSafeInteger(na) || !Number.isSafeInteger(nb)) return null;
  const n = na + nb;
  if (!Number.isSafeInteger(n)) return null;
  return makeRational(n, L);
}

// Parse a non-negative integer field. Empty -> fallback. Any
// non-digit character -> NaN (caller treats as an input error).
function parseField(str, fallback) {
  const t = (str == null ? "" : String(str)).trim();
  if (t === "") return fallback;
  if (!/^\d+$/.test(t)) return NaN;
  const v = parseInt(t, 10);
  return Number.isSafeInteger(v) ? v : NaN;
}

// Resolve one term { op:'+'|'-', whole, num, den } to an exact
// signed rational. Returns { rational, error }. `error` is a short
// string when the term is malformed (callers show it inline).
//   - all blank            -> 0           (valid, contributes nothing)
//   - whole only           -> integer
//   - num/den only         -> fraction
//   - whole + num/den      -> mixed number
//   - num present, den 0/blank -> error    (no denominator)
//   - any non-digit        -> error
function termRational(term) {
  const wRaw = term.whole, nRaw = term.num, dRaw = term.den;
  const nBlank = (nRaw == null ? "" : String(nRaw)).trim() === "";
  const dBlank = (dRaw == null ? "" : String(dRaw)).trim() === "";
  const w = parseField(wRaw, 0);
  const n = parseField(nRaw, 0);
  // Parse the denominator only when present, so a blank field is
  // distinguishable from a malformed one (don't let a blank become NaN
  // and get mis-reported as a non-digit error).
  const dParsed = dBlank ? null : parseField(dRaw, 0);
  if (Number.isNaN(w) || Number.isNaN(n) || (dParsed !== null && Number.isNaN(dParsed))) {
    return { rational: null, error: "digits only" };
  }
  if (!nBlank && (dBlank || dParsed === 0)) {
    return { rational: null, error: "need denominator" };
  }
  const den = dBlank || dParsed === 0 ? 1 : dParsed; // den 1 only when num is blank
  const mag = makeRational(w * den + n, den);
  if (!mag) return { rational: null, error: "too large" };
  const sign = term.op === "-" ? -1 : 1;
  return { rational: { n: sign * mag.n, d: mag.d }, error: null };
}

// Exact multiply with cross-cancellation BEFORE multiplying, so the
// intermediate products stay as small as possible (delays overflow).
function mulR(a, b) {
  if (!a || !b) return null;
  const g1 = gcd(a.n, b.d);
  const g2 = gcd(b.n, a.d);
  const n = (a.n / g1) * (b.n / g2);
  const d = (a.d / g2) * (b.d / g1);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return null;
  return makeRational(n, d);
}

// Exact divide: a / b === a * (1/b). Returns null when b is zero
// (callers check for zero first so they can report it distinctly).
function divR(a, b) {
  if (!a || !b || b.n === 0) return null;
  const sign = b.n < 0 ? -1 : 1;
  return mulR(a, { n: sign * b.d, d: Math.abs(b.n) });
}

// A row with all three fields empty has not been entered yet.
function isBlankTerm(term) {
  const f = (v) => (v == null ? "" : String(v)).trim() === "";
  return f(term.whole) && f(term.num) && f(term.den);
}

// Evaluate the term list with STANDARD order of operations:
// x and / bind tighter than + and -, left to right within each.
// term.op is the operator in FRONT of the term: "+", "-", "*", "/".
// For the first entered term it acts as a sign ("-" negates; the
// others mean positive). Blank rows are skipped entirely, so a row
// that has just been added never changes the answer or raises an
// error while the user is still typing.
// Returns:
//   { rational, error:null,      badIndices:[] }       ok
//   { rational:null, error:'input',   badIndices:[...] } malformed term(s)
//   { rational:null, error:'divzero', badIndices:[i] }   divide by zero
//   { rational:null, error:'overflow',badIndices:[] }    too large for exact
function evaluateTerms(terms) {
  const bad = [];
  const items = [];
  for (let i = 0; i < terms.length; i++) {
    if (isBlankTerm(terms[i])) continue;
    const r = termRational(terms[i]);
    if (r.error) bad.push(i);
    else items.push({ i, op: terms[i].op, v: r.rational });
  }
  if (bad.length) return { rational: null, error: "input", badIndices: bad };
  if (!items.length) return { rational: { n: 0, d: 1 }, error: null, badIndices: [] };
  const OVER = { rational: null, error: "overflow", badIndices: [] };
  let sum = { n: 0, d: 1 };
  let cur = items[0].v; // termRational already applied a leading "-"
  for (let k = 1; k < items.length; k++) {
    const { i, op, v } = items[k];
    if (op === "*") cur = mulR(cur, v);
    else if (op === "/") {
      if (v.n === 0) return { rational: null, error: "divzero", badIndices: [i] };
      cur = divR(cur, v);
    } else {
      sum = addR(sum, cur);
      cur = v; // "-" terms arrive already negated
    }
    if (!cur || !sum) return OVER;
  }
  sum = addR(sum, cur);
  return sum ? { rational: sum, error: null, badIndices: [] } : OVER;
}

const THIN = "\u2009"; // thin space between whole and fraction parts

// Mixed-number string, e.g. "3 1/4", "-2/3", "5", "0".
function formatMixed(r) {
  if (!r) return "—";
  if (r.n === 0) return "0";
  const neg = r.n < 0;
  const an = Math.abs(r.n);
  const whole = Math.floor(an / r.d);
  const rem = an % r.d;
  let s;
  if (rem === 0) s = `${whole}`;
  else if (whole === 0) s = `${rem}/${r.d}`;
  else s = `${whole}${THIN}${rem}/${r.d}`;
  return (neg ? "-" : "") + s;
}

// Structured mixed-number parts, so the UI can render a STACKED fraction
// (numerator over denominator with a bar) instead of inline "n/d" — which
// blends into an adjacent whole number ("3 1/4" reads like "31/4"). Branches
// mirror formatMixed exactly so the two can never disagree. Returns one of:
//   { kind:"none" }                          when r is null   -> render "—"
//   { kind:"zero" }                          when r.n === 0   -> render "0"
//   { kind:"whole",    neg, whole }          remainder is 0
//   { kind:"fraction", neg, num, den }       whole part is 0
//   { kind:"mixed",    neg, whole, num, den} otherwise
function mixedParts(r) {
  if (!r) return { kind: "none" };
  if (r.n === 0) return { kind: "zero" };
  const neg = r.n < 0;
  const an = Math.abs(r.n);
  const whole = Math.floor(an / r.d);
  const rem = an % r.d;
  if (rem === 0) return { kind: "whole", neg, whole };
  if (whole === 0) return { kind: "fraction", neg, num: rem, den: r.d };
  return { kind: "mixed", neg, whole, num: rem, den: r.d };
}

// Improper-fraction string, e.g. "13/4", or "5" when whole.
function formatImproper(r) {
  if (!r) return "—";
  if (r.d === 1) return `${r.n}`;
  return `${r.n}/${r.d}`;
}

// Decimal string, trimmed, with a leading "≈" when the value is not
// exactly representable in `places` decimals (so we never imply a
// repeating decimal is exact).
function formatDecimal(r, places = 6) {
  if (!r) return "—";
  const exact = r.n / r.d;
  const rounded = Number(exact.toFixed(places));
  let s = String(rounded);
  // toFixed/Number already trims trailing zeros via Number(); guard "-0".
  if (s === "-0") s = "0";
  const isExact = r.d === 1 || onlyFactors2and5(r.d);
  return (isExact ? "" : "≈ ") + s;
}

// True when d's only prime factors are 2 and 5 -> terminating decimal.
function onlyFactors2and5(d) {
  d = Math.abs(d);
  if (d === 0) return false;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

// Clamp an integer-string field after an arrow-key nudge (desktop).
function nudgeField(str, delta, max) {
  const cur = parseField(str, 0);
  const base = Number.isNaN(cur) ? 0 : cur;
  let next = base + delta;
  if (next < 0) next = 0;
  if (max != null && next > max) next = max;
  return String(next);
}

// Strip everything except digits (input sanitiser; keeps fields numeric
// even on a desktop QWERTY keyboard).
function digitsOnly(str, maxLen) {
  let s = (str == null ? "" : String(str)).replace(/[^\d]/g, "");
  if (maxLen != null) s = s.slice(0, maxLen);
  return s;
}

// ===================== [SEC:UI-CONST] =====================
// Shared design tokens — identical to Triangle Buddy so the apps
// read as one family. Presentation only (not in core/logic.js).
const C = {
  bg: "#0b0e13", panel: "#11151c", panel2: "#161b24", line: "#2a3344",
  ink: "#f0ece2", dim: "#aab4c5", faint: "#7f8a9d",
  brass: "#e0b46a", brassDim: "#5a4a28", cyan: "#7fe3d3", red: "#e8838c",
};
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
const FONT_DISP = "'Fraunces', Georgia, serif";
const APP_VERSION = "v1.3.0";
const FAMILY_URL = "https://trianglebuddy.com/";
const MAX_DIGITS = 6;        // per field; keeps products inside safe-integer range
const NUDGE_MAX = 999999;    // arrow-key ceiling per field
const MINUS = "\u2212";      // U+2212, typographic minus
// Operators, in the order shown on the segmented control between rows.
const OPS = [
  { op: "+", glyph: "+", label: "add" },
  { op: "-", glyph: MINUS, label: "subtract" },
  { op: "*", glyph: "\u00d7", label: "multiply by" },
  { op: "/", glyph: "\u00f7", label: "divide by" },
];
const OP_GLYPH = { "+": "+", "-": MINUS, "*": "\u00d7", "/": "\u00f7" };

let _idSeq = 0;
const newId = () => `t${++_idSeq}`;
const blankTerm = (op = "+") => ({ id: newId(), op, whole: "", num: "", den: "" });
const defaultTerms = () => [
  { id: newId(), op: "+", whole: "", num: "1", den: "2" },
  { id: newId(), op: "+", whole: "", num: "1", den: "4" },
];

/* ===================== [SEC:UI-CONST/hub] Buddy tool family =====================
   Copied from Triangle Buddy (COMPONENT-CATALOG "BUDDY_TOOLS + ToolNav"); only the
   class prefix differs. Keep the list identical in all three apps. ToolNav renders a
   direct link with one sibling tool and a "More tools" menu with two or more. */
const BUDDY_TOOLS = [
  { id: "triangle", name: "Triangle Buddy", url: "https://trianglebuddy.com/", blurb: "Sides, angles & missing values" },
  { id: "fractions", name: "Fraction Buddy", url: "https://fractions.trianglebuddy.com/", blurb: "Add, subtract, multiply & divide fractions" },
  { id: "trig", name: "Trig Buddy", url: "https://trig.trianglebuddy.com/", blurb: "Unit circle, exact values & inverse trig" },
];
function ToolNav({ tools, currentId }) {
  const others = tools.filter((t) => t.id !== currentId);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {                    // close on outside press or Esc
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (others.length === 0) return null;
  if (others.length === 1) {
    const t = others[0];
    return <a className="fb-nav-link" href={t.url} title={t.blurb}>{t.name} <span aria-hidden="true">{"\u2192"}</span></a>;
  }
  return (
    <div className="fb-nav" ref={ref}>
      <button type="button" className="fb-nav-link fb-nav-btn" aria-label="More tools" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg className="fb-nav-ico" width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true" focusable="false"><rect x="1" y="1" width="6.5" height="6.5" rx="1.5" /><rect x="10.5" y="1" width="6.5" height="6.5" rx="1.5" /><rect x="1" y="10.5" width="6.5" height="6.5" rx="1.5" /><rect x="10.5" y="10.5" width="6.5" height="6.5" rx="1.5" /></svg>
        <span className="fb-nav-txt">Tools <span aria-hidden="true">{"\u25BE"}</span></span>
      </button>
      {open && (
        <div className="fb-nav-menu" role="menu">
          {tools.map((t) => t.id === currentId ? (
            <span key={t.id} className="fb-nav-item is-current" role="menuitem" aria-current="page"><b>{t.name}</b><small>{t.blurb}</small></span>
          ) : (
            <a key={t.id} className="fb-nav-item" role="menuitem" href={t.url}><b>{t.name}</b><small>{t.blurb}</small></a>
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== [SEC:COMPONENT] =====================
function FractionCalculator() {
  const [terms, setTerms] = useState(defaultTerms);
  const [coarse, setCoarse] = useState(false);
  const appRef = useRef(null);
  const focusTermRef = useRef(null); // id of a just-added term to focus

  // Platform detection: coarse pointer => touch-first device. Used to
  // size targets and pick the right hint. (Same signal Triangle Buddy uses.)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(!!mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, []);

  // After "Add term", move focus to the new row's first field so typing
  // can start immediately.
  useEffect(() => {
    const id = focusTermRef.current;
    if (!id || !appRef.current) return;
    focusTermRef.current = null;
    const el = appRef.current.querySelector(`[data-term="${id}"] input.fb-in`);
    if (el) el.focus();
  }, [terms]);

  const result = useMemo(() => evaluateTerms(terms), [terms]);
  const badSet = useMemo(() => new Set(result.badIndices || []), [result]);

  // Show the order-of-operations note only when it can change the answer:
  // an entered x/÷ term and an entered +/− term after the first row.
  const precedenceNote = useMemo(() => {
    let md = false, as = false;
    terms.forEach((t, i) => {
      if (i === 0 || isBlankTerm(t)) return;
      if (t.op === "*" || t.op === "/") md = true; else as = true;
    });
    return md && as;
  }, [terms]);

  const setField = useCallback((id, field, raw) => {
    const val = digitsOnly(raw, MAX_DIGITS);
    setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, [field]: val } : t)));
  }, []);

  // First row: the operator slot is a sign (+/−) toggle.
  const toggleSign = useCallback((id) => {
    setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, op: t.op === "-" ? "+" : "-" } : t)));
  }, []);

  // Other rows: one tap on the segmented control picks the operator.
  const setOp = useCallback((id, op) => {
    setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, op } : t)));
  }, []);

  const addTerm = useCallback(() => {
    const t = blankTerm("+");
    focusTermRef.current = t.id;
    setTerms((ts) => [...ts, t]);
  }, []);

  const removeTerm = useCallback((id) => {
    setTerms((ts) => (ts.length <= 2 ? ts : ts.filter((t) => t.id !== id)));
  }, []);

  const reset = useCallback(() => setTerms(defaultTerms()), []);

  // Keyboard: ↑/↓ nudges the value (desktop); Enter / the keypad's
  // "Next" key jumps to the following box, and the last box closes it.
  const onFieldKey = useCallback((id, field) => (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const list = appRef.current ? Array.from(appRef.current.querySelectorAll("input.fb-in")) : [];
      const at = list.indexOf(e.currentTarget);
      const next = at >= 0 ? list[at + 1] : null;
      if (next) next.focus(); else e.currentTarget.blur();
      return;
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const delta = e.key === "ArrowUp" ? 1 : -1;
    setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, [field]: nudgeField(t[field], delta, NUDGE_MAX) } : t)));
  }, []);

  // Select the whole value on focus, so one tap + typing REPLACES it
  // (no backspacing over the prefilled example). Deferred a tick because
  // mobile Safari moves the caret after the focus event fires.
  const selectAll = useCallback((e) => {
    const el = e.currentTarget;
    setTimeout(() => {
      try { if (document.activeElement === el) el.setSelectionRange(0, el.value.length); } catch (_) {}
    }, 0);
  }, []);

  const mixed = result.rational ? formatMixed(result.rational) : null;
  const parts = result.rational ? mixedParts(result.rational) : { kind: "none" };
  const improper = result.rational ? formatImproper(result.rational) : null;
  const decimal = result.rational ? formatDecimal(result.rational) : null;
  const lastIdx = terms.length - 1;

  const numberInputProps = {
    type: "text",
    inputMode: "numeric",
    pattern: "[0-9]*",
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    onFocus: selectAll,
  };

  return (
    <div className="fb-root" style={{ background: C.bg, color: C.ink, fontFamily: FONT_MONO }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        html,body{background:${C.bg};margin:0;}
        .fb-root{box-sizing:border-box;padding:18px 18px 0;
          background-image:radial-gradient(circle at 20% 0%, #14202b 0%, rgba(11,14,19,0) 45%);
          background-color:${C.bg};background-repeat:no-repeat;background-attachment:fixed;}
        .fb-app{max-width:640px;margin:0 auto;display:flex;flex-direction:column;}
        .fb-header{display:flex;align-items:baseline;gap:14px;margin-bottom:4px;flex-wrap:wrap;}
        .fb-title{font-family:${FONT_DISP};font-weight:600;margin:0;letter-spacing:-0.5px;font-size:30px;}
        .fb-subtitle{color:${C.dim};font-size:12px;letter-spacing:1px;}
        .fb-version{color:${C.dim};font-size:11px;}
        .fb-head-end{margin-left:auto;display:flex;align-items:center;gap:12px;position:relative;} /* anchors .fb-nav-menu to the header edge */
        .fb-nav-link{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:4px 12px;border-radius:999px;border:1px solid ${C.line};background:${C.panel};color:${C.brass};font-family:${FONT_MONO};font-size:12px;text-decoration:none;cursor:pointer;white-space:nowrap;box-sizing:border-box;}
        .fb-nav-link:hover,.fb-nav-link:focus-visible{border-color:${C.brass};outline:none;}
        .fb-nav-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:10000;min-width:260px;padding:6px;border-radius:12px;background:${C.panel2};border:1px solid ${C.line};box-shadow:0 16px 36px -10px #000;}
        .fb-nav-item{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:48px;padding:8px 12px;border-radius:8px;box-sizing:border-box;text-decoration:none;color:${C.ink};}
        .fb-nav-item b{font-family:${FONT_DISP};font-weight:600;font-size:15px;}
        .fb-nav-item small{font-family:${FONT_MONO};font-size:11px;color:${C.dim};}
        a.fb-nav-item:hover,a.fb-nav-item:focus-visible{background:${C.bg};outline:none;}
        .fb-nav-item.is-current b{color:${C.brass};}
        .fb-rule{height:1px;background:linear-gradient(90deg,${C.brass},transparent);margin-bottom:16px;opacity:0.5;}
        .fb-stack{display:flex;flex-direction:column;gap:14px;}

        .fb-section{background:${C.panel};border:1px solid ${C.line};border-radius:12px;overflow:hidden;box-shadow:0 12px 30px -22px #000;}
        .fb-section-head{display:flex;align-items:baseline;justify-content:space-between;padding:10px 14px;border-bottom:1px solid ${C.line};background:${C.panel2};}
        .fb-section-title{font-family:${FONT_DISP};font-size:16px;font-weight:600;letter-spacing:0.3px;}
        .fb-section-hint{font-size:10.5px;color:${C.faint};letter-spacing:0.5px;}
        .fb-section-body{padding:12px;display:flex;flex-direction:column;gap:10px;}

        .fb-term{display:grid;grid-template-columns:minmax(0,1fr) auto 1fr;align-items:center;column-gap:10px;row-gap:6px;
          padding:8px;border-radius:10px;background:${C.bg};border:1px solid ${C.line};}
        /* sign/operator + whole + fraction, centered under the operator picker */
        .fb-cluster{grid-column:2;display:flex;align-items:center;gap:10px;}
        .fb-term.is-bad{border-color:${C.red};}

        .fb-btn{cursor:pointer;transition:all .15s ease;user-select:none;-webkit-user-select:none;touch-action:manipulation;}
        .fb-btn:hover{border-color:${C.brass};color:${C.brass};}

        /* Left slot: sign toggle on row 1, operator badge on later rows. */
        .fb-op,.fb-opbadge{width:40px;height:40px;flex:0 0 auto;border-radius:8px;box-sizing:border-box;
          font-family:${FONT_MONO};font-size:22px;font-weight:600;display:grid;place-items:center;line-height:1;}
        .fb-op{background:${C.bg};border:1px solid ${C.line};color:${C.brass};}
        .fb-op.is-minus,.fb-opbadge.is-minus{color:${C.red};}
        .fb-op:hover{color:${C.brass};border-color:${C.brass};}
        .fb-op.is-minus:hover{color:${C.red};}
        .fb-opbadge{color:${C.brass};border:1px solid transparent;opacity:0.85;}

        /* Operator picker between rows: one tap, 4 choices. */
        .fb-ops{display:flex;justify-content:center;gap:6px;}
        .fb-opbtn{width:44px;height:36px;border-radius:8px;background:${C.bg};border:1px solid ${C.line};color:${C.dim};
          font-family:${FONT_MONO};font-size:19px;font-weight:600;display:grid;place-items:center;line-height:1;padding:0;}
        .fb-opbtn.is-on{background:${C.brassDim};border-color:${C.brass};color:${C.ink};}
        .fb-opbtn.is-on.is-minus{background:#3a2226;border-color:${C.red};}

        input.fb-in{background:${C.panel};border:1px solid ${C.line};color:${C.ink};font-family:${FONT_MONO};box-sizing:border-box;
          border-radius:6px;padding:0 2px;height:40px;font-size:16px;text-align:center;outline:none;-moz-appearance:textfield;}
        input.fb-in:focus{border-color:${C.brass};}
        input.fb-in::placeholder{color:${C.faint};opacity:0.7;}
        input.fb-whole{width:72px;}
        .fb-infrac{display:flex;flex-direction:column;align-items:stretch;gap:3px;width:76px;flex:0 0 auto;}
        .fb-bar{height:2px;background:${C.brass};border-radius:2px;opacity:0.85;}
        input.fb-num,input.fb-den{width:100%;height:34px;}

        .fb-del{grid-column:3;justify-self:end;width:34px;height:34px;flex:0 0 auto;border-radius:8px;background:transparent;
          border:1px solid #5a2e33;color:${C.red};font-family:${FONT_MONO};font-size:18px;display:grid;place-items:center;line-height:1;}
        .fb-del:hover{color:${C.red};border-color:${C.red};background:#2a1417;}
        .fb-del[disabled]{opacity:0.3;cursor:default;pointer-events:none;}

        /* Own line under the row, so a message never pushes the row wider
           than a phone screen. */
        .fb-termerr{grid-column:1 / -1;color:${C.red};font-size:11px;text-align:center;}

        .fb-add{display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 10px;border-radius:8px;
          background:${C.bg};color:${C.dim};border:1px dashed ${C.line};font-family:${FONT_MONO};font-size:13px;}
        .fb-add:hover{color:${C.brass};border-color:${C.brass};}

        .fb-result{display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 4px 4px;text-align:center;}
        .fb-eq-line{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;}
        .fb-eq{font-family:${FONT_DISP};font-size:34px;color:${C.faint};}
        .fb-result-main{font-family:${FONT_DISP};font-weight:600;font-size:42px;line-height:1.05;color:${C.brass};word-break:break-word;
          display:inline-flex;align-items:center;}
        .fb-swhole{margin-right:9px;}
        .fb-sfrac{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;font-size:0.46em;}
        .fb-sfrac-n,.fb-sfrac-d{display:block;padding:0 2px;line-height:1.04;}
        .fb-sfrac-bar{align-self:stretch;height:2px;background:${C.brass};margin:2px 0;border-radius:1px;}
        .fb-result-sub{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;color:${C.dim};font-size:13px;}
        .fb-result-sub b{color:${C.cyan};font-weight:500;}
        .fb-result-sub .sep{color:${C.faint};}
        .fb-note{color:${C.faint};font-size:11px;text-align:center;}
        .fb-warn{color:${C.red};font-size:12.5px;text-align:center;padding:6px 4px;}

        .fb-footer{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px;}
        .fb-reset{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;background:${C.bg};
          color:${C.dim};border:1px solid ${C.line};font-family:${FONT_MONO};font-size:12px;}
        .fb-reset:hover{color:${C.brass};border-color:${C.brass};}
        .fb-hint{margin-left:auto;color:${C.faint};font-size:11px;text-align:right;line-height:1.5;}
        .fb-family{display:block;margin-top:18px;text-align:center;color:${C.dim};font-size:12px;text-decoration:none;
          letter-spacing:0.5px;padding:14px 10px;border-top:1px solid ${C.line};}
        .fb-family b{color:${C.brass};font-weight:500;}
        .fb-family:hover b{text-decoration:underline;}

        ::selection{background:${C.brass};color:${C.bg};}

        /* Touch-first devices: larger targets, and the result moves ABOVE
           the rows and sticks there, so it stays visible over the keypad. */
        @media (pointer: coarse){
          .fb-op,.fb-opbadge{width:46px;height:46px;font-size:24px;}
          .fb-opbtn{width:54px;height:44px;font-size:22px;}
          .fb-ops{gap:8px;}
          input.fb-in{height:46px;font-size:17px;}
          input.fb-num,input.fb-den{height:40px;}
          input.fb-whole{width:70px;}
          .fb-infrac{width:74px;}
          .fb-del{width:40px;height:40px;font-size:20px;}
          .fb-term{column-gap:6px;}
          .fb-cluster{gap:8px;}
          .fb-result-sec{order:-1;position:sticky;top:0;z-index:5;box-shadow:0 10px 24px -8px #000;}
          .fb-result-sec .fb-section-head{display:none;}
          .fb-result-sec .fb-section-body{padding:8px 12px;gap:6px;}
          .fb-result-main{font-size:38px;}
          .fb-eq{font-size:28px;}
          .fb-hint{margin-left:0;text-align:left;}
          .fb-nav-link{min-height:44px;font-size:13px;padding:4px 14px;}
        }
        .fb-nav-ico{display:none}
        @media (max-width:600px){ .fb-nav-btn{width:44px;min-height:44px;padding:0;justify-content:center} .fb-nav-txt{display:none} .fb-nav-ico{display:block} }
        @media (max-width:600px){ .fb-header{align-items:center;} .fb-subtitle{order:3;width:100%;} }
        /* Phones: a centered group leaves the delete button crowded on the
           right, so spread all four row items with equal spacing instead.
           (display:contents lets the cluster's children join the row.) */
        @media (max-width: 480px){
          .fb-term{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-evenly;column-gap:0;}
          .fb-cluster{display:contents;}
          .fb-termerr{flex-basis:100%;}
        }
        /* Narrow phones (e.g. 320px): trim outer padding so a full row fits. */
        @media (max-width: 360px){
          .fb-root{padding:10px 10px 0;}
          .fb-section-body{padding:10px;}
        }
      `}</style>

      <div className="fb-app" ref={appRef}>
        <div className="fb-header">
          <h1 className="fb-title">Fraction<span style={{ color: C.brass }}>·</span>Buddy</h1>
          <span className="fb-subtitle">+ − × ÷ FRACTIONS · EXACT RESULTS</span>
          <div className="fb-head-end">
            <ToolNav tools={BUDDY_TOOLS} currentId="fractions" />
            <span className="fb-version">{APP_VERSION}</span>
          </div>
        </div>
        <div className="fb-rule" />

        <div className="fb-stack">
          {/* ---- Terms ---- */}
          <Section title="Terms" hint={`${terms.length} TERMS`}>
            {terms.map((t, i) => {
              const blank = isBlankTerm(t);
              const tErr = blank ? null : termRational(t).error;
              const isBad = badSet.has(i) || !!tErr;
              const errText = tErr || (result.error === "divzero" && badSet.has(i) ? "can't divide by 0" : null);
              return (
                <React.Fragment key={t.id}>
                  {i > 0 && (
                    <div className="fb-ops" role="radiogroup" aria-label={`operator before term ${i + 1}`}>
                      {OPS.map((o) => {
                        const on = t.op === o.op;
                        return (
                          <button
                            key={o.op}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={o.label}
                            className={`fb-btn fb-opbtn${on ? " is-on" : ""}${o.op === "-" ? " is-minus" : ""}`}
                            onClick={() => setOp(t.id, o.op)}
                          >
                            {o.glyph}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div data-term={t.id} className={`fb-term${isBad ? " is-bad" : ""}`}>
                    <div className="fb-cluster">
                    {i === 0 ? (
                      <button
                        type="button"
                        className={`fb-btn fb-op${t.op === "-" ? " is-minus" : ""}`}
                        onClick={() => toggleSign(t.id)}
                        aria-label={t.op === "-" ? "first term is negative (tap for positive)" : "first term is positive (tap for negative)"}
                        title="Sign of the first term"
                      >
                        {t.op === "-" ? MINUS : "+"}
                      </button>
                    ) : (
                      <span className={`fb-opbadge${t.op === "-" ? " is-minus" : ""}`} aria-hidden="true">
                        {OP_GLYPH[t.op] || "+"}
                      </span>
                    )}

                    <input
                      {...numberInputProps}
                      enterKeyHint="next"
                      className="fb-in fb-whole"
                      placeholder="0"
                      value={t.whole}
                      onChange={(e) => setField(t.id, "whole", e.target.value)}
                      onKeyDown={onFieldKey(t.id, "whole")}
                      aria-label={`term ${i + 1} whole number`}
                    />

                    <div className="fb-infrac">
                      <input
                        {...numberInputProps}
                        enterKeyHint="next"
                        className="fb-in fb-num"
                        placeholder="0"
                        value={t.num}
                        onChange={(e) => setField(t.id, "num", e.target.value)}
                        onKeyDown={onFieldKey(t.id, "num")}
                        aria-label={`term ${i + 1} numerator`}
                      />
                      <div className="fb-bar" />
                      <input
                        {...numberInputProps}
                        enterKeyHint={i === lastIdx ? "done" : "next"}
                        className="fb-in fb-den"
                        placeholder="1"
                        value={t.den}
                        onChange={(e) => setField(t.id, "den", e.target.value)}
                        onKeyDown={onFieldKey(t.id, "den")}
                        aria-label={`term ${i + 1} denominator`}
                      />
                    </div>

                    </div>

                    <button
                      type="button"
                      className="fb-btn fb-del"
                      onClick={() => removeTerm(t.id)}
                      disabled={terms.length <= 2}
                      aria-label={`remove term ${i + 1}`}
                      title={terms.length <= 2 ? "Keep at least two terms" : "Remove this term"}
                    >
                      {"\u00d7"}
                    </button>

                    {errText && <span className="fb-termerr">{errText}</span>}
                  </div>
                </React.Fragment>
              );
            })}

            <button type="button" className="fb-btn fb-add" onClick={addTerm} aria-label="add another term">
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add term
            </button>
          </Section>

          {/* ---- Result ---- */}
          <Section title="Result" hint="EXACT" className="fb-result-sec">
            {result.error === "input" && (
              <div className="fb-warn">Check the highlighted term{result.badIndices.length > 1 ? "s" : ""} — each fraction needs a denominator.</div>
            )}
            {result.error === "divzero" && (
              <div className="fb-warn">Can't divide by zero — change the highlighted term.</div>
            )}
            {result.error === "overflow" && (
              <div className="fb-warn">These numbers are too large for exact arithmetic. Try smaller values.</div>
            )}
            {!result.error && (
              <div className="fb-result" aria-live="polite">
                <div className="fb-eq-line">
                  <span className="fb-eq">=</span>
                  <span className="fb-result-main" aria-label={mixed}>
                    <MixedResult parts={parts} />
                  </span>
                </div>
                <div className="fb-result-sub">
                  <span>improper <b>{improper}</b></span>
                  <span className="sep">·</span>
                  <span>decimal <b>{decimal}</b></span>
                </div>
                {precedenceNote && (
                  <div className="fb-note">× and ÷ are worked out before + and −</div>
                )}
              </div>
            )}
          </Section>
        </div>

        <div className="fb-footer">
          <button type="button" className="fb-btn fb-reset" onClick={reset} aria-label="reset to the example">
            <span style={{ fontSize: 14, lineHeight: 1 }}>↺</span> Reset
          </button>
          <span className="fb-hint">
            {coarse
              ? "Tap a box and type — it replaces the value. Next ↵ jumps ahead."
              : "Enter jumps to the next box · ↑ / ↓ nudge a value."}
          </span>
        </div>

        <a className="fb-family" href={FAMILY_URL}>
          More free math &amp; geometry tools at <b>trianglebuddy.com</b>
        </a>
      </div>
    </div>
  );
}

// ===================== [SEC:PRESENT] =====================
// Small presentational helper (mirrors Triangle Buddy's Section).
function Section({ title, hint, className, children }) {
  return (
    <div className={`fb-section${className ? " " + className : ""}`}>
      <div className="fb-section-head">
        <span className="fb-section-title">{title}</span>
        {hint && <span className="fb-section-hint">{hint}</span>}
      </div>
      <div className="fb-section-body">{children}</div>
    </div>
  );
}

// A typographic stacked fraction: numerator over a bar over denominator.
// Purely visual (aria-hidden) — the parent .fb-result-main carries an
// aria-label with the readable text form (e.g. "3 1/4").
// Classes are fb-sfrac* (NOT fb-frac): v1.1.0 shared .fb-frac with the
// input column and the two rules bled into each other.
function StackedFraction({ num, den }) {
  return (
    <span className="fb-sfrac" aria-hidden="true">
      <span className="fb-sfrac-n">{num}</span>
      <span className="fb-sfrac-bar" />
      <span className="fb-sfrac-d">{den}</span>
    </span>
  );
}

// Renders the main result from structured mixedParts(): a whole number, a
// stacked fraction, or both, with the whole part visually separated.
function MixedResult({ parts }) {
  const sign = parts.neg ? MINUS : "";
  switch (parts.kind) {
    case "zero":
      return <>0</>;
    case "whole":
      return <>{sign}{parts.whole}</>;
    case "fraction":
      return <>{sign}<StackedFraction num={parts.num} den={parts.den} /></>;
    case "mixed":
      return (
        <>
          {sign}
          <span className="fb-swhole">{parts.whole}</span>
          <StackedFraction num={parts.num} den={parts.den} />
        </>
      );
    case "none":
    default:
      return <>—</>;
  }
}

export default FractionCalculator;
