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
