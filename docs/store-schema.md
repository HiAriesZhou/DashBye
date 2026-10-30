# Project and release resources

DashBye keeps reusable tool code separate from product data. A project has a small
entry configuration and a versioned resource directory.

```text
extension-project/
  dashbye.config.yml
  release.zip
  store/
    release.yml
    listing/
      en/description.txt
    assets/
      icon-128.png
      screenshots/01.png
    releases/
      1.2.3.lock.json
```

`dashbye.config.yml`:

```yaml
schema: dashbye/config/v2
project: .
resources: store
browser:
  endpoint: http://127.0.0.1:9333
targets:
  chrome:
    artifact: release.zip
    itemId: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    language: English – en (default)
```

`targets` lists only the stores this extension is managed in. `dashbye init` asks
which ones: the Chrome Web Store is the default, and Firefox Add-ons and Edge
Add-ons are added only when chosen. It shows the packages, build scripts, or store
links it finds for each store, without preselecting any. Other targets:

```yaml
  edge:
    artifact: dist/edge.zip
    productId: d34f98f5-f9b7-42b1-bebb-98707202b21d   # Partner Center product ID
    language: English
  firefox:
    artifact: web-ext-artifacts/example-1.2.3.xpi
    addon: example                                     # AMO slug, numeric ID, or add-on ID
```

Add or remove a target by editing this file or by running `dashbye init` and choosing
**change stores**. The browser endpoint is shared by every store that DashBye
reaches through Chrome. A `dashbye/config/v1` file (one `artifact` and `target`) is
still read as a Chrome-only configuration.

Paths in this file resolve from the configuration and project directories. CLI path
overrides resolve from the current directory.

`browser.display` (optional) names the display, such as a second monitor or a
virtual display, where DashBye places its own Chrome window on macOS.

An artifact or source path may contain `{version}` in its file name, such as
`release/x-chrome-v{version}.zip`. DashBye uses the matching file with the highest
version, so the configuration does not change between releases; `plan` shows the
version it picked. `{version}` is not allowed in directory names.

## Marketing sources beside the release root

Keep generators, HTML templates, fixtures, and unapproved candidate images outside
the DashBye resources directory. Prefer a name such as `marketing/rendered/` for
exported candidates. Do **not** create a second directory also called `store` for
finished upload copies: DashBye treats only the configured `resources` root plus
paths referenced by `release.yml` as desired draft state. A common pattern is to
render candidates under `marketing/rendered/`, copy approved files into
`store/assets/`, and let a repository check assert the pairs match.


`store/release.yml` is the complete desired draft state:

```yaml
schema: dashbye/release/v1
listing:
  defaultLanguage: English – en (default)
  category: Tools
  locales:
    English – en (default):
      description: listing/en/description.txt
      screenshots:
        - assets/screenshots/01.png
      promoVideoUrl: null
  assets:
    icon: assets/icon-128.png
    smallPromo: assets/promo-small-440x280.png
    marqueePromo: null
  globalScreenshots: []
  globalPromoVideoUrl: null
  officialUrl: null
  homepageUrl: https://example.com/
  supportUrl: null
  matureContent: false
privacy:
  singlePurpose: Explain the implemented single purpose.
  permissionJustifications:
    storage: Explain the implemented use of storage.
  hostPermissionJustification: null
  remoteCode:
    uses: false
    justification: null
  collectedData: []
  certifications:
    noSaleOrTransfer: true
    relatedToSinglePurpose: true
    noCreditworthinessUse: true
  policyUrl: https://example.com/privacy
```

The built manifest is authoritative for permissions and host access. Every active
or optional permission needs a matching justification; removed permissions must not
leave stale entries. Host access requires a host justification. DashBye reports
inconsistencies but never invents collection claims or legal certifications.

For the Chrome Web Store, the manifest `version` needs three or four parts (`1.2.0`,
`1.2.0.1`). DashBye reads the draft package version back from the Dashboard, where a
`1.2` or `1` cannot be told apart from dates and file sizes on the same page.
`dashbye validate` (and `plan`, before any browser access) reports a shorter version
as `unreadable_chrome_version`.

`privacy.collectedData` lists the Dashboard data-usage categories the extension
collects, using these exact identifiers (case-sensitive):

| Identifier | Dashboard checkbox |
| --- | --- |
| `personallyIdentifiableInformation` | Personally identifiable information |
| `healthInformation` | Health information |
| `financialAndPaymentInformation` | Financial and payment information |
| `authenticationInformation` | Authentication information |
| `personalCommunications` | Personal communications |
| `location` | Location |
| `webHistory` | Web history |
| `userActivity` | User activity |
| `websiteContent` | Website content |

`dashbye validate` (and `plan`, before any browser access) rejects any other value
with `unknown_collected_data_category` and suggests the closest identifier.

Image requirements:

| Asset | Dimensions | Maximum |
| --- | --- | --- |
| Store icon | 128×128 | 1 |
| Localized or global screenshots | 1280×800 or 640×400 | 5 |
| Small promo tile | 440×280 | 1 |
| Marquee promo tile | 1400×560 | 1 |

Images must be PNG or JPEG. PNG screenshots may not contain alpha. Detailed
descriptions are plain text with 1–16,000 characters. Empty arrays and `null` are
intentional desired state: a plan may remove remote values or assets to match them.

After a verified Chrome sync, `store/releases/<version>.lock.json` records normalized
manifest facts and SHA-256 fingerprints. It contains no credentials or cookies.

## Firefox Add-ons

Add a `stores.firefox` block to `store/release.yml` when Firefox is configured.
Anything it omits falls back to the shared listing (default-language description and
screenshots plus global screenshots, `homepageUrl`, `supportUrl`). Chrome-only
requirements such as the 128×128 icon and privacy declarations do not apply.

```yaml
stores:
  firefox:
    summary: One-line summary shown on AMO   # required, at most 250 characters
    categories: [other]                      # AMO category slugs
    description: listing/firefox/description.txt   # optional
    supportEmail: null                       # optional
    screenshots: []                          # optional; replaces the shared screenshots
    reviewerNotes: listing/firefox/reviewer-notes.txt   # optional; build steps for AMO reviewers
```

AMO has no draft. Creating a version submits it for review, and listing edits go live
immediately. `plan` compares this block with the add-on on AMO:

- **Before AMO approves the package version**, `sync-draft` only uploads the package
  for validation and shows the listing changes that wait for approval. Submit the
  version with `dashbye submit` ([usage](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md#submitting-a-firefox-version)).
- **Once AMO's current version equals the package version**, `sync-draft` updates
  `summary`, `description`, `homepageUrl`, `supportEmail`, and `categories`, then
  re-reads the add-on. Support URL and screenshots stay manual in AMO Developer Hub.

The package manifest must set `browser_specific_settings.gecko.id`. `submit` also
needs release notes at `store/releases/<version>.notes.md` and, when the code is
bundled or minified, a source archive in `dashbye.config.yml`:

```yaml
targets:
  firefox:
    artifact: release/x-firefox-v1.2.0.zip
    source: release/x-source-v1.2.0.zip
    addon: x@example.com
```

Validation uploads need an AMO API key (Developer Hub → Tools → Manage API Keys).
Provide it as `DASHBYE_AMO_ISSUER` and `DASHBYE_AMO_SECRET`, or in
`credentials.json` in the DashBye state directory, readable only by you:

```json
{ "amo": { "issuer": "user:12345:67", "secret": "…" } }
```

Never put the key in the repository or in `dashbye.config.yml`.

## Microsoft Edge Add-ons

`sync-draft` uploads the Edge package to the product's draft submission with the
Edge Add-ons API and waits for the upload operation to succeed. It never calls the
publish endpoint: review the draft, update the store listing, and publish in
Partner Center. The API has no listing fields and no read of the current draft, so
the plan shows the upload only.

Create an API key in Partner Center (Microsoft Edge → Publish API) and provide it as
`DASHBYE_EDGE_CLIENT_ID` and `DASHBYE_EDGE_API_KEY`, or in the same private
`credentials.json`:

```json
{ "edge": { "clientId": "…", "apiKey": "…" } }
```
