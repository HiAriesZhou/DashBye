# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DashBye is a local-first Node.js CLI (`dashbye`) that keeps a Chrome extension's Chrome Web Store package, listing copy, images, and privacy declarations versioned in the extension repo, diffs them against the live Dashboard **draft** via Chrome DevTools Protocol, and — only after explicit plan approval — saves the draft and reads it back. It never submits for review or publishes.

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

`scripts/check-release-boundary.mjs` (part of `npm test`) fails the build if any `src/*.ts` targets a `getByRole` button named Submit for review / Publish / Archive / Delete. Do not work around it.

## Architecture

Pipeline: local intent → remote observation → approved write. See `docs/architecture.md` for detail.

- `project.ts` — loads `dashbye.config.yml` (`dashbye/config/v2`: `targets` per store; v1 is read as Chrome-only). `stores/detect.ts` suggests stores from packages, scripts, and links; `init.ts` walks one `resolveInit` sequence for both the terminal wizard and `init --agent --json`, including "change stores". `multi-plan.ts` holds plan v3 (one approval hash over every store plan); Chrome saves drafts; Firefox (`stores/firefox/`) is validate-only because AMO has no draft — it reads the add-on, lists listing differences for the owner, and only calls the upload-validation endpoint; Edge is still carried as `pending`. `scripts/check-release-boundary.mjs` scans `src/**` and forbids AMO version creation, PATCH/PUT/DELETE, previews, and Edge publish calls.
- `workspace.ts` — finds the nearest `dashbye.config.yml`, loads `store/release.yml` (schema: `docs/store-schema.md`), validates images and checks privacy declarations against the real manifest (via `artifact.ts`, which normalizes ZIP / build dir / manifest input).
- `init.ts` — interactive wizard plus a non-writing `init --agent --json` protocol that returns either one missing input or a full config preview. `agent-prompt.ts` generates the agent hand-off prompt.
- `dashboard-v2.ts` — the only browser code. Connects to a **loopback-only** CDP endpoint (playwright-core, never logs into Chrome; `chrome.ts` opens the dedicated profile and `session.ts` waits for manual sign-in), picks/reuses a work tab via a `window.name` marker, and reads package/listing/privacy state as **hashes and booleans**, never raw field contents. Selectors are guarded by page/heading/language checks; mismatches stop the run rather than guess. Dashboard UI is not a stable API — this file is where breakage appears.
- `reconcile.ts` — builds a complete desired-state plan (upload/update/replace/remove/reorder). `approvalHash` binds item, artifact, resources, remote snapshot, and exact operations. Empty lists / `null` in desired state mean removal.
- `cli.ts` — commands `init`, `agent-prompt`, `validate`, `doctor`, `chrome`, `inspect`, `plan`, `sync-draft`; options are declared per command in `args.ts` (unknown options fail). Readable output in a terminal (`format.ts`), JSON with `--json` or when not a TTY — agents depend on the JSON. Plans are saved under the platform state dir (`paths.ts`); `sync-draft` asks `[Y/n]` in a terminal, otherwise requires `--approve-plan`. `sync-draft` re-reads remote state and revalidates the approved plan immediately before writing, clicks Save draft, re-reads everything, and writes the lock only when zero operations remain.
- `release-lock.ts` — records verified artifact/resource fingerprints after a successful read-back; the previous lock surfaces permission drift. `hash.ts` / `image-fingerprint.ts` (sharp) provide content and perceptual image hashes.
- `security.ts` — redaction and loopback/ID validation helpers.

## Repository rules (from AGENTS.md — mandatory)

- Treat every Dashboard write as production-adjacent. Never add review submission, publishing, archiving, login automation, CAPTCHA handling, or fingerprint spoofing.
- Every write needs a bound plan beforehand and a reload/read-back check afterward. Asset deletion/replacement and privacy writes need explicit approval; never infer data-use certifications.
- CDP endpoints: loopback only; require exact item ID and language.
- Never log account names, publisher IDs, cookies, tokens, field contents, or full authenticated URLs.
- Browser profiles, reports, packages, real-listing screenshots, HAR files, and traces stay outside the repo. Tests and examples use fictional item IDs (e.g. `'a'.repeat(32)`) and synthetic assets only.
- Unit tests cover parsing/validation/planning only; real selector changes need a reviewed, reversible draft verification (record in `docs/validation.md`).

## Docs

`README.md` and `README.zh-CN.md` (and `docs/usage.md` / `docs/usage.zh-CN.md`) are parallel translations — update both together. Design notes live in `docs/plans/`.
