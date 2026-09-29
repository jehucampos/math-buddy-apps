# math-buddy-apps — instructions for Claude Code

Monorepo for three free, self-contained single-file web apps. Each deploys to its own
Cloudflare Worker from `main` via Workers Builds. See README.md for layout and deploy setup,
COMPONENT-CATALOG.md for reusable pieces.

| App | Folder | Source of truth | Live |
|---|---|---|---|
| Triangle Buddy | apps/triangle | TriangleCalculator.jsx | trianglebuddy.com |
| Trig Buddy | apps/trig | TrigCalculator.jsx | trig.trianglebuddy.com |
| Fraction Buddy | apps/fraction | FractionCalculator.jsx + core/logic.js | fractions.trianglebuddy.com |

## Build and test

```
cd apps/<app> && npm ci && cd ../..        # once per app, or after lockfile changes
node scripts/buddy.js <app>                # build + gates + stage dist/
node scripts/buddy.js <app> --full         # adds real-browser gates (Trig browser-test, Fraction layout-check)
```
- Any failing gate stops the run and nothing is staged. Never skip, weaken, or delete a gate
  to make a change pass; fix the code, or stop and report.
- Browser gates need Chromium locally (Trig: `CHROMIUM=/path/to/chrome`; Fraction: Python
  `playwright`). If they can't run locally, say so; GitHub Actions (`gates` workflow) runs
  them on every push and PR.
- Do not commit build outputs (index.html, *-buddy.html, standalone_entry.jsx, dist/,
  apps/*/widget.js). .gitignore covers them.

## Rules

- **Evidence, not speculation.** Every behavioural claim must map to a passing gate or a
  measurement you ran. If something is unverified, say so explicitly.
- **Simulate before delivering.** Run the relevant gates (and `--full` where possible) before
  saying a change is done.
- **Version every change to an app's shipped output:** patch = fix, minor = backward-compatible
  feature, major = breaking. Add a changelog entry in the .jsx header banner. Version strings
  are pinned in several places; update all of them:
  - Triangle: TriangleCalculator.jsx and core/interaction-test.js (expects the label)
  - Trig: TrigCalculator.jsx (VERSION const + banner) and package.json `version` (gates cross-check)
  - Fraction: FractionCalculator.jsx (APP_VERSION + banner); keep package.json `version` in step
  Tooling-only changes (scripts/, CI) bump the root package.json version instead.
- **Fraction core logic:** edit core/logic.js, then mirror it verbatim into the [SEC:CORE]
  block of FractionCalculator.jsx; core/sync-check.js enforces this.
- **Triangle deletions:** when removing a state/ref/function, add its name to
  BANNED_IDENTIFIERS in apps/triangle/core/build.js.
- **Shared code** lives in packages/ (currently widget.js); a change there rebuilds and
  redeploys all three apps.
- **New interaction tests:** wait for the app to mount (poll for its markers) instead of
  fixed sleeps; see COMPONENT-CATALOG.md "jsdom boot pattern".
- **Design decisions belong to Jehu.** For subjective UI or layout choices with real
  trade-offs, present the options and ask before implementing.
- **Do not change** the `name` in any apps/*/wrangler.jsonc (they are the live Worker names),
  and do not add Feelings Buddy apps here (separate project).
- Update COMPONENT-CATALOG.md when you add or change a reusable component or pattern.
- Be concise. No filler.

## Git workflow

- Pushing to `main` deploys to production. Prefer a branch + pull request: the `gates` check
  runs on the PR, and merging to `main` deploys.
- Commit messages: `<app> vX.Y.Z: <what changed>` (or `repo vX.Y.Z: …` for tooling).
