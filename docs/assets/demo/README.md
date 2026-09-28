# Example case notes

This is the record behind the example in the [README](../../../README.md#example).

## Record

- **Date:** 2026-09-22
- **Extension:** Bookmark Assistant 1.4.2
- **DashBye:** 0.2.0 with a temporary Dashboard compatibility fix for the readiness
  of a Privacy-page field during navigation. This is not a record of an unmodified
  0.2.1 run.
- **Before the run:** configuration and manual Google sign-in were complete.
- **Approved plan:** one operation on `English – en (default)`: replace the
  **440 × 280 small promotional tile**. The owner approved it by replying “保存”
  (“Save”). No package was uploaded in this run.
- **Result:** the initial sync did not pass its immediate read-back. A later inspect
  and plan found no remaining operations; a zero-operation verification sync then
  reported `saved_and_reread`, and another plan returned `operations: []`.
- **Not performed:** review submission and publication.

`sync-draft` now rereads a saved draft several times before reporting a difference;
see [validation](../../validation.md).

## Screenshots

Not published yet. Screenshots of the request, the plan, the approval, and the
successful read-back will be added here after owner review. They are cropped and
redacted: no account names, publisher or item IDs, approval hashes, authenticated
URLs, or unrelated conversation.
