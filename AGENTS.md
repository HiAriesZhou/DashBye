# Engineering rules

DashBye is a local-first CLI for approved browser-extension store updates. See
[architecture](docs/architecture.md), [usage](docs/usage.md), and
[validation scope](docs/validation.md) for the current contracts.

## Development

- Use Node.js 22+ and TypeScript ESM (`NodeNext`); relative imports use `.js`.
- `npm run check` type-checks without emitting files. `npm test` rebuilds `dist/`,
  runs `node:test`, and checks the release boundary. Rebuild before individual tests.
- Declare flags per command in `src/args.ts`; preserve JSON output for `--json`
  and non-terminal callers, which agents and scripts depend on.
- Preserve existing work. Use a task branch and keep commits, pushes, merges,
  releases, and store writes within the owner's current authorization. Historical
  records and tool permission lists do not grant authorization.

## Store safety

- Treat every Dashboard write as production-adjacent, even when the UI says Draft.
- Never add publication, archive, login automation, CAPTCHA handling, or fingerprint
  spoofing. Chrome and Edge review submission remain manual. The sole submission
  exception is the separately approved AMO path used by `submit` and `release`:
  AMO has no draft and requires its bound hash or a default-no prompt.
- AMO version creation and listing edits stay in `src/stores/firefox/amo-write.ts`,
  the only module exempted by the release-boundary check. Listing edits require AMO
  to have approved the package version. Edge stops at the draft package; never call
  its publish endpoint or add listing automation.
- Do not weaken `scripts/check-release-boundary.mjs` or expand its AMO exemption.
- Bind each write to the target, exact inputs, remote state and operations; verify
  again at execution and send the checked snapshot. Asset deletion/replacement and
  privacy writes need explicit approval. Never invent data-use certifications.
- Accept CDP endpoints only on loopback and require an exact item ID and language.
  Use a dedicated visible Chrome profile and preserve user editor tabs.
- Never log account names, publisher IDs, cookies, tokens, field contents, or full
  authenticated URLs. Real profiles, packages, screenshots, HAR files, reports and
  traces stay outside repositories. Tests and examples use fictional IDs and
  synthetic assets.
- Never replay an API write unless it provably never reached the store. Chrome's
  existing unconfirmed-save recovery may read the draft and apply only remaining
  approved operations once; do not extend this to AMO submissions or blind retries.
- Verify after writing: Chrome needs zero remaining operations before a release
  lock; AMO re-reads writable fields and reports manual work; Edge checks the upload
  operation, since its API cannot read draft contents.
- Selector changes need a reviewed, reversible real-Dashboard check; record the
  scope in `docs/validation.md`. Unit tests alone do not verify live selectors.

## Website and documentation

- `website/` is an independent Astro static package with its own lockfile. It needs
  Node.js 22.23.4+; website CI uses 24. Run its `npm test` and `npm run build` separately.
- Never add analytics, tracking, or third-party requests in page code or at build
  time. Keep fonts and assets self-hosted. Preserve `/apple-touch-icon.png` and update
  `website/scripts/ignore-build.sh` when the site gains a new input.
- Keep both READMEs, both usage guides, and `website/src/lib/copy.ts` consistent.
  README is an entry point; stable technical detail belongs in the linked docs.
- Keep public guidance tool-neutral. Preserve `CLAUDE.md` as an entry point. Task
  plans, handoff snapshots, generation prompts, local settings, and private account
  configuration do not belong in the public tree. Keep brand terms separate from
  the code's MIT license.

## Releasing DashBye

- `main` accepts changes only through a pull request with the `test` check passing;
  never push to it directly. Publishing requires a separate authorization.
- Bump `package.json`, `package-lock.json` (`npm version <x.y.z> --no-git-tag-version`)
  and `VERSION` in `src/cli.ts` in one `release: <x.y.z>` commit, last in the release PR.
- After merge, tag the merged release commit `v<x.y.z>` and push the tag. The release
  workflow must verify version equality and that the commit belongs to `main`, run
  checks, and publish through npm trusted publishing (OIDC, with provenance).
- Never move an existing tag. If its workflow fails, fix the cause and rerun it for
  that tag. Create the GitHub Release after publication succeeds.
- Local publication is exceptional, only when CI is unavailable and separately
  authorized. Confirm the configured npm identity is authorized; never expose
  credentials or silently fall back to another account.
- Merging relevant site inputs deploys dashbye.lol; check its version after release.
  The npm trusted publisher must target this repository and `release.yml`.
