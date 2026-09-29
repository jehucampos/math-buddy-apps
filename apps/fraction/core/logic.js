/* ============================================================
   FRACTION BUDDY — core/logic.js
   Pure rational arithmetic. EXACT (no float rounding). This is
   the single source of truth; the same text is inlined verbatim
   into FractionCalculator.jsx [SEC:CORE]. Edit here, run
   core/test.js, then sync.

   A rational is { n, d } with d > 0, always reduced. Any
   operation that would exceed Number.MAX_SAFE_INTEGER returns
   null (the OVERFLOW sentinel) rather than a silently-wrong
   float — callers surface a "too large for exact mode" notice.
   ============================================================ */

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

// Exact negate (for subtraction: a - b === a + (-b)).
function negR(a) { return a ? { n: -a.n, d: a.d } : null; }

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

module.exports = {
  gcd, makeRational, lcm, addR, negR,
  mulR, divR, isBlankTerm, evaluateTerms,
  parseField, termRational,
  formatMixed, mixedParts, formatImproper, formatDecimal, onlyFactors2and5,
  nudgeField, digitsOnly,
};
