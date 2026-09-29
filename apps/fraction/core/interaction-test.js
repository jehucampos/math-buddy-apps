/* FRACTION BUDDY — core/interaction-test.js
   Renders the bundled component with react-dom/client into a jsdom DOM
   (the real client path the browser uses), then drives it like a user:
   reads live DOM attributes, types into fields, toggles +/-, adds and
   removes terms, and resets — asserting the visible result each time.
   This is the "will it work for a tester" gate.
   Run: node core/interaction-test.js   */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const SRC_JSX = path.join(ROOT, "FractionCalculator.jsx");
const ESBUILD = path.join(ROOT, "node_modules", ".bin", "esbuild");
const TMP = path.join(ROOT, ".iact-bundle.cjs");

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL:", name); } }

// Bundle for Node (externalise react so the host copies are used).
execFileSync(ESBUILD, [
  SRC_JSX, "--bundle", "--format=cjs", "--platform=node",
  "--loader:.jsx=jsx", "--jsx=automatic",
  "--external:react", "--external:react-dom", "--external:react/jsx-runtime",
  `--outfile=${TMP}`, "--log-level=error",
], { stdio: "inherit", cwd: ROOT });

// jsdom environment.
global.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
window.matchMedia = window.matchMedia || function (q) {
  return { matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } };
};

const React = require("react");
const { createRoot } = require("react-dom/client");
const act = require("react").act || require("react-dom/test-utils").act;
const Component = require(TMP).default;

const root = createRoot(document.getElementById("root"));
act(() => { root.render(React.createElement(Component)); });

const $ = (sel) => Array.from(document.querySelectorAll(sel));
const resultText = () => {
  const el = document.querySelector(".fb-result-main");
  // The fractional part is rendered as a STACKED fraction (separate
  // numerator/denominator spans), so textContent no longer contains "/".
  // The aria-label carries the canonical readable form (e.g. "3 1/4"),
  // computed from the rational — assert against that.
  return el ? (el.getAttribute("aria-label") || "").replace(/\u2009/g, " ") : "(none)"; // thin space -> normal for asserts
};
const warnText = () => {
  const el = document.querySelector(".fb-warn");
  return el ? el.textContent : null;
};
const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
function type(input, val) {
  act(() => {
    nativeSet.call(input, val);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
function click(el) {
  act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
}
const valueInputs = () => $("input.fb-in");

// ---- 1. mobile keypad: REAL DOM attributes on every value field ----
(() => {
  const ins = valueInputs();
  ok("six value fields on default (2 terms x 3)", ins.length === 6);
  const allNumeric = ins.every((i) => i.getAttribute("inputmode") === "numeric");
  const allPattern = ins.every((i) => i.getAttribute("pattern") === "[0-9]*");
  const allText = ins.every((i) => i.getAttribute("type") === "text");
  ok("every field has inputmode=numeric (numeric keypad on mobile)", allNumeric);
  ok("every field has pattern=[0-9]* ", allPattern);
  ok("every field is type=text (avoids number-spinner quirks)", allText);
})();

// ---- 2. default state shows 3/4 ----
ok("default 1/2 + 1/4 = 3/4", resultText() === "3/4");

// ---- 2b. the fractional part renders STACKED, not inline (the v1.1.0 fix) ----
(() => {
  const main = document.querySelector(".fb-result-main");
  ok("default result renders a stacked fraction (.fb-sfrac present)", !!main.querySelector(".fb-sfrac"));
  const n = main.querySelector(".fb-sfrac-n");
  const d = main.querySelector(".fb-sfrac-d");
  ok("stacked numerator = 3", n && n.textContent === "3");
  ok("stacked denominator = 4", d && d.textContent === "4");
  ok("stacked fraction has a bar element", !!main.querySelector(".fb-sfrac-bar"));
  ok("pure fraction has no whole-number span", !main.querySelector(".fb-swhole"));
  ok("result-main aria-label is the readable form '3/4'", main.getAttribute("aria-label") === "3/4");
})();

// ---- 3. typing updates the exact result: 1/3 + 1/3 = 2/3 ----
(() => {
  const ins = valueInputs(); // [t1 w,n,d, t2 w,n,d]
  type(ins[2], "3"); // t1 den 2 -> 3  => 1/3
  type(ins[5], "3"); // t2 den 4 -> 3  => 1/3
  ok("1/3 + 1/3 = 2/3 (exact, not 0.667)", resultText() === "2/3");
})();

// ---- 4. operator picker: one tap picks −, and back to + ----
const pick = (rowIdx, label) => {       // rowIdx = 1-based picker index (between rows)
  const grp = $(".fb-ops")[rowIdx - 1];
  const btn = Array.from(grp.querySelectorAll(".fb-opbtn")).find((x) => x.getAttribute("aria-label") === label);
  click(btn);
  return btn;
};
(() => {
  const minus = pick(1, "subtract");
  ok("picker: subtract is checked after one tap", minus.getAttribute("aria-checked") === "true");
  ok("1/3 - 1/3 = 0", resultText() === "0");
  ok("row badge shows minus", document.querySelectorAll(".fb-opbadge")[0].textContent === "\u2212");
  pick(1, "add");
  ok("back to + : 2/3", resultText() === "2/3");
})();

// ---- 5. mixed-number input and readouts: 2 3/4 + 1 1/4 = 4 ----
(() => {
  click($(".fb-reset")[0]);                 // back to default 1/2 + 1/4
  const ins = valueInputs();
  type(ins[0], "2"); type(ins[1], "3"); type(ins[2], "4"); // t1 = 2 3/4
  type(ins[3], "1"); type(ins[4], "1"); type(ins[5], "4"); // t2 = 1 1/4
  ok("2 3/4 + 1 1/4 = 4", resultText() === "4");
  ok("whole-number result shows no stacked fraction", !document.querySelector(".fb-result-main .fb-sfrac"));
})();

// ---- 5b. a genuine mixed number: whole part is visually separated ----
(() => {
  click($(".fb-reset")[0]);                 // back to default 1/2 + 1/4
  const ins = valueInputs();
  type(ins[0], "2"); type(ins[1], "3"); type(ins[2], "4"); // t1 = 2 3/4
  type(ins[3], "0"); type(ins[4], "3"); type(ins[5], "4"); // t2 = 3/4
  ok("2 3/4 + 3/4 = 3 1/2", resultText() === "3 1/2");
  const main = document.querySelector(".fb-result-main");
  ok("mixed result has a separated whole-number span", !!main.querySelector(".fb-swhole"));
  ok("mixed result whole part = 3", main.querySelector(".fb-swhole").textContent === "3");
  ok("mixed result also has a stacked fraction", !!main.querySelector(".fb-sfrac"));
  // Restore the section-5 state (2 3/4 + 1 1/4 = 4) so the add/remove
  // sections below chain from a 2-term sum of 4 as they expect.
  type(ins[3], "1"); type(ins[4], "1"); type(ins[5], "4");
  ok("restored 2 3/4 + 1 1/4 = 4", resultText() === "4");
})();

// ---- 6. add a term, then it participates: + 1/2 -> 4 1/2 ----
(() => {
  click($(".fb-add")[0]);
  ok("now 3 terms (9 value fields)", valueInputs().length === 9);
  const ins = valueInputs();
  type(ins[7], "1"); type(ins[8], "2"); // new term = 1/2
  ok("4 + 1/2 = 4 1/2", resultText() === "4 1/2");
})();

// ---- 7. remove the added term -> back to 4; remove disabled at 2 ----
(() => {
  const dels = $(".fb-del");
  ok("delete enabled with 3 terms", dels.every((d) => !d.disabled));
  click(dels[2]); // remove third term
  ok("back to 2 terms", valueInputs().length === 6);
  ok("result 4 again", resultText() === "4");
  ok("delete disabled at the 2-term minimum", $(".fb-del").every((d) => d.disabled));
})();

// ---- 8. invalid input is flagged, never silently wrong ----
(() => {
  click($(".fb-reset")[0]);
  const ins = valueInputs();
  // numerator with no denominator -> term error + warning, no result shown
  type(ins[1], "3"); type(ins[2], "");
  ok("numerator without denominator -> warning shown", !!warnText());
  ok("no result-main rendered while invalid", document.querySelector(".fb-result-main") === null);
  ok("offending term row marked bad", $(".fb-term.is-bad").length >= 1);
  // fix it
  type(ins[2], "8");
  ok("fixed: 3/8 + 1/4 = 5/8", resultText() === "5/8");
})();

// ---- 9. input sanitiser strips non-digits (QWERTY safety on desktop) ----
(() => {
  click($(".fb-reset")[0]);
  const ins = valueInputs();
  type(ins[0], "1a2.3/"); // junk
  ok("non-digits stripped from field value", ins[0].value === "123");
})();

// ---- 10. multiply and divide through the UI ----
(() => {
  click($(".fb-reset")[0]);                       // 1/2 , 1/4
  pick(1, "multiply by");
  ok("1/2 x 1/4 = 1/8", resultText() === "1/8");
  pick(1, "divide by");
  ok("1/2 ÷ 1/4 = 2", resultText() === "2");
  const ins = valueInputs();
  type(ins[0], "2"); type(ins[1], "1"); type(ins[2], "2");   // 2 1/2
  type(ins[3], "");  type(ins[4], "3"); type(ins[5], "4");   // ÷ 3/4
  ok("2 1/2 ÷ 3/4 = 3 1/3 (exact)", resultText() === "3 1/3");
})();

// ---- 11. order of operations + note ----
(() => {
  click($(".fb-reset")[0]);                       // 1/2 + 1/4
  click($(".fb-add")[0]);
  const ins = valueInputs();
  type(ins[3], ""); type(ins[4], "1"); type(ins[5], "3");     // row 2 = 1/3
  type(ins[7], "3"); type(ins[8], "4");                       // row 3 = 3/4
  pick(2, "multiply by");                                      // 1/2 + 1/3 x 3/4
  ok("1/2 + 1/3 x 3/4 = 3/4 (x before +)", resultText() === "3/4");
  ok("precedence note shown when x and + are mixed", !!document.querySelector(".fb-note"));
  pick(1, "multiply by");                                      // 1/2 x 1/3 x 3/4
  ok("all x : 1/8", resultText() === "1/8");
  ok("no precedence note when only x", !document.querySelector(".fb-note"));
})();

// ---- 12. divide by zero is flagged on its row, not shown as a number ----
(() => {
  click($(".fb-reset")[0]);
  pick(1, "divide by");
  const ins = valueInputs();
  type(ins[3], "0"); type(ins[4], ""); type(ins[5], "");      // ÷ 0
  ok("÷ 0 -> warning", /divide by zero/i.test(warnText() || ""));
  ok("÷ 0 -> no result shown", document.querySelector(".fb-result-main") === null);
  ok("÷ 0 -> row 2 highlighted", $(".fb-term")[1].classList.contains("is-bad"));
  ok("÷ 0 -> row message", /divide by 0/.test($(".fb-term")[1].textContent));
  type(ins[3], "2");
  ok("fixed: 1/2 ÷ 2 = 1/4", resultText() === "1/4");
})();

// ---- 13. a just-added blank row never breaks the answer ----
(() => {
  click($(".fb-reset")[0]);                       // 3/4
  click($(".fb-add")[0]);
  pick(2, "divide by");
  ok("blank ÷ row: still 3/4, no warning", resultText() === "3/4" && !warnText());
  ok("blank row not highlighted", !$(".fb-term")[2].classList.contains("is-bad"));
})();

// ---- 14. first-row sign toggle ----
(() => {
  click($(".fb-reset")[0]);
  click($(".fb-op")[0]);
  ok("-1/2 + 1/4 = -1/4", resultText() === "-1/4");
  ok("result shows typographic minus", document.querySelector(".fb-result-main").textContent.startsWith("\u2212"));
})();

// ---- 15. mobile speed: select-on-focus, Enter/Next advances, focus on add ----
(async () => {
  click($(".fb-reset")[0]);
  const ins = valueInputs();
  act(() => { ins[1].focus(); });
  await new Promise((r) => setTimeout(r, 10));
  ok("focus selects the whole value (typing replaces it)", ins[1].selectionStart === 0 && ins[1].selectionEnd === ins[1].value.length && ins[1].value.length > 0);
  act(() => { ins[1].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  ok("Enter on numerator -> denominator focused", document.activeElement === ins[2]);
  act(() => { ins[2].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  ok("Enter on row-1 denominator -> row-2 whole focused", document.activeElement === ins[3]);
  act(() => { ins[5].focus(); });
  act(() => { ins[5].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  ok("Enter on the last box closes the keypad (blur)", document.activeElement !== ins[5] && !valueInputs().includes(document.activeElement));
  ok("enterkeyhint: next on inner boxes, done on the last", ins[0].getAttribute("enterkeyhint") === "next" && ins[5].getAttribute("enterkeyhint") === "done");
  click($(".fb-add")[0]);
  const after = valueInputs();
  ok("Add term focuses the new row's first box", document.activeElement === after[6]);
  ok("after adding, previous last box becomes 'next'", after[5].getAttribute("enterkeyhint") === "next");

  try { fs.unlinkSync(TMP); } catch {}
  console.log(`\n[interaction-test] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
