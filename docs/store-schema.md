# Store configuration

Configuration uses YAML. Paths resolve relative to the YAML file.

```yaml
schema: cws-release-kit/v1
language: English – en (default)
description: listing.txt
assets:
  icon: assets/icon-128.png
  localizedScreenshots:
    - assets/screenshots/01.png
  globalScreenshots: []
  smallPromo: assets/promo-small-440x280.png
  marqueePromo: null
```

The item ID and CDP endpoint are intentionally command-line arguments. This keeps
production targets out of reusable listing files and makes every run explicit.

Image requirements:

| Asset | Dimensions | Limit |
| --- | --- | --- |
| Store icon | 128×128 | one |
| Localized screenshots | 1280×800 or 640×400 | five |
| Global screenshots | 1280×800 or 640×400 | five |
| Small promo | 440×280 | one |
| Marquee promo | 1400×560 | one |

Screenshots must be PNG or JPEG. PNG screenshots may not contain an alpha channel.
Descriptions are plain text and must not exceed 16,000 characters.

Privacy declarations, category, distribution, test credentials, review submission,
and publishing are outside this schema and outside the v0.1 CLI.
