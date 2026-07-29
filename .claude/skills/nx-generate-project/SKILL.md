---
name: nx-generate-project
description: Use when adding a new app or lib to this workspace — Phase 2's `apps/web` SPA or a Phase 4 `libs/*` shared package (e.g. the trip schema) — so the exact generator invocation and flags are looked up here instead of re-derived from scratch. Use once, at the point a new top-level app or lib is actually being started, not speculatively.
---

# Generating new apps/libs

Mirrors how `apps/bivy` and `apps/api` were generated (see
`satellite-weather-assistant-plan.md`'s Nx scaffolding notes) so new projects follow
the same conventions.

## Adding `apps/web` (Phase 2 — Vite + React SPA)

1. Install the plugins if not already present:
   ```
   npm install --save-dev @nx/react @nx/vite
   ```
2. Generate the app:
   ```
   npx nx g @nx/react:app web \
     --directory=apps/web \
     --bundler=vite \
     --style=css \
     --routing=false \
     --unitTestRunner=vitest \
     --e2eTestRunner=none
   ```
   `--bundler=vite` is what wires up `@nx/vite` (TypeScript project references +
   per-project type-checking) instead of webpack — matches the plan's "Vite +
   TypeScript + React, lighter than Next.js" choice. Skip `--routing` unless the
   trip planner grows multiple views; keep `--e2eTestRunner=none` — no e2e story is
   planned for the PWA.
3. Add `vite-plugin-pwa` and wire the manifest/service-worker per the Phase 2 plan —
   not part of the generator, hand-added to `apps/web/vite.config.ts` afterward.
4. `nx serve web` for local dev, `nx build web` for the GitHub Pages deploy artifact.

## Adding a `libs/*` package (Phase 4 — shared trip schema)

1. Generate a plain buildable TS lib (no framework needed — it's a shared type +
   maybe a couple of pure functions):
   ```
   npx nx g @nx/js:lib trip-schema \
     --directory=libs/trip-schema \
     --bundler=none \
     --unitTestRunner=vitest \
     --importPath=@bivy-app/trip-schema
   ```
   `--bundler=none` since this lib is only ever consumed inside the Nx workspace
   (by `apps/api` and `apps/web`) via esbuild's internal-import resolution — it
   doesn't need to be independently publishable or bundled.
2. Import it from `apps/api/src/*` and `apps/web/src/*` via the `--importPath` alias
   (`@bivy-app/trip-schema`), which `nx g` wires into `tsconfig.base.json`
   automatically.
3. `apps/api`'s esbuild `build` target tree-shakes the lib into the function bundle
   at build time — no extra wiring needed on the function side once the import
   path resolves.

## Gotchas

- Always pass `--directory=` explicitly with the full path (`apps/web`,
  `libs/trip-schema`) — a bare name lets Nx choose a default location that won't
  match this workspace's existing `apps/bivy` / `apps/api` layout.
- Match `--unitTestRunner=vitest` on every new project — `apps/api` required a
  manual post-generation swap away from the `@simondotm/nx-firebase` plugin's
  default Jest target (see `satellite-weather-assistant-plan.md`'s Nx-tooling
  notes); `@nx/react` and `@nx/js` generators support vitest natively via the
  flag, so no manual swap is needed for `web` or `libs/*`.
- After generating, run the `nx-affected-check` skill once to confirm the new
  project's `lint`/`test`/`build` targets actually run clean before building on
  top of it.
