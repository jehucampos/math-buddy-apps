#!/usr/bin/env node
// Tests [SEC:CORE] helpers straight from the shipped JSX: strip imports and the
// component, bundle with esbuild, require the helpers. No separate logic file
// to keep in sync. Run: node core/test-core.js
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), TMP = path.join(ROOT, ".test-core");
fs.mkdirSync(TMP, { recursive: true });
const src = fs.readFileSync(path.join(ROOT, "TriangleCalculator.jsx"), "utf8")
  // imports -> require (module-level code such as useIsoLayoutEffect needs React)
  .replace(/^import (\w+), \{([^}]*)\} from "([^"]+)";?$/gm, 'const $1 = require("$3"); const {$2} = $1;')
  .replace(/^import \{([^}]*)\} from "([^"]+)";?$/gm, 'const {$1} = require("$2");')
  .replace(/^export default function TriangleCalculator[\s\S]*$/m, "");
const names = ["deriveLocks","fitView","parseCoord","parseToBase","keypadApply","nextTarget","EDIT_ORDER",
  "outwardNormal","externalBisector","zoomStep","autoGridStep","toFraction","sidesOf","anglesOf","solve","ToolNav","BUDDY_TOOLS"];
fs.writeFileSync(path.join(TMP, "w.jsx"), src + `\nmodule.exports = { ${names.join(", ")} };\n`);
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [path.join(TMP, "w.jsx"), "--bundle", "--format=cjs",
  "--platform=node", "--jsx=automatic", "--external:react", "--external:react/jsx-runtime", "--external:lucide-react",
  `--outfile=${path.join(TMP, "w.cjs")}`, "--log-level=error"]);
const L = require(path.join(TMP, "w.cjs"));
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; console.log(`FAIL ${n} ${d}`); } };
const close = (a, b, t = 1e-6) => Math.abs(a - b) <= t;
const lk = (edgeLen = {}, vertexAngle = {}, pinned = []) => ({ edgeLen, vertexAngle, pinned });
const cur = { a: 5, b: 4, c: 3 };
const st = (r) => ["a","b","c","A","B","C"].map((k) => r.state[k][0]).join("");

// ---- deriveLocks truth table ----
let r = L.deriveLocks(lk(), cur);
ok("none: known 0, all free", r.known === 0 && st(r) === "ffffff" && !r.determined);
r = L.deriveLocks(lk({ BC: 5 }), cur);
ok("a: known 1", r.known === 1 && st(r) === "ufffff");
r = L.deriveLocks(lk({ BC: 5, CA: 4 }), cur);
ok("a,b: known 2, undetermined", r.known === 2 && !r.determined && st(r) === "uuffff");
r = L.deriveLocks(lk({ BC: 5, CA: 4, AB: 3 }), cur);
ok("SSS valid: solved, angles auto", r.determined && !r.impossible && !r.over && st(r) === "uuuaaa");
r = L.deriveLocks(lk({ BC: 1, CA: 1, AB: 5 }), cur);
ok("SSS invalid: impossible", r.impossible);
r = L.deriveLocks(lk({ BC: 5, CA: 4 }, { C: 90 }), cur);
ok("SAS (a,b + included C): solved, unique", r.determined && !r.ambiguous && st(r) === "uuaaau");
r = L.deriveLocks(lk({ BC: 6, CA: 8 }, { A: 40 }), cur);
ok("SSA 6,8,40deg: ambiguous (2 triangles)", r.determined && r.ambiguous && !r.impossible);
r = L.deriveLocks(lk({ BC: 9, CA: 8 }, { A: 40 }), cur);
ok("SSA opposite side longer: unique", r.determined && !r.ambiguous && !r.impossible);
r = L.deriveLocks(lk({ BC: 4, CA: 8 }, { A: 40 }), cur);
ok("SSA too short: impossible", r.impossible);
r = L.deriveLocks(lk({ BC: 10, CA: 8 }, { A: 100 }), cur);
ok("SSA obtuse: unique", r.determined && !r.ambiguous && !r.impossible);
r = L.deriveLocks(lk({}, { A: 90, B: 53.13 }), cur);
ok("AA: shape only, C auto, sides free", r.scaleOnly && r.known === 2 && !r.determined && st(r) === "fffuua");
r = L.deriveLocks(lk({}, { A: 120, B: 70 }), cur);
ok("AA sum >= 180: impossible", r.impossible);
r = L.deriveLocks(lk({}, { A: 90, B: 60, C: 30 }), cur);
ok("AAA consistent: shape only, not over", r.scaleOnly && !r.over);
r = L.deriveLocks(lk({}, { A: 90, B: 60, C: 20 }), cur);
ok("AAA inconsistent: over", r.over);
r = L.deriveLocks(lk({ BC: 5 }, { A: 90, B: 53.13 }), cur);
ok("AAS (a + A,B): solved", r.determined && st(r) === "uaauua");
r = L.deriveLocks(lk({ BC: 5, CA: 4, AB: 3 }, { A: 90 }), cur);
ok("SSS + angle: over", r.over);
r = L.deriveLocks(lk({ BC: 5, CA: 4 }, { A: 90, B: 53 }), cur);
ok("SS + AA: over", r.over);
r = L.deriveLocks(lk({}, {}, ["A", "B"]), cur);
ok("pins A,B: c auto, known 1", r.known === 1 && st(r) === "ffafff");
r = L.deriveLocks(lk({}, {}, ["A", "B", "C"]), cur);
ok("pins A,B,C: solved, all auto", r.determined && st(r) === "aaaaaa");

// ---- fitView ----
{
  const P = { A: { x: 0, y: 0 }, B: { x: 0, y: -3 }, C: { x: 4, y: 0 } };
  const f = L.fitView(P, 331, 293, 70, 0.5, 1000, 28);
  ok("fitView ppi = min(191/4, 153/3)", close(f.ppi, 47.75), `ppi=${f.ppi}`);
  const ox = 28 + f.pan.x, oy = 28 + f.pan.y;
  ok("fitView centers bbox", close(ox + 2 * f.ppi, 331 / 2) && close(oy - 1.5 * f.ppi, 293 / 2));
}

// ---- parsing (keypad output forms) ----
const pb = (x) => L.parseToBase(x, "in");
ok("parse 5", close(pb("5"), 5));
ok("parse 5-3/8", close(pb("5-3/8"), 5.375), `got ${pb("5-3/8")}`);
ok("parse 5-3/8″", close(pb("5-3/8\u2033"), 5.375), `got ${pb("5-3/8\u2033")}`);
ok("parse 3/8", close(pb("3/8"), 0.375), `got ${pb("3/8")}`);
ok("parse 1′", close(pb("1\u2032"), 12), `got ${pb("1\u2032")}`);
ok("parse 1′ 7″ 3/4 (keypad spacing)", close(pb("1\u2032 7\u2033 3/4"), 19.75), `got ${pb("1\u2032 7\u2033 3/4")}`);
ok("parse 2.5", close(pb("2.5"), 2.5));
ok("parseCoord -3-1/2", close(L.parseCoord("-3-1/2", "in"), -3.5), `got ${L.parseCoord("-3-1/2", "in")}`);
ok("parseCoord 0", close(L.parseCoord("0", "in"), 0), `got ${L.parseCoord("0", "in")}`);
ok("parseCoord 4", close(L.parseCoord("4", "in"), 4));

// ---- keypad ----
const K = (keys) => keys.reduce((d, k) => L.keypadApply(d, k), "");
ok("keypad 1′7″3/4 builds parseable text", close(pb(K(["1", "\u2032", "7", "\u2033", "3", "/", "4"])), 19.75), JSON.stringify(K(["1","\u2032","7","\u2033","3","/","4"])));
ok("keypad one decimal per number", K(["5", ".", "2", "."]) === "5.2");
ok("keypad backspace", K(["5", "-", "3", "\u232B"]) === "5-");
ok("keypad backspace drops trailing space + mark", K(["1", "\u2032", "\u232B"]) === "1");

// ---- nextTarget ----
const all = () => true;
ok("next a -> b", L.nextTarget(L.EDIT_ORDER, "a", all) === "b");
ok("next C wraps -> a", L.nextTarget(L.EDIT_ORDER, "C", all) === "a");
ok("prev a wraps -> C", L.nextTarget(L.EDIT_ORDER, "a", all, -1) === "C");
ok("next skips ineligible", L.nextTarget(L.EDIT_ORDER, "a", (t) => t === "B") === "B");
ok("next none eligible -> null", L.nextTarget(L.EDIT_ORDER, "a", () => false) === null);

// ---- regression: existing helpers ----
{
  const A = { x: 0, y: 0 }, B = { x: 4, y: 0 }, C = { x: 0, y: 3 }, cen = { x: 4 / 3, y: 1 };
  const n = L.outwardNormal(A, B, cen);
  ok("outwardNormal AB = (0,-1)", close(n.x, 0) && close(n.y, -1));
  const e = L.externalBisector({ x: 100, y: 400 }, { x: 100, y: 100 }, { x: 500, y: 400 });
  ok("externalBisector down-left", e.x < 0 && e.y > 0);
  ok("zoomStep x√2", close(L.zoomStep(70, 1, 0.5, 1000, Math.SQRT2), 70 * Math.SQRT2));
  const g = L.autoGridStep(10, "imperial");
  ok("autoGridStep ppi10 = 1in/1ft", g.gridInches === 1 && g.majorInches === 12);
  const P = { A: { x: 0, y: 0 }, B: { x: 0, y: -3 }, C: { x: 4, y: 0 } };
  const sd = L.sidesOf(P.A, P.B, P.C);
  ok("sidesOf 3-4-5", close(sd.a, 5) && close(sd.b, 4) && close(sd.c, 3));
  const S = L.solve(P, { edgeLen: { BC: 6 }, vertexAngle: {}, pinned: [] }, null, 200);
  const s2 = L.sidesOf(S.A, S.B, S.C);
  ok("solve honors edge lock a=6", close(s2.a, 6, 1e-3), `a=${s2.a}`);
}

// ---- hub navigation: data + ToolNav in all three modes (none / one sibling / menu) ----
{
  const T = L.BUDDY_TOOLS, ids = T.map((t) => t.id);
  ok("BUDDY_TOOLS ids unique", new Set(ids).size === ids.length);
  ok("BUDDY_TOOLS = triangle, fractions, trig", ids.join() === "triangle,fractions,trig", ids.join());
  ok("BUDDY_TOOLS urls are https roots", T.every((t) => /^https:\/\/[a-z0-9.-]+\/$/.test(t.url)));
}
(async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><div id=r></div>", { pretendToBeVisual: true });
  global.window = dom.window; global.document = dom.window.document;
  const React = require("react"), { createRoot } = require("react-dom/client");
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const doc = dom.window.document, root = createRoot(doc.getElementById("r"));
  const mount = async (tools) => { root.render(React.createElement(L.ToolNav, { tools, currentId: "triangle" })); await tick(); };
  const down = (el) => el.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));

  await mount([L.BUDDY_TOOLS[0]]);
  ok("ToolNav: no siblings renders nothing", doc.getElementById("r").innerHTML === "");
  await mount(L.BUDDY_TOOLS.slice(0, 2));
  const a = doc.querySelector("a.tc-nav-link");
  ok("ToolNav: one sibling = direct link", !!a && a.href === "https://fractions.trianglebuddy.com/" && !doc.querySelector(".tc-nav-btn"));
  await mount(L.BUDDY_TOOLS);
  const btn = doc.querySelector(".tc-nav-btn");
  ok("ToolNav: two+ siblings = closed menu button", !!btn && !doc.querySelector(".tc-nav-menu") && btn.getAttribute("aria-expanded") === "false");
  btn.click(); await tick();
  const items = [...doc.querySelectorAll(".tc-nav-item")];
  ok("ToolNav: menu lists all 3 tools", items.length === 3, `got ${items.length}`);
  ok("ToolNav: current tool marked, not a link", items[0].tagName === "SPAN" && items[0].getAttribute("aria-current") === "page");
  ok("ToolNav: siblings are links with right hrefs", items[1].href === "https://fractions.trianglebuddy.com/" && items[2].href === "https://trig.trianglebuddy.com/");
  down(items[1]); await tick();
  ok("ToolNav: press inside menu keeps it open", !!doc.querySelector(".tc-nav-menu"));
  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick();
  ok("ToolNav: Esc closes", !doc.querySelector(".tc-nav-menu"));
  doc.querySelector(".tc-nav-btn").click(); await tick();
  down(doc.body); await tick();
  ok("ToolNav: outside press closes", !doc.querySelector(".tc-nav-menu"));
  root.unmount();

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`CORE TESTS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR", e.stack); process.exit(2); });
