# Dashbye

*Less dashboard. More shipping.*

少填表，多发布。

Dashbye safely compares a repository-owned Chrome Web Store listing
with an already authenticated Developer Dashboard tab. It can append missing
listing images, update the detailed description, save a draft, and reload the
page to verify the result.

The tool never signs in to Google, submits an item for review, publishes,
archives, changes privacy declarations, or removes existing images.

## Status

This is an early technical release. The supported path is a user-launched,
dedicated Chrome profile with loopback-only remote debugging. Reusing that
profile in a new headless browser process is not supported.

The package is marked private to prevent accidental npm publication while the
public repository and release process are still under review.

## Install

```bash
npm install
npm run build
```

Node.js 22 or later is required. Chrome must be started separately with a
dedicated user data directory and a loopback remote debugging port. Never use
your daily Chrome profile.

On macOS, one example is:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/absolute/path/outside/the/repository/cws-profile \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  https://chrome.google.com/webstore/devconsole
```

Log in manually and open the exact item you intend to inspect. The profile path
must be dedicated to this tool and must stay outside both the repository and any
cloud-synchronized folder.

## Commands

```bash
# Validate local configuration and image requirements without a browser.
npm start -- validate --config examples/store/store.yml

# Read the selected item and language without changing the Dashboard.
npm start -- inspect \
  --endpoint http://127.0.0.1:9333 \
  --item-id your-extension-id \
  --language "English – en (default)"

# Show the planned draft changes.
npm start -- plan \
  --config /path/to/store.yml \
  --endpoint http://127.0.0.1:9333 \
  --item-id your-extension-id

# Apply only the displayed append/update operations and save the draft.
npm start -- sync-draft \
  --config /path/to/store.yml \
  --endpoint http://127.0.0.1:9333 \
  --item-id your-extension-id \
  --confirm-item-id your-extension-id \
  --confirm-existing-prefix
```

`--confirm-existing-prefix` is required when a screenshot section is partly
populated. It means you manually verified that the existing images match the
first files in the configured order. The tool will stop if the Dashboard has
more images than the configuration.

See [store schema](docs/store-schema.md), [architecture](docs/architecture.md),
and [security model](docs/security.md).

## Release boundary

Dashbye stops after saving and re-reading a draft. Review submission
and publishing remain deliberate human actions in the Developer Dashboard.
