/* FRACTION BUDDY — core/sync-check.js
   Proves every pure function inlined in FractionCalculator.jsx
   [SEC:CORE] is identical to the one in core/logic.js (the file the
   tests run against). If they drift, the shipped logic is no longer
   what core/test.js verified — so this fails the build.
   Run: node core/sync-check.js   */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const logic = fs.readFileSync(path.join(__dirname, "logic.js"), "utf8");
const jsx = fs.readFileSync(path.join(ROOT, "FractionCalculator.jsx"), "utf8");

// Extract a top-level `function NAME(...) {...}` by brace matching.
function extractFn(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  let i = src.indexOf("{", m.index);
  if (i < 0) return null;
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}

// Compare code, not commentary: drop block + line comments first.
// (None of the mirrored functions contain "//" inside a string/regex.)
const norm = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ")
   .replace(/\/\/[^\n]*/g, " ")
   .replace(/\s+/g, " ")
   .trim();

// Functions that MUST be mirrored. negR lives only in logic.js (used by
// the test harness; the component subtracts via a sign in termRational),
// so it is intentionally excluded.
const NAMES = [
  "gcd", "makeRational", "lcm", "addR", "parseField", "termRational",
  "mulR", "divR", "isBlankTerm", "evaluateTerms", "formatMixed", "mixedParts", "formatImproper", "onlyFactors2and5",
  "formatDecimal", "nudgeField", "digitsOnly",
];

let bad = 0;
for (const name of NAMES) {
  const a = extractFn(logic, name);
  const b = extractFn(jsx, name);
  if (!a) { console.error(`  MISSING in logic.js: ${name}`); bad++; continue; }
  if (!b) { console.error(`  MISSING in FractionCalculator.jsx: ${name}`); bad++; continue; }
  if (norm(a) !== norm(b)) {
    console.error(`  DRIFT: ${name} differs between logic.js and the JSX [SEC:CORE]`);
    bad++;
  }
}

if (bad) {
  console.error(`\n[sync-check] ${bad} function(s) out of sync — re-inline core/logic.js into [SEC:CORE].`);
  process.exit(1);
}
console.log(`[sync-check] ok — ${NAMES.length} core functions identical in both files`);
