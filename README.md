# buddy-apps

Monorepo for the Buddy family of free math tools. Each app ships as one
self-contained HTML page on its own Cloudflare Worker (static assets).

| App | Folder | Live | Version |
|---|---|---|---|
| Triangle Buddy | `apps/triangle` | trianglebuddy.com | v1.17.0 |
| Trig Buddy | `apps/trig` | trig.trianglebuddy.com | v0.1.1 |
| Fraction Buddy | `apps/fraction` | fractions.trianglebuddy.com | v1.2.4 |

## Layout

```
apps/<app>/            one folder per app: canonical .jsx, core/ (build + gates),
                       package.json + lockfile, og-image.png, robots.txt, sitemap.xml,
                       wrangler.jsonc, .node-version
packages/widget/       widget.js (Buy Me a Coffee) — shared, synced into each app at build
scripts/buddy.js       sync shared files -> run the app's build + gates -> stage dist/
COMPONENT-CATALOG.md   reusable pieces across the family
```

Fraction's old `core/package-deploy.sh` and `core/assets/widget.js` are retired: staging
is done by `scripts/buddy.js`, robots/sitemap/og-image are committed files, and the widget
comes from `packages/widget`. `core/make-og.py` now writes `apps/fraction/og-image.png`.

Build outputs (`index.html`, `*-buddy.html`, `standalone_entry.jsx`, `dist/`) and
synced copies (`apps/*/widget.js`) are git-ignored; CI rebuilds them.

## Build locally

```
cd apps/triangle && npm ci && cd ../..
node scripts/buddy.js triangle            # all Triangle gates run by default

cd apps/trig && npm ci && cd ../..
CHROMIUM=/path/to/chrome node scripts/buddy.js trig --full   # adds interaction + browser gates

cd apps/fraction && npm ci && cd ../..
node scripts/buddy.js fraction --full    # --full adds layout-check.py (needs: pip install playwright
                                         #   && python -m playwright install chromium)
```

Triangle and Trig run their gates inside `core/build.js`. Fraction's `build.js` runs only
the smoke gate, so `scripts/buddy.js` runs its other gates (listed in `APPS` there).

Any failing gate stops the build and nothing is staged. A green run leaves the
deploy set in `apps/<app>/dist/`: index.html, widget.js, og-image.png, robots.txt, sitemap.xml.

## Deploy (Cloudflare Workers Builds)

For each app's existing Worker: Settings → Builds → connect this repo, then set

| Field | Value |
|---|---|
| Root directory | `apps/<app>` |
| Build command | `npm ci && node ../../scripts/buddy.js <app> --deploy` |
| Deploy command | `npx wrangler deploy` |
| Build watch paths | `apps/<app>/*`, `packages/*`, `scripts/*` |

Before the first deploy, set `"name"` in `apps/<app>/wrangler.jsonc` to the Worker's
exact name. `--deploy` refuses to continue while it is still `set-me`.
After each deploy, confirm the version label on the live site.

The GitHub Actions workflow (`.github/workflows/gates.yml`) runs every gate for
every app on each push and PR, including Trig's browser gate and Fraction's layout gate.
The Cloudflare build command runs without `--full`, so those two real-browser gates run
only in GitHub Actions — protect `main` so merges require the `gates` check.

## Versioning

- Each app keeps its own version (patch = fix, minor = feature, major = breaking).
- A change in `packages/` or `scripts/` that alters an app's built output bumps that app.
- The repo version (root package.json) tracks tooling changes.

## Adding an app

1. Create `apps/<app>/` with its source, `core/`, package.json + lockfile, assets, wrangler.jsonc.
2. Add it to the `matrix.app` list in `.github/workflows/gates.yml`.
3. Add it to `BUDDY_TOOLS` in the other apps and to the table above.
