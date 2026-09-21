# Architecture

DashBye separates local intent, remote observation, and approved writes.

1. `init.ts` supports a confirmed terminal wizard and a non-writing Agent JSON
   protocol that returns one missing input or a complete configuration preview.
2. `workspace.ts` discovers `dashbye.config.yml`, resolves project-controlled paths,
   loads `store/release.yml`, validates image constraints, and checks privacy
   declarations against the actual extension manifest.
3. `artifact.ts` reads a ZIP, build directory, or manifest and normalizes version,
   permissions, optional permissions, host scopes, and content-script matches.
4. `release-lock.ts` records verified artifact and resource fingerprints after a
   successful save and read-back. The previous lock makes permission drift visible.
5. `dashboard-v2.ts` connects only to a loopback CDP endpoint and one exact item edit
   tab. It reads package, listing, and privacy state into hashes and booleans that do
   not expose field contents.
6. `reconcile.ts` creates a complete desired-state plan: upload, update, replace,
   remove, and reorder. The approval hash binds the item, artifact, resources, remote
   snapshot, and exact operations.
7. `cli.ts` revalidates the approved plan against a fresh remote read immediately
   before writing. After **Save draft**, it rereads all supported state and writes a
   lock only when no operation remains.

The CLI does not launch or authenticate Chrome. A person starts official Chrome with
a dedicated profile, signs in, and opens the intended item. Browser selectors are
guarded by page, heading, language, and final state checks. A mismatch stops the run
instead of guessing another field or item.

The Dashboard is not a stable public automation API. Unit tests cover local parsing,
validation, and planning; real selector behavior still requires a reviewed,
reversible draft verification after Dashboard UI changes.
