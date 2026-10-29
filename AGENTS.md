# Repository rules

- Treat every Dashboard write as production-adjacent, even when the UI says Draft.
- Never add review submission, publishing, archive, login automation, CAPTCHA
  handling, or fingerprint spoofing. The one exception is `dashbye submit` for AMO,
  which has no draft: it may create a listed Firefox version only for a plan the
  owner approved by hash or prompt, and `sync-draft` may edit AMO listing fields
  only after AMO approved the package version. Both live in
  `src/stores/firefox/amo-write.ts`, the only file the release-boundary check
  exempts. Edge stops at the draft package; never call its publish endpoint.
- Asset deletion/replacement and privacy draft writes require a bound plan and
  explicit approval. Never infer or invent data-use certifications.
- Accept CDP endpoints only on loopback and require an exact item ID and language.
- Never log account names, publisher IDs, cookies, tokens, field contents, or full
  authenticated URLs.
- Browser profiles, reports, downloaded packages, screenshots from real listings,
  HAR files, and traces must stay outside the repository.
- Every write must be preceded by a plan and followed by a reload/read-back check.
- Never resend a store write over another route or as a retry unless it provably never
  left (see `canRetryDirect` in `src/net.ts`); an AMO version create sent twice can
  leave a version in review without its notes.
- Examples and tests must use fictional item IDs and synthetic assets only.

## Website

- `website/` (dashbye.lol) is a separate static package; see CLAUDE.md. Keep its copy in
  `website/src/lib/copy.ts` consistent with both READMEs, and never add analytics,
  tracking, or third-party requests: the product promises no telemetry.

## Releasing DashBye

- `main` accepts changes only through a pull request with the `test` check passing
  (ruleset "Protect main"); never push to it directly.
- Bump `package.json`, `package-lock.json` (via `npm version <x.y.z> --no-git-tag-version`)
  and `VERSION` in `src/cli.ts` (`tests/cli-version.test.ts` checks they match) in one
  `release: <x.y.z>` commit, the last commit of the release pull request.
- After the pull request merges, tag the merged release commit `v<x.y.z>` and push the tag.
  `.github/workflows/release.yml` checks that the tag matches `package.json`, runs the
  tests, and publishes to npm through trusted publishing (OIDC, with provenance); no npm
  token is stored anywhere. The registry can take several minutes to show the version.
- If a tag-triggered run fails, fix the workflow and run it by hand for that tag.
- Then create the GitHub Release for the tag. Never publish from a local machine
  unless the workflow is unavailable, and never move an existing tag.
- Merging to `main` also deploys dashbye.lol when the site's inputs changed (see
  CLAUDE.md); check that it shows the new version.
- One-time setup: on npmjs.com, add this repository and `release.yml` as the
  package's trusted publisher.
