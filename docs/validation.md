# Technical validation status

The records below describe real runs with a manually authenticated, dedicated
Chrome profile or owner-approved API access. They establish the exercised scope,
not coverage of every version, locale, store state, or later code change.

## Confirmed scope

| Surface | Real verification |
| --- | --- |
| Chrome Web Store | Package upload; listing, image, URL, data-use and privacy reads; icon, screenshot and promo-tile replacement; selected privacy-copy changes; draft saving and zero-operation read-back. |
| Chrome session | Existing dedicated-session use; navigation to the exact item; preserving user editors; reopening a window in a running dedicated Chrome with every window closed (2026-10-12). |
| AMO | One approved version submission with source archive and notes, followed by version read-back; one description update after AMO approved that version (2026-10-20). |
| Edge | One package upload to a draft submission with a successful API operation; nothing was published (2026-10-20). The API cannot read draft contents. |
| Agent initialization | The `needs_input` → `ready` → approved write → `existing_config` flow in Codex Desktop (2026-09-22), including the local built-CLI fallback when no global executable was present. |

Local tests cover parsing, manifest/resource validation, deterministic planning,
stale-plan guards and output redaction. They do not replace real selector checks.

## Image-comparison basis

Current comparisons use stored originals from Google's image service rather than
lossy Dashboard thumbnails. On 2026-10-12, unchanged text-dense screenshots measured
0.027–0.032 worst-block difference against their WebP thumbnails, while the stored
PNG originals compared at 0.0000. The read-only plan then reported zero operations.
No images or authenticated URLs were retained.

Screenshots combine a 64×40 grayscale signature, compared by its worst 8×8 block,
with a 16×16 RGB signature. The block tolerance is 0.025 and colour tolerance is
0.012. Earlier thumbnail calibration found noise up to 0.0155 and a redesigned
screenshot at least 0.0357. A colour-only change (`#d03030` versus `#507a50`) escaped
the grayscale check at 0.0078, so RGB comparison remains required. The combined
check is unit-tested; real-thumbnail calibration covered the grayscale part only.
Icons and promo tiles use the 16×16 RGB comparison and were not recalibrated.

Read-back from stored originals after a new real image replacement, and blob:/data:
upload previews, remain unvalidated on a real Dashboard.

## Dashboard guards

- Package upload uses the in-page ZIP/CRX input, not a native file chooser, and
  verifies the resulting draft version.
- The remote-code privacy card must contain yes/no radios so permission text
  mentioning remote code cannot select a different card.
- Image removal confirms the planned removal and waits for replacement previews
  before saving. Reads and writes target visible controls; previews are
  de-duplicated by rendered position, not image content.
- Language selection prefers the full configured label, such as
  `English – en (default)`, with a legacy short-label fallback.
- Read-only checks on 2026-10-12 confirmed that Pending review blocks writes. An
  unlocked check on 2026-10-14 confirmed that a single disabled remote-code field
  must not lock the whole privacy page; a page is locked only when all visible
  text fields are disabled. The live guard immediately before filling has not
  been exercised against a real locked Dashboard.
- Section readiness requires both the expected URL suffix and the section title.
  Two read-only plans on 2026-10-12 matched the preceding adapter's operations and
  remote hash. The section-URL fallback itself was not exercised.

## Chrome artwork example

On 2026-09-22, an approved run for Bookmark Assistant 1.4.2 replaced only the
440×280 small promotional tile on its English listing. It used DashBye 0.2.0 with
a temporary privacy-field navigation compatibility fix, not an unmodified 0.2.1.
The initial read-back still differed. A later plan found no remaining operations;
a zero-operation verification sync returned `saved_and_reread`, wrote the release
lock, and another plan returned `operations: []`. No package was uploaded, submitted
for review, or published in this run.

The current bounded settling reads are read-only. The separate recovery for an
unconfirmed Save draft may apply remaining approved changes once. Neither recovery
branch has yet been exercised on a real Dashboard.

## AMO submission and listing verification

The 2026-10-20 submission read back its version, source presence, and reviewer
notes. AMO returned release notes as rendered HTML, so the first run reported
`submitted_incomplete`; comparison now normalizes that rendering (`amoText`), and
the same notes compare equal. AMO subsequently approved the version, and another
submission was blocked because the version already existed. After approval, the
listing description update read back correctly and a new plan had no differences.

## Not yet validated on real stores

- The complete `release` flow: automatic Chrome startup, waiting for manual sign-in,
  text previews, draft confirmation, and the separate default-no Firefox prompt.
- Chrome's post-approval input-drift rejection and buffered package/image uploads.
- A collected-data change, certification change, or new permission confirmation.
- Multiple locales and Dashboard languages other than English.
- The stored-original image and navigation/recovery branches noted above.
- `browser.display` placement and proxy behavior as part of a complete real release.
- Sign-in and Dashboard operations on Windows and Linux. CI checks only Chrome
  discovery, dedicated-profile startup, and the loopback endpoint on those systems.

Use a real release need to extend these records; do not manufacture live listing
changes just to exercise unvalidated branches. Every applicable write still needs
its own approved plan.

## Outside the product boundary

- Headless Chrome and daily-browser profile reuse.
- Edge listing fields, review submission, and publication; these stay in Partner
  Center. Only the draft package is automated.
- Chrome review submission and publication. The only review-submission exception
  is the separately approved AMO path reached by `submit` or `release`.
