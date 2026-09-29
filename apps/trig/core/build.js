#!/usr/bin/env node
/*
  Buddy-family build pipeline (Trig Buddy config)
  ================================================
  Same shape as Triangle Buddy's core/build.js, made generic via APP below.

  Reads   ../<APP.src>            canonical single-file JSX (imports React only)
          ./template.html         HTML wrapper with a {{BUNDLE}} placeholder
  Writes  ../standalone_entry.jsx deploy-target JSX (React import inlined + mount tail)
          ../index.html           final deployable, bundle inlined
          ../<APP.alias>          byte-identical copy of index.html

  Gates (cumulative — any failure aborts and says why):
    0. BANNED_IDENTIFIERS        removed names must not reappear in code
    1. core/test-core.js         pure-logic asserts, straight from the JSX
    2. core/smoke-render.js      renderToString across modes × views × editors
    3. core/verify-built-html.js the shipped file: head/SEO/assets + boots in jsdom
    --full adds:
    4. core/interaction-test.js  user flows in jsdom (phone + desktop)
    5. core/browser-test.js      real Chromium: layout, drags, keypad, screenshots

  USAGE  node core/build.js [--entry-only] [--full]
*/
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const APP = {
  name: "Trig Buddy",
  src: "TrigCalculator.jsx",
  component: "TrigCalculator",
  alias: "trig-buddy.html",
};

const ROOT = path.resolve(__dirname, "..");
const SRC_JSX = path.join(ROOT, APP.src);
const TEMPLATE_HTML = path.join(__dirname, "template.html");
const OUT_ENTRY = path.join(ROOT, "standalone_entry.jsx");
const OUT_BUNDLE = path.join(ROOT, ".build-bundle.js");
const OUT_INDEX = path.join(ROOT, "index.html");
const OUT_ALIAS = path.join(ROOT, APP.alias);
const ESBUILD = path.join(ROOT, "node_modules", ".bin", "esbuild");
const entryOnly = process.argv.includes("--entry-only");
const full = process.argv.includes("--full");

const read = (p) => fs.readFileSync(p, "utf8");
const log = (...a) => console.log("[build]", ...a);
function die(code, ...msg) { console.error("[build]", ...msg); process.exit(code); }
function assertFile(p, label) { if (!fs.existsSync(p)) die(2, `missing ${label}: ${p}`); }
function gate(script, label, code) {
  log(`gate: ${label}…`);
  try { execFileSync("node", [path.join(__dirname, script)], { stdio: "inherit", cwd: ROOT }); }
  catch (e) { die(code, `${label.toUpperCase()} FAILED — build is NOT safe to deploy.`); }
}

// ---- 0 + 1. entry transform -------------------------------------------------
function buildEntry() {
  assertFile(SRC_JSX, "source JSX");
  const src = read(SRC_JSX);

  // Names deleted from the codebase; the build fails loudly if code still uses
  // them (comments are ignored). Add { name, reason } after removing a name.
  const BANNED_IDENTIFIERS = [];
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const hits = [];
  for (const b of BANNED_IDENTIFIERS) {
    noBlock.split("\n").forEach((line, i) => {
      if (new RegExp(`\\b${b.name}\\b`).test(line.replace(/\/\/.*$/, ""))) hits.push(`  line ${i + 1}: ${b.name} — ${b.reason}`);
    });
  }
  if (hits.length) die(8, "banned identifiers still referenced:\n" + hits.join("\n"));

  const reactImportRe = /^import\s+(?:React\s*,\s*)?{\s*([^}]+?)\s*}\s*from\s*"react"\s*;?\s*$/m;
  const m = src.match(reactImportRe);
  if (!m) die(3, "could not find the React import line; aborting.");
  const hooks = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (/from\s*"lucide-react"/.test(src)) die(4, "this app has no icon step; inline an SVG instead of importing lucide-react.");

  let out = src.replace(reactImportRe,
    `import React from "react";\nimport { createRoot } from "react-dom/client";\nconst { ${hooks.join(", ")} } = React;`);
  out += `\n\n// ----- standalone mount (added by core/build.js) -----\n` +
    `const _root = document.getElementById("root");\n` +
    `if (_root) { createRoot(_root).render(React.createElement(${APP.component})); }\n`;
  fs.writeFileSync(OUT_ENTRY, out);
  log(`wrote ${path.relative(ROOT, OUT_ENTRY)} (${out.length} bytes)`);
}

// ---- bundle + splice ----------------------------------------------------------
function bundle() {
  assertFile(ESBUILD, "esbuild binary");
  execFileSync(ESBUILD, [OUT_ENTRY, "--bundle", "--minify", "--format=iife", "--loader:.jsx=jsx", "--jsx=automatic",
    "--define:process.env.NODE_ENV=\"production\"", `--outfile=${OUT_BUNDLE}`, "--log-level=warning"], { stdio: "inherit", cwd: ROOT });
  log(`bundle size: ${(fs.statSync(OUT_BUNDLE).size / 1024).toFixed(1)} KB`);
}
function splice() {
  assertFile(TEMPLATE_HTML, "HTML template");
  const tpl = read(TEMPLATE_HTML);
  if (tpl.split("{{BUNDLE}}").length !== 2) die(7, "template must contain exactly one {{BUNDLE}} placeholder.");
  const b = read(OUT_BUNDLE);
  if (b.includes("</script")) die(7, "bundle contains a closing script tag sequence; it would break the page.");
  const html = tpl.split("{{BUNDLE}}").join(b);   // split/join: safe with "$" in the bundle
  fs.writeFileSync(OUT_INDEX, html);
  fs.writeFileSync(OUT_ALIAS, html);
  log(`wrote index.html (${(html.length / 1024).toFixed(1)} KB) + ${APP.alias}`);
  try { fs.unlinkSync(OUT_BUNDLE); } catch {}
}

gate("test-core.js", "core logic tests", 10);
buildEntry();
if (entryOnly) { log("done (--entry-only)"); process.exit(0); }
bundle();
splice();
gate("smoke-render.js", "smoke render", 9);
gate("verify-built-html.js", "built-HTML verification", 11);
if (full) {
  gate("interaction-test.js", "interaction tests", 12);
  gate("browser-test.js", "browser tests", 13);
}
log(full ? "build complete — all gates green." : "build complete (run with --full for interaction + browser gates).");
