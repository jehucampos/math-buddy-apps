#!/usr/bin/env node
/*
  buddy.js — one entry point for every app in this repo.

  USAGE   node scripts/buddy.js <app> [--full] [--deploy]
    <app>     folder name under apps/ (triangle, trig, …)
    --full    also run real-browser gates (Trig: forwarded to its build; Fraction: layout-check.py)
    --deploy  also preflight wrangler.jsonc (used by the Cloudflare build command)

  Steps
    1. sync   copy shared files from packages/ into the app folder
    2. build  run the app's own core/build.js, then any extra gates listed in APPS
              (Triangle and Trig run their gates inside build.js; Fraction runs them separately)
    3. stage  copy the deploy set into apps/<app>/dist (the Worker's assets dir)
    4. check  (--deploy) refuse to deploy while wrangler.jsonc still has a placeholder name
*/
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const SHARED = [["packages/widget/widget.js", "widget.js"]];          // [repo path, app-relative dest]
const DEPLOY_SET = ["index.html", "widget.js", "og-image.png", "robots.txt", "sitemap.xml"];
const PLACEHOLDER = "set-me";
// Gates an app runs OUTSIDE its build.js. [command, script]; `full` = only with --full.
// A layout gate exiting 2 means "skipped, no browser" and counts as a failure here.
const APPS = {
  fraction: {
    gates: [["node", "test.js"], ["node", "sync-check.js"], ["node", "interaction-test.js"], ["node", "verify-built-html.js"]],
    full: [["python3", "layout-check.py"]],
  },
};

const die = (code, msg) => { console.error(`[buddy] ${msg}`); process.exit(code); };
const log = (...a) => console.log("[buddy]", ...a);

const [app, ...flags] = process.argv.slice(2);
if (!app) die(2, "usage: node scripts/buddy.js <app> [--full] [--deploy]");
const APP = path.join(REPO, "apps", app);
if (!fs.existsSync(path.join(APP, "core", "build.js"))) die(2, `no apps/${app}/core/build.js`);
if (!fs.existsSync(path.join(APP, "node_modules"))) die(2, `run  npm ci  in apps/${app} first`);

// 1. sync
for (const [src, dest] of SHARED) {
  fs.copyFileSync(path.join(REPO, src), path.join(APP, dest));
  log(`synced ${src} -> apps/${app}/${dest}`);
}

// 2. build (+ the app's gates). execFileSync throws on non-zero exit.
const buildArgs = flags.filter((f) => f === "--full");
try { execFileSync("node", [path.join(APP, "core", "build.js"), ...buildArgs], { stdio: "inherit", cwd: APP }); }
catch (e) { die(e.status || 1, `apps/${app} build FAILED (exit ${e.status}) — nothing staged.`); }
const cfg = APPS[app] || {};
for (const [cmd, script] of [...(cfg.gates || []), ...(flags.includes("--full") ? cfg.full || [] : [])]) {
  log(`gate ${script}…`);
  try { execFileSync(cmd, [path.join(APP, "core", script)], { stdio: "inherit", cwd: APP }); }
  catch (e) { die(e.status || 1, `apps/${app} gate ${script} FAILED (exit ${e.status}) — nothing staged.`); }
}

// 3. stage
const DIST = path.join(APP, "dist");
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);
for (const f of DEPLOY_SET) {
  const p = path.join(APP, f);
  if (!fs.existsSync(p)) die(3, `deploy file missing: apps/${app}/${f}`);
  fs.copyFileSync(p, path.join(DIST, f));
}
log(`staged ${DEPLOY_SET.length} files -> apps/${app}/dist`);

// 4. check
if (flags.includes("--deploy")) {
  const raw = fs.readFileSync(path.join(APP, "wrangler.jsonc"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const w = JSON.parse(raw);
  if (!w.name || w.name === PLACEHOLDER) die(4, `apps/${app}/wrangler.jsonc: set "name" to the existing Worker's name before deploying.`);
  if (!w.assets || path.resolve(APP, w.assets.directory) !== DIST) die(4, `apps/${app}/wrangler.jsonc: assets.directory must be ./dist`);
  log(`wrangler preflight ok (worker "${w.name}")`);
}
log("done.");
