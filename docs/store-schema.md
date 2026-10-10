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

`targets` lists only the stores this extension is managed in; `dashbye init` asks
which ones and suggests stores whose packages, build scripts, or store links it finds
in the repository. Other targets:

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

After a verified sync, `store/releases/<version>.lock.json` records normalized
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
```

AMO has no draft. Creating a version submits it for review, and listing edits go live
immediately, so DashBye never does either. `plan` compares this block with the add-on
on AMO and lists the fields to update by hand; `sync-draft` only uploads the package
for AMO validation. The package version must be newer than the AMO version, and its
manifest must set `browser_specific_settings.gecko.id`.

Validation uploads need an AMO API key (Developer Hub → Tools → Manage API Keys).
Provide it as `DASHBYE_AMO_ISSUER` and `DASHBYE_AMO_SECRET`, or in
`credentials.json` in the DashBye state directory, readable only by you:

```json
{ "amo": { "issuer": "user:12345:67", "secret": "…" } }
```

Never put the key in the repository or in `dashbye.config.yml`.
