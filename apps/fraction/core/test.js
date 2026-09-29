/* FRACTION BUDDY — core/test.js
   Standing regression suite for core/logic.js. A green run means the
   exact-arithmetic logic shipped in the artifact is correct.
   Run: node core/test.js   */

const L = require("./logic.js");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  FAIL:", name); }
}
function eqR(name, r, n, d) {
  ok(name, r && r.n === n && r.d === d);
}
function term(op, whole, num, den) { return { op, whole, num, den }; }

// ---- gcd / makeRational (reduction) ----
ok("gcd(12,8)=4", L.gcd(12, 8) === 4);
ok("gcd(0,0)=1", L.gcd(0, 0) === 1);
eqR("reduce 6/8 -> 3/4", L.makeRational(6, 8), 3, 4);
eqR("reduce -2/-4 -> 1/2", L.makeRational(-2, -4), 1, 2);
eqR("reduce 2/-4 -> -1/2", L.makeRational(2, -4), -1, 2);
eqR("reduce 0/5 -> 0/1", L.makeRational(0, 5), 0, 1);
ok("d=0 -> null", L.makeRational(1, 0) === null);

// ---- lcm ----
ok("lcm(4,6)=12", L.lcm(4, 6) === 12);
ok("lcm(3,3)=3", L.lcm(3, 3) === 3);
ok("lcm(0,5)=0", L.lcm(0, 5) === 0);

// ---- addR exactness (the heart of the tool) ----
eqR("1/2 + 1/4 = 3/4", L.addR({ n: 1, d: 2 }, { n: 1, d: 4 }), 3, 4);
eqR("1/3 + 1/3 = 2/3 (NOT a rounded decimal)", L.addR({ n: 1, d: 3 }, { n: 1, d: 3 }), 2, 3);
eqR("1/3 + 2/3 = 1/1", L.addR({ n: 1, d: 3 }, { n: 2, d: 3 }), 1, 1);
eqR("1/2 + (-1/2) = 0/1", L.addR({ n: 1, d: 2 }, L.negR({ n: 1, d: 2 })), 0, 1);
eqR("1/6 + 1/10 = 4/15", L.addR({ n: 1, d: 6 }, { n: 1, d: 10 }), 4, 15);
eqR("negR(3/4) = -3/4", L.negR({ n: 3, d: 4 }), -3, 4);

// ---- parseField ----
ok("parseField('' ,7)=7", L.parseField("", 7) === 7);
ok("parseField(' 12 ')=12", L.parseField(" 12 ") === 12);
ok("parseField('3a')=NaN", Number.isNaN(L.parseField("3a")));
ok("parseField('-3')=NaN (sign handled by op)", Number.isNaN(L.parseField("-3")));

// ---- termRational ----
eqR("term + 2 3/4 -> 11/4", L.termRational(term("+", "2", "3", "4")).rational, 11, 4);
eqR("term - 2 3/4 -> -11/4", L.termRational(term("-", "2", "3", "4")).rational, -11, 4);
eqR("term + 5 (whole only) -> 5/1", L.termRational(term("+", "5", "", "")).rational, 5, 1);
eqR("term + 3/8 (frac only) -> 3/8", L.termRational(term("+", "", "3", "8")).rational, 3, 8);
eqR("term all blank -> 0/1", L.termRational(term("+", "", "", "")).rational, 0, 1);
ok("term num w/o den -> error", L.termRational(term("+", "", "3", "")).error === "need denominator");
ok("term den=0 -> error", L.termRational(term("+", "1", "3", "0")).error === "need denominator");
ok("term letters -> error", L.termRational(term("+", "x", "", "")).error === "digits only");
eqR("term + improper 7/2 -> 7/2", L.termRational(term("+", "", "7", "2")).rational, 7, 2);

// ---- evaluateTerms: add/subtract (regression of the v1.x sum behaviour) ----
(() => {
  const r = L.evaluateTerms([term("+", "", "1", "2"), term("+", "", "1", "4")]);
  eqR("sum 1/2 + 1/4 = 3/4", r.rational, 3, 4);
  ok("sum no error", r.error === null);
})();
(() => {
  const r = L.evaluateTerms([term("+", "5", "", ""), term("-", "2", "1", "2")]);
  eqR("5 - 2 1/2 = 5/2", r.rational, 5, 2);
})();
(() => {
  const r = L.evaluateTerms([term("+", "", "2", "3"), term("-", "", "2", "3")]);
  eqR("2/3 - 2/3 = 0", r.rational, 0, 1);
})();
(() => {
  const r = L.evaluateTerms([term("+", "1", "1", "2"), term("+", "", "3", "x")]);
  ok("sum flags bad term index", r.error === "input" && r.badIndices.length === 1 && r.badIndices[0] === 1);
})();
(() => { // three-term mixed add/subtract
  const r = L.evaluateTerms([term("+", "", "1", "2"), term("+", "", "1", "3"), term("+", "", "1", "6")]);
  eqR("1/2 + 1/3 + 1/6 = 1", r.rational, 1, 1);
})();

// ---- overflow guard: must return the sentinel, never a wrong float ----
(() => {
  const huge = { n: 999999, d: 999983 }; // large coprime-ish denominators
  const r = L.addR(huge, { n: 888888, d: 999979 });
  // 999983*999979 ~ 1e12 (safe); product with numerator ~1e12*1e6 -> unsafe
  // We only assert it is EITHER a correct rational OR the overflow sentinel,
  // never a non-safe-integer rational.
  ok("addR never returns unsafe ints",
     r === null || (Number.isSafeInteger(r.n) && Number.isSafeInteger(r.d)));
})();
(() => {
  // Force a definite overflow and confirm the sentinel.
  const a = { n: 9e15, d: 1 }, b = { n: 9e15, d: 1 };
  ok("addR overflow -> null", L.addR(a, b) === null);
  const r = L.evaluateTerms([{ op: "+", whole: "99999999999999999", num: "", den: "" }]);
  ok("evaluateTerms 17-digit whole -> input error (never wrong)", r.error === "input");
})();

// ---- mulR / divR: exact, cross-cancelled ----
eqR("mulR 2/3 * 3/4 = 1/2", L.mulR({ n: 2, d: 3 }, { n: 3, d: 4 }), 1, 2);
eqR("mulR -1/2 * 2/5 = -1/5", L.mulR({ n: -1, d: 2 }, { n: 2, d: 5 }), -1, 5);
eqR("mulR 0 * 7/9 = 0", L.mulR({ n: 0, d: 1 }, { n: 7, d: 9 }), 0, 1);
eqR("divR 1/2 / 1/4 = 2", L.divR({ n: 1, d: 2 }, { n: 1, d: 4 }), 2, 1);
eqR("divR 3/4 / -3/8 = -2", L.divR({ n: 3, d: 4 }, { n: -3, d: 8 }), -2, 1);
ok("divR by zero -> null", L.divR({ n: 1, d: 2 }, { n: 0, d: 1 }) === null);
// cross-cancellation keeps a product safe that a naive n*n would overflow
eqR("mulR cross-cancels (999999/999998 * 999998/999999 = 1)",
    L.mulR({ n: 999999, d: 999998 }, { n: 999998, d: 999999 }), 1, 1);
ok("mulR genuine overflow -> null", L.mulR({ n: 9e15, d: 1 }, { n: 7, d: 1 }) === null);

// ---- evaluateTerms: order of operations (x and / before + and -) ----
eqR("1/2 + 1/3 x 3/4 = 3/4 (not 5/8)",
    L.evaluateTerms([term("+", "", "1", "2"), term("+", "", "1", "3"), term("*", "", "3", "4")]).rational, 3, 4);
eqR("2 1/2 / 3/4 = 10/3",
    L.evaluateTerms([term("+", "2", "1", "2"), term("/", "", "3", "4")]).rational, 10, 3);
eqR("-1/2 x 2/3 - 1/6 = -1/2",
    L.evaluateTerms([term("-", "", "1", "2"), term("*", "", "2", "3"), term("-", "", "1", "6")]).rational, -1, 2);
eqR("6 / 2 x 3 = 9 (left to right within x and /)",
    L.evaluateTerms([term("+", "6", "", ""), term("/", "2", "", ""), term("*", "3", "", "")]).rational, 9, 1);
eqR("1 - 1/2 / 1/4 + 3 = 2",
    L.evaluateTerms([term("+", "1", "", ""), term("-", "", "1", "2"), term("/", "", "1", "4"), term("+", "3", "", "")]).rational, 2, 1);
eqR("1/2 - 1/3 x 3/2 = 0",
    L.evaluateTerms([term("+", "", "1", "2"), term("-", "", "1", "3"), term("*", "", "3", "2")]).rational, 0, 1);
(() => {
  const r = L.evaluateTerms([term("+", "", "1", "2"), term("/", "0", "", "")]);
  ok("divide by 0 -> divzero at index 1", r.error === "divzero" && r.badIndices.length === 1 && r.badIndices[0] === 1);
  const r2 = L.evaluateTerms([term("+", "", "1", "2"), term("/", "", "0", "5")]);
  ok("divide by 0/5 -> divzero", r2.error === "divzero");
})();
(() => { // blank rows are skipped, never an error while typing
  ok("isBlankTerm all empty", L.isBlankTerm(term("*", "", "", "")) === true);
  ok("isBlankTerm with den only is not blank", L.isBlankTerm(term("+", "", "", "4")) === false);
  eqR("blank x row skipped: 3/4 x [blank] = 3/4",
      L.evaluateTerms([term("+", "", "3", "4"), term("*", "", "", "")]).rational, 3, 4);
  const r = L.evaluateTerms([term("+", "", "3", "4"), term("/", "", "", "")]);
  ok("blank / row skipped (no divzero while typing)", r.error === null && r.rational.n === 3 && r.rational.d === 4);
  eqR("all rows blank -> 0", L.evaluateTerms([term("+", "", "", ""), term("*", "", "", "")]).rational, 0, 1);
  eqR("blank first row: next '-' term becomes a negative lead",
      L.evaluateTerms([term("+", "", "", ""), term("-", "", "1", "2")]).rational, -1, 2);
})();
(() => { // overflow through multiplication surfaces as the sentinel
  const big = term("*", "999999", "", "");
  const r = L.evaluateTerms([term("+", "999999", "", ""), big, big, big]);
  ok("chained large products -> overflow (never wrong)", r.error === "overflow" && r.rational === null);
})();

// ---- formatting ----
ok("formatMixed 11/4 = '2 3/4'", L.formatMixed({ n: 11, d: 4 }) === "2\u20093/4");
ok("formatMixed -11/4 = '-2 3/4'", L.formatMixed({ n: -11, d: 4 }) === "-2\u20093/4");
ok("formatMixed 3/4", L.formatMixed({ n: 3, d: 4 }) === "3/4");
ok("formatMixed 5/1 = '5'", L.formatMixed({ n: 5, d: 1 }) === "5");
ok("formatMixed 0", L.formatMixed({ n: 0, d: 1 }) === "0");
ok("formatImproper 11/4", L.formatImproper({ n: 11, d: 4 }) === "11/4");
ok("formatImproper 5/1 = '5'", L.formatImproper({ n: 5, d: 1 }) === "5");
ok("formatDecimal 3/4 exact = '0.75'", L.formatDecimal({ n: 3, d: 4 }) === "0.75");
ok("formatDecimal 1/3 approx '≈ 0.333333'", L.formatDecimal({ n: 1, d: 3 }) === "≈ 0.333333");
ok("formatDecimal 1/8 exact '0.125'", L.formatDecimal({ n: 1, d: 8 }) === "0.125");
ok("onlyFactors2and5(8)=true", L.onlyFactors2and5(8) === true);
ok("onlyFactors2and5(3)=false", L.onlyFactors2and5(3) === false);
ok("onlyFactors2and5(20)=true", L.onlyFactors2and5(20) === true);

// ---- nudgeField / digitsOnly (input helpers) ----
ok("nudge '3' +1 = '4'", L.nudgeField("3", 1, 64) === "4");
ok("nudge '0' -1 clamps to '0'", L.nudgeField("0", -1, 64) === "0");
ok("nudge '64' +1 clamps to max", L.nudgeField("64", 1, 64) === "64");
ok("nudge '' +1 = '1'", L.nudgeField("", 1, 64) === "1");
ok("digitsOnly '1a2.3/4' = '1234'", L.digitsOnly("1a2.3/4") === "1234");
ok("digitsOnly maxLen", L.digitsOnly("1234567", 4) === "1234");

// ---- mixedParts (structured form for the stacked-fraction display) ----
// Each case is checked against formatMixed so the two views can never drift.
ok("mixedParts(null) -> none", L.mixedParts(null).kind === "none");
{
  const p = L.mixedParts(L.makeRational(0, 1));
  ok("mixedParts 0 -> zero", p.kind === "zero");
}
{
  const p = L.mixedParts(L.makeRational(5, 1));
  ok("mixedParts 5 -> whole 5", p.kind === "whole" && p.whole === 5 && p.neg === false);
}
{
  const p = L.mixedParts(L.makeRational(3, 4)); // 3/4, no whole part
  ok("mixedParts 3/4 -> fraction 3/4", p.kind === "fraction" && p.num === 3 && p.den === 4 && p.neg === false);
}
{
  const p = L.mixedParts(L.makeRational(13, 4)); // 3 1/4
  ok("mixedParts 13/4 -> mixed 3 + 1/4", p.kind === "mixed" && p.whole === 3 && p.num === 1 && p.den === 4 && p.neg === false);
}
{
  const p = L.mixedParts(L.makeRational(-13, 4)); // -3 1/4
  ok("mixedParts -13/4 -> mixed neg 3 + 1/4", p.kind === "mixed" && p.neg === true && p.whole === 3 && p.num === 1 && p.den === 4);
}
{
  const p = L.mixedParts(L.makeRational(-3, 4)); // -3/4
  ok("mixedParts -3/4 -> fraction neg 3/4", p.kind === "fraction" && p.neg === true && p.num === 3 && p.den === 4);
}
// Cross-check: rebuilding the text form from parts equals formatMixed.
function partsToText(p) {
  const THIN = "\u2009";
  if (p.kind === "none") return "—";
  if (p.kind === "zero") return "0";
  const sign = p.neg ? "-" : "";
  if (p.kind === "whole") return sign + p.whole;
  if (p.kind === "fraction") return sign + `${p.num}/${p.den}`;
  return sign + `${p.whole}${THIN}${p.num}/${p.den}`;
}
[0, 1, 5, 3, 13, -13, -3, 7, 100, -1].forEach((n) => {
  const r = L.makeRational(n, 4);
  const fromParts = partsToText(L.mixedParts(r));
  const fromFormat = L.formatMixed(r);
  ok(`mixedParts agrees with formatMixed for ${n}/4`, fromParts === fromFormat);
});

console.log(`\n[core/test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
