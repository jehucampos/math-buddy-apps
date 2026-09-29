#!/usr/bin/env node
/*
  Fraction Buddy build pipeline
  =============================

  Reads:
    ../FractionCalculator.jsx     canonical artifact source (single .jsx file)
    ./template.html               HTML wrapper with `{{BUNDLE}}` placeholder

  Produces (in ../):
    standalone_entry.jsx          deploy-target JSX (React import inlined + mount)
    fraction-buddy.html           final deployable, bundle inlined
    index.html                    byte-identical copy (hosting default)

  One surgical transformation turns the artifact JSX into something esbuild can
  bundle against React + ReactDOM without a JSX-runtime import resolver:

    Replace `import React, { useState, … } from "react"`
      with  `import React from "react";
             import { createRoot } from "react-dom/client";
             const { useState, … } = React;`
      and append a createRoot mount tail at the bottom.

  Fraction Buddy uses NO lucide icons (operators are plain monospace glyphs),
  so unlike the Triangle Buddy pipeline there is no icon-inlining step. The
  component body, all comments, the [SEC:CORE] block, and CSS strings are
  copied verbatim. Logic in core/logic.js is unchanged by this script; it is
  shipped via the verbatim inlining in [SEC:CORE] and that identity is proven
  separately by core/sync-check.js.

  USAGE
    node core/build.js              full build (default)
    node core/build.js --entry-only just regenerate standalone_entry.jsx
*/

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ---- paths --------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
const SRC_JSX = path.join(ROOT, "FractionCalculator.jsx");
const TEMPLATE_HTML = path.join(__dirname, "template.html");
const OUT_ENTRY = path.join(ROOT, "standalone_entry.jsx");
const OUT_BUNDLE = path.join(ROOT, ".build-bundle.js"); // intermediate
const OUT_PRIMARY = path.join(ROOT, "fraction-buddy.html");
const OUT_ALIAS = path.join(ROOT, "index.html");
const ESBUILD = path.join(ROOT, "node_modules", ".bin", "esbuild");

// ---- args ---------------------------------------------------------------
const entryOnly = process.argv.includes("--entry-only");

// ---- helpers ------------------------------------------------------------
function read(p) { return fs.readFileSync(p, "utf8"); }
function write(p, s) { fs.writeFileSync(p, s); }
function log(...a) { console.log("[build]", ...a); }

function assertFile(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`[build] missing ${label}: ${p}`);
    process.exit(2);
  }
}

// ---- 1. transform: FractionCalculator.jsx -> standalone_entry.jsx -------
function buildEntry() {
  assertFile(SRC_JSX, "source JSX");

  const src = read(SRC_JSX);

  // ---- (0) Removed-identifier guard --------------------------------------
  // Names that must NOT appear anywhere in code (comments excepted). Catches
  // stale references to deleted state/refs/handlers. Empty at v1.0.0; add a
  // { name, reason } entry whenever a declaration is deleted and you want the
  // build to fail loudly if any reference survives.
  const BANNED_IDENTIFIERS = [
    { name: "sumTerms", reason: "replaced by evaluateTerms in v1.2.0 (x / ÷ support)" },
    { name: "toggleOp", reason: "split into toggleSign (row 1) + setOp (picker) in v1.2.0" },
  ];
  const hits = [];
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  for (const b of BANNED_IDENTIFIERS) {
    const lines = noBlockComments.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const codeOnly = lines[i].replace(/\/\/.*$/, "");
      const re = new RegExp(`\\b${b.name}\\b`);
      if (re.test(codeOnly)) {
        const origLine = src.split("\n")[i] || "";
        hits.push({ name: b.name, reason: b.reason, line: i + 1, text: origLine.trim() });
      }
    }
  }
  if (hits.length) {
    console.error("[build] banned identifiers still referenced in source:");
    for (const h of hits) {
      console.error(`  line ${h.line}: ${h.name} — ${h.reason}`);
      console.error(`    ${h.text}`);
    }
    process.exit(8);
  }

  // (1) Find the React import line. Source uses the combined form
  //     `import React, { useState, … } from "react";`. Accept either that or
  //     the bare named form `import { … } from "react"`.
  const reactImportRe = /^import\s+(?:React\s*,\s*)?{\s*([^}]+?)\s*}\s*from\s*"react"\s*;?\s*$/m;
  const reactMatch = src.match(reactImportRe);
  if (!reactMatch) {
    console.error("[build] could not find React import line; aborting.");
    process.exit(3);
  }
  const reactHooks = reactMatch[1].split(",").map(s => s.trim()).filter(Boolean);

  // (2) Guard: Fraction Buddy must not pull in lucide-react.
  if (/from\s*"lucide-react"/.test(src)) {
    console.error("[build] source references lucide-react; Fraction Buddy ships no icons. Aborting.");
    process.exit(4);
  }

  // (3) Build the replacement block.
  const reactBlock =
    `import React from "react";\n` +
    `import { createRoot } from "react-dom/client";\n` +
    `const { ${reactHooks.join(", ")} } = React;`;

  // (4) Apply the substitution.
  let out = src.replace(reactImportRe, reactBlock);

  // (5) Append the root-mount tail. The artifact exports `FractionCalculator`
  //     as default; standalone needs to render it into <div id="root">.
  const mountTail =
    `\n\n// ----- standalone mount (added by core/build.js) -----\n` +
    `const _root = document.getElementById("root");\n` +
    `if (_root) { createRoot(_root).render(React.createElement(FractionCalculator)); }\n`;
  out = out + mountTail;

  write(OUT_ENTRY, out);
  log(`wrote ${path.relative(ROOT, OUT_ENTRY)} (${out.length} bytes, 0 icons — none used)`);
  return { reactHooks };
}

// ---- 2. bundle: esbuild produces a single minified IIFE -----------------
function bundle() {
  assertFile(ESBUILD, "esbuild binary");
  log("bundling with esbuild…");
  execFileSync(ESBUILD, [
    OUT_ENTRY,
    "--bundle",
    "--minify",
    "--format=iife",
    "--loader:.jsx=jsx",
    "--jsx=automatic",
    `--outfile=${OUT_BUNDLE}`,
  ], { stdio: "inherit", cwd: ROOT });
  const size = fs.statSync(OUT_BUNDLE).size;
  log(`bundle size: ${(size / 1024).toFixed(1)} KB`);
}

// ---- 3. splice: bundle into HTML template -------------------------------
function splice() {
  assertFile(TEMPLATE_HTML, "HTML template");
  const tpl = read(TEMPLATE_HTML);
  if (!tpl.includes("{{BUNDLE}}")) {
    console.error("[build] template missing {{BUNDLE}} placeholder; aborting.");
    process.exit(7);
  }
  const b = read(OUT_BUNDLE);
  // split/join (not String#replace) — bundle text can contain "$" sequences
  // that replace() would interpret as backreferences.
  const html = tpl.split("{{BUNDLE}}").join(b);
  write(OUT_PRIMARY, html);
  write(OUT_ALIAS, html);
  log(`wrote ${path.relative(ROOT, OUT_PRIMARY)} (${html.length} bytes)`);
  log(`wrote ${path.relative(ROOT, OUT_ALIAS)} (alias)`);
  try { fs.unlinkSync(OUT_BUNDLE); } catch {}
}

// ---- main ---------------------------------------------------------------
buildEntry();
if (entryOnly) {
  log("done (--entry-only)");
  process.exit(0);
}
bundle();
splice();

// Smoke-render gate: render the component in Node via react-dom/server.
// Catches runtime ReferenceErrors at initial render that the JSX parser and
// esbuild bundler accept as syntactically valid.
log("smoke-rendering…");
try {
  execFileSync("node", [path.join(__dirname, "smoke-render.js")], { stdio: "inherit", cwd: ROOT });
} catch (e) {
  console.error("[build] SMOKE TEST FAILED — built bundle errors at render time.");
  console.error("[build] output HTML was written but is NOT safe to deploy.");
  process.exit(9);
}

log("build complete.");
