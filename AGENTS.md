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
- Examples and tests must use fictional item IDs and synthetic assets only.

## Releasing DashBye

- Bump `package.json`, `package-lock.json` (via `npm version <x.y.z> --no-git-tag-version`)
  and `VERSION` in `src/cli.ts` in one `release: <x.y.z>` commit on `main`.
- Tag that commit `v<x.y.z>` and push the tag. `.github/workflows/release.yml` checks
  that the tag matches `package.json`, runs the tests, and publishes to npm through
  trusted publishing (OIDC, with provenance); no npm token is stored anywhere.
- If a tag-triggered run fails, fix the workflow and run it by hand for that tag.
- Then create the GitHub Release for the tag. Never publish from a local machine
  unless the workflow is unavailable, and never move an existing tag.
- One-time setup: on npmjs.com, add this repository and `release.yml` as the
  package's trusted publisher.
