---
name: nx-affected-check
description: Use before committing any change to files under apps/ or libs/ — runs `nx affected -t lint,test,build` so only the Nx projects actually touched by the change (plus their dependents) get re-verified, instead of re-running everything. Use whenever you've finished a change and are about to commit or open a PR; also use `nx graph` when you need to see why a project was (or wasn't) marked affected in a workspace this small.
---

# Nx affected workflow

The workspace currently has two projects (`bivy`, `api`); this still matters because
`apps/web` (Phase 2) and `libs/*` (Phase 4) will add more, and the habit of using
`affected` instead of blanket commands is what keeps CI fast as the graph grows.

## Steps

1. Make sure your changes are committed or staged — `nx affected` diffs against a base
   git ref, not your working tree state alone (uncommitted changes are still picked up,
   but the base comparison itself is git-based).
2. Run:
   ```
   npx nx affected -t lint,test,build
   ```
   This resolves which projects changed since the base ref (default: diff against the
   `main` branch tip, or `HEAD~1` if you're already on `main`), plus anything that
   depends on them, and runs `lint`, `test`, and `build` only for those.
3. If you only touched one project and want a faster loop while iterating, target it
   directly instead: `npx nx run-many -t lint,test -p api`.
4. Before opening a PR / pushing to `main`, run the full `affected` set (step 2) once
   more against the actual base you're merging into, not just your last local run —
   catches the case where `main` moved under you.

## Using `nx graph`

- `npx nx graph` opens an interactive dependency graph in the browser. In a
  two-to-four-project workspace this is mostly useful for one thing: confirming
  *why* `nx affected` picked up a project you didn't expect (e.g. `api` shows up
  affected because it imports a `libs/trip-schema` you just touched, once Phase 4
  exists).
- `npx nx graph --affected` shows just the affected subgraph for your current
  uncommitted/base diff — faster to read than the full graph when you're trying to
  sanity-check a `nx affected` run before trusting it.

## Gotchas

- `nx affected` needs enough git history to diff against — if a shallow clone (e.g.
  `fetch-depth: 1` in CI) makes the base ref unavailable, it silently falls back to
  treating *everything* as affected. Locally this is rarely an issue; in CI, this
  repo's workflow (`.github/workflows/deploy.yml`) uses `fetch-depth: 0` plus
  `nrwl/nx-set-shas@v4` specifically to avoid it.
- The custom-executor `check-prompts` target on `api` is intentionally never included
  in the `-t lint,test,build` set — don't add it to a default target list, it hits the
  live Anthropic API and is meant to stay a manual, human-in-the-loop step (see the
  `prompt-check` skill).
