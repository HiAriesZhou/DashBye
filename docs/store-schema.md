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
schema: dashbye/config/v1
project: .
artifact: release.zip
resources: store
target:
  itemId: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  language: English – en (default)
  endpoint: http://127.0.0.1:9333
```

Paths in this file resolve from the configuration and project directories. CLI path
overrides resolve from the current directory.

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
