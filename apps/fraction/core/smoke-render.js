/* FRACTION BUDDY — core/smoke-render.js
   Bundle FractionCalculator.jsx as CJS and actually render it with
   react-dom/server. Catches runtime errors the parser/bundler accept
   (dangling consts, bad helper refs, hook misuse) AND confirms, end to
   end, that:
     - the default state computes 1/2 + 1/4 = 3/4 via the inlined core,
     - the value fields carry the numeric-keypad attributes (mobile).
   Run: node core/smoke-render.js   */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_JSX = path.join(ROOT, "FractionCalculator.jsx");
const ESBUILD = path.join(ROOT, "node_modules", ".bin", "esbuild");
const TMP = path.join(ROOT, ".smoke-bundle.cjs");

function fail(msg, detail) {
  console.error("[smoke] " + msg);
  if (detail) console.error(detail);
  try { fs.unlinkSync(TMP); } catch {}
  process.exit(1);
}

if (!fs.existsSync(SRC_JSX)) fail("source not found: " + SRC_JSX);
if (!fs.existsSync(ESBUILD)) fail("esbuild not found in node_modules");

try {
  execFileSync(ESBUILD, [
    SRC_JSX, "--bundle", "--format=cjs", "--platform=node",
    "--loader:.jsx=jsx", "--jsx=automatic",
    "--external:react", "--external:react-dom", "--external:react/jsx-runtime",
    `--outfile=${TMP}`, "--log-level=error",
  ], { stdio: "inherit", cwd: ROOT });
} catch (e) { fail("esbuild bundling failed for smoke test"); }

let React, renderToString, mod;
try {
  React = require("react");
  renderToString = require("react-dom/server").renderToString;
  delete require.cache[TMP];
  mod = require(TMP);
} catch (e) { fail("loading bundle threw (module-level error):", e.stack || e.message); }

const Component = mod && (mod.default || mod.FractionCalculator);
if (typeof Component !== "function") fail("no default export (expected FractionCalculator)");

try {
  const html = renderToString(React.createElement(Component));
  if (typeof html !== "string" || html.length < 200) fail(`suspiciously little output (${html?.length ?? 0} chars)`);
  const checks = [
    ["title present", /Fraction/.test(html)],
    ['default result aria-label "3/4" (1/2 + 1/4 via inlined core)', html.includes('aria-label="3/4"')],
    ["result rendered as stacked fraction", /class="fb-sfrac"/.test(html) && /fb-sfrac-bar/.test(html)],
    ["operator picker renders x and ÷", html.includes("multiply by") && html.includes("divide by")],
    ["link back to trianglebuddy.com", html.includes('href="https://trianglebuddy.com/"')],
    ["numeric keypad: inputmode", /inputmode="numeric"/i.test(html)],
    ["numeric keypad: pattern", /pattern="\[0-9\]\*"/.test(html)],
    ["improper readout label", html.includes("improper")],
    ["decimal readout label", html.includes("decimal")],
  ];
  let bad = 0;
  for (const [name, cond] of checks) if (!cond) { console.error("  MISSING:", name); bad++; }
  if (bad) fail(`${bad} render assertion(s) failed`);
  try { fs.unlinkSync(TMP); } catch {}
  console.log(`[smoke] ok — rendered ${html.length} chars; default 1/2 + 1/4 = 3/4 confirmed`);
} catch (e) {
  fail("render threw:", e.stack || e.message);
}
