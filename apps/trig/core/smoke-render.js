#!/usr/bin/env node
/*
  Smoke render: bundle TrigCalculator.jsx as a Node CJS module and render it
  with react-dom/server across every mode × view, both angle units, and both
  editor presentations. Catches render-time ReferenceErrors, hook misuse and
  throw-in-render bugs that parse-clean tools miss. Event handlers are not
  exercised here (see interaction-test.js / browser-test.js).
*/
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_JSX = path.join(ROOT, "TrigCalculator.jsx");
const ESBUILD = path.join(ROOT, "node_modules", ".bin", "esbuild");
const TMP = path.join(ROOT, ".smoke-bundle.cjs");
function fail(msg, detail) {
  console.error("[smoke] " + msg);
  if (detail) console.error(detail);
  try { fs.unlinkSync(TMP); } catch {}
  process.exit(1);
}
try {
  execFileSync(ESBUILD, [SRC_JSX, "--bundle", "--format=cjs", "--platform=node", "--loader:.jsx=jsx", "--jsx=automatic",
    "--external:react", "--external:react-dom", "--external:react/jsx-runtime", `--outfile=${TMP}`, "--log-level=error"], { stdio: "inherit", cwd: ROOT });
} catch (e) { fail("esbuild bundling failed"); }

let React, renderToString, Comp;
try {
  React = require("react");
  renderToString = require("react-dom/server").renderToString;
  delete require.cache[TMP];
  Comp = require(TMP).default;
} catch (e) { fail("loading bundle threw (module-level error):", e.stack || e.message); }
if (typeof Comp !== "function") fail("no default export (expected the TrigCalculator component)");

const VERSION = "v" + JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const origError = console.error;
const cases = [];
for (const initialMode of ["angle", "inverse", "triangle", "sinusoid"])
  for (const initialView of [null, "circle", "wave", "both"])
    cases.push({ initialMode, initialView, initialCanvas: initialView === "both" ? { w: 1000, h: 520 } : null });
cases.push({ initialDeg: 150, initialUnit: "rad" });
cases.push({ initialDeg: -765, initialView: "both", initialCanvas: { w: 1000, h: 520 } });
cases.push({ initialDeg: 90, initialMode: "inverse", initialView: "wave" });
cases.push({ initialTouch: true, initialEdit: "theta" });
cases.push({ initialTouch: false, initialEdit: "theta" });
cases.push({ initialMode: "triangle", initialTouch: true, initialEdit: "hyp" });
cases.push({ initialMode: "sinusoid", initialEdit: "C", initialUnit: "rad" });

let total = 0;
for (const props of cases) {
  const warnings = [];
  console.error = (...a) => warnings.push(a.map(String).join(" ").slice(0, 300));
  let html;
  try { html = renderToString(React.createElement(Comp, props)); }
  catch (e) { console.error = origError; fail(`render threw for ${JSON.stringify(props)}:`, e.stack || e.message); }
  console.error = origError;
  if (warnings.length) fail(`React warned during render for ${JSON.stringify(props)}:`, warnings.join("\n"));
  if (typeof html !== "string" || html.length < 2000) fail(`suspiciously small render (${html && html.length}) for ${JSON.stringify(props)}`);
  for (const marker of ["Trig", "Buddy", "tg-svg", VERSION]) if (!html.includes(marker)) fail(`missing "${marker}" for ${JSON.stringify(props)}`);
  if (/NaN/.test(html)) fail(`render contains NaN for ${JSON.stringify(props)}: …${html.slice(Math.max(0, html.indexOf("NaN") - 120), html.indexOf("NaN") + 40)}…`);
  if (props.initialEdit && !/tg-(sheet|pop)/.test(html)) fail(`editor did not render for ${JSON.stringify(props)}`);
  total += html.length;
}
try { fs.unlinkSync(TMP); } catch {}
console.log(`[smoke] ok — ${cases.length} renders, ${(total / 1024).toFixed(0)} KB of HTML, no throws, no warnings, no NaN`);
