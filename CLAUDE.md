# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DashBye is a local-first Node.js CLI (`dashbye`) that keeps a browser extension's store package, listing copy, images, and privacy declarations versioned in the extension repo, diffs them against each configured store, and — only after explicit plan approval — writes and reads back. Chrome Web Store: the live Dashboard **draft**, via Chrome DevTools Protocol. Edge Add-ons: the draft package, via the Edge Add-ons API. Firefox Add-ons (AMO, no draft): package validation, `dashbye submit` for a separately approved version, and listing edits after AMO approves it. It never submits Chrome or Edge for review and never publishes.

## Commands

Node 22+ required. TypeScript ESM (`module: NodeNext`), so relative imports must use `.js` extensions (e.g. `'../src/reconcile.js'`).

```bash
npm run check                                  # type-check only (CI runs this)
npm run build                                  # clean dist/ + tsc → dist/src, dist/tests
npm test                                       # build, run all tests, then the draft-only boundary check
npm run build && node --test dist/tests/reconcile.test.js   # run a single test file
npm run build && node --test --test-name-pattern="<name>" dist/tests/reconcile.test.js
node dist/src/cli.js -h                        # run the built CLI
```

Tests use `node:test` + `node:assert/strict` and run against the compiled `dist/`, not the `.ts` sources — always rebuild first.

`scripts/check-release-boundary.mjs` (part of `npm test`) fails the build if any `src/**/*.ts` targets a `getByRole` button named Submit for review / Publish / Archive / Delete, or calls a forbidden AMO or Edge endpoint (see Architecture). Do not work around it.

## Architecture

Pipeline: local intent → remote observation → approved write. See `docs/architecture.md` for detail.

- `project.ts` — loads `dashbye.config.yml` (`dashbye/config/v2`: `targets` per store; v1 is read as Chrome-only). `stores/detect.ts` suggests stores from packages, scripts, and links; `init.ts` walks one `resolveInit` sequence for both the terminal wizard and `init --agent --json`, including "change stores". `multi-plan.ts` holds plan v3 (one approval hash over every store plan; stores without an adapter are carried as `pending`). Store adapters live in `stores/`: Firefox (`stores/firefox/`) validates the package until AMO approves that version, then updates the listing fields AMO accepts; `submit.ts` builds the separately approved version submission, and every AMO write is in `amo-write.ts`. Edge (`stores/edge/`) uploads the draft package and records it so the same package is not uploaded again; the API cannot read the draft. API keys come from `credentials.ts` (environment or a private state-dir file); `net.ts` routes store APIs through `HTTP(S)_PROXY` and keeps loopback CDP off the proxy. `scripts/check-release-boundary.mjs` scans `src/**` and forbids AMO version creation and PATCH/PUT/DELETE outside `amo-write.ts`, previews, and Edge publish calls everywhere.
- `workspace.ts` — finds the nearest `dashbye.config.yml`, loads `store/release.yml` (schema: `docs/store-schema.md`), validates images and checks privacy declarations against the real manifest (via `artifact.ts`, which normalizes ZIP / build dir / manifest input).
- `init.ts` — interactive wizard plus a non-writing `init --agent --json` protocol that returns either one missing input or a full config preview. `agent-prompt.ts` generates the agent hand-off prompt (`init --prompt`). `versioned-path.ts` resolves `{version}` in artifact/source file names to the newest match.
- `dashboard-v2.ts` — the only browser code. Connects to a **loopback-only** CDP endpoint (playwright-core, never logs into Chrome; `chrome.ts` opens the dedicated profile and `session.ts` waits for manual sign-in), picks/reuses a work tab via a `window.name` marker, and reads package/listing/privacy state as **hashes and booleans**, never raw field contents, plus an `editLock` (Pending review / disabled fields, see `edit-lock.ts`) that makes `plan` carry `blocking` reasons and `sync-draft` refuse to write. Selectors are guarded by page/heading/language checks; mismatches stop the run rather than guess. Dashboard UI is not a stable API — this file is where breakage appears.
- `reconcile.ts` — builds a complete desired-state plan (upload/update/replace/remove/reorder). `approvalHash` binds item, artifact, resources, remote snapshot, and exact operations. Empty lists / `null` in desired state mean removal.
- `cli.ts` — commands `init`, `doctor`, `release`, `validate`, `plan`, `sync-draft`, `submit` (`agent-prompt`, `chrome`, `inspect` only name their replacements `init --prompt`, `doctor --login`, `plan --remote`). `release` runs validate → plan → one `[Y/n]` for drafts → a separate `[y/N]` for a Firefox submission → read-back; without a terminal it prints the plan and the `--approve-plan` / `--approve-submit` hashes and writes nothing. Options are declared per command in `args.ts` (unknown options fail). Readable output in a terminal (`format.ts`), JSON with `--json` or when not a TTY — agents depend on the JSON. Plans are saved under the platform state dir (`paths.ts`); `sync-draft` asks `[Y/n]` in a terminal, otherwise requires `--approve-plan`. `sync-draft` and `release` share one execution path: re-read remote state and revalidate the approved plan immediately before writing, click Save draft (retrying once with only the remaining approved changes if the save is not confirmed), re-read everything, and write the lock only when zero operations remain. `text-preview.ts` prints listing-text changes in the terminal only; plans and JSON stay value-free. `displays.ts` optionally moves DashBye's own window to `browser.display` (macOS).
- `release-lock.ts` — records verified artifact/resource fingerprints after a successful read-back; the previous lock surfaces permission drift. `hash.ts` / `image-fingerprint.ts` (sharp) provide content and perceptual image hashes.
- `security.ts` — redaction and loopback/ID validation helpers.

## Repository rules (from AGENTS.md — mandatory)

- Treat every Dashboard write as production-adjacent. Never add review submission, publishing, archiving, login automation, CAPTCHA handling, or fingerprint spoofing. The one exception is the approved AMO path in `stores/firefox/amo-write.ts` (`dashbye submit`, and listing edits after AMO approval); Edge stops at the draft package.
- Every write needs a bound plan beforehand and a reload/read-back check afterward. Asset deletion/replacement and privacy writes need explicit approval; never infer data-use certifications.
- CDP endpoints: loopback only; require exact item ID and language.
- Never log account names, publisher IDs, cookies, tokens, field contents, or full authenticated URLs.
- Browser profiles, reports, packages, real-listing screenshots, HAR files, and traces stay outside the repo. Tests and examples use fictional item IDs (e.g. `'a'.repeat(32)`) and synthetic assets only.
- Unit tests cover parsing/validation/planning only; real selector changes need a reviewed, reversible draft verification (record in `docs/validation.md`).

## Docs

`README.md` and `README.zh-CN.md` (and `docs/usage.md` / `docs/usage.zh-CN.md`) are parallel translations — update both together. Design notes live in `docs/plans/`.
