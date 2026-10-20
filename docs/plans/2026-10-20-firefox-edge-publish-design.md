# Firefox Submission And Edge Drafts

## Problem

Chrome releases end at a saved, re-read draft. Firefox and Edge still need hand
work after `sync-draft`: AMO only validates the package, and Edge is listed as
pending. The two stores differ in what a "draft" can be:

- **AMO has no draft.** Creating a listed version enters the review queue, and an
  add-on metadata edit is visible immediately. A Firefox release therefore cannot
  stop at a draft the way Chrome does.
- **Edge has a draft.** The Edge Add-ons API (v1.1) uploads a package into the
  draft submission and publishes only through a separate call. Store-listing
  fields are not in the API; they live in Partner Center.

## Decisions

- **Firefox gets a separate `submit` command.** It is the only DashBye command that
  starts a store review, and only for AMO, because AMO offers nothing between
  validation and submission. The repository rule against review submission keeps
  applying everywhere else. `sync-draft` never submits.
- **`submit` is bound like any write.** `dashbye submit` without approval prints
  and saves a submission plan (`dashbye/firefox-submit/v1`): add-on, artifact and
  source hashes, release-notes and reviewer-notes hashes, the AMO version, and
  blocking reasons, including a version AMO already has. With `--approve-plan`
  equal to that hash, or an explicit `y` at a default-no prompt, it re-reads AMO,
  refuses on any drift, then:
  1. uploads the package (channel `listed`) and waits for validation; any error stops;
  2. creates the version with the upload, the source archive and the inherited
     license (one multipart request);
  3. sets release notes and reviewer notes on that version (one JSON request);
  4. reads the version back (version string, source present, notes) and reports
     `submitted` only when everything matches. AMO itself is the record: a version
     it already has blocks the next plan, so no Firefox lock file is written.
  A failure after step 2 reports the created version instead of retrying, since a
  repeated upload would fail or duplicate.
- **Firefox listing waits for approval.** `sync-draft` updates AMO metadata
  (summary, description, categories, homepage, support email) only when AMO's
  current version equals the local version. Earlier, the plan blocks with "waiting
  for AMO to approve <version>", so the public listing never describes a version
  users cannot install yet. Previews stay out of scope.
- **Edge package goes to the draft through the API.** Edge credentials (client ID
  and API key) enable an upload to `/v1/products/{id}/submissions/draft/package`,
  followed by polling its operation until it succeeds or fails. The API cannot read
  the current draft, so the plan binds the local package only and the operation
  outcome is the read-back. The publish endpoint is never called; the boundary
  check keeps rejecting it.
- **Edge listing goes to the draft through Partner Center.** A Partner Center module
  mirrors the Chrome Dashboard module: dedicated profile, loopback CDP, an owned work
  tab for the exact product, guarded page and heading checks, hash-only reads, Save
  as draft, and a full re-read. It ships after its selectors are verified against a
  real product in a reviewed, reversible draft, recorded in `docs/validation.md`.
- **Credentials follow the AMO pattern.** `DASHBYE_EDGE_CLIENT_ID` and
  `DASHBYE_EDGE_API_KEY`, or an `edge` entry in the private `credentials.json`
  (mode 0600). Errors name the operation and HTTP status only; Microsoft and AMO
  URLs are redacted like Chrome Dashboard URLs.

## Release workspace additions

```yaml
# dashbye.config.yml
targets:
  firefox:
    artifact: release/x-firefox-v1.2.0.zip
    source: release/x-source-v1.2.0.zip   # required by submit when the build is bundled
    addon: x@example.com
```

```yaml
# store/release.yml
stores:
  firefox:
    reviewerNotes: listing/firefox/reviewer-notes.txt   # build steps for AMO reviewers
```

`stores.edge` listing resources arrive with the Partner Center module.

Release notes live at `store/releases/<version>.notes.md`; `submit` blocks when the
file for the package version is missing.

## Boundary check

`scripts/check-release-boundary.mjs` keeps its rules for every file except one named
AMO writer module, where version creation and `PATCH` are allowed. Any other match,
and any Edge `/submissions` path outside `/draft`, still fails `npm test`.

## Order of work

1. Firefox `submit` with plan, approval and read-back; Firefox listing writes
   gated on approval.
2. Edge credentials, `stores.edge` resources, and the draft package upload.
3. Edge Partner Center listing module, enabled after a recorded real-draft check.

## Verification

Unit tests use fake fetch implementations and fictional IDs for every request,
including the multipart body, the polling sequence, drift refusal, and the
"version created, notes failed" outcome. The boundary script gets tests for the
allowed module and for rejected paths elsewhere. Real AMO and Edge runs are recorded
in `docs/validation.md` before the README claims them.
