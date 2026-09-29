#!/usr/bin/env node
/*
  Smoke render: bundle TriangleCalculator.jsx as a Node-importable CJS
  module, then actually render it with react-dom/server. Catches:

    - ReferenceErrors during render (undeclared identifiers in JSX
      attributes, dangling consts, etc.)
    - Hook usage errors (state hooks called outside a component, etc.)
    - Throw-in-render bugs of any kind that parse-clean tools miss.

  This is the gate that would have caught the v1.14.2 -> v1.14.3 regression:
  esbuild parsed orphan code as valid JSX text, but actually rendering it
  immediately throws `ReferenceError: c0 is not defined`.

  Run automatically as part of `node core/build.js`. Can be run standalone
  too: `node core/smoke-render.js`.

  Limitations:
    - Renders only the DEFAULT state (3-4-5 right triangle, all defaults).
      A bug that only surfaces after some interaction won't be caught.
      Still: most JSX-attribute reference errors happen on the first render.
    - Does NOT exercise event handlers — those are wired up by React but
      not invoked during renderToString.
*/

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const SRC_JSX = path.join(ROOT, "TriangleCalculator.jsx");
const ESBUILD = path.join(ROOT, "node_modules", ".bin", "esbuild");
const TMP_BUNDLE = path.join(ROOT, ".smoke-bundle.cjs");

function fail(msg, detail) {
  console.error("[smoke] " + msg);
  if (detail) console.error(detail);
  try { fs.unlinkSync(TMP_BUNDLE); } catch {}
  process.exit(1);
}

if (!fs.existsSync(SRC_JSX)) fail("source not found: " + SRC_JSX);
if (!fs.existsSync(ESBUILD)) fail("esbuild not found in node_modules");

// 1. Bundle as CJS for Node. lucide-react and react/react-dom resolved
//    against node_modules (esbuild walks up). External nothing.
try {
  execFileSync(ESBUILD, [
    SRC_JSX,
    "--bundle",
    "--format=cjs",
    "--platform=node",
    "--loader:.jsx=jsx",
    "--jsx=automatic",
    "--external:react",
    "--external:react-dom",
    "--external:react/jsx-runtime",
    `--outfile=${TMP_BUNDLE}`,
    "--log-level=error",
  ], { stdio: "inherit", cwd: ROOT });
} catch (e) {
  fail("esbuild bundling failed (this is a separate build for smoke test)");
}

// 2. Load + render. Wrap in try/catch so a throw is reported cleanly
//    rather than just dumping a stack trace into the build log.
let mod, React, renderToString;
try {
  // Clear any cached require for the bundle (in case build runs twice in one process)
  delete require.cache[TMP_BUNDLE];
  React = require("react");
  renderToString = require("react-dom/server").renderToString;
  mod = require(TMP_BUNDLE);
} catch (e) {
  fail("loading bundle threw — likely a module-level error:", e.stack || e.message);
}

const Component = mod && (mod.default || mod.TriangleCalculator);
if (typeof Component !== "function") {
  fail("no default export found in bundle (expected the TriangleCalculator component)");
}

try {
  const html = renderToString(React.createElement(Component));
  // Sanity: a real render should produce SOME output. Empty string means
  // the component returned null or something weird happened.
  if (typeof html !== "string" || html.length < 100) {
    fail(`render produced suspiciously little output (${html?.length ?? 0} chars)`);
  }
  // Look for key markers that should appear in default-state HTML.
  if (!html.includes("Triangle")) fail("render output missing 'Triangle' marker text");
  // Clean up + report
  try { fs.unlinkSync(TMP_BUNDLE); } catch {}
  console.log(`[smoke] ok — rendered ${html.length} chars of HTML`);
} catch (e) {
  fail("render threw an error:", e.stack || e.message);
}
