# Component Catalog — Buddy App Family

A quick-reference index of the reusable pieces shared between Triangle Buddy and
Fraction Buddy. The goal is that a new "·Buddy" tool can be assembled from these
without re-deriving conventions. Each entry says **what it is**, **where it
lives**, and **how to reuse it**.

Fraction Buddy version: **v1.0.0**.

---

## 1. Design tokens (`C`) and fonts

**What:** A single color object plus two font stacks that give every tool the
same refined dark theme. Defined in the `[SEC:UI-CONST]` section of the
canonical `.jsx` and reused verbatim across apps.

```
C = {
  bg:#0b0e13, panel:#11151c, panel2:#161b24, line:#2a3344,
  ink:#f0ece2, dim:#aab4c5, faint:#7f8a9d,
  brass:#e0b46a, brassDim:#5a4a28, cyan:#7fe3d3, red:#e8838c
}
FONT_MONO = "JetBrains Mono", ui-monospace, …
FONT_DISP = "Fraunces", Georgia, serif
```

**Reuse:** Copy `C` into the new tool's `[SEC:UI-CONST]`. Body uses
`FONT_MONO`; the title/result display uses `FONT_DISP`. `brass` is the single
accent — used for the title middle-dot, the gradient rule, and primary values.
`cyan` is the secondary accent (positive/active), `red` for errors. Keeping the
object identical is what makes the family look like one product.

**Header pattern:** Title rendered as `Word·Buddy` with a brass middle dot
(`·`, U+00B7); uppercase letter-spaced subtitle beneath; version string
top-right; a brass→transparent gradient horizontal rule under the header; page
background is a radial gradient over `C.bg`.

---

## 2. Rational arithmetic core (`core/logic.js`)

**What:** The single source of truth for Fraction Buddy's math — **exact**
integer-fraction arithmetic, no floating point in the result path.

**Public API:**

| Function | Purpose |
|---|---|
| `gcd(a,b)` | greatest common divisor (non-negative) |
| `makeRational(n,d)` | build a reduced `{n,d}` (d>0), `null` if d==0 |
| `lcm(a,b)` | least common multiple |
| `addR(x,y)` | add two rationals exactly; returns `null` on genuine overflow past `Number.MAX_SAFE_INTEGER` (never an unsafe integer) |
| `negR(x)` | negate (test-only; not inlined into the app) |
| `parseField(str)` | digits-only string → integer, with `{value,error}` |
| `termRational(term)` | one `{op,whole,num,den}` term → rational or typed error |
| `sumTerms(terms)` | fold terms → `{rational, error, badIndices}` |
| `formatMixed` / `formatImproper` / `formatDecimal` | display forms |
| `onlyFactors2and5(d)` | true if a denominator yields a terminating decimal |
| `nudgeField` / `digitsOnly` | UI helpers (arrow-key step; input sanitizer) |

**Reuse / extension:** Anything needing exact fraction math imports these. The
overflow sentinel (`null`) is the contract: callers must render a "too large"
state rather than coerce to float. To extend with multiply/divide, add `mulR`,
`divR` following `addR`'s overflow-guard shape and add them to `sync-check.js`'s
inlined-function list.

**Why exact (not Triangle Buddy's `toFraction`):** Triangle Buddy *rounds* a
float to a nearby fraction for display. Fraction Buddy must return the
mathematically exact sum (1/3 + 1/3 = 2/3, not 0.667→a rounded guess), so it
keeps integer numerator/denominator throughout and reduces via `gcd`.

---

## 3. Numeric-input pattern (mobile keypad)

**What:** The convention that makes every value field trigger the phone numeric
keypad instead of QWERTY, while staying a normal text box on desktop.

**Markup each value field carries:**
```
type="text"  inputMode="numeric"  pattern="[0-9]*"
autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
```
Plus an `onChange` that runs the value through `digitsOnly()` (strips anything
non-digit) and a `MAX_DIGITS` cap (6) so products stay inside the safe-integer
range.

**Why three separate fields per term (whole / numerator / denominator) instead
of one "2 3/4" box:** a numeric keypad has no space or `/` key, so a combined
box would be un-typeable on mobile. Splitting into three purely-numeric fields
keeps the keypad usable and each field trivially validatable.

**Reuse:** Any new tool that takes numeric entry copies this attribute set and
the `digitsOnly` sanitizer. Verified at the real-DOM level — see §6.

---

## 4. Platform tailoring (coarse vs fine pointer)

**What:** Runtime detection of touch vs mouse to tune targets and hints.

- `window.matchMedia("(pointer: coarse)")` (guarded for SSR/jsdom absence) sets
  a `coarse` state.
- **Coarse (mobile):** enlarged hit targets via `@media (pointer: coarse)` and a
  touch-oriented hint line.
- **Fine (desktop):** ↑/↓ arrow keys nudge the focused field (`nudgeField`), with
  a matching hint line.

**Reuse:** Copy the `useEffect` that subscribes to the media query and the
`onFieldKey` arrow handler. The guard (`typeof window === "undefined" ||
!window.matchMedia`) is required so SSR/smoke-render and the build never throw.

---

## 5. Presentational helper: `Section`

**What:** A small card primitive (`[SEC:PRESENT]`) — a titled panel with a head
row and a body, styled from `C`. Mirrors Triangle Buddy's `tc-section`; Fraction
Buddy's CSS classes are the `fb-*` parallel (`fb-section`, `fb-result-main`,
`fb-warn`, …).

**Reuse:** Wrap each logical group (the terms list, the result) in a `Section`.
Keep the `xx-section` / `xx-result-main` / `xx-warn` class-naming parallel so
shared CSS reasoning carries over between tools.

---

## 6. Build & test conventions

**Canonical source:** one `.jsx` file (`FractionCalculator.jsx`) with nav-map
section tags: `[SEC:CORE]` (logic.js inlined verbatim), `[SEC:UI-CONST]`,
`[SEC:COMPONENT]`, `[SEC:PRESENT]`. Default-exports the component, imports only
React.

**Pipeline (`core/build.js`):**
1. Transform the `import React, {…} from "react"` line into a React default
   import + `createRoot` and append a mount tail. *(Fraction Buddy has no lucide
   step — operators are monospace glyphs `+`, `−` U+2212, `×` U+00D7, `↺`.)*
2. `esbuild --bundle --minify --format=iife --loader:.jsx=jsx --jsx=automatic`.
3. Splice the bundle into `core/template.html` at `{{BUNDLE}}` via split/join
   (not `String#replace`, which would mis-handle `$` in the bundle).
4. Write `fraction-buddy.html` + `index.html` (alias).
5. A `BANNED_IDENTIFIERS` guard fails the build if a deleted name is still
   referenced in code (empty at v1.0.0).

**Gates (all must pass before shipping):**

| Gate | Proves |
|---|---|
| `core/test.js` | 57 asserts: exact arithmetic, parsing, formatting, overflow guard |
| `core/sync-check.js` | the 13 `[SEC:CORE]` functions are byte-identical to `logic.js` |
| `core/smoke-render.js` | the component renders server-side without runtime errors |
| `core/interaction-test.js` | 21 asserts: user-driven flows in jsdom (client render) |
| `core/verify-built-html.js` | 11 asserts: the **shipped HTML file** boots, mounts, and carries the numeric-keypad attributes on real DOM nodes |

**Reuse:** A new tool clones this layout. The two gates that catch what esbuild
and the JSX parser miss are `smoke-render` (render-time `ReferenceError`s) and
`verify-built-html` (does the final file actually boot). Keep both.

---

## 7. HTML template / hosting (`core/template.html`)

**What:** The deployable wrapper. `{{BUNDLE}}` placeholder inside a `<script>`;
viewport with `user-scalable=no`; full SEO head (title, description, keywords,
author, canonical, Open Graph, Twitter card, JSON-LD `WebApplication` +
`FAQPage`); inline `<style>`; `<div id="root">`; a crawlable `<footer>` (how-to,
exactness note, FAQ) so the page has content before JS runs; the Buy-Me-a-Coffee
widget referencing the local `./widget.js` companion.

**Reuse:** Copy and change the head metadata + footer copy per tool. The single
external runtime dependency is Google Fonts; `./widget.js` is the optional BMC
companion the project already ships. Everything else is inlined — one
self-contained file.

---

## Versioning

Per project convention, every change bumps the version by its scope
(patch/minor/major). Fraction Buddy ships at **v1.0.0** (new app, not a Triangle
Buddy edit). The version string lives top-right in the header of the canonical
`.jsx`.

---

## Added in Triangle Buddy v1.16.0

**`deriveLocks(locks, cur)`** · `[SEC:CORE/solve]` · pure
Classifies each side (a, b, c) and angle (A, B, C) as `user`, `auto` (computed) or `free` using SSS, SAS, ASA/AAS and SSA; two pinned vertices fix the side between them. Returns `{ state, known, determined, ambiguous, impossible, over, scaleOnly }`. `ambiguous` = SSA with two valid triangles. Drives solve-mode styling, the status pill, and keypad Next. Covered by the determinacy truth table in `core/test-core.js`.

**`fitView(P, vw, vh, pad, minPpi, maxPpi, margin)`** · `[SEC:CORE/solve]` · pure
Returns `{ ppi, pan }` fitting the points' bounding box into a `vw x vh` view with `pad` px clear on every side. Used on first measure, Reset, Recenter and keep-in-view. Reusable by any pan/zoom canvas.

**`keypadApply(draft, key)`** and **`nextTarget(order, cur, ok, dir)`** · `[SEC:CORE/solve]` · pure
Custom-keypad text editing (backspace also drops the trailing space; one decimal point per number; the feet/inch keys append the space the imperial parser expects) and wrap-around "next eligible item" navigation. Reusable for any numeric keypad, e.g. Fraction Buddy.

**`parseCoord(str, unit)`** · `[SEC:CORE/solve]` · pure
Coordinate entry: a leading minus negates, so `-3-1/2` is -3.5 while `3-1/2` stays whole-dash-fraction (3.5).

**On-canvas editor (phone sheet / desktop popover)** · `[SEC:COMPONENT]`
Tap target -> `editor = { kind, id }`. Coarse pointer: fixed bottom sheet `.tc-sheet` with a 4x4 custom keypad (`.tc-keypad`, `.tc-key`), lock/pin pill, Set, Next. Fine pointer: absolutely positioned `.tc-pop` with a native input (Enter set, Tab next, Esc close). Tap vs drag is decided in `onUp` by pointer travel <= `TAP_PX`; taps restore any micro-move and add no history. `body.tc-sheet-open` hides the BMC button (`#bmc-wbtn`). Reusable shell for value entry in other Buddy apps.

**viewBox 1:1 CSS px pattern** · `[SEC:COMPONENT]`
`vbW`/`vbH` track the SVG element via ResizeObserver so every on-canvas size is specified once in CSS px. Lesson: a fixed viewBox scales text and touch targets by element width / viewBox width (0.52 on a 390-pt phone: 6 px labels).

**Gates: `core/test-core.js`, `core/interaction-test.js`**
`test-core` bundles `[SEC:CORE]` straight from the JSX (no separate logic file to keep in sync). `interaction-test` drives the built `index.html` in jsdom on phone and desktop. Both run from `core/build.js` (exit codes 10 / 11). Needs `npm install` (jsdom is a devDependency).


---

## Added in Triangle Buddy v1.17.0

**`BUDDY_TOOLS` + `ToolNav({ tools, currentId })`** · `[SEC:UI-CONST/hub]`
Single source of truth for the tool family, with trianglebuddy.com as the hub and each tool on its own subdomain. Each entry is `{ id, name, url, blurb }`. `ToolNav` renders nothing when there are no sibling tools, a direct header link (`.tc-nav-link`) when there is exactly one, and a "More tools" menu (`.tc-nav-menu`, current tool marked `aria-current`, closes on Esc or outside press) at two or more. All three modes are tested in `core/test-core.js`, so the menu is verified before a third tool exists.
**Adding a tool (e.g. trig.trianglebuddy.com):** add one entry to `BUDDY_TOOLS`, and add a crawlable footer line to `core/template.html`. The header switches to the menu automatically.
**Reuse in other Buddy apps:** copy the section and pass that app's `currentId` (e.g. `"fractions"`) so every tool shows the same family navigation.

**Updated in Triangle v1.18.0 · Trig v0.2.0 · Fraction v1.3.0: `ToolNav` in all three headers**
All three apps now carry an identical copy of `BUDDY_TOOLS` (triangle, fractions, trig) plus `ToolNav`, with only the class prefix changed (`tc-` / `tg-` / `fb-`) and `currentId` set to the app. With three tools, each header shows the menu.
- **Button:** `aria-label="More tools"`, visible text "Tools ▾". At `max-width:600px` it turns into a 44x44 four-square SVG icon (`.xx-nav-ico` shown, `.xx-nav-txt` hidden). Measured in Chromium, the text button pushed the Trig and Fraction phone headers down a row (+50 / +58 px). With the icon they cost +10 px (Fraction 360–414 px, Trig 390–414 px). At 320 px (both apps) and at 360–375 px (Trig), the header still takes an extra row.
- **Anchor:** the menu is positioned against the header's right-hand cluster (`.tc-head-end` / `.tg-hdr-right` / `.fb-head-end`, which is `position:relative`), not against the button. When it hung off the button, a 274 px menu started 16 px off-screen at 320 px width.
- **Stacking:** `z-index:10000` puts the menu above the Buy Me a Coffee widget (button and welcome bubble at 9999; the bubble shows 0.5–8 s after a first visit) and below Trig's editor layers (10000–10002; the editor comes later in the DOM, so it wins the tie).
- **Gates:** unit tests for all three modes (Triangle and Trig `core/test-core.js`, Fraction `core/interaction-test.js`) and built-page menu checks (Triangle `interaction-test`, Trig and Fraction `verify-built-html`). Real-browser layout checks cover button placement and size, the menu fully on screen and on top, and closing (Trig `browser-test.js`, Fraction `layout-check.py`, both `--full`). Triangle has no real-browser gate.
**Adding a tool now:** add the same entry to `BUDDY_TOOLS` in every app and a footer line to every app's `core/template.html`, then update each app's nav tests (they assert the exact list).

**Fit until touched** · `[SEC:COMPONENT]`
`viewTouchedRef`: until the user's first pointer-down on the canvas, a wheel zoom, or a zoom button, every resize refits the triangle, because the first measurement can run before the layout settles. After that, resizes preserve the user's view. Reset clears the flag.

---

## Repo tooling (buddy-apps monorepo v0.2.0)

**`scripts/buddy.js <app> [--full] [--deploy]`** · repo root
One entry point for every app: syncs shared files from `packages/` into the app, runs the app's `core/build.js`, then any extra gates listed in its `APPS` table (Fraction runs test, sync-check, interaction-test and verify-built-html there; `--full` adds `layout-check.py`). It stages the deploy set (index.html, widget.js, og-image.png, robots.txt, sitemap.xml) into `apps/<app>/dist`. `--deploy` refuses to continue while `wrangler.jsonc` still has the `set-me` name. Any failing gate stops the run before staging. A layout gate that exits 2 ("skipped, no browser") counts as a failure.
**Adding an app:** give it `core/build.js`. If its gates live outside the build, list them in `APPS`. Then add the app to the CI matrix.

**`packages/widget/widget.js`** · shared
The Buy Me a Coffee companion. It is copied into each app at build time, which replaces the per-app copies (Fraction's `core/assets/widget.js` is retired).

**jsdom boot pattern: wait for mount, don't sleep** · Triangle `core/interaction-test.js`
After constructing JSDOM, poll until the app's own markers exist (Triangle: 9 `[data-ed]` targets, 5 s cap), then allow a short settle for post-mount effects. A fixed `tick(120)` lost the race on cold starts: mount measured 51–181 ms, and the old test passed only 1 of 10 cold runs. Use this in every new Buddy interaction gate.
