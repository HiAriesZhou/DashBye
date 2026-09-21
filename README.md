# Dashbye

*Less dashboard. More shipping.*

少填表，多发布。

Dashbye versions and reconciles a Chrome Web Store package, listing copy,
screenshots, promotional assets, and privacy declarations from files owned by the
extension project. It connects to an already authenticated, dedicated Chrome
profile, saves only a draft, and reads the result back.

Dashbye is product-neutral. Each extension supplies its own project, artifact,
resource paths, target item, and language through `dashbye.config.yml`.

## Status

This is an early technical release. The real Dashboard path has been verified for
read-only inspection, complete comparison, screenshot upload, draft save, and
read-back. Package upload and complete privacy reconciliation remain guarded by an
exact plan hash and should be verified on a reviewed draft before broader use.

Dashbye does not automate Google login, submit an item for review, or publish it.
It does not assume headless authentication works. The supported browser path is
official Chrome with a separate user data directory and loopback CDP endpoint.

## Install and help

```bash
npm install
npm run build
node dist/src/cli.js -h
```

Node.js 22 or later is required. `dashbye -h` is the complete manual for commands,
initialization, options, defaults, and agent use; subcommands do not have separate
help pages.

Run `dashbye init` once in an interactive terminal, or initialize without prompts:

```bash
dashbye init \
  --project /path/to/extension \
  --artifact dist/release.zip \
  --resources store \
  --item-id aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --language "English – en (default)" \
  --endpoint http://127.0.0.1:9333 \
  --non-interactive
```

The generated configuration is discovered from the current directory upward.
Command-line overrides take precedence over it.

## Browser setup

Start Chrome yourself with a profile outside the repository and outside synced
folders. On macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/Library/Application Support/Dashbye/chrome-profile" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  https://chromewebstore.google.com/devconsole
```

Log in manually and open exactly one edit tab for the intended item. Dashbye never
opens a login window, bypasses verification, reads Chrome profile databases, or
copies cookies into configuration, logs, or Git.

## Release flow

```bash
dashbye validate
dashbye doctor --json
dashbye inspect --output current-draft.json
dashbye plan --output dashbye-plan.json
dashbye sync-draft \
  --plan dashbye-plan.json \
  --approve-plan <exact-approval-hash> \
  --non-interactive
```

`validate` compares manifest permissions with privacy declarations. `plan` produces
complete desired-state operations, including replacements and removals. The plan is
bound to the item, artifact, release resources, and current Dashboard state. Any
change invalidates it. `sync-draft` requires the exact approval hash, saves the
draft, reads all supported fields again, and writes a version lock only after they
match.

See [resource schema](docs/store-schema.md), [architecture](docs/architecture.md),
and [security model](docs/security.md).

## Release boundary

The final automated boundary is **Save draft**. Review submission and publication
remain deliberate actions in the Chrome Web Store Developer Dashboard.
