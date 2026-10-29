# Architecture

DashBye separates local intent, remote observation, and approved writes.

0. `project.ts` reads `dashbye.config.yml`. Its `targets` name the stores this
   extension is managed in; commands touch only those (or a `--store` subset).
   `stores/detect.ts` collects per-store evidence from packages, scripts, and links during init; Chrome Web Store is the default and Firefox and Edge are added only when chosen.
1. `init.ts` supports a confirmed terminal wizard and a non-writing Agent JSON
   protocol that returns one missing input or a complete configuration preview.
2. `workspace.ts` discovers `dashbye.config.yml`, resolves project-controlled paths
   (`versioned-path.ts` resolves `{version}` in file names to the newest match),
   loads `store/release.yml`, validates image constraints, and checks privacy
   declarations against the actual extension manifest.
3. `artifact.ts` reads a ZIP, build directory, or manifest and normalizes version,
   permissions, optional permissions, host scopes, and content-script matches.
4. `release-lock.ts` records verified artifact and resource fingerprints after a
   successful save and read-back. The previous lock makes permission drift visible.
5. `dashboard-v2.ts` connects only to a loopback CDP endpoint and selects a work tab
   for the exact item. A non-secret `window.name` marker lets separate CLI commands
   reuse it; user editors remain untouched. Pending Dashboard login redirects are
   recognized so retries do not open more tabs. It reads package, listing, and
   privacy state into hashes and booleans that do not expose field contents. It also
   reads an edit lock (`edit-lock.ts`): whether the item shows **Pending review** and
   whether the listing or privacy page has disabled fields. Listing images are
   fingerprinted from the stored upload (`dashboard-image.ts` requests the image
   service's original size through the page), not from the lossy preview thumbnail.
6. `reconcile.ts` creates a complete desired-state plan: upload, update, replace,
   remove, and reorder. The approval hash binds the item, artifact, resources, remote
   snapshot, and exact operations. A locked draft still gets a plan, with the reasons
   bound under `blocking`.
7. `stores/` holds the API-based adapters. Firefox (`stores/firefox/`) reads the
   add-on from AMO: until AMO has approved the package version, the plan only
   validates the package; once it has, `sync-draft` updates the listing fields AMO's
   API accepts and re-reads them. `submit.ts` builds a separate plan for a new listed
   version (package, source archive, release and reviewer notes, AMO state). Every
   AMO write lives in `amo-write.ts`, the only file the release-boundary check
   exempts. Edge (`stores/edge/`) uploads the package to the draft submission and
   records what it uploaded, because the API cannot read the draft. API keys come
   from `credentials.ts`; `net.ts` sends store API requests through
   `HTTP(S)_PROXY` when set and keeps loopback CDP off the proxy.
   `multi-plan.ts` combines the store plans under one approval hash.
8. `cli.ts` refuses a blocked plan before opening Chrome, and refuses to write when
   a fresh read finds the draft locked. `release` and `sync-draft` share one
   execution path: it revalidates the approved plan against a fresh remote read
   immediately before writing. After **Save draft**, it rereads all supported state,
   retries once with only the remaining approved changes when a save is not
   confirmed, and writes a lock only when no operation remains. `release` asks for a
   Firefox submission separately, default no. `text-preview.ts` shows listing-text
   changes in the terminal only; plans and JSON output stay value-free.

When the loopback endpoint is not answering, the CLI opens official Chrome with a
dedicated DashBye profile (`chrome.ts`); it never authenticates. When the endpoint
answers but lists no page target (Chrome left running with every window closed, which
Playwright cannot attach to), it re-runs Chrome with the same profile and the generic
Dashboard URL so the running instance opens a window. A person signs in,
and `session.ts` waits for that in a terminal before selecting the intended item.
Plans and the last remote state read (`plan --remote`) are saved in the platform
state directory (`paths.ts`), outside every repository. `displays.ts` can move
DashBye's own window to the display named in `browser.display` (macOS). Browser selectors are
guarded by page, heading, language, and final state checks. A mismatch stops the run
instead of guessing another field or item.

The Dashboard is not a stable public automation API. Unit tests cover local parsing,
validation, and planning; real selector behavior still requires a reviewed,
reversible draft verification after Dashboard UI changes.
