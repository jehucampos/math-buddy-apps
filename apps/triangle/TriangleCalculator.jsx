import React, { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from "react";
import { Lock, Unlock, Pin, PinOff, RotateCcw, Grid3x3, Magnet, Ruler, Move, Hand, Undo2, Redo2, MoveHorizontal, RotateCw } from "lucide-react";

/* ============================================================
   TRIANGLE BUDDY  v1.17.0
   ------------------------------------------------------------
   NAVIGATION MAP (search these tags to jump to a section):
     [SEC:CORE]    pure logic — mirrors core/logic.js verbatim.
                   Do NOT edit here directly; edit core/logic.js,
                   run core/test.js + core/sync-check.js, then
                   sync. Spans fractions→units→helpers→solver.
     [SEC:UI-CONST] UI-only constants (colors, fonts, grid display
                   presets, cursor, RotateIcon). Artifact-only.
     [SEC:COMPONENT] the React component (state, refs, gestures,
                   effects, render). All churn happens here.
     [SEC:PRESENT] small presentational helpers (Section, Row…).
   ------------------------------------------------------------
   TESTING: pure logic is verified by core/test.js (63 asserts)
   against core/logic.js, the SAME text inlined in [SEC:CORE].
   core/sync-check.js proves the two are logic-equivalent, so a
   green test run == shipped logic is correct. Geometry uses ONE
   canonical base unit (inches); units are a display/parse layer.
   ------------------------------------------------------------
   CHANGELOG (chronological):
   v1.1  pan, whole-triangle move, Shift axis-lock, label clamp.
   v1.2  scroll zoom-to-cursor; body-move snaps nearest vertex.
   v1.3  undo/redo (Ctrl/Cmd+Z); view state excluded from history.
   v1.4  rotate via halo (rigid; pivot=centroid or lone pin).
   v1.5  imperial/metric units + per-system scales.
   v1.6  compound imperial parser (1' 7" 3/4, 1.5ft, 3-1/2…).
   v1.7  responsive mouse+touch; snap features as on-screen toggles.
   v1.8  pinch-zoom + two-finger pan (multi-pointer).
   v1.8.1 full-viewport layout; v1.8.2 renamed "Triangle Buddy".
   v1.9  contrast/readability; letterbox-aware pointer mapping;
         v1.9.1-1.9.3 pinch reliability (window capture-phase, iOS).
   v1.10 default is a 3-4-5 right triangle, first quadrant.
   v1.11 desktop fit-to-viewport; wheel zoom gated on Shift.
   v1.12 Undo/Redo/Reset in canvas footer; stacked a/b/c labels;
         v1.12.1 rotate cue = arced-arrow icon at cursor.
   v1.12.2 tooling: pure logic extracted to core/logic.js as the
         single source of truth, backed by a standing regression
         suite (core/test.js) + sync-check; file sectioned with a
         navigation map. No behavior change.
   v1.13.0 edge labels offset along the OUTWARD normal (away from
         the centroid), so they always sit outside the triangle
         regardless of rotation or winding. New pure helper
         outwardNormal in core/logic.js (5 asserts).
         Visual refactor: 60 inline style={{...}} props reduced
         to 18 (only genuinely-dynamic ones remain) — repeated
         patterns extracted to named CSS classes (tc-flat, tc-chip,
         tc-section, tc-row, tc-lock, tc-glyph…) in the existing
         <style> block. No behavior change.
   v1.14.0 rotation affordance redesigned. The persistent dashed
         halo around the triangle is removed entirely (it could
         look distorted for very obtuse shapes). Instead, one
         rotate icon now sits at each vertex along its EXTERNAL
         angle bisector ray, always visible when rotation is
         possible — same affordance on desktop and touch. Vertex
         letter labels A/B/C also moved onto the external bisector
         ray (closer to the vertex), so each vertex now has a
         clean outward stack: vertex disc → letter → rotate icon.
         New pure helper externalBisector in core/logic.js
         (7 asserts). Dead state hoverPt removed.
   v1.14.1 fix: dangling setHoverPt(null) call in the SVG's
         onPointerLeave handler — missed when the hoverPt state
         was removed in v1.14.0. Caused an Uncaught ReferenceError
         every time the pointer left the canvas. Build script now
         carries a BANNED_IDENTIFIERS guard that fails the build
         loudly when removed names are still referenced in code
         (changelog mentions are allowed).
   v1.14.2 fixes:
         * GRID: minor and major grid lines now align exactly.
           Previously the minor pattern was nested inside the
           major pattern's tile, where SVG's user-space resolution
           shifted minor lines by (origin.x mod minorPx) away from
           major lines. The two now render as sibling fills, both
           anchored to `origin` in SVG root user space.
         * EDGE LABELS: offset is now dynamic, computed as the
           box's projection in the outward-normal direction
           (|n.x|*halfW + |n.y|*halfH) + 8 px gap. The previous
           fixed 26 px offset wasn't enough for diagonal normals
           and let the label box overlap the edge.
         * ROTATE ICONS: pushed from 36 → 46 px past each vertex
           to add breathing room between the vertex letter and
           the rotate icon. Letter offset (18 px) unchanged.
   v1.14.3 fix: orphan duplicate JSX tail left by an incomplete
         str_replace in v1.14.2 — referenced an out-of-scope
         block-local `c0` and threw ReferenceError on every
         render. The build accepted it because the orphan parsed
         as JSX text + valid <g> children. Build now runs a
         smoke-render gate (core/smoke-render.js) that actually
         invokes the component through react-dom/server's
         renderToString in Node and aborts the build if any
         error is thrown during render. Catches dangling consts,
         broken helper refs, and any other runtime-only error
         in JSX attributes — complements the BANNED_IDENTIFIERS
         guard from v1.14.1 which covers handlers that don't
         fire at initial render.
   v1.14.4 ROTATE_CURSOR redesign #1 (filled-triangle). Read as
         bulky; superseded immediately by v1.14.5.
   v1.14.5 ROTATE_CURSOR redesign #2 (open chevron). Thin matching
         strokes throughout (1.5 px white on 3 px black halo), arc
         loop centered at (14,14) r=6.5 with gap in upper area,
         two-segment chevron at the loop's upper-left endpoint
         with apex on the loop and legs at 35° half-angle from
         the reverse-tangent. Hot spot unchanged at (14, 14).
   v1.15.0 wider zoom range + button-driven zoom:
         * MIN_PPI 14 → 0.5, MAX_PPI 220 → 1000. Now covers from
           millimeter-scale fine inspection up through many-yard
           overviews. Pinch-zoom honors the new bounds automatically;
           the existing pinchTransform helper already clamps to
           [MIN_PPI, MAX_PPI].
         * Zoom slider replaced with −/+ buttons. Each click steps
           multiplicatively by ZOOM_STEP = √2 (so every two clicks
           is 2× zoom). Buttons re-anchor zoom on the canvas center
           via zoomAt() so the visible content stays put. Buttons
           disable at the ppi bounds. Pinch zoom remains smooth/analog.
         * New pure helper zoomStep(ppi, dir, min, max, ratio) for
           the button click math.
         * New pure helper autoGridStep(ppi, system) that returns
           {gridInches, majorInches} picking the finest tier whose
           minor step renders ≥ 10 px on screen. Imperial tiers
           cascade from 1/32" through 100 ft (primary new band:
           1 ft major / 1 in minor for wide-out zoom). Metric tiers
           0.1 mm through 10 m.
         * New "Auto" chip prepended to the Grid step row in Settings.
           When Auto is on (default), the visual grid AND the snap
           step both come from autoGridStep — so zooming way out
           switches the grid to feet/inches with no manual action.
           Selecting any manual fractional chip turns Auto off.
         * Reset now also resets gridAuto back to true (alongside
           pan and pxPerInch which it already reset).
   v1.15.1 fix: grid now fills the canvas element top to bottom.
         The viewBox was a fixed 640x560 inside an element whose
         height is set to fill the column (fit mode) — with
         preserveAspectRatio="meet" that uniformly scaled the
         content to the width and centered it, leaving ~360 px of
         dead space above and below the grid on a typical desktop
         layout. The viewBox height is now dynamic: W stays 640,
         vbH = round(W * elemH / elemW) is kept in sync by a
         ResizeObserver on the SVG element (isomorphic layout
         effect so the first paint is already correct). When vbH
         changes, pan.y shifts by half the delta so content keeps
         its position relative to vertical center instead of
         drifting toward the top; reset() applies the same offset
         to the H0-tuned initial pan. Module-level H renamed H0
         (pre-measure fallback); drag/pan handlers and clientToVB
         read the live height from a ref so their stable-identity
         callbacks don't capture a stale value.
   v1.16.0 readable, editable canvas + solve mode:
         * viewBox = element size in CSS px (1:1). On-canvas sizes are
           set once and render the same on every device; the fixed
           640-wide viewBox scaled them by canvasWidth/640 (0.52 on a
           390-pt phone: ~6 px labels, 25 px touch targets). Lengths
           15 px, angles 14 px, 44 px vertex/label targets on touch.
           View fits the triangle on first measure, reset and recenter
           (pure helper fitView).
         * Tap a length or angle label to edit it in place; tap a vertex
           (no drag) for X/Y and Pin. Phone: bottom sheet with a custom
           keypad (feet/inch/fraction keys, Set, Next). Desktop: popover
           with a native input (Enter set, Tab next, Esc close). Tap vs
           drag = pointer travel <= TAP_PX; taps never move geometry or
           add history.
         * Solve mode: deriveLocks() classifies each side/angle as user /
           auto (computed) / free via SSS, SAS, ASA/AAS, SSA (two pins fix
           the side between them). Computed values render muted + dashed;
           a status pill reports N of 3 known / Solved / 2 triangles fit
           (ambiguous SSA) / No triangle fits / Over-constrained. Keypad
           Next jumps to the next free value and closes once solved.
           Tapping a computed value offers to unlock one of the inputs.
           After a typed value, the view refits only if a vertex left the
           canvas or the triangle shrank below 20% of it.
         * Phone: Sides/Angles/Vertices collapse under a Details toggle;
           panel inputs use 16 px text on touch (stops iOS focus zoom);
           the coffee button hides while the keypad is open.
         * Window pointer tracking ignores pointers that don't target the
           SVG, so overlays on the canvas can't start a pinch.
         * Gates: core/test-core.js (pure helpers + determinacy truth
           table, tested straight from this file) and
           core/interaction-test.js (jsdom drives built index.html).
   v1.17.0 hub navigation: BUDDY_TOOLS ([SEC:UI-CONST/hub]) lists the tool
         family; ToolNav in the header links to the one sibling tool
         (Fraction Buddy at fractions.trianglebuddy.com) and becomes a
         "More tools" menu automatically at two or more siblings (menu
         path tested now in core/test-core.js). Crawlable footer line
         added to core/template.html, mirroring Fraction Buddy's.
         Fixes found in real Chromium: resizes keep refitting until the
         user first touches the view (the first measure ran before the
         layout settled, clipping a rotate icon); desktop popover 280 px
         with a 14 px title so it no longer wraps.
   ============================================================ */

// ===================== [SEC:CORE] =====================
// Pure logic — mirrors core/logic.js. Keep in sync (core/sync-check.js).
// ---- [SEC:CORE/measurement] measurement / geometry ----
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

function toFraction(value, maxDenom = 64) {
  const neg = value < 0;
  let v = Math.abs(value);
  let whole = Math.floor(v);
  let frac = v - whole;
  let num = Math.round(frac * maxDenom);
  let den = maxDenom;
  if (num === den) { whole += 1; num = 0; }
  let text;
  if (num === 0) text = `${whole}"`;
  else {
    const g = gcd(num, den); num /= g; den /= g;
    text = whole > 0 ? `${whole}\u2009${num}/${den}"` : `${num}/${den}"`;
  }
  if (neg && (whole !== 0 || num !== 0)) text = "-" + text;
  return text;
}

const distp = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

function sidesOf(A, B, C) {
  return { a: distp(B, C), b: distp(C, A), c: distp(A, B) };
}
function angleFromSides(adj1, adj2, opp) {
  const cv = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  return Math.acos(Math.min(1, Math.max(-1, cv)));
}
function anglesOf(A, B, C) {
  const { a, b, c } = sidesOf(A, B, C);
  const d = r => r * 180 / Math.PI;
  return { A: d(angleFromSides(b, c, a)), B: d(angleFromSides(a, c, b)), C: d(angleFromSides(a, b, c)) };
}
function parseLength(str) {
  if (typeof str !== "string") return NaN;
  let s = str.trim().replace(/"/g, "").replace(/\u2033/g, "");
  if (s === "") return NaN;
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  let m = s.match(/^(-?\d+)[\s-]+(\d+)\/(\d+)$/);
  if (m) { const w = +m[1], n = +m[2], d = +m[3]; if (!d) return NaN; const sg = w < 0 ? -1 : 1; return w + sg * (n / d); }
  m = s.match(/^(-?\d+)\/(\d+)$/);
  if (m) { const n = +m[1], d = +m[2]; if (!d) return NaN; return n / d; }
  return NaN;
}

// ---- [SEC:CORE/units] units layer (base unit = inches) ----
const INCH_PER = { in: 1, ft: 12, yd: 36, mm: 1 / 25.4, cm: 1 / 2.54, m: 1 / 0.0254 };
const UNIT_SYMBOL = { in: "\"", ft: "ft", yd: "yd", mm: "mm", cm: "cm", m: "m" };
const IMPERIAL_UNITS = ["in", "ft", "yd"];
const METRIC_UNITS = ["mm", "cm", "m"];
const UNIT_LABEL = { in: "inches", ft: "feet", yd: "yards", mm: "millimeters", cm: "centimeters", m: "meters" };

// Compound imperial parser -> INCHES, or null if no imperial structure found
// (caller then treats the input as a bare number in the selected unit).
// Order FEET -> FRACTION -> INCHES -> leftover avoids grabbing a fraction's
// denominator (e.g. "2 1/2 in" = 2.5", not the "2" from "1/2 in").
function parseImperial(str) {
  if (typeof str !== "string") return null;
  let s = str.trim().toLowerCase()
    .replace(/[\u2032\u2019\u2018]/g, "'")
    .replace(/[\u2033\u201d\u201c]/g, "\"");
  if (s === "") return null;
  let inches = 0, found = false, m;
  m = s.match(/(\d+(?:\.\d+)?)\s*(?:feet|ft|')/);
  if (m) { inches += parseFloat(m[1]) * 12; found = true; s = s.replace(m[0], " "); }
  m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) { const n = +m[1], d = +m[2]; if (d) { inches += n / d; found = true; } s = s.replace(m[0], " "); }
  m = s.match(/(\d+(?:\.\d+)?)\s*(?:inches|inch|in|")/);
  if (m) { inches += parseFloat(m[1]); found = true; s = s.replace(m[0], " "); }
  m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) { if (found) inches += parseFloat(m[1]); else return null; }
  return found ? inches : null;
}

function parseToBase(str, unit) {
  if (METRIC_UNITS.includes(unit)) {
    const v = parseFloat(String(str).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(v) ? v * INCH_PER[unit] : NaN;
  }
  // imperial: try the compound feet/inches/fraction parser first (result in inches)
  const imp = parseImperial(str);
  if (imp != null) return imp;
  // otherwise a bare number is interpreted in the selected imperial unit
  const v = parseFloat(String(str).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v * INCH_PER[unit] : NaN;
}
function _trimDec(str) {
  if (str.includes(".")) str = str.replace(/0+$/, "").replace(/\.$/, "");
  return str === "-0" ? "0" : str;
}
function formatMetric(bi, unit, decimals) {
  return `${_trimDec((bi / INCH_PER[unit]).toFixed(decimals))} ${UNIT_SYMBOL[unit]}`;
}
function _fmtFrac(whole, num, den) {
  if (num === 0) return `${whole}"`;
  const g = gcd(num, den); num /= g; den /= g;
  return whole > 0 ? `${whole}\u2009${num}/${den}"` : `${num}/${den}"`;
}
function formatImperial(bi, unit, denom) {
  const neg = bi < 0; const ticks = Math.round(Math.abs(bi) * denom); const den = denom;
  const wholeIn = Math.floor(ticks / den), num = ticks % den;
  let out;
  if (unit === "in") out = _fmtFrac(wholeIn, num, den);
  else if (unit === "ft") {
    const ft = Math.floor(wholeIn / 12), inW = wholeIn % 12;
    const inStr = _fmtFrac(inW, num, den);
    out = ft === 0 ? inStr : (inW === 0 && num === 0 ? `${ft}'` : `${ft}'\u2009${inStr}`);
  } else {
    const yd = Math.floor(wholeIn / 36); const rem = wholeIn % 36; const ft = Math.floor(rem / 12), inW = rem % 12;
    const parts = [];
    if (yd > 0) parts.push(`${yd}yd`);
    if (ft > 0) parts.push(`${ft}'`);
    if (inW > 0 || num > 0 || parts.length === 0) parts.push(_fmtFrac(inW, num, den));
    out = parts.join("\u2009");
  }
  return (neg && ticks !== 0) ? "-" + out : out;
}
function formatLength(bi, system, unit, denom, decimals) {
  return system === "imperial" ? formatImperial(bi, unit, denom) : formatMetric(bi, unit, decimals);
}
// snap-grid increment presets, expressed in each display unit (converted to base inches at use)
const GRID_OPTIONS = {
  in: [1, 0.5, 0.25, 0.125, 0.0625], ft: [1, 0.5, 0.25, 1 / 12], yd: [1, 0.5, 0.25, 1 / 3],
  mm: [10, 5, 2, 1], cm: [5, 1, 0.5, 0.1], m: [0.5, 0.1, 0.05, 0.01],
};
const DEFAULT_GRID_INCHES = { in: 0.25, ft: 1, yd: 12, mm: 5 / 25.4, cm: 1 / 2.54, m: 0.05 / 0.0254 };
const DEFAULT_UNIT = { imperial: "in", metric: "cm" };
// drawn graph-paper spacing per unit (major, minor) in that unit
const DISPLAY_GRID = {
  in: { major: 1, minor: 0.25 }, ft: { major: 1, minor: 0.25 }, yd: { major: 1, minor: 1 / 3 },
  mm: { major: 10, minor: 5 }, cm: { major: 1, minor: 0.5 }, m: { major: 0.1, minor: 0.05 },
};

// ---- [SEC:CORE/helpers] interaction helpers ----
function axisConstrain(start, raw) {
  const dx = raw.x - start.x, dy = raw.y - start.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: raw.x, y: start.y } : { x: start.x, y: raw.y };
}
function clampLabel(cx, cy, halfW, halfH, W, H, pad = 2) {
  return { x: Math.max(halfW + pad, Math.min(W - halfW - pad, cx)), y: Math.max(halfH + pad, Math.min(H - halfH - pad, cy)) };
}
function nearestVertex(pts, p) {
  let best = null, bd = Infinity;
  for (const k of ["A", "B", "C"]) {
    const d = Math.hypot(pts[k].x - p.x, pts[k].y - p.y);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
// delta that snaps `anchor` to the nearest grid intersection
function snapDelta(anchor, step) {
  const sx = Math.round(anchor.x / step) * step, sy = Math.round(anchor.y / step) * step;
  return { dx: sx - anchor.x, dy: sy - anchor.y };
}
// new camera origin so the point under the cursor stays fixed while zooming
function zoomAt(vb, origin, ppi, newPpi) {
  const ix = (vb.x - origin.x) / ppi, iy = (vb.y - origin.y) / ppi;
  return { x: vb.x - ix * newPpi, y: vb.y - iy * newPpi };
}
// pinch: keep the world point (ix,iy) under the current two-finger midpoint while
// scaling ppi by curDist/startDist. Returns clamped ppi and the matching origin.
function pinchTransform(startDist, startPpi, ix, iy, curMid, curDist, minPpi, maxPpi) {
  const newPpi = Math.max(minPpi, Math.min(maxPpi, startPpi * (curDist / startDist)));
  return { ppi: newPpi, origin: { x: curMid.x - ix * newPpi, y: curMid.y - iy * newPpi } };
}
// Unit-vector perpendicular to edge p->q that points AWAY from `interior`.
// Used to offset edge labels so they sit outside the triangle, not on top of it.
function outwardNormal(p, q, interior) {
  const dx = q.x - p.x, dy = q.y - p.y;
  let nx = -dy, ny = dx;
  const L = Math.hypot(nx, ny) || 1;
  nx /= L; ny /= L;
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  if (nx * (interior.x - mx) + ny * (interior.y - my) > 0) { nx = -nx; ny = -ny; }
  return { x: nx, y: ny };
}
// Unit vector along the EXTERNAL angle bisector at vertex V, given its two
// neighbors P and Q. Points AWAY from triangle interior — used to place
// per-vertex decorations (letter labels, rotate icons) on a clean outward ray.
// For any non-degenerate triangle u + w is never zero. Degenerate fallback:
// perpendicular to the V->P edge.
function externalBisector(V, P, Q) {
  const ux = P.x - V.x, uy = P.y - V.y, uL = Math.hypot(ux, uy) || 1;
  const wx = Q.x - V.x, wy = Q.y - V.y, wL = Math.hypot(wx, wy) || 1;
  let bx = ux / uL + wx / wL, by = uy / uL + wy / wL;
  const L = Math.hypot(bx, by);
  if (L < 1e-9) return { x: -uy / uL, y: ux / uL };
  return { x: -bx / L, y: -by / L };
}
const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Multiplicative zoom step (×SQRT2 per click). dir=+1 zooms in, -1 zooms out.
// Returns clamped ppi.
function zoomStep(ppi, dir, minPpi, maxPpi, ratio) {
  const factor = dir > 0 ? ratio : 1 / ratio;
  return clampNum(ppi * factor, minPpi, maxPpi);
}

// Auto grid step. Returns { gridInches, majorInches } describing the snap +
// visual grid for the current zoom level. Strategy: pick the finest tier whose
// minor step renders >= 10 px on screen. Below 10 px the minor grid is too
// dense to read; the next coarser tier takes over. Imperial tiers cascade from
// 1/32" (tightest) up through 100 ft (widest). Metric tiers from 0.1 mm up
// through 10 m.
function autoGridStep(ppi, system) {
  // tiers: [minor_inches, major_inches], finest first
  const IMPERIAL_TIERS = [
    [0.03125, 1], [0.0625, 1], [0.125, 1], [0.25, 1],
    [1, 12],            // 1 in minor / 1 ft major — primary wide-out band
    [12, 120],          // 1 ft minor / 10 ft major
    [120, 1200],        // 10 ft minor / 100 ft major
  ];
  const MM = 1 / 25.4;
  const METRIC_TIERS = [
    [0.1 * MM, 1 * MM], [0.5 * MM, 5 * MM], [1 * MM, 10 * MM],
    [5 * MM, 50 * MM], [10 * MM, 100 * MM], [50 * MM, 500 * MM],
    [100 * MM, 1000 * MM], [1000 * MM, 10000 * MM],
  ];
  const tiers = system === "metric" ? METRIC_TIERS : IMPERIAL_TIERS;
  for (const [mi, ma] of tiers) {
    if (mi * ppi >= 10) return { gridInches: mi, majorInches: ma };
  }
  // Fallthrough: ppi so low even the coarsest tier is < 10 px. Use coarsest.
  const last = tiers[tiers.length - 1];
  return { gridInches: last[0], majorInches: last[1] };
}

// ---- [SEC:CORE/solve] derived locks, fit-to-view, editor helpers (v1.16.0) ----
const SIDE_KEY = { a: "BC", b: "CA", c: "AB" };
const SIDE_ENDS = { a: ["B", "C"], b: ["C", "A"], c: ["A", "B"] };
const SIDE_OPP = { a: "A", b: "B", c: "C" };
const EDIT_ORDER = ["a", "b", "c", "A", "B", "C"];

// Classify each side and angle as "user" (entered by the user), "auto"
// (mathematically determined by the user's inputs, or by two pins), or
// "free". cur = current side lengths {a,b,c} in inches, used for pin-fixed
// sides and the SSA ambiguity test. Determinacy rules: SSS, SAS, ASA/AAS
// (any side + two angles), and SSA (two sides + a non-included angle), which
// may admit 0, 1 or 2 triangles. Two angles alone fix the shape, not the size.
function deriveLocks(locks, cur) {
  const pinned = locks.pinned || [], eL = locks.edgeLen || {}, vA = locks.vertexAngle || {};
  const userS = {}, fixS = {}, val = {};
  for (const k of ["a", "b", "c"]) {
    userS[k] = eL[SIDE_KEY[k]] != null;
    fixS[k] = userS[k] || SIDE_ENDS[k].every((v) => pinned.includes(v));
    val[k] = userS[k] ? eL[SIDE_KEY[k]] : (cur ? cur[k] : NaN);
  }
  const userA = ["A", "B", "C"].filter((v) => vA[v] != null);
  const knownS = ["a", "b", "c"].filter((k) => fixS[k]);
  const nS = knownS.length, nA = userA.length, anglesSet = nA >= 2;
  const angSum = userA.reduce((t, v) => t + vA[v], 0);
  let determined = false, ambiguous = false, impossible = nA === 2 && angSum >= 180;
  const inconsistent = nA === 3 && Math.abs(angSum - 180) > 0.05;
  if (nS === 3) {
    determined = true;
    if (!(val.a + val.b > val.c && val.b + val.c > val.a && val.a + val.c > val.b)) impossible = true;
  } else if (nS >= 1 && anglesSet) {
    determined = true;
  } else if (nS === 2 && nA === 1) {
    determined = true;
    const X = userA[0], xs = ["a", "b", "c"].find((k) => SIDE_OPP[k] === X);
    if (fixS[xs]) {                      // X is opposite a known side: SSA
      const ys = knownS.find((k) => k !== xs);
      const x = val[xs], y = val[ys], h = y * Math.sin(vA[X] * Math.PI / 180);
      if (x < h - 1e-9) impossible = true;
      else if (vA[X] < 90 && x < y - 1e-9 && x > h + 1e-9) ambiguous = true;
    }                                    // else X is the included angle: SAS
  }
  const indep = nS + Math.min(nA, 2);
  const state = {};
  for (const k of ["a", "b", "c"]) state[k] = userS[k] ? "user" : (fixS[k] || determined) ? "auto" : "free";
  for (const v of ["A", "B", "C"]) state[v] = vA[v] != null ? "user" : (determined || anglesSet) ? "auto" : "free";
  return {
    state, determined, ambiguous, impossible,
    over: indep > 3 || inconsistent,
    scaleOnly: nS === 0 && anglesSet,
    known: determined ? 3 : Math.min(indep, nS === 0 ? 2 : 3),
  };
}

// Fit the triangle's bounding box into a vw x vh view with `pad` px of room
// on every side for labels and rotate icons. Returns { ppi, pan }.
function fitView(P, vw, vh, pad, minPpi, maxPpi, margin) {
  const xs = [P.A.x, P.B.x, P.C.x], ys = [P.A.y, P.B.y, P.C.y];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const wIn = Math.max(maxX - minX, 1e-6), hIn = Math.max(maxY - minY, 1e-6);
  const aw = Math.max(vw - 2 * pad, 40), ah = Math.max(vh - 2 * pad, 40);
  const ppi = clampNum(Math.min(aw / wIn, ah / hIn), minPpi, maxPpi);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return { ppi, pan: { x: vw / 2 - cx * ppi - margin, y: vh / 2 - cy * ppi - margin } };
}

// Coordinate entry: a leading minus sign negates the length that follows,
// so "-3-1/2" is -3.5 while "3-1/2" (whole-dash-fraction) is 3.5.
function parseCoord(str, unit) {
  const t = String(str).trim();
  const neg = /^[-\u2212]/.test(t);
  const v = parseToBase(neg ? t.slice(1) : t, unit);
  return neg ? -v : v;
}

// Custom keypad input. Backspace also drops any trailing space the feet /
// inch keys add; only one decimal point per number segment.
function keypadApply(draft, key) {
  if (key === "\u232B") return draft.replace(/\s+$/, "").slice(0, -1).replace(/\s+$/, "");
  if (draft.length >= 18) return draft;
  if (key === "." && /\.\d*$/.test(draft)) return draft;
  if (key === "\u2032" || key === "\u2033") return draft.replace(/\s+$/, "") + key + " ";
  return draft + key;
}

// Next item in `order` after `cur` (dir +1/-1) that satisfies ok(); null if none.
function nextTarget(order, cur, ok, dir = 1) {
  const n = order.length, i = order.indexOf(cur);
  for (let j = 1; j <= n; j++) {
    const t = order[(((i + dir * j) % n) + n) % n];
    if (ok(t)) return t;
  }
  return null;
}

// ---- [SEC:CORE/rotation] region detection + rotation ----
function _sign(p, a, b) { return (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y); }
function pointInTriangle(p, A, B, C) {
  const d1 = _sign(p, A, B), d2 = _sign(p, B, C), d3 = _sign(p, C, A);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function distToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
  const L2 = vx * vx + vy * vy || 1e-12;
  let t = (wx * vx + wy * vy) / L2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
function distToTriangle(p, A, B, C) {
  if (pointInTriangle(p, A, B, C)) return 0;
  return Math.min(distToSegment(p, A, B), distToSegment(p, B, C), distToSegment(p, C, A));
}
function centroidOf(P) { return { x: (P.A.x + P.B.x + P.C.x) / 3, y: (P.A.y + P.B.y + P.C.y) / 3 }; }
function rotatePointsAround(P, O, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const rot = p => ({ x: O.x + (p.x - O.x) * c - (p.y - O.y) * s, y: O.y + (p.x - O.x) * s + (p.y - O.y) * c });
  return { A: rot(P.A), B: rot(P.B), C: rot(P.C) };
}
function snapAngleDeg(rad, stepDeg) { const d = rad * 180 / Math.PI; return (Math.round(d / stepDeg) * stepDeg) * Math.PI / 180; }
function classifyZone(inside, distPx, bandPx) { return inside ? "inside" : (distPx <= bandPx ? "near" : "far"); }

// ---- [SEC:CORE/solver] PBD constraint solver ----
const EDGES = [["A", "B"], ["B", "C"], ["C", "A"]];

// Rotation cue glyph: two arced arrows around a center. Drawn in viewBox px.
function RotateIcon({ x, y, r = 11, color = "#7fe3d3" }) {
  // two opposing arcs (each ~140°), with a small arrowhead at each arc's leading end
  const pol = (cx, cy, rad, deg) => ({ x: cx + rad * Math.cos(deg * Math.PI / 180), y: cy + rad * Math.sin(deg * Math.PI / 180) });
  const arcPath = (a0, a1) => {
    const p0 = pol(x, y, r, a0), p1 = pol(x, y, r, a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  };
  // arrowhead at the leading end (angle aEnd), pointing along the tangent (increasing angle)
  const head = (aEnd) => {
    const tip = pol(x, y, r, aEnd);
    const tang = { x: -Math.sin(aEnd * Math.PI / 180), y: Math.cos(aEnd * Math.PI / 180) }; // CCW tangent
    const back = { x: tip.x - tang.x * 5.5, y: tip.y - tang.y * 5.5 };
    const norm = { x: Math.cos(aEnd * Math.PI / 180), y: Math.sin(aEnd * Math.PI / 180) }; // radial
    const w = 3.6;
    return `${(back.x + norm.x * w).toFixed(2)},${(back.y + norm.y * w).toFixed(2)} ${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${(back.x - norm.x * w).toFixed(2)},${(back.y - norm.y * w).toFixed(2)}`;
  };
  return (
    <g pointerEvents="none" opacity="0.95">
      <circle cx={x} cy={y} r={r + 7} fill="#0b0e13" opacity="0.55" />
      <path d={arcPath(35, 165)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d={arcPath(215, 345)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <polygon points={head(165)} fill={color} />
      <polygon points={head(345)} fill={color} />
    </g>
  );
}

function clonePts(p) { return { A: { ...p.A }, B: { ...p.B }, C: { ...p.C } }; }
function cloneLocks(L) { return { pinned: [...L.pinned], edgeLen: { ...L.edgeLen }, vertexAngle: { ...L.vertexAngle } }; }
function ptsChanged(a, b) {
  for (const k of ["A", "B", "C"]) if (Math.abs(a[k].x - b[k].x) > 1e-9 || Math.abs(a[k].y - b[k].y) > 1e-9) return true;
  return false;
}
function rotateAround(p, O, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const dx = p.x - O.x, dy = p.y - O.y;
  p.x = O.x + dx * c - dy * s;
  p.y = O.y + dx * s + dy * c;
}
function solve(points, locks, dragging, iterations = 80) {
  const P = clonePts(points);
  const pinned = new Set(locks.pinned || []);
  if (dragging) pinned.add(dragging);
  const movable = n => !pinned.has(n);
  for (let it = 0; it < iterations; it++) {
    for (const [u, v] of EDGES) {
      const key = u + v, keyR = v + u;
      const target = (locks.edgeLen || {})[key] ?? (locks.edgeLen || {})[keyR];
      if (target == null) continue;
      const pu = P[u], pv = P[v];
      let dx = pv.x - pu.x, dy = pv.y - pu.y;
      let d = Math.hypot(dx, dy) || 1e-9;
      const diff = (d - target) / d;
      const wu = movable(u) ? 1 : 0, wv = movable(v) ? 1 : 0;
      const ws = wu + wv; if (!ws) continue;
      pu.x += dx * diff * (wu / ws); pu.y += dy * diff * (wu / ws);
      pv.x -= dx * diff * (wv / ws); pv.y -= dy * diff * (wv / ws);
    }
    const angDef = [["A", "B", "C"], ["B", "A", "C"], ["C", "A", "B"]];
    for (const [vtx, e1, e2] of angDef) {
      const td = (locks.vertexAngle || {})[vtx];
      if (td == null) continue;
      const target = td * Math.PI / 180;
      const O = P[vtx], p1 = P[e1], p2 = P[e2];
      const a1 = Math.atan2(p1.y - O.y, p1.x - O.x);
      const a2 = Math.atan2(p2.y - O.y, p2.x - O.x);
      let cur = a2 - a1;
      while (cur <= -Math.PI) cur += 2 * Math.PI;
      while (cur > Math.PI) cur -= 2 * Math.PI;
      const sign = cur >= 0 ? 1 : -1;
      const err = Math.abs(cur) - target;
      if (Math.abs(err) < 1e-9) continue;
      const m1 = movable(e1) ? 1 : 0, m2 = movable(e2) ? 1 : 0;
      const ms = m1 + m2; if (!ms) continue;
      rotateAround(p1, O, (+sign * err / 2) * (m1 / ms));
      rotateAround(p2, O, (-sign * err / 2) * (m2 / ms));
    }
  }
  return P;
}

/* ===================== [SEC:UI-CONST/hub] Buddy tool family =====================
   trianglebuddy.com is the hub; each tool lives on its own subdomain. This list is
   the single source of truth for cross-tool navigation. ToolNav renders a direct
   link while there is exactly one sibling tool, and a "More tools" menu once there
   are two or more, so adding a tool is one line here (plus its footer line in
   core/template.html). Reusable as-is in any Buddy app: pass that app's currentId. */
const BUDDY_TOOLS = [
  { id: "triangle", name: "Triangle Buddy", url: "https://trianglebuddy.com/", blurb: "Sides, angles & missing values" },
  { id: "fractions", name: "Fraction Buddy", url: "https://fractions.trianglebuddy.com/", blurb: "Add, subtract, multiply & divide fractions" },
];
function ToolNav({ tools, currentId }) {
  const others = tools.filter((t) => t.id !== currentId);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {                    // close on outside press or Esc
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (others.length === 0) return null;
  if (others.length === 1) {
    const t = others[0];
    return <a className="tc-nav-link" href={t.url} title={t.blurb}>{t.name} <span aria-hidden="true">{"\u2192"}</span></a>;
  }
  return (
    <div className="tc-nav" ref={ref}>
      <button type="button" className="tc-nav-link tc-nav-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        More tools <span aria-hidden="true">{"\u25BE"}</span>
      </button>
      {open && (
        <div className="tc-nav-menu" role="menu">
          {tools.map((t) => t.id === currentId ? (
            <span key={t.id} className="tc-nav-item is-current" role="menuitem" aria-current="page"><b>{t.name}</b><small>{t.blurb}</small></span>
          ) : (
            <a key={t.id} className="tc-nav-item" role="menuitem" href={t.url}><b>{t.name}</b><small>{t.blurb}</small></a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== [SEC:UI-CONST] =====================
   UI-only constants (colors, fonts, dimensions, rotate cursor).
   These are NOT in core/logic.js — they're presentation, not logic. */

const C = {
  brassMute: "#a08c5e", cyanMute: "#5f9e95", // v1.16.0: computed (auto-locked) values
  bg: "#0b0e13", panel: "#11151c", panel2: "#161b24", line: "#2a3344",
  ink: "#f0ece2", dim: "#aab4c5", faint: "#7f8a9d",
  brass: "#e0b46a", brassDim: "#5a4a28", cyan: "#7fe3d3", red: "#e8838c",
};
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
const FONT_DISP = "'Fraunces', Georgia, serif";
const DENOMS = [2, 4, 8, 16, 32, 64];
const W0 = 640, H0 = 560, MARGIN = 28; // pre-measure / server-render viewBox; live size is vbW x vbH in CSS px (1:1)
const TAP_PX = 6;   // a press travelling <= this many CSS px is a tap, not a drag
const FIT_PAD = 72; // px kept clear around the triangle by fitView (labels + rotate icons)
// Layout effect in the browser (runs before paint, so the viewBox is corrected
// before the first frame), plain effect on the server (react-dom/server warns
// on useLayoutEffect). Standard isomorphic pattern.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const MIN_PPI = 0.5, MAX_PPI = 1000;
const ZOOM_STEP = Math.SQRT2; // multiplicative zoom step per +/- button click
const BAND_PX = 64; // screen-space hit-test width for the rotate zone (no longer drawn)
const ROTATE_CURSOR = `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI4IDI4Ij4KPGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+CjxwYXRoIGQ9Ik0gMTguOTggOS44MiBBIDYuNSA2LjUgMCAxIDEgOS44MiA5LjAyIi8+Cjxwb2x5bGluZSBwb2ludHM9IjYuODMsOS4yOCA5LjgyLDkuMDIgOS4wNSwxMS45MiIvPgo8L2c+CjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+CjxwYXRoIGQ9Ik0gMTguOTggOS44MiBBIDYuNSA2LjUgMCAxIDEgOS44MiA5LjAyIi8+Cjxwb2x5bGluZSBwb2ludHM9IjYuODMsOS4yOCA5LjgyLDkuMDIgOS4wNSwxMS45MiIvPgo8L2c+Cjwvc3ZnPg==") 14 14, auto`;

// ===================== [SEC:COMPONENT] =====================
// React component. State, refs, gesture handlers, effects, render.
// This section is where almost all churn lives; everything above is stable.
export default function TriangleCalculator() {
  // Default: a 3-4-5 right triangle in the visual first quadrant.
  //   A at the origin (0,0); B straight up the +Y axis; C straight out the +X axis.
  //   Internal y is screen-down, so "up" (visual +Y) is negative y internally.
  //   AC = 4 (X leg), AB = 3 (Y leg), BC = 5 (hypotenuse), right angle at A.
  const initial = useMemo(() => ({
    A: { x: 0, y: 0 }, B: { x: 0, y: -3 }, C: { x: 4, y: 0 },
  }), []);
  // initialView is only the pre-measure / server-render view. In the browser the
  // first ResizeObserver measure replaces it with fitView(); reset() refits too.
  const initialView = useMemo(() => ({ ppi: 70, pan: { x: 122, y: 442 } }), []);

  const [pts, setPts] = useState(initial);
  const [locks, setLocks] = useState({ pinned: [], edgeLen: {}, vertexAngle: {} });
  const [pxPerInch, setPxPerInch] = useState(initialView.ppi);
  const [pan, setPan] = useState(initialView.pan);   // camera offset in px
  const [denom, setDenom] = useState(64);
  const [system, setSystem] = useState("imperial"); // 'imperial' | 'metric'
  const [unit, setUnit] = useState("in");
  const [decimals, setDecimals] = useState(4);
  const [gridSnap, setGridSnap] = useState(false);
  const [orthoSnap, setOrthoSnap] = useState(false);
  const [axisLock, setAxisLock] = useState(false);   // touch-friendly: lock vertex drag to an axis
  const [angleSnap, setAngleSnap] = useState(false);  // touch-friendly: snap rotation to 15°
  const [isTouch, setIsTouch] = useState(false);      // coarse pointer (no hover/keyboard)
  const [viewport, setViewport] = useState({ w: 1280, h: 900 });
  // viewBox = the SVG element's size in CSS px (1:1), tracked by a ResizeObserver.
  const [vbW, setVbW] = useState(W0);
  const vbWRef = useRef(W0); vbWRef.current = vbW;
  const W = vbW;
  const [vbH, setVbH] = useState(H0);
  const vbHRef = useRef(H0); vbHRef.current = vbH;
  const H = vbH;
  const fittedRef = useRef(false);      // first measure fits the triangle to the canvas
  const viewTouchedRef = useRef(false); // until the user touches the view, resizes refit (layout settles after mount)
  // on-canvas editor: { kind: "edge" | "angle" | "vertex", id }, draft text per field
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState({ v: "", x: "", y: "", f: "v" });
  const [draftErr, setDraftErr] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const openEditor = useCallback((t, toggle = true) => {
    setEditor((prev) => (toggle && prev && prev.kind === t.kind && prev.id === t.id ? null : t));
    setDraft({ v: "", x: "", y: "", f: t.kind === "vertex" ? "x" : "v" });
    setDraftErr(false);
  }, []);
  const closeEditor = useCallback(() => { setEditor(null); setDraftErr(false); }, []);
  const [gridStep, setGridStep] = useState(0.25);
  const [gridAuto, setGridAuto] = useState(true); // when true, gridStep + visual grid track zoom level
  // Auto grid lookup (memoized): when gridAuto, both the snap step AND visual
  // grid major/minor come from this. When gridAuto is off, returns null and
  // callers fall back to gridStep / DISPLAY_GRID[unit].
  const autoGrid = useMemo(
    () => gridAuto ? autoGridStep(pxPerInch, system) : null,
    [gridAuto, pxPerInch, system]
  );
  const effectiveGridInches = autoGrid ? autoGrid.gridInches : gridStep;
  const [interaction, setInteraction] = useState(null); // {type, ...}
  const [hoverZone, setHoverZone] = useState("far");    // 'inside' | 'near' | 'far' — drives CSS cursor
  const [edits, setEdits] = useState({});
  const [history, setHistory] = useState([]); // undo stack of {pts, locks}
  const [future, setFuture] = useState([]);   // redo stack

  const svgRef = useRef(null);

  // ---- refs for stale-free keyboard undo/redo ----
  const ptsRef = useRef(pts); ptsRef.current = pts;
  const locksRef = useRef(locks); locksRef.current = locks;
  const historyRef = useRef(history); historyRef.current = history;
  const futureRef = useRef(future); futureRef.current = future;
  const interactionRef = useRef(interaction); interactionRef.current = interaction;
  const pointersRef = useRef(new Map()); // pointerId -> {x,y} in viewBox px (for pinch)
  const viewRef = useRef({ ppi: pxPerInch, pan }); // live view state (set during render below)

  // push the supplied before-snapshot onto the undo stack; clears redo
  const commitHistory = useCallback((before) => {
    setHistory(h => [...h, before]);
    setFuture([]);
  }, []);
  const snapNow = useCallback(() => ({ pts: clonePts(ptsRef.current), locks: cloneLocks(locksRef.current) }), []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.length) return;
    const prev = h[h.length - 1];
    setFuture(f => [...f, snapNow()]);
    setHistory(hh => hh.slice(0, -1));
    setPts(prev.pts); setLocks(prev.locks); setEdits({});
  }, [snapNow]);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (!f.length) return;
    const next = f[f.length - 1];
    setHistory(hh => [...hh, snapNow()]);
    setFuture(ff => ff.slice(0, -1));
    setPts(next.pts); setLocks(next.locks); setEdits({});
  }, [snapNow]);

  const origin = useMemo(() => ({ x: MARGIN + pan.x, y: MARGIN + pan.y }), [pan]);
  const i2x = useCallback((xi) => origin.x + xi * pxPerInch, [origin, pxPerInch]);
  const i2y = useCallback((yi) => origin.y + yi * pxPerInch, [origin, pxPerInch]);

  const s = sidesOf(pts.A, pts.B, pts.C);
  const ang = anglesOf(pts.A, pts.B, pts.C);
  const angSum = ang.A + ang.B + ang.C;
  const valid = s.a + s.b > s.c && s.b + s.c > s.a && s.a + s.c > s.b;
  const hasPins = locks.pinned.length > 0;
  // solve mode: which values are entered (user), computed (auto) or still free
  const dl = deriveLocks(locks, s);
  const solveStatus = dl.impossible ? { t: "No triangle fits these values", c: C.red }
    : dl.over ? { t: "Over-constrained \u00B7 unlock one", c: C.red }
    : dl.determined ? { t: dl.ambiguous ? "Solved \u00B7 2 triangles fit" : "Solved", c: C.cyan }
    : dl.scaleOnly ? { t: "Shape set \u00B7 add a side", c: C.dim }
    : dl.known === 0 ? { t: "Tap a value to set it", c: C.faint }
    : { t: `${dl.known} of 3 known`, c: C.dim };

  // client px (in viewBox units) helpers
  const clientToVB = useCallback((cx, cy) => {
    const rect = svgRef.current.getBoundingClientRect();
    // SVG uses preserveAspectRatio="xMidYMid meet": uniform scale + centering (letterbox).
    // With vbH tracking the element aspect ratio the offsets are ~0, but keep the
    // general form so a one-frame mismatch during resize still maps correctly.
    const Ww = vbWRef.current, Hh = vbHRef.current;
    const scale = Math.min(rect.width / Ww, rect.height / Hh);
    const offX = (rect.width - Ww * scale) / 2, offY = (rect.height - Hh * scale) / 2;
    return { x: (cx - rect.left - offX) / scale, y: (cy - rect.top - offY) / scale };
  }, []);
  const vbToInch = useCallback((vb) => ({ x: (vb.x - origin.x) / pxPerInch, y: (vb.y - origin.y) / pxPerInch }), [origin, pxPerInch]);

  const applySnap = useCallback((vtx, p) => {
    let { x, y } = p;
    if (gridSnap) { x = Math.round(x / effectiveGridInches) * effectiveGridInches; y = Math.round(y / effectiveGridInches) * effectiveGridInches; }
    if (orthoSnap) {
      for (const other of ["A", "B", "C"]) {
        if (other === vtx) continue;
        const o = pts[other];
        if (Math.abs(x - o.x) < 0.35) x = o.x;
        if (Math.abs(y - o.y) < 0.35) y = o.y;
      }
    }
    return { x, y };
  }, [gridSnap, orthoSnap, effectiveGridInches, pts]);

  // ---- pointer down dispatchers ----
  const startVertex = (vtx) => (e) => {
    if (pointersRef.current.size >= 2) return;   // pinch owns the gesture
    e.preventDefault(); e.stopPropagation();
    setInteraction({ type: "vertex", vtx, start: { ...pts[vtx] }, startSnapshot: snapNow(), startClient: { x: e.clientX, y: e.clientY } });
  };
  // tap-only targets (value labels): a press that doesn't travel opens that value's editor
  const startTap = (target) => (e) => {
    if (pointersRef.current.size >= 2) return;   // pinch owns the gesture
    e.preventDefault(); e.stopPropagation();
    setInteraction({ type: "tap", target, startClient: { x: e.clientX, y: e.clientY } });
  };
  const startBody = (e) => {
    if (hasPins) return;                       // pins must be released first
    if (pointersRef.current.size >= 2) return;   // pinch owns the gesture
    e.preventDefault(); e.stopPropagation();
    const clickInch = vbToInch(clientToVB(e.clientX, e.clientY));
    const anchor = nearestVertex(pts, clickInch);
    setInteraction({ type: "body", anchor, startClient: { x: e.clientX, y: e.clientY }, startPts: clonePts(pts), startSnapshot: snapNow() });
  };
  const startPan = (e) => {
    e.preventDefault();
    setInteraction({ type: "pan", startClient: { x: e.clientX, y: e.clientY }, startPan: { ...pan } });
  };

  // rotation allowed unless 2+ vertices are pinned (two fixed points lock orientation).
  // pivot: the single pinned vertex if exactly one, else the centroid.
  const canRotate = locks.pinned.length <= 1;
  const rotatePivot = () => locks.pinned.length === 1 ? { ...pts[locks.pinned[0]] } : centroidOf(pts);

  // classify the cursor position relative to the triangle, in screen (viewBox) px
  const bandPx = isTouch ? 72 : BAND_PX; // CSS px; must reach the rotate icons (ICON_OFF + r)
  const zoneAt = useCallback((clientX, clientY) => {
    const vb = clientToVB(clientX, clientY);
    const PA = { x: i2x(pts.A.x), y: i2y(pts.A.y) };
    const PB = { x: i2x(pts.B.x), y: i2y(pts.B.y) };
    const PC = { x: i2x(pts.C.x), y: i2y(pts.C.y) };
    const inside = pointInTriangle(vb, PA, PB, PC);
    return classifyZone(inside, distToTriangle(vb, PA, PB, PC), bandPx);
  }, [clientToVB, i2x, i2y, pts, bandPx]);

  const startRotate = (e) => {
    e.preventDefault();
    const pivot = rotatePivot();
    const cur = vbToInch(clientToVB(e.clientX, e.clientY));
    const startAngle = Math.atan2(cur.y - pivot.y, cur.x - pivot.x);
    setInteraction({ type: "rotate", pivot, startAngle, startPts: clonePts(pts), startSnapshot: snapNow(), startClient: { x: e.clientX, y: e.clientY } });
  };

  // background (empty space) pointer-down: near the triangle => rotate, else pan
  const startBackground = (e) => {
    if (pointersRef.current.size >= 2) return;   // pinch owns the gesture
    if (canRotate && zoneAt(e.clientX, e.clientY) === "near") startRotate(e);
    else startPan(e);
  };

  // hover (when idle) drives the affordance cursor over empty space
  const onHover = useCallback((e) => {
    if (interactionRef.current) return;
    setHoverZone(zoneAt(e.clientX, e.clientY));
  }, [zoneAt]);

  // ---- multi-pointer tracking for pinch-zoom + two-finger pan ----
  const two = () => { const v = [...pointersRef.current.values()]; return v.length >= 2 ? v.slice(0, 2) : null; };
  const pinchMetrics = () => {
    const p = two(); if (!p) return null;
    return { mid: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
  };
  const enterPinch = () => {
    const m = pinchMetrics(); if (!m || m.dist < 1) return;
    const { ppi, pan: livePan } = viewRef.current;
    const origin = { x: MARGIN + livePan.x, y: MARGIN + livePan.y };
    const ix = (m.mid.x - origin.x) / ppi, iy = (m.mid.y - origin.y) / ppi;
    setInteraction({ type: "pinch", startDist: m.dist, startPpi: ppi, ix, iy });
  };

  // ---- unified move / up ----
  const onMove = useCallback((e) => {
    // Multi-touch guard (ref-based, immune to stale closure): if a pinch is active
    // or two+ fingers are down, the single-finger gesture must NOT run.
    if (pointersRef.current.size >= 2 || interactionRef.current?.type === "pinch") return;
    if (!interaction) return;
    if (interaction.type === "pinch") return;
    if (interaction.type === "vertex") {
      const lockAxis = e.shiftKey || axisLock;
      let raw = vbToInch(clientToVB(e.clientX, e.clientY));
      if (lockAxis) raw = axisConstrain(interaction.start, raw);
      let snapped = applySnap(interaction.vtx, raw);
      if (lockAxis) {                          // re-assert axis lock after snapping
        const ax = axisConstrain(interaction.start, raw);
        if (ax.x === interaction.start.x) snapped.x = interaction.start.x;
        if (ax.y === interaction.start.y) snapped.y = interaction.start.y;
      }
      setPts(prev => solve({ ...prev, [interaction.vtx]: snapped }, locks, interaction.vtx));
    } else if (interaction.type === "body") {
      const rect = svgRef.current.getBoundingClientRect();
      const scale = Math.min(rect.width / vbWRef.current, rect.height / vbHRef.current);
      let dxIn = (e.clientX - interaction.startClient.x) / scale / pxPerInch;
      let dyIn = (e.clientY - interaction.startClient.y) / scale / pxPerInch;
      const sp = interaction.startPts;
      if (gridSnap) {
        // snap the vertex nearest the original click to the grid; same delta moves all.
        // Pure translation => orientation preserved (no rotation). For axis-parallel,
        // grid-length edges this lands every vertex on the grid.
        const movedAnchor = { x: sp[interaction.anchor].x + dxIn, y: sp[interaction.anchor].y + dyIn };
        const sd = snapDelta(movedAnchor, effectiveGridInches);
        dxIn += sd.dx; dyIn += sd.dy;
      }
      setPts({
        A: { x: sp.A.x + dxIn, y: sp.A.y + dyIn },
        B: { x: sp.B.x + dxIn, y: sp.B.y + dyIn },
        C: { x: sp.C.x + dxIn, y: sp.C.y + dyIn },
      });
    } else if (interaction.type === "pan") {
      const rect = svgRef.current.getBoundingClientRect();
      const scale = Math.min(rect.width / vbWRef.current, rect.height / vbHRef.current);
      const dx = (e.clientX - interaction.startClient.x) / scale;
      const dy = (e.clientY - interaction.startClient.y) / scale;
      setPan({ x: interaction.startPan.x + dx, y: interaction.startPan.y + dy });
    } else if (interaction.type === "rotate") {
      const cur = vbToInch(clientToVB(e.clientX, e.clientY));
      const a = Math.atan2(cur.y - interaction.pivot.y, cur.x - interaction.pivot.x);
      let delta = a - interaction.startAngle;
      if (e.shiftKey || angleSnap) delta = snapAngleDeg(delta, 15); // toggle or Shift snaps to 15°
      // rigid rotation: preserves all edge lengths & angles, so locks stay satisfied;
      // no solver pass needed.
      setPts(rotatePointsAround(interaction.startPts, interaction.pivot, delta));
    }
  }, [interaction, clientToVB, vbToInch, applySnap, locks, pxPerInch, gridSnap, effectiveGridInches, axisLock, angleSnap]);

  const onUp = useCallback((e) => {
    const cur = interactionRef.current;
    // Tap = a press that travelled <= TAP_PX. Taps never move geometry (any
    // micro-move, e.g. a grid snap, is restored) and never add history.
    const moved = cur && cur.startClient && e && Number.isFinite(e.clientX)
      ? Math.hypot(e.clientX - cur.startClient.x, e.clientY - cur.startClient.y) : Infinity;
    if (cur && moved <= TAP_PX) {
      if (cur.startSnapshot) setPts(cur.startSnapshot.pts);
      if (cur.startPan) setPan(cur.startPan);
      if (cur.type === "vertex") openEditor({ kind: "vertex", id: cur.vtx });
      else if (cur.type === "tap") openEditor(cur.target);
      else closeEditor();                        // tap on empty canvas / body closes
      setInteraction(null);
      return;
    }
    if (cur && (cur.type === "vertex" || cur.type === "body" || cur.type === "rotate") && cur.startSnapshot) {
      if (ptsChanged(cur.startSnapshot.pts, ptsRef.current)) commitHistory(cur.startSnapshot);
    }
    setInteraction(null);
  }, [commitHistory, openEditor, closeEditor]);

  useEffect(() => {
    // Persistent window-level pointer tracking. This guarantees BOTH fingers are
    // seen by the same handler (React synthetic capture on the SVG can miss the
    // 2nd touch on iOS). Handles single-gesture moves, pinch, and bookkeeping.
    const inSvg = (e) => {
      const el = svgRef.current; if (!el) return false;
      // must actually target the canvas: overlays drawn over the canvas rect
      // (editor sheet / popover) must not count, or two quick keypad taps
      // would start a pinch.
      if (e.target && e.target.nodeType === 1 && !el.contains(e.target)) return false;
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    const handleDown = (e) => {
      if (!inSvg(e)) return;               // only track touches on the canvas
      viewTouchedRef.current = true;       // user owns the view from here on
      pointersRef.current.set(e.pointerId, clientToVB(e.clientX, e.clientY));
      if (pointersRef.current.size === 2) enterPinch(); // 2nd finger => pinch, overriding any single gesture
    };
    const handleMove = (e) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, clientToVB(e.clientX, e.clientY));
      }
      if (interactionRef.current?.type === "pinch") {
        const m = pinchMetrics(); if (!m) return;
        const I = interactionRef.current;
        const r = pinchTransform(I.startDist, I.startPpi, I.ix, I.iy, m.mid, m.dist, MIN_PPI, MAX_PPI);
        setPxPerInch(r.ppi);
        setPan({ x: r.origin.x - MARGIN, y: r.origin.y - MARGIN });
        return;
      }
      onMove(e);
    };
    const handleUp = (e) => {
      pointersRef.current.delete(e.pointerId);
      if (interactionRef.current?.type === "pinch") {
        if (pointersRef.current.size < 2) setInteraction(null);
        return;
      }
      onUp(e);
    };
    const capture = { capture: true, passive: false };
    window.addEventListener("pointerdown", handleDown, capture);
    window.addEventListener("pointermove", handleMove, capture);
    window.addEventListener("pointerup", handleUp, capture);
    window.addEventListener("pointercancel", handleUp, capture);
    return () => {
      window.removeEventListener("pointerdown", handleDown, capture);
      window.removeEventListener("pointermove", handleMove, capture);
      window.removeEventListener("pointerup", handleUp, capture);
      window.removeEventListener("pointercancel", handleUp, capture);
    };
  }, [onMove, onUp, clientToVB]);

  // keep latest view state for the stable wheel handler
  viewRef.current = { ppi: pxPerInch, pan };

  // iOS Safari fires non-standard gesture* events for two-finger pinch that can
  // zoom the whole page; suppress them on the canvas so our pinch handler owns it.
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const prevent = (e) => e.preventDefault();
    el.addEventListener("gesturestart", prevent, { passive: false });
    el.addEventListener("gesturechange", prevent, { passive: false });
    el.addEventListener("gestureend", prevent, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", prevent);
      el.removeEventListener("gesturechange", prevent);
      el.removeEventListener("gestureend", prevent);
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e) => {
      // On desktop, only zoom when Shift is held (so plain scroll-wheel scrolls the
      // page as expected). Trackpad pinch arrives as ctrl+wheel — always allow that.
      const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (!isTouch && !e.shiftKey && !e.ctrlKey) return; // let the page scroll
      e.preventDefault();
      viewTouchedRef.current = true;
      const { ppi, pan } = viewRef.current;
      const vb = clientToVB(e.clientX, e.clientY);
      const origin = { x: MARGIN + pan.x, y: MARGIN + pan.y };
      const factor = Math.exp(-e.deltaY * 0.0015);   // smooth, direction-correct
      const np = clampNum(ppi * factor, MIN_PPI, MAX_PPI);
      if (np === ppi) return;
      const no = zoomAt(vb, origin, ppi, np);
      setPxPerInch(np);
      setPan({ x: no.x - MARGIN, y: no.y - MARGIN });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [clientToVB]);

  // ---- keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo ----
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return; // let inputs do native undo
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- detect coarse pointer (touch) to adapt hit targets & affordances ----
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(!!mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener("change", update) : mq.addListener(update);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", update) : mq.removeListener(update); };
  }, []);

  // ---- editor side effects ----
  useEffect(() => {                               // Esc closes the editor anywhere
    if (!editor) return;
    const onKey = (e) => { if (e.key === "Escape") closeEditor(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, closeEditor]);
  useEffect(() => {                               // phone: sheet open => hide coffee button, keep canvas visible
    if (typeof document === "undefined") return;
    const on = !!(editor && isTouch);
    document.body.classList.toggle("tc-sheet-open", on);
    if (on && svgRef.current) {
      const r = svgRef.current.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight - 440) {
        const card = svgRef.current.closest(".tc-canvas-card");
        if (card && card.scrollIntoView) card.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
    return () => document.body.classList.remove("tc-sheet-open");
  }, [editor, isTouch]);

  // ---- track viewport size so the layout can fit the screen without scrolling ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---- viewBox = element size in CSS px (1:1) ----
  // Every on-canvas size (fonts, touch targets, icons) is then set once in CSS
  // px and renders identically on phone and desktop. A fixed 640-wide viewBox
  // scaled all of it by (canvas width / 640): ~6 px labels on a phone. First
  // measure fits the triangle; later resizes shift pan by half the delta so
  // the view stays centered.
  useIsoLayoutEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const nw = Math.max(120, Math.round(r.width)), nh = Math.max(120, Math.round(r.height));
      const pw = vbWRef.current, ph = vbHRef.current;
      if (!fittedRef.current || !viewTouchedRef.current) {
        fittedRef.current = true;
        const f = fitView(ptsRef.current, nw, nh, FIT_PAD, MIN_PPI, MAX_PPI, MARGIN);
        setPxPerInch(f.ppi); setPan(f.pan);
      } else if (nw !== pw || nh !== ph) {
        setPan(p => ({ x: p.x + (nw - pw) / 2, y: p.y + (nh - ph) / 2 }));
      }
      if (nw !== pw) setVbW(nw);
      if (nh !== ph) setVbH(nh);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- lock / edit actions ----
  const reSolve = (nl, np = pts) => setPts(solve(np, nl, null, 120));
  const toggleEdgeLock = (key) => { commitHistory(snapNow()); setLocks(L => {
    const el = { ...L.edgeLen };
    if (el[key] != null) delete el[key];
    else el[key] = key === "AB" ? s.c : key === "BC" ? s.a : s.b;
    return { ...L, edgeLen: el };
  }); };
  const toggleAngleLock = (v) => { commitHistory(snapNow()); setLocks(L => {
    const va = { ...L.vertexAngle };
    if (va[v] != null) delete va[v]; else va[v] = ang[v];
    return { ...L, vertexAngle: va };
  }); };
  const togglePin = (v) => { commitHistory(snapNow()); setLocks(L => ({
    ...L, pinned: L.pinned.includes(v) ? L.pinned.filter(x => x !== v) : [...L.pinned, v],
  })); };
  const commitEdge = (key) => {
    const val = parseToBase(edits["e" + key] ?? "", unit);
    setEdits(e => { const n = { ...e }; delete n["e" + key]; return n; });
    if (!Number.isFinite(val) || val <= 0) return;
    commitHistory(snapNow());
    const nl = { ...locks, edgeLen: { ...locks.edgeLen, [key]: val } };
    setLocks(nl); reSolve(nl);
  };
  const commitAngle = (v) => {
    const val = parseFloat(edits["a" + v]);
    setEdits(e => { const n = { ...e }; delete n["a" + v]; return n; });
    if (!Number.isFinite(val) || val <= 0 || val >= 180) return;
    commitHistory(snapNow());
    const nl = { ...locks, vertexAngle: { ...locks.vertexAngle, [v]: val } };
    setLocks(nl); reSolve(nl);
  };
  const reset = () => {
    commitHistory(snapNow());
    setPts(initial);
    setLocks({ pinned: [], edgeLen: {}, vertexAngle: {} });
    setEdits({});
    setEditor(null);
    viewTouchedRef.current = false;
    const f = fitView(initial, W, H, FIT_PAD, MIN_PPI, MAX_PPI, MARGIN);
    setPan(f.pan);
    setPxPerInch(f.ppi);
    setGridAuto(true);
  };

  // ---- on-canvas editor (v1.16.0) ----
  const itemKind = (id) => (id === id.toLowerCase() ? "edge" : "angle");
  const editorLabel = (ed) => ed.kind === "edge" ? `Side ${ed.id} \u00B7 edge ${SIDE_KEY[ed.id]}`
    : ed.kind === "angle" ? `Angle ${ed.id}` : `Vertex ${ed.id}`;
  const edState = !editor ? "free" : editor.kind === "vertex"
    ? (locks.pinned.includes(editor.id) ? "user" : "free") : dl.state[editor.id];
  const edComputed = !!editor && editor.kind !== "vertex" && edState === "auto";
  // After a typed value changes the geometry, refit only if a vertex left the
  // canvas or the triangle shrank to a speck — a deliberate zoom is otherwise kept.
  const keepInView = (P) => {
    const m = 60, X = ["A", "B", "C"].map((v) => i2x(P[v].x)), Y = ["A", "B", "C"].map((v) => i2y(P[v].y));
    const out = X.some((x) => x < m || x > W - m) || Y.some((y) => y < m || y > H - m);
    const tiny = Math.max(Math.max(...X) - Math.min(...X), Math.max(...Y) - Math.min(...Y)) < 0.2 * Math.min(W, H);
    if (out || tiny) { const f = fitView(P, W, H, FIT_PAD, MIN_PPI, MAX_PPI, MARGIN); setPxPerInch(f.ppi); setPan(f.pan); }
  };
  // Apply the draft. Returns the resulting locks (unchanged when the draft is
  // empty), or null when the typed value can't be parsed or is out of range.
  const applyEdit = () => {
    if (!editor) return locks;
    const d = draft;
    if (editor.kind === "vertex") {
      const v = editor.id, hasX = d.x.trim() !== "", hasY = d.y.trim() !== "";
      if (!hasX && !hasY) return locks;
      const nx = hasX ? parseCoord(d.x, unit) : pts[v].x;
      const nyUp = hasY ? parseCoord(d.y, unit) : -pts[v].y;
      if (!Number.isFinite(nx) || !Number.isFinite(nyUp)) return null;
      commitHistory(snapNow());
      const np = solve({ ...pts, [v]: { x: nx, y: -nyUp } }, locks, v, 160);
      setPts(np); keepInView(np);
      setDraft({ v: "", x: "", y: "", f: "x" });
      return locks;
    }
    if (d.v.trim() === "") return locks;
    let nl;
    if (editor.kind === "edge") {
      const val = parseToBase(d.v, unit);
      if (!Number.isFinite(val) || val <= 0) return null;
      nl = { ...locks, edgeLen: { ...locks.edgeLen, [SIDE_KEY[editor.id]]: val } };
    } else {
      const val = parseFloat(d.v);
      if (!Number.isFinite(val) || val <= 0 || val >= 180) return null;
      nl = { ...locks, vertexAngle: { ...locks.vertexAngle, [editor.id]: val } };
    }
    commitHistory(snapNow());
    const np = solve(pts, nl, null, 120);
    setLocks(nl); setPts(np); keepInView(np);
    setDraft({ v: "", x: "", y: "", f: "v" });
    return nl;
  };
  const doSet = () => { const r = applyEdit(); if (r === null) { setDraftErr(true); return; } closeEditor(); };
  // Next (phone keypad): jump to the next still-FREE value, the fastest path to a
  // solved triangle; closes once nothing is left to enter. Tab (desktop): next editable.
  const goNext = (dir) => {
    if (!editor) return;
    const r = applyEdit();
    if (r === null) { setDraftErr(true); return; }
    if (editor.kind === "vertex") { openEditor({ kind: "vertex", id: nextTarget(["A", "B", "C"], editor.id, () => true, dir) }, false); return; }
    const d2 = deriveLocks(r, s);
    const nt = nextTarget(EDIT_ORDER, editor.id, isTouch ? (t) => d2.state[t] === "free" : (t) => d2.state[t] !== "auto", dir);
    if (!nt) { closeEditor(); return; }
    openEditor({ kind: itemKind(nt), id: nt }, false);
  };
  const toggleEditorLock = () => {
    if (!editor) return;
    const hasDraft = editor.kind === "vertex" ? false : draft.v.trim() !== "";
    if (editor.kind !== "vertex" && edState !== "user" && hasDraft) { if (applyEdit() === null) setDraftErr(true); return; }
    if (editor.kind === "edge") toggleEdgeLock(SIDE_KEY[editor.id]);
    else if (editor.kind === "angle") toggleAngleLock(editor.id);
    else togglePin(editor.id);
  };
  const unlockItem = (t) => (itemKind(t) === "edge" ? toggleEdgeLock(SIDE_KEY[t]) : toggleAngleLock(t));
  const pressKey = (k) => { setDraftErr(false); setDraft((d) => ({ ...d, [d.f]: keypadApply(d[d.f], k) })); };
  const onEdKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); doSet(); }
    else if (e.key === "Escape") { e.preventDefault(); closeEditor(); }
    else if (e.key === "Tab") {
      const f = e.target && e.target.dataset ? e.target.dataset.f : undefined;
      if (editor && editor.kind === "vertex" && ((f === "x" && !e.shiftKey) || (f === "y" && e.shiftKey))) return; // native X<->Y
      e.preventDefault(); goNext(e.shiftKey ? -1 : 1);
    }
  };
  const edCurrent = (ed) => ed.kind === "edge" ? fmt(s[ed.id]) : `${ang[ed.id].toFixed(2)}\u00B0`;
  const kp = !editor || edComputed ? [] : editor.kind === "angle"
    ? ["7", "8", "9", "\u232B", "4", "5", "6", "", "1", "2", "3", "", ".", "0", "", ""]
    : system === "imperial"
      ? ["7", "8", "9", "\u232B", "4", "5", "6", "\u2032", "1", "2", "3", "\u2033", ".", "0", "/", "-"]
      : ["7", "8", "9", "\u232B", "4", "5", "6", "", "1", "2", "3", "", ".", "0", "", editor.kind === "vertex" ? "-" : ""];
  const renderHead = () => (
    <div className="tc-ed-head">
      <span className="tc-ed-title">{editorLabel(editor)}</span>
      {!edComputed && (
        <button className={`tc-btn tc-pill${edState === "user" ? (editor.kind === "edge" ? " is-on" : " is-on-cyan") : ""}`} onClick={toggleEditorLock}>
          {editor.kind === "vertex"
            ? (edState === "user" ? <><Pin size={13} />Pinned</> : <><PinOff size={13} />Pin</>)
            : (edState === "user" ? <><Lock size={13} />Locked</> : <><Unlock size={13} />Lock</>)}
        </button>
      )}
      <button className="tc-btn tc-ed-x" onClick={closeEditor} aria-label="Close editor">{"\u00D7"}</button>
    </div>
  );
  const renderFields = (native) => {
    if (editor.kind === "vertex") {
      const cur = { x: decimalInUnit(pts[editor.id].x), y: decimalInUnit(-pts[editor.id].y) };
      return (
        <div className="tc-ed-xy">
          {["x", "y"].map((f) => native ? (
            <label key={f} className="tc-ed-lbl">{f.toUpperCase()}
              <input className={`tc-ed-in${draftErr ? " is-err" : ""}`} data-f={f} autoFocus={f === "x"} value={draft[f]}
                placeholder={cur[f].toFixed(3)} onKeyDown={onEdKey}
                onChange={(e) => { setDraftErr(false); const val = e.target.value; setDraft((d) => ({ ...d, [f]: val, f })); }} />
            </label>
          ) : (
            <button key={f} className={`tc-ed-field${draft.f === f ? " is-active" : ""}${draftErr ? " is-err" : ""}`}
              onClick={() => setDraft((d) => ({ ...d, f }))}>
              <span className="tc-ed-lbl">{f.toUpperCase()}</span>
              {draft[f] || <span className="tc-ed-ph">{cur[f].toFixed(3)}</span>}
              {draft.f === f && <span className="tc-caret" />}
            </button>
          ))}
        </div>
      );
    }
    return native ? (
      <input className={`tc-ed-in${draftErr ? " is-err" : ""}`} autoFocus value={draft.v} placeholder={edCurrent(editor)} onKeyDown={onEdKey}
        onChange={(e) => { setDraftErr(false); const val = e.target.value; setDraft((d) => ({ ...d, v: val })); }} />
    ) : (
      <div className={`tc-ed-field is-active${draftErr ? " is-err" : ""}`}>
        {draft.v || <span className="tc-ed-ph">{edCurrent(editor)}</span>}<span className="tc-caret" />
      </div>
    );
  };
  const renderComputed = () => (
    <div className="tc-ed-computed">
      <div className="tc-ed-value">{edCurrent(editor)}</div>
      <div className="tc-ed-note">Computed from your inputs. Unlock one of them to change this value.</div>
      <div className="tc-ed-chips">
        {EDIT_ORDER.filter((t) => dl.state[t] === "user").map((t) => (
          <button key={t} className="tc-btn tc-chip" onClick={() => unlockItem(t)}>Unlock {t}</button>
        ))}
        {locks.pinned.map((v) => (
          <button key={"p" + v} className="tc-btn tc-chip" onClick={() => togglePin(v)}>Unpin {v}</button>
        ))}
      </div>
    </div>
  );
  const renderSheet = () => (
    <div className="tc-sheet" role="dialog" aria-label={editorLabel(editor)}>
      <div className="tc-sheet-grip" />
      {renderHead()}
      {edComputed ? renderComputed() : (
        <>
          {renderFields(false)}
          <div className="tc-keypad">
            {kp.map((k, i) => k ? (
              <button key={i} className={`tc-key${"\u2032\u2033/-".includes(k) ? " is-mark" : ""}`}
                onPointerDown={(e) => { e.preventDefault(); pressKey(k); }}>{k}</button>
            ) : <span key={i} />)}
          </div>
          <div className="tc-ed-actions">
            <button className="tc-btn tc-set" onClick={doSet}>{"Set \u2713"}</button>
            <button className="tc-btn tc-next" onClick={() => goNext(1)}>{"Next \u203A"}</button>
          </div>
        </>
      )}
    </div>
  );
  const renderPopover = () => {
    const S = (p) => ({ x: i2x(p.x), y: i2y(p.y) });
    let a;
    if (editor.kind === "edge") {
      const [u, w] = SIDE_ENDS[editor.id];
      const P = S(pts[u]), Q = S(pts[w]), n = outwardNormal(P, Q, S(centroidOf(pts)));
      a = { x: (P.x + Q.x) / 2 + n.x * 36, y: (P.y + Q.y) / 2 + n.y * 36 };
    } else a = S(pts[editor.id]);
    const PW = 280, below = a.y < H / 2;
    const style = {
      width: PW, left: 10 + clampNum(a.x - PW / 2, 4, Math.max(4, W - PW - 4)),
      top: 10 + (below ? a.y + 30 : a.y - 30), transform: below ? undefined : "translateY(-100%)",
    };
    return (
      <div key={`${editor.kind}-${editor.id}`} className="tc-pop" style={style} onPointerDown={(e) => e.stopPropagation()}>
        {renderHead()}
        {edComputed ? renderComputed() : (
          <>
            {renderFields(true)}
            <div className="tc-ed-actions"><button className="tc-btn tc-set" onClick={doSet}>{"Set \u2713"}</button></div>
            <div className="tc-ed-hint">Enter set {"\u00B7"} Tab next {"\u00B7"} Esc close</div>
          </>
        )}
      </div>
    );
  };
  // Zoom buttons. Multiplicative step (×√2 per click). Re-centers the zoom on
  // the canvas center so the visible portion stays roughly anchored.
  const zoomInBtn = () => {
    const np = zoomStep(pxPerInch, +1, MIN_PPI, MAX_PPI, ZOOM_STEP);
    viewTouchedRef.current = true;
    const center = { x: W / 2, y: H / 2 };
    const no = zoomAt(center, origin, pxPerInch, np);
    setPxPerInch(np);
    setPan({ x: no.x - MARGIN, y: no.y - MARGIN });
  };
  const zoomOutBtn = () => {
    const np = zoomStep(pxPerInch, -1, MIN_PPI, MAX_PPI, ZOOM_STEP);
    viewTouchedRef.current = true;
    const center = { x: W / 2, y: H / 2 };
    const no = zoomAt(center, origin, pxPerInch, np);
    setPxPerInch(np);
    setPan({ x: no.x - MARGIN, y: no.y - MARGIN });
  };
  const recenter = () => {
    const f = fitView(pts, W, H, FIT_PAD, MIN_PPI, MAX_PPI, MARGIN);
    setPxPerInch(f.ppi); setPan(f.pan);
  };
  const switchSystem = (sys) => { const u = DEFAULT_UNIT[sys]; setSystem(sys); setUnit(u); setGridStep(DEFAULT_GRID_INCHES[u]); setEdits({}); };
  const switchUnit = (u) => { setUnit(u); setGridStep(DEFAULT_GRID_INCHES[u]); setEdits({}); };
  const fmt = (bi) => formatLength(bi, system, unit, denom, decimals);
  const decimalInUnit = (bi) => bi / INCH_PER[unit];

  const edgeKeyForSide = { a: "BC", b: "CA", c: "AB" };
  const constraintCount = Object.keys(locks.edgeLen).length + Object.keys(locks.vertexAngle).length + locks.pinned.length;

  function arcPath(vtx, e1, e2, r = 24) {
    const O = pts[vtx], P1 = pts[e1], P2 = pts[e2];
    const a1 = Math.atan2(P1.y - O.y, P1.x - O.x);
    const a2 = Math.atan2(P2.y - O.y, P2.x - O.x);
    const ox = i2x(O.x), oy = i2y(O.y);
    const x1 = ox + r * Math.cos(a1), y1 = oy + r * Math.sin(a1);
    const x2 = ox + r * Math.cos(a2), y2 = oy + r * Math.sin(a2);
    let diff = a2 - a1; while (diff <= -Math.PI) diff += 2 * Math.PI; while (diff > Math.PI) diff -= 2 * Math.PI;
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 0 ${diff > 0 ? 1 : 0} ${x2} ${y2}`, mid: { ang: a1 + diff / 2, ox, oy } };
  }

  const VERTS = [["A", "B", "C"], ["B", "A", "C"], ["C", "A", "B"]];
  const bgCursor =
    interaction?.type === "rotate" ? ROTATE_CURSOR :
    interaction?.type === "pan" ? "grabbing" :
    (canRotate && hoverZone === "near") ? ROTATE_CURSOR : "grab";

  // drawn graph-paper spacing: follows zoom when gridAuto, otherwise active unit.
  // (autoGrid and effectiveGridInches are computed via useMemo earlier in the component.)
  const minorPx = autoGrid
    ? autoGrid.gridInches * pxPerInch
    : DISPLAY_GRID[unit].minor * INCH_PER[unit] * pxPerInch;
  const majorPx = autoGrid
    ? autoGrid.majorInches * pxPerInch
    : DISPLAY_GRID[unit].major * INCH_PER[unit] * pxPerInch;
  const showMinor = minorPx >= 6;

  // Desktop "fit" mode: when the window is wide enough for the side-by-side layout
  // and tall enough to be worth constraining, lock the app to the viewport height so
  // everything is visible without scrolling. Narrow/mobile keeps natural scrolling.
  const fitMode = !isTouch && viewport.w >= 900;
  const isPhone = isTouch && Math.min(viewport.w, viewport.h) < 600;
  const pad = fitMode ? 14 : 18;

  // Explicit canvas height so the footer controls always have room.
  // FIT MODE: fill the row minus the footer. STACKED: a capped fraction of the viewport
  // (shorter than the window, allowed to be rectangular/wide).
  const FOOTER_H = 104;        // toggles row + hint text + zoom row
  const canvasMaxH = fitMode
    ? Math.max(240, viewport.h - 2 * pad - 34 /*header*/ - 17 /*divider*/ - 2 * 10 /*card pad*/ - FOOTER_H)
    : Math.max(260, Math.min(440, Math.round(viewport.h * 0.42)));

  return (
    <div style={{
      background: C.bg, color: C.ink, fontFamily: FONT_MONO,
      minHeight: "100vh",
      padding: pad, boxSizing: "border-box", overflow: fitMode ? "visible" : undefined,
      backgroundImage: "radial-gradient(circle at 20% 0%, #14202b 0%, rgba(11,14,19,0) 45%)",
      backgroundColor: C.bg, backgroundRepeat: "no-repeat", backgroundAttachment: "fixed",
    }} className="tc-root">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        html,body{background:${C.bg};margin:0;}
        .tc-root{min-height:100dvh;}
        .tc-app{max-width:1600px;margin:0 auto;display:flex;flex-direction:column;}
        .tc-header{display:flex;align-items:baseline;gap:14px;margin-bottom:4px;flex-wrap:wrap;}
        .tc-title{font-family:${FONT_DISP};font-weight:600;margin:0;letter-spacing:-0.5px;}
        .tc-subtitle{color:${C.dim};font-size:12px;letter-spacing:1px;}
        .tc-version{color:${C.dim};font-size:11px;}
        .tc-head-end{margin-left:auto;display:flex;align-items:center;gap:12px}
        .tc-nav{position:relative}
        .tc-nav-link{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:4px 12px;border-radius:999px;border:1px solid ${C.line};background:${C.panel};color:${C.brass};font-family:${FONT_MONO};font-size:12px;text-decoration:none;cursor:pointer;white-space:nowrap;box-sizing:border-box}
        .tc-nav-link:hover,.tc-nav-link:focus-visible{border-color:${C.brass};outline:none}
        @media (pointer: coarse){ .tc-nav-link{min-height:44px;font-size:13px;padding:4px 14px} }
        .tc-nav-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:60;min-width:260px;padding:6px;border-radius:12px;background:${C.panel2};border:1px solid ${C.line};box-shadow:0 16px 36px -10px #000}
        .tc-nav-item{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:48px;padding:8px 12px;border-radius:8px;box-sizing:border-box;text-decoration:none;color:${C.ink}}
        .tc-nav-item b{font-family:${FONT_DISP};font-weight:600;font-size:15px}
        .tc-nav-item small{font-family:${FONT_MONO};font-size:11px;color:${C.dim}}
        a.tc-nav-item:hover,a.tc-nav-item:focus-visible{background:${C.bg};outline:none}
        .tc-nav-item.is-current b{color:${C.brass}}
        .tc-rule{height:1px;background:linear-gradient(90deg,${C.brass},transparent);margin-bottom:16px;opacity:0.5;}
        .tc-cols{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;min-height:0;}
        .tc-canvas-card{background:${C.panel};border:1px solid ${C.line};border-radius:12px;padding:10px;box-shadow:0 18px 40px -20px #000;flex:1 1 520px;min-width:320px;display:flex;flex-direction:column;}
        .tc-controls{flex:1 1 320px;min-width:300px;display:flex;flex-direction:column;gap:14px;}
        .tc-footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;}
        .tc-hint{margin-top:8px;font-size:10.5px;color:${C.faint};line-height:1.6;}
        .tc-zoom{display:flex;align-items:center;gap:6px;margin-left:auto;}
        .tc-zoom-btn{width:26px;height:26px;padding:0;display:grid;place-items:center;font-family:${FONT_MONO};font-size:14px;font-weight:600;background:${C.bg};color:${C.dim};border:1px solid ${C.line};border-radius:5px;cursor:pointer;}
        .tc-zoom-btn:disabled{opacity:0.4;cursor:default;color:${C.faint};}
        .tc-zoom-btn:disabled:hover{border-color:${C.line}!important;color:${C.faint}!important;}

        .tc-btn{cursor:pointer;transition:all .15s ease;user-select:none}
        .tc-btn:hover{border-color:${C.brass}!important;color:${C.brass}!important}
        .tc-vtx{cursor:crosshair}.tc-vtx:active{cursor:crosshair}
        .tc-body{cursor:${hasPins ? "not-allowed" : "move"}}
        input.tc-in{background:${C.bg};border:1px solid ${C.line};color:${C.ink};font-family:${FONT_MONO};border-radius:5px;padding:4px 6px;width:74px;font-size:12px;outline:none}
        input.tc-in:focus{border-color:${C.brass}}

        /* base "flat" button used by toggles, recenter, undo/redo/reset */
        .tc-flat{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:7px;font-size:12px;background:${C.bg};color:${C.dim};border:1px solid ${C.line};font-family:${FONT_MONO};cursor:pointer;}
        .tc-flat[disabled],.tc-flat.is-disabled{color:${C.faint};opacity:0.5;cursor:default;}
        .tc-flat.is-on{background:${C.brass};color:${C.bg};border-color:${C.brass};}
        .tc-flat.is-on-cyan{background:${C.cyan};color:${C.bg};border-color:${C.cyan};}

        /* small "chip" button used by system/scale/denom/decimals selectors */
        .tc-chip{background:${C.bg};color:${C.dim};border:1px solid ${C.line};border-radius:5px;font-size:11px;padding:3px 8px;font-family:${FONT_MONO};cursor:pointer;}
        .tc-chip.is-on{background:${C.brass};color:${C.bg};border-color:${C.brass};}
        .tc-chip.is-on-cyan{background:${C.cyan};color:${C.bg};border-color:${C.cyan};}

        /* Section/Row/Glyph */
        .tc-section{background:${C.panel};border:1px solid ${C.line};border-radius:12px;overflow:hidden;box-shadow:0 12px 30px -22px #000;}
        .tc-section-head{display:flex;align-items:baseline;justify-content:space-between;padding:10px 14px;border-bottom:1px solid ${C.line};background:${C.panel2};}
        .tc-section-title{font-family:${FONT_DISP};font-size:16px;font-weight:600;letter-spacing:0.3px;}
        .tc-section-hint{font-size:10.5px;color:${C.faint};letter-spacing:0.5px;}
        .tc-section-body{padding:8px 12px;display:flex;flex-direction:column;gap:8px;}
        .tc-row{display:flex;align-items:center;gap:10px;}
        .tc-row-label{flex:1;color:${C.dim};font-size:12px;}
        .tc-row-chips{display:flex;gap:4px;flex-wrap:wrap;}
        .tc-glyph{width:26px;height:26px;flex-shrink:0;border-radius:6px;display:grid;place-items:center;background:#0c1016;border:1px solid ${C.line};font-family:${FONT_DISP};font-style:italic;font-size:15px;}
        .tc-readout{flex:1;min-width:0;}
        .tc-readout-main{color:${C.ink};font-size:13px;}
        .tc-readout-sub{color:${C.faint};font-size:10px;}
        .tc-coord{flex:1;color:${C.faint};font-size:11px;}
        .tc-select{background:${C.bg};color:${C.ink};border:1px solid ${C.line};border-radius:5px;padding:4px 6px;font-family:${FONT_MONO};font-size:12px;}
        .tc-warn{color:${C.red};font-size:11px;margin-top:4px;}

        /* lock toggle square */
        .tc-lock{width:32px;height:30px;display:grid;place-items:center;border-radius:6px;background:${C.bg};color:${C.dim};border:1px solid ${C.line};cursor:pointer;}
        .tc-lock.is-on{background:${C.brass};color:${C.bg};border-color:${C.brass};}
        .tc-lock.is-on-cyan{background:${C.cyan};color:${C.bg};border-color:${C.cyan};}

        .tc-canvas-card{position:relative}
        .tc-tap{cursor:pointer}
        .tc-status{position:absolute;top:18px;left:18px;padding:3px 10px;border-radius:999px;border:1px solid ${C.line};background:${C.panel2}e6;font-size:12px;font-family:${FONT_MONO};pointer-events:none}
        @media (pointer: coarse){ input.tc-in, select.tc-select{font-size:16px} }
        .tc-details{justify-content:center}
        .tc-lock.is-auto{background:transparent;color:${C.brassMute};border-style:dashed;cursor:default}
        .tc-lock.is-auto:hover{border-color:${C.line}!important;color:${C.brassMute}!important}
        .tc-ed-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
        .tc-ed-title{flex:1;font-family:${FONT_DISP};font-size:16px;font-weight:600;color:${C.ink}}
        .tc-pill{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:999px;font-size:12px;font-family:${FONT_MONO};background:${C.bg};color:${C.dim};border:1px solid ${C.line};cursor:pointer}
        .tc-pill.is-on{background:${C.brass};color:${C.bg};border-color:${C.brass}}
        .tc-pill.is-on-cyan{background:${C.cyan};color:${C.bg};border-color:${C.cyan}}
        .tc-ed-x{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:transparent;color:${C.dim};border:1px solid ${C.line};font-size:20px;line-height:1;cursor:pointer}
        .tc-ed-field,.tc-ed-in{display:flex;align-items:center;width:100%;box-sizing:border-box;min-height:46px;padding:0 12px;border-radius:9px;background:${C.bg};border:1.5px solid ${C.line};color:${C.ink};font-family:${FONT_MONO};font-size:20px;outline:none;text-align:left}
        .tc-ed-field.is-active,.tc-ed-in:focus{border-color:${C.brass}}
        .tc-ed-field.is-err,.tc-ed-in.is-err{border-color:${C.red}}
        .tc-ed-ph{color:${C.faint}}
        .tc-caret{display:inline-block;width:2px;height:22px;margin-left:2px;background:${C.brass};animation:tcBlink 1s steps(1) infinite}
        @keyframes tcBlink{50%{opacity:0}}
        .tc-ed-xy{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .tc-ed-xy .tc-ed-field,.tc-ed-xy .tc-ed-in{font-size:17px;gap:8px}
        .tc-ed-lbl{font-size:12px;color:${C.dim};font-family:${FONT_MONO}}
        label.tc-ed-lbl{display:flex;flex-direction:column;gap:4px}
        .tc-ed-actions{display:flex;gap:8px;margin-top:10px}
        .tc-set{flex:2;min-height:48px;border-radius:10px;background:${C.brass};color:${C.bg};border:none;font-family:${FONT_MONO};font-size:15px;font-weight:600;cursor:pointer}
        .tc-next{flex:1;min-height:48px;border-radius:10px;background:transparent;color:${C.brass};border:1.5px solid ${C.brass};font-family:${FONT_MONO};font-size:14px;font-weight:600;cursor:pointer}
        .tc-ed-computed{display:flex;flex-direction:column;gap:8px}
        .tc-ed-value{font-family:${FONT_MONO};font-size:22px;color:${C.brassMute}}
        .tc-ed-note{font-size:12px;color:${C.dim};line-height:1.5}
        .tc-ed-chips{display:flex;flex-wrap:wrap;gap:6px}
        .tc-ed-hint{margin-top:8px;font-size:10.5px;color:${C.faint}}
        .tc-sheet{position:fixed;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;z-index:50;background:${C.panel2};border:1px solid ${C.line};border-bottom:none;border-radius:18px 18px 0 0;padding:8px 14px calc(12px + env(safe-area-inset-bottom, 0px));box-shadow:0 -18px 40px -12px #000;font-family:${FONT_MONO}}
        .tc-sheet-grip{width:40px;height:4px;border-radius:2px;background:${C.line};margin:0 auto 10px}
        .tc-keypad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
        .tc-key{min-height:48px;border-radius:10px;background:${C.bg};color:${C.ink};border:1px solid ${C.line};font-family:${FONT_MONO};font-size:21px;touch-action:manipulation;user-select:none;-webkit-user-select:none}
        .tc-key:active{background:${C.line}}
        .tc-key.is-mark{color:${C.brass};font-size:25px}
        body.tc-sheet-open #bmc-wbtn{display:none!important}
        body.tc-sheet-open .tc-root{padding-bottom:440px}
        .tc-pop{position:absolute;z-index:40;padding:12px;border-radius:12px;background:${C.panel2};border:1px solid ${C.brass}66;box-shadow:0 16px 36px -10px #000;font-family:${FONT_MONO};box-sizing:border-box}
        .tc-pop .tc-ed-in{font-size:18px}
        .tc-pop .tc-ed-title{font-size:14px}
        ::selection{background:${C.brass};color:${C.bg}}`}</style>

      <div className="tc-app" style={{ height: fitMode ? "100%" : undefined, minHeight: fitMode ? 0 : "calc(100vh - 40px)" }}>
        <div className="tc-header">
          <h1 className="tc-title" style={{ fontSize: fitMode ? 24 : 30 }}>
            Triangle<span style={{ color: C.brass }}>·</span>Buddy
          </h1>
          <span className="tc-subtitle">INTERACTIVE GEOMETRY · {system === "imperial" ? `IMPERIAL 1/${denom}"` : `METRIC ${decimals}dp`} · {UNIT_LABEL[unit].toUpperCase()}</span>
          <div className="tc-head-end">
            <ToolNav tools={BUDDY_TOOLS} currentId="triangle" />
            <span className="tc-version">v1.17.0</span>
          </div>
        </div>
        <div className="tc-rule" />

        <div className="tc-cols" style={{ flex: fitMode ? "1 1 auto" : undefined }}>
          {/* ---- canvas ---- */}
          <div className="tc-canvas-card">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
              onPointerMove={onHover}
              onPointerLeave={() => setHoverZone("far")}
              style={{ width: "100%", height: canvasMaxH, maxHeight: canvasMaxH, display: "block", touchAction: "none", flex: "0 0 auto" }}>
              <defs>
                <pattern id="minor" width={minorPx} height={minorPx} patternUnits="userSpaceOnUse" x={origin.x} y={origin.y}>
                  <path d={`M ${minorPx} 0 L 0 0 0 ${minorPx}`} fill="none" stroke="#222b38" strokeWidth="1" />
                </pattern>
                <pattern id="major" width={majorPx} height={majorPx} patternUnits="userSpaceOnUse" x={origin.x} y={origin.y}>
                  <path d={`M ${majorPx} 0 L 0 0 0 ${majorPx}`} fill="none" stroke="#2f3a4c" strokeWidth="1" />
                </pattern>
                <linearGradient id="tfill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={C.brass} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={C.cyan} stopOpacity="0.07" />
                </linearGradient>
                <clipPath id="frame"><rect x="0" y="0" width={W} height={H} rx="6" /></clipPath>
              </defs>

              <g clipPath="url(#frame)">
                {/* background grids = pan surface.
                    Minor pattern renders UNDERNEATH the major pattern as a
                    separate fill (NOT nested inside the major pattern). When
                    a pattern is referenced inside another pattern, the inner
                    pattern's x/y are interpreted in the OUTER pattern's local
                    tile space, not SVG root user space — which shifts minor
                    grid lines by `origin.x mod minorPx` away from major lines.
                    Sibling fills both reference `origin` in SVG root space,
                    so they align exactly. Only the major rect carries pointer
                    events; the minor rect is decoration. */}
                {showMinor && <rect x="0" y="0" width={W} height={H} fill="url(#minor)" pointerEvents="none" />}
                <rect x="0" y="0" width={W} height={H} fill="url(#major)" style={{ cursor: bgCursor }} onPointerDown={startBackground} />
                {/* axes (origin lines) */}
                <line x1={origin.x} y1="0" x2={origin.x} y2={H} stroke={C.faint} strokeWidth="1" strokeDasharray="2 4" pointerEvents="none" />
                <line x1="0" y1={origin.y} x2={W} y2={origin.y} stroke={C.faint} strokeWidth="1" strokeDasharray="2 4" pointerEvents="none" />

                {/* triangle body = move handle */}
                <polygon className="tc-body"
                  points={`${i2x(pts.A.x)},${i2y(pts.A.y)} ${i2x(pts.B.x)},${i2y(pts.B.y)} ${i2x(pts.C.x)},${i2y(pts.C.y)}`}
                  fill="url(#tfill)" stroke={valid ? C.brass : C.red} strokeWidth="2" strokeLinejoin="round"
                  onPointerDown={startBody} />

                {/* rotate cue: one rotate icon per vertex, anchored along each
                    vertex's EXTERNAL angle bisector. Always visible when canRotate
                    (no hover dependence — same affordance on desktop and touch).
                    No persistent halo (some triangle shapes made it look distorted). */}
                {canRotate && (() => {
                  const VTRI = ["A", "B", "C"];
                  const NB = { A: ["B", "C"], B: ["A", "C"], C: ["A", "B"] };
                  return VTRI.map((v) => {
                    const [p, q] = NB[v];
                    const Vs = { x: i2x(pts[v].x), y: i2y(pts[v].y) };
                    const Ps = { x: i2x(pts[p].x), y: i2y(pts[p].y) };
                    const Qs = { x: i2x(pts[q].x), y: i2y(pts[q].y) };
                    const b = externalBisector(Vs, Ps, Qs);
                    // 46 px past the vertex: clears the 9-14 px vertex disc, the
                    // 13 px vertex letter at offset 18 (so letter extends to ~24 px
                    // from vertex), leaving ~22 px of breathing room before the icon.
                    const ICON_OFF = 52;
                    const ax = Vs.x + b.x * ICON_OFF;
                    const ay = Vs.y + b.y * ICON_OFF;
                    return <RotateIcon key={"rot" + v} x={ax} y={ay} r={11} color={C.cyan} />;
                  });
                })()}

                {/* rotation pivot indicator */}
                {interaction?.type === "rotate" && (
                  <g pointerEvents="none">
                    <circle cx={i2x(interaction.pivot.x)} cy={i2y(interaction.pivot.y)} r="4" fill={C.cyan} />
                    <circle cx={i2x(interaction.pivot.x)} cy={i2y(interaction.pivot.y)} r="9" fill="none" stroke={C.cyan} strokeWidth="1" opacity="0.6" />
                  </g>
                )}

                {/* angle arcs + labels (clamped). Tap a label to edit that angle.
                    user = bright + heavy arc; auto (computed) = muted + dashed arc. */}
                {VERTS.map(([v, e1, e2]) => {
                  const { d, mid } = arcPath(v, e1, e2, 24);
                  const R = isTouch ? 50 : 44;
                  const raw = { x: mid.ox + R * Math.cos(mid.ang), y: mid.oy + R * Math.sin(mid.ang) };
                  const txt = `${ang[v].toFixed(1)}\u00B0`;
                  const hw = txt.length * 4.4 + 8, hh = isTouch ? 16 : 11;
                  const p = clampLabel(raw.x, raw.y, hw, hh, W, H);
                  const st = dl.state[v], editing = !!editor && editor.kind === "angle" && editor.id === v;
                  const col = st === "auto" ? C.cyanMute : C.cyan;
                  return (
                    <g key={"ang" + v}>
                      <path d={d} fill="none" stroke={st === "free" ? C.dim : col} strokeWidth={st === "user" ? 2.5 : 1.5} strokeDasharray={st === "auto" ? "3 3" : undefined} pointerEvents="none" />
                      <g className="tc-tap" data-ed={"angle-" + v} onPointerDown={startTap({ kind: "angle", id: v })}>
                        <rect x={p.x - hw} y={p.y - hh} width={hw * 2} height={hh * 2} rx="6"
                          fill={editing ? C.panel2 : "transparent"} stroke={editing ? C.cyan : "none"} strokeWidth="1.5" />
                        <text x={p.x} y={p.y} fill={col} fontSize="14" fontWeight={st === "user" ? 600 : 400} fontFamily={FONT_MONO} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">{txt}</text>
                      </g>
                    </g>
                  );
                })}

                {/* edge length labels — offset along the outward normal so they sit outside the triangle.
                    Offset is dynamic: the box's projection in the normal direction is
                    |n.x|*halfW + |n.y|*halfH, so we use that + a small gap. This keeps
                    the nearest edge of the label box a constant distance from the triangle
                    edge regardless of normal orientation (otherwise diagonal-normal boxes
                    overlap the edge they're labeling). */}
                {[["c", pts.A, pts.B], ["a", pts.B, pts.C], ["b", pts.C, pts.A]].map(([k, p, q]) => {
                  const mx = i2x((p.x + q.x) / 2), my = i2y((p.y + q.y) / 2);
                  // outward normal in screen space (computed from screen-space vertex positions
                  // and screen-space centroid so it's correct regardless of pan/zoom/winding).
                  const PA = { x: i2x(pts.A.x), y: i2y(pts.A.y) };
                  const PB = { x: i2x(pts.B.x), y: i2y(pts.B.y) };
                  const PC = { x: i2x(pts.C.x), y: i2y(pts.C.y) };
                  const cen = { x: (PA.x + PB.x + PC.x) / 3, y: (PA.y + PB.y + PC.y) / 3 };
                  const Pscr = { x: i2x(p.x), y: i2y(p.y) }, Qscr = { x: i2x(q.x), y: i2y(q.y) };
                  const n = outwardNormal(Pscr, Qscr, cen);
                  const txt = fmt(s[k]);
                  const halfW = Math.max(26, txt.length * 4.6 + 10), halfH = 19;
                  const EDGE_GAP = 8; // px of breathing room between box and edge
                  const OFFSET = Math.abs(n.x) * halfW + Math.abs(n.y) * halfH + EDGE_GAP;
                  const c0 = clampLabel(mx + n.x * OFFSET, my + n.y * OFFSET, halfW, halfH, W, H);
                  const st = dl.state[k], editing = !!editor && editor.kind === "edge" && editor.id === k;
                  const stroke = editing || st === "user" ? C.brass : st === "auto" ? C.brassMute : C.line;
                  const hitH = isTouch ? Math.max(halfH, 22) : halfH; // 44 px tall target on touch
                  return (
                    <g key={"len" + k} className="tc-tap" data-ed={"edge-" + k} onPointerDown={startTap({ kind: "edge", id: k })}>
                      <rect x={c0.x - halfW} y={c0.y - hitH} width={halfW * 2} height={hitH * 2} fill="transparent" />
                      {editing && <rect x={c0.x - halfW - 3} y={c0.y - halfH - 3} width={halfW * 2 + 6} height={halfH * 2 + 6} rx="8" fill="none" stroke={C.brass} strokeOpacity="0.35" strokeWidth="5" pointerEvents="none" />}
                      <rect x={c0.x - halfW} y={c0.y - halfH} width={halfW * 2} height={halfH * 2} rx="6" fill={C.panel2} stroke={stroke} strokeWidth={st === "free" && !editing ? 1 : 1.5} strokeDasharray={st === "auto" && !editing ? "4 3" : undefined} opacity="0.97" pointerEvents="none" />
                      <text x={c0.x} y={c0.y - 7} fill={st === "auto" ? C.brassMute : C.brass} fontSize="12" fontFamily={FONT_DISP} fontStyle="italic" fontWeight="600" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">{k}</text>
                      <text x={c0.x} y={c0.y + 8} fill={st === "user" ? C.brass : st === "auto" ? C.brassMute : C.ink} fontSize="15" fontFamily={FONT_MONO} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">{txt}</text>
                    </g>
                  );
                })}

                {/* vertices */}
                {["A", "B", "C"].map((v) => {
                  const pinned = locks.pinned.includes(v);
                  const x = i2x(pts[v].x), y = i2y(pts[v].y);
                  // letter sits along the external angle bisector — the same outward
                  // ray the rotate icon uses, just closer in. 18 px past the vertex
                  // clears the 9-14 px disc.
                  const NB = { A: ["B", "C"], B: ["A", "C"], C: ["A", "B"] };
                  const [p, q] = NB[v];
                  const Ps = { x: i2x(pts[p].x), y: i2y(pts[p].y) };
                  const Qs = { x: i2x(pts[q].x), y: i2y(pts[q].y) };
                  const b = externalBisector({ x, y }, Ps, Qs);
                  const LETTER_OFF = 21;
                  const lp = clampLabel(x + b.x * LETTER_OFF, y + b.y * LETTER_OFF, 9, 9, W, H);
                  const editing = !!editor && editor.kind === "vertex" && editor.id === v;
                  const dr = isTouch ? 8 : 7;
                  return (
                    <g key={"v" + v} className="tc-vtx" data-ed={"vertex-" + v} onPointerDown={startVertex(v)}>
                      <circle cx={x} cy={y} r={isTouch ? 22 : 14} fill="transparent" />
                      {editing && <circle cx={x} cy={y} r={dr + 7} fill="none" stroke={C.brass} strokeOpacity="0.45" strokeWidth="4" pointerEvents="none" />}
                      <circle cx={x} cy={y} r={dr} fill={pinned ? C.cyan : C.brass} stroke={C.bg} strokeWidth="2" />
                      {pinned && <circle cx={x} cy={y} r={dr + 4} fill="none" stroke={C.cyan} strokeWidth="1.5" strokeDasharray="2 3" />}
                      <text x={lp.x} y={lp.y} fill={C.ink} fontSize="15" fontFamily={FONT_DISP} textAnchor="middle" fontWeight="600" pointerEvents="none" dominantBaseline="middle">{v}</text>
                    </g>
                  );
                })}
              </g>
              {/* frame border on top */}
              <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="6" fill="none" stroke={C.line} pointerEvents="none" />
            </svg>
            <div className="tc-status" style={{ color: solveStatus.c }}>{solveStatus.t}</div>
            {editor && !isTouch && renderPopover()}
            {editor && isTouch && renderSheet()}

            <div className="tc-footer">
              <Toggle on={gridSnap} onClick={() => setGridSnap(v => !v)} icon={<Grid3x3 size={13} />} label="Grid snap" />
              <Toggle on={orthoSnap} onClick={() => setOrthoSnap(v => !v)} icon={<Magnet size={13} />} label="Ortho snap" />
              <Toggle on={axisLock} onClick={() => setAxisLock(v => !v)} icon={<MoveHorizontal size={13} />} label="Axis lock" />
              <Toggle on={angleSnap} onClick={() => setAngleSnap(v => !v)} icon={<RotateCw size={13} />} label="15° snap" />
              <button className="tc-btn tc-flat" onClick={recenter}>
                <Hand size={13} /> Recenter view
              </button>
              <button className={`tc-btn tc-flat${history.length ? "" : " is-disabled"}`} onClick={undo} title="Undo (Ctrl/Cmd+Z)" disabled={!history.length}>
                <Undo2 size={13} /> Undo
              </button>
              <button className={`tc-btn tc-flat${future.length ? "" : " is-disabled"}`} onClick={redo} title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!future.length}>
                <Redo2 size={13} /> Redo
              </button>
              <button className="tc-btn tc-flat" onClick={reset} title="Reset to default">
                <RotateCcw size={13} /> Reset
              </button>
              <div className="tc-zoom">
                <Ruler size={13} color={C.dim} />
                <button className="tc-btn tc-zoom-btn" onClick={zoomOutBtn} disabled={pxPerInch <= MIN_PPI + 1e-6} title="Zoom out (×0.71)">−</button>
                <button className="tc-btn tc-zoom-btn" onClick={zoomInBtn} disabled={pxPerInch >= MAX_PPI - 1e-6} title="Zoom in (×1.41)">+</button>
              </div>
            </div>
            <div className="tc-hint">
              <span style={{ color: C.brass }}>tap a value or vertex to edit</span> · <Move size={11} style={{ verticalAlign: "-1px" }} /> drag inside to move
              {gridSnap && <span style={{ color: C.dim }}> (snaps nearest vertex)</span>} ·
              <span style={{ color: C.dim }}> drag just outside</span> to rotate{canRotate ? "" : " (off: 2+ pins)"} ·
              <span style={{ color: C.dim }}> drag far out</span> to pan ·
              {isTouch ? (
                <> use the <span style={{ color: C.dim }}>Axis lock</span> / <span style={{ color: C.dim }}>15° snap</span> toggles · pinch to zoom, two fingers to pan</>
              ) : (
                <>
                  <kbd style={kbd}>Shift</kbd>+scroll to zoom ·
                  <kbd style={kbd}>Shift</kbd> = axis-lock (vertex) / 15° snap (rotate) ·
                  <kbd style={kbd}>Ctrl/⌘+Z</kbd> undo
                </>
              )}
              {hasPins && <span style={{ color: C.cyan }}> · unpin to move</span>}
            </div>
          </div>

          {/* ---- control panel ---- */}
          <div style={fitMode ? {
            flex: "1 1 320px", minWidth: 300, maxWidth: 420, display: "flex", flexDirection: "column",
            gap: 10, overflowY: "auto", minHeight: 0, maxHeight: viewport.h - 2 * pad - 34 - 17,
          } : {
            flex: "1 1 300px", minWidth: 280, display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, alignContent: "start",
          }}>
            {isPhone && (
              <button className="tc-btn tc-flat tc-details" onClick={() => setShowDetails((v) => !v)}>
                {showDetails ? "Hide details \u25B4" : "Sides, angles, vertices \u25BE"}
              </button>
            )}
            {(!isPhone || showDetails) && (<>
            <Section title="Sides" hint={`length · ${system === "imperial" ? `1/${denom}"` : `${decimals} dp`} · ${UNIT_LABEL[unit]}`}>
              {[["a", "BC"], ["b", "CA"], ["c", "AB"]].map(([k, key]) => {
                const locked = locks.edgeLen[key] != null;
                return (
                  <Row key={k}>
                    <Glyph color={C.brass}>{k}</Glyph>
                    <div className="tc-readout">
                      <div className="tc-readout-main">{fmt(s[k])}</div>
                      <div className="tc-readout-sub">{decimalInUnit(s[k]).toFixed(4)} {UNIT_SYMBOL[unit]} · edge {key}{dl.state[k] === "auto" ? " · computed" : ""}</div>
                    </div>
                    <input className="tc-in" placeholder={`${decimalInUnit(s[k]).toFixed(unit === "in" ? 3 : 4)}`} value={edits["e" + key] ?? ""}
                      title={system === "imperial" ? `Accepts: 1' 7" 3/4 · 1ft 7in 3/4 · 1.5ft · 3-1/2 · 5/8" · or a number in ${UNIT_LABEL[unit]}` : `Decimal value in ${UNIT_LABEL[unit]}`}
                      onChange={e => setEdits(x => ({ ...x, ["e" + key]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && commitEdge(key)}
                      onBlur={() => edits["e" + key] != null && commitEdge(key)} />
                    <LockBtn state={dl.state[k]} onClick={() => toggleEdgeLock(key)} />
                  </Row>
                );
              })}
            </Section>

            <Section title="Angles" hint={`sum ${angSum.toFixed(2)}°`} hintColor={Math.abs(angSum - 180) < 0.05 ? C.dim : C.red}>
              {["A", "B", "C"].map((v) => {
                const locked = locks.vertexAngle[v] != null;
                return (
                  <Row key={v}>
                    <Glyph color={C.cyan}>{v}</Glyph>
                    <div className="tc-readout">
                      <div className="tc-readout-main">{ang[v].toFixed(2)}°</div>
                      <div className="tc-readout-sub">vertex {v}{dl.state[v] === "auto" ? " · computed" : ""}</div>
                    </div>
                    <input className="tc-in" placeholder={ang[v].toFixed(1)} value={edits["a" + v] ?? ""}
                      onChange={e => setEdits(x => ({ ...x, ["a" + v]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && commitAngle(v)}
                      onBlur={() => edits["a" + v] != null && commitAngle(v)} />
                    <LockBtn state={dl.state[v]} onClick={() => toggleAngleLock(v)} accent={C.cyan} />
                  </Row>
                );
              })}
            </Section>

            <Section title="Vertices" hint="pin to lock in place">
              {["A", "B", "C"].map((v) => {
                const pinned = locks.pinned.includes(v);
                return (
                  <Row key={v}>
                    <Glyph color={pinned ? C.cyan : C.dim}>{v}</Glyph>
                    <div className="tc-coord">({pts[v].x.toFixed(2)}, {(-pts[v].y).toFixed(2)})</div>
                    <button className={`tc-btn tc-flat${pinned ? " is-on-cyan" : ""}`} onClick={() => togglePin(v)}>
                      {pinned ? <Pin size={13} /> : <PinOff size={13} />}{pinned ? "Pinned" : "Free"}
                    </button>
                  </Row>
                );
              })}
            </Section>
            </>)}

            <Section title="Settings">
              <Row>
                <span className="tc-row-label">Units</span>
                <div className="tc-row-chips">
                  {["imperial", "metric"].map(sys => (
                    <button key={sys} className={`tc-btn tc-chip${system === sys ? " is-on" : ""}`} style={{ textTransform: "capitalize", padding: "3px 9px" }} onClick={() => switchSystem(sys)}>{sys}</button>
                  ))}
                </div>
              </Row>
              <Row>
                <span className="tc-row-label">Scale</span>
                <div className="tc-row-chips">
                  {(system === "imperial" ? IMPERIAL_UNITS : METRIC_UNITS).map(u => (
                    <button key={u} className={`tc-btn tc-chip${unit === u ? " is-on-cyan" : ""}`} onClick={() => switchUnit(u)}>{UNIT_LABEL[u]}</button>
                  ))}
                </div>
              </Row>
              <Row>
                <span className="tc-row-label">{system === "imperial" ? "Fraction" : "Decimals"}</span>
                {system === "imperial" ? (
                  <div className="tc-row-chips">
                    {DENOMS.map(d => (
                      <button key={d} className={`tc-btn tc-chip${denom === d ? " is-on" : ""}`} style={{ padding: "3px 7px" }} onClick={() => setDenom(d)}>1/{d}</button>
                    ))}
                  </div>
                ) : (
                  <div className="tc-row-chips">
                    {[0, 1, 2, 3, 4].map(d => (
                      <button key={d} className={`tc-btn tc-chip${decimals === d ? " is-on" : ""}`} onClick={() => setDecimals(d)}>{d}</button>
                    ))}
                  </div>
                )}
              </Row>
              <Row>
                <span className="tc-row-label">Grid step</span>
                <div className="tc-row-chips">
                  <button
                    className={`tc-btn tc-chip${gridAuto ? " is-on-cyan" : ""}`}
                    onClick={() => setGridAuto(true)}
                    title="Auto: grid + snap step track zoom level"
                  >Auto</button>
                  {GRID_OPTIONS[unit].map(g => {
                    const inches = g * INCH_PER[unit];
                    const label = system === "imperial" && unit === "in" ? toFraction(g, 64) : `${_trimDec(g.toFixed(4))} ${UNIT_SYMBOL[unit]}`;
                    const selected = !gridAuto && Math.abs(gridStep - inches) < 1e-9;
                    return (
                      <button
                        key={g}
                        className={`tc-btn tc-chip${selected ? " is-on" : ""}`}
                        onClick={() => { setGridAuto(false); setGridStep(inches); }}
                      >{label}</button>
                    );
                  })}
                </div>
              </Row>
              <Row>
                <span className="tc-row-label">
                  Solve: <span style={{ color: solveStatus.c }}>{solveStatus.t}</span>
                </span>
              </Row>
              {!valid && <div className="tc-warn">▲ Triangle inequality violated — current side locks cannot form a triangle.</div>}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

const kbd = { background: "#0c1016", border: "1px solid #2a3340", borderRadius: 4, padding: "1px 5px", fontSize: 10, color: "#c9d1dd" };

// ===================== [SEC:PRESENT] =====================
// Small presentational helpers (Section, Row, Glyph, LockBtn, Toggle).
// Pure renderers, no business logic.
function Section({ title, hint, hintColor, children }) {
  return (
    <div className="tc-section">
      <div className="tc-section-head">
        <span className="tc-section-title">{title}</span>
        {hint && <span className="tc-section-hint" style={hintColor ? { color: hintColor } : undefined}>{hint}</span>}
      </div>
      <div className="tc-section-body">{children}</div>
    </div>
  );
}
function Row({ children }) { return <div className="tc-row">{children}</div>; }
function Glyph({ children, color }) {
  return <span className="tc-glyph" style={{ color }}>{children}</span>;
}
function LockBtn({ state, onClick, accent = C.brass }) {
  // free (outline) / user (accent fill) / auto (muted dashed: computed from other inputs)
  if (state === "auto") {
    return (
      <button className="tc-btn tc-lock is-auto" disabled title="Computed from your other inputs">
        <Lock size={14} />
      </button>
    );
  }
  const locked = state === "user";
  // accent picks between brass (default, sides) and cyan (angles) for the "on" state
  const onClass = accent === C.cyan ? " is-on-cyan" : " is-on";
  return (
    <button className={`tc-btn tc-lock${locked ? onClass : ""}`} onClick={onClick} title={locked ? "Locked — click to release" : "Click to lock"}>
      {locked ? <Lock size={14} /> : <Unlock size={14} />}
    </button>
  );
}
function Toggle({ on, onClick, icon, label }) {
  return (
    <button className={`tc-btn tc-flat${on ? " is-on" : ""}`} onClick={onClick}>
      {icon}{label}
    </button>
  );
}
