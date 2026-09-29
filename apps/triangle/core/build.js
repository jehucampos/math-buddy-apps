#!/usr/bin/env node
/*
  Triangle Buddy build pipeline
  =============================

  Reads:
    ../TriangleCalculator.jsx     canonical artifact source (single .jsx file)
    ../icons_inline.json          { iconName: [["element", { attrs… }], …] }
    ./template.html               HTML wrapper with `{{BUNDLE}}` placeholder

  Produces (in ../):
    standalone_entry.jsx          deploy-target JSX (React/lucide imports inlined)
    index.html                    final deployable, bundle inlined
    triangle-buddy.html           byte-identical copy of index.html

  Two surgical transformations turn the artifact JSX into something esbuild
  can bundle against React + ReactDOM without a JSX-runtime import resolver
  for lucide-react:

    1. Replace `import { useState, … } from "react"`
         with `import React from "react";
               import { createRoot } from "react-dom/client";
               const { useState, … } = React;
               // …  + createRoot mount at the bottom`

    2. Replace `import { Lock, … } from "lucide-react"`
         with an inlined ICONS table from icons_inline.json + a `makeIcon`
         factory + individual `const Lock = makeIcon("Lock"), …` declarations.

  The component body, all comments, the [SEC:CORE] block, and CSS strings
  are copied verbatim. Logic in core/logic.js is unchanged by this script;
  it is shipped via the verbatim inlining in [SEC:CORE].

  USAGE
    node core/build.js              full build (default)
    node core/build.js --entry-only just regenerate standalone_entry.jsx
*/

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ---- paths --------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
const SRC_JSX = path.join(ROOT, "TriangleCalculator.jsx");
const ICONS_JSON = path.join(ROOT, "icons_inline.json");
const TEMPLATE_HTML = path.join(__dirname, "template.html");
const OUT_ENTRY = path.join(ROOT, "standalone_entry.jsx");
const OUT_BUNDLE = path.join(ROOT, ".build-bundle.js"); // intermediate
const OUT_INDEX = path.join(ROOT, "index.html");
const OUT_ALIAS = path.join(ROOT, "triangle-buddy.html");
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

// ---- 1. transform: TriangleCalculator.jsx -> standalone_entry.jsx -------
function buildEntry() {
  assertFile(SRC_JSX, "source JSX");
  assertFile(ICONS_JSON, "icons JSON");

  const src = read(SRC_JSX);
  const icons = JSON.parse(read(ICONS_JSON));

  // ---- (0) Removed-identifier guard --------------------------------------
  // Lists of names that should NOT appear anywhere in the source. Used to
  // catch stale references to deleted state/refs (e.g. when a state hook is
  // removed but a handler still calls its setter). Each entry is a name +
  // brief reason; the reason gets printed in the error so future-me knows
  // why it was banned.
  //
  // To add a new banned name: include it after deleting the declaration,
  // then run `node core/build.js` — the build will fail loudly listing
  // every remaining reference.
  const BANNED_IDENTIFIERS = [
    { name: "hoverPt",    reason: "removed in v1.14.0 with the rotate-cue redesign" },
    { name: "setHoverPt", reason: "removed in v1.14.0 (was setter for hoverPt)" },
    { name: "hoverPtRef", reason: "removed in v1.14.0 (was ref for hoverPt)" },
  ];
  const hits = [];
  // Strip block comments (/* ... */) globally first, then process line by
  // line stripping line comments. This way mentions inside the changelog
  // banner at the top of the file (a /* */ block) don't trigger false
  // positives, while code references are still caught.
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  for (const b of BANNED_IDENTIFIERS) {
    const lines = noBlockComments.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const codeOnly = lines[i].replace(/\/\/.*$/, "");
      const re = new RegExp(`\\b${b.name}\\b`);
      if (re.test(codeOnly)) {
        // For the error message, show the ORIGINAL line so the user sees
        // the actual code (not the comment-stripped version).
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
    console.error("[build] remove these references (or, if intentional, drop the name from BANNED_IDENTIFIERS).");
    process.exit(8);
  }

  // (1) Find the React import line. The source uses the combined form
  //     `import React, { useState, … } from "react";` (default + named).
  //     We accept either that or the bare named form `import { … } from "react"`.
  const reactImportRe = /^import\s+(?:React\s*,\s*)?{\s*([^}]+?)\s*}\s*from\s*"react"\s*;?\s*$/m;
  const reactMatch = src.match(reactImportRe);
  if (!reactMatch) {
    console.error("[build] could not find React import line; aborting.");
    process.exit(3);
  }
  const reactHooks = reactMatch[1].split(",").map(s => s.trim()).filter(Boolean);

  // (2) Find the lucide-react import line and extract the icon names.
  const lucideImportRe = /^import\s*{\s*([^}]+?)\s*}\s*from\s*"lucide-react"\s*;?\s*$/m;
  const lucideMatch = src.match(lucideImportRe);
  if (!lucideMatch) {
    console.error("[build] could not find lucide-react import line; aborting.");
    process.exit(4);
  }
  const usedIcons = lucideMatch[1].split(",").map(s => s.trim()).filter(Boolean);

  // (3) Verify every used icon has path data in icons_inline.json.
  const missing = usedIcons.filter(n => !icons[n]);
  if (missing.length) {
    console.error("[build] icons used by source but missing from icons_inline.json:", missing);
    console.error("        update icons_inline.json (path data must come from lucide-react@0.383.0)");
    process.exit(5);
  }

  // (4) Build the replacement blocks.
  const reactBlock =
    `import React from "react";\n` +
    `import { createRoot } from "react-dom/client";\n` +
    `const { ${reactHooks.join(", ")} } = React;`;

  // Inline ICONS table — keep it as a single line so line numbers in the rest
  // of the file barely shift (helps when reading stack traces against source).
  const iconsLiteral = JSON.stringify(
    Object.fromEntries(usedIcons.map(n => [n, icons[n]]))
  );
  const iconFactory =
    `const ICONS = ${iconsLiteral};\n` +
    `function makeIcon(name){ const nodes=ICONS[name]; return function Icon(props){\n` +
    `  const { size=24, color="currentColor", strokeWidth=2, style, ...rest } = props||{};\n` +
    `  return React.createElement("svg",{xmlns:"http://www.w3.org/2000/svg",width:size,height:size,viewBox:"0 0 24 24",\n` +
    `    fill:"none",stroke:color,strokeWidth,strokeLinecap:"round",strokeLinejoin:"round",style,...rest},\n` +
    `    nodes.map((n,i)=>React.createElement(n[0],Object.assign({key:i},n[1])))); }; }`;
  const iconDecls = `const ${usedIcons.map(n => `${n}=makeIcon("${n}")`).join(", ")};`;
  const lucideBlock = `${iconFactory}\n${iconDecls}`;

  // (5) Apply the two substitutions.
  let out = src.replace(reactImportRe, reactBlock);
  out = out.replace(lucideImportRe, lucideBlock);

  // (6) Append the root-mount tail. The artifact exports `TriangleCalculator`
  //     as default; standalone needs to render it into <div id="root">.
  const mountTail =
    `\n\n// ----- standalone mount (added by core/build.js) -----\n` +
    `const _root = document.getElementById("root");\n` +
    `if (_root) { createRoot(_root).render(React.createElement(TriangleCalculator)); }\n`;

  out = out + mountTail;

  // (7) Sanity check: the lucide-react import should be fully gone.
  // (React import is expected to still appear — it's been replaced with
  // a default import line at the top.)
  if (out.includes('from "lucide-react"')) {
    console.error("[build] post-transform output still references lucide-react; aborting.");
    process.exit(6);
  }

  write(OUT_ENTRY, out);
  log(`wrote ${path.relative(ROOT, OUT_ENTRY)} (${out.length} bytes, ${usedIcons.length} icons inlined)`);
  return { reactHooks, usedIcons };
}

// ---- 2. bundle: esbuild produces a single minified IIFE -----------------
function bundle() {
  assertFile(ESBUILD, "esbuild binary");
  log("bundling with esbuild…");
  // --format=iife matches the existing index.html (immediately-invoked
  // function expression wrapping the whole bundle).
  // --jsx=automatic uses React's automatic JSX runtime.
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
  const bundle = read(OUT_BUNDLE);
  // The placeholder sits inside <script>…</script> already, so we just
  // inject the bundle text. We do NOT use String#replace because the bundle
  // can contain "$" sequences (regex backref syntax). split/join is safe.
  const html = tpl.split("{{BUNDLE}}").join(bundle);
  write(OUT_INDEX, html);
  write(OUT_ALIAS, html);
  log(`wrote ${path.relative(ROOT, OUT_INDEX)} (${html.length} bytes)`);
  log(`wrote ${path.relative(ROOT, OUT_ALIAS)} (alias)`);
  // Clean intermediate.
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

// Smoke-render gate: actually render the component in Node with
// react-dom/server. Catches runtime ReferenceErrors thrown during the
// initial render (e.g. dangling consts in JSX attributes) that the JSX
// parser and esbuild bundler accept as syntactically valid. Complements
// the BANNED_IDENTIFIERS guard which catches stale handler references.
log("smoke-rendering…");
try {
  execFileSync("node", [path.join(__dirname, "smoke-render.js")], { stdio: "inherit", cwd: ROOT });
} catch (e) {
  console.error("[build] SMOKE TEST FAILED — built bundle errors at render time.");
  console.error("[build] index.html was written but is NOT safe to deploy.");
  process.exit(9);
}

// Behavior gates (v1.16.0). Pure helpers straight from the JSX, then a jsdom
// run of the BUILT index.html through the on-canvas edit + solve flow — the
// paths renderToString never reaches (editor closed at initial render).
function runGate(file, label, code) {
  log(`${label}…`);
  try {
    const out = execFileSync("node", [path.join(__dirname, file)], { cwd: ROOT, encoding: "utf8" });
    log(out.trim().split("\n").pop());
  } catch (e) {
    console.error((e.stdout || "") + (e.stderr || ""));
    if (/Cannot find module 'jsdom'/.test(String(e.stderr) + String(e.stdout)))
      console.error("[build] jsdom missing: run  npm install --save-dev jsdom@24");
    console.error(`[build] ${label.toUpperCase()} FAILED — index.html was written but is NOT safe to deploy.`);
    process.exit(code);
  }
}
runGate("test-core.js", "core tests", 10);
runGate("interaction-test.js", "interaction tests", 11);

log("build complete.");
