# Repository rules

- Treat every Dashboard write as production-adjacent, even when the UI says Draft.
- Never add review submission, publishing, archive, login automation, CAPTCHA
  handling, or fingerprint spoofing.
- Asset deletion/replacement and privacy draft writes require a bound plan and
  explicit approval. Never infer or invent data-use certifications.
- Accept CDP endpoints only on loopback and require an exact item ID and language.
- Never log account names, publisher IDs, cookies, tokens, field contents, or full
  authenticated URLs.
- Browser profiles, reports, downloaded packages, screenshots from real listings,
  HAR files, and traces must stay outside the repository.
- Every write must be preceded by a plan and followed by a reload/read-back check.
- Examples and tests must use fictional item IDs and synthetic assets only.
