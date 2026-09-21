# DashBye

*Less dashboard. More shipping.*
少填表，多发布。

DashBye keeps a Chrome extension's Web Store package, descriptions, screenshots,
promotional artwork, and privacy declarations in versioned project files. It
compares those files with the current Chrome Web Store Dashboard draft, shows the
exact differences, applies an approved plan, saves the draft, and reads it back.

## The problem it solves

Chrome Web Store releases mix code with state that normally lives only in a web
form. That creates several recurring problems:

- new screenshots exist in the repository while the Dashboard still shows old ones;
- manifest permissions change but permission and privacy explanations become stale;
- descriptions, URLs, data-use declarations, and image order have no reviewable
  history;
- repeated manual editing makes omissions and accidental changes hard to detect;
- an agent can prepare a release, but it lacks a safe contract for what it may write.

DashBye turns the complete draft into a desired state owned by the extension
repository. `validate` checks the package and declarations, `plan` lists every
change, and `sync-draft` accepts only that exact approved plan. Automation stops at
**Save draft**. DashBye never submits for review or publishes an extension.

## Install with an agent — recommended

Use this path with Codex, Claude Code, or another coding agent that can access your
extension repository and run terminal commands. Copy the following prompt into the
agent session for that extension:

```text
Install and configure DashBye for the Chrome extension repository in this session.

DashBye source: https://github.com/HiAriesZhou/DashBye

Work inside the extension repository for product files. Keep the DashBye source,
browser profile, downloaded packages, logs, screenshots, traces, credentials, and
cookies outside the extension repository.

1. Read the extension repository's AGENTS.md and relevant documentation. Inspect
   git status and preserve unrelated work.
2. Verify Node.js 22 or later. Install DashBye from the GitHub source without using
   sudo. Prefer:
     npm install --global git+https://github.com/HiAriesZhou/DashBye.git
   If global installation is unavailable, clone DashBye outside the extension
   repository, run npm ci and npm run build there, and use its dist/src/cli.js.
3. Run dashbye -h. Then start the non-writing setup guide with:
     dashbye init --agent --json --project <absolute extension repository path>
4. When the guide returns status "needs_input", ask me that one question. Use the
   host's native choice/menu UI when available; otherwise ask one concise chat
   question. Preserve each answer as the matching init flag and call the guide
   again. Inspect the repository and offer evidence-based artifact choices instead
   of asking me to locate files the agent can find itself.
5. When it returns "existing_config", offer its use-existing and reconfigure
   actions, recommending the existing configuration. Reconfigure only if I choose
   it explicitly. When it returns "ready", show me its configuration preview. Then
   run the returned writeCommand to create dashbye.config.yml and missing store
   templates. Do not overwrite existing configuration unless I explicitly choose
   to reconfigure it.
6. Audit the actual built manifest and existing store resources. Organize the
   complete desired state under the configured project-owned resource directory;
   do not move product assets into the DashBye repository. Never invent product
   claims, data collection, legal certifications, or permission purposes.
7. Run dashbye validate. Explain remaining issues and fix repository-owned inputs
   where evidence is sufficient.
8. Do not open or automate Google login. When Dashboard access is needed, stop and
   ask me to start a dedicated Chrome profile and sign in manually.
9. Run inspect and plan before any Dashboard write. Report the exact item and every
   add, update, replacement, removal, or reorder. Wait for my explicit confirmation
   of that concrete plan before sync-draft.
10. Never submit for review or publish. After an approved draft sync, require a
    successful read-back with zero remaining operations and report what succeeded,
    failed, or remains unverified.

Carry out the work; do not return only a plan or generic instructions.
```

An agent can display native menus only when its host exposes a structured question
tool. `dashbye init --agent --json` supplies the question schema, defaults, choices,
and validation, but cannot force a generic chat interface to render buttons. When
native menus are unavailable, the same flow works as one question per message.

Plain ChatGPT without repository and terminal access cannot install DashBye or edit
local files. It can explain the schema or draft configuration, but a coding agent or
terminal session must perform installation and validation.

## Install in a terminal

Node.js 22 or later is required.

```bash
git clone https://github.com/HiAriesZhou/DashBye.git
cd DashBye
npm ci
npm run build
npm link
dashbye -h
```

Do not use `sudo`. If `npm link` is unavailable, run the CLI as
`node /path/to/DashBye/dist/src/cli.js`.

Move to the extension repository and start the interactive setup:

```bash
cd /path/to/extension
dashbye init
```

The terminal wizard asks for the project, package or manifest, release-resource
directory, Chrome Web Store item ID, Dashboard language, and dedicated Chrome
endpoint. It shows the resulting configuration before writing it. Existing copy
and assets are preserved unless `--overwrite` is explicitly supplied.

For automation, pass all values directly:

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

## What lives in the extension repository

DashBye is product-neutral. Each extension owns its configuration and complete
desired Chrome Web Store state:

```text
extension-project/
  dashbye.config.yml
  store/
    release.yml
    listing/
      en/description.txt
    assets/
      icon/
      screenshots/
      promo/
    releases/
      <version>.lock.json
```

`dashbye.config.yml` points to the project, built artifact, resource directory,
exact item ID, Dashboard language, and loopback Chrome endpoint. `release.yml`
defines listing fields and privacy declarations. A release lock is written only
after a successful save and zero-difference read-back.

See the complete [resource schema](docs/store-schema.md).

## Browser setup

Start official Chrome yourself with a dedicated profile outside repositories and
cloud-synchronized folders. On macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/Library/Application Support/DashBye/chrome-profile" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  https://chromewebstore.google.com/devconsole
```

Sign in manually and open exactly one edit tab for the intended item. DashBye never
opens a login window, bypasses verification, reads Chrome profile databases, or
copies cookies into configuration, logs, or Git.

## Draft release flow

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

`validate` compares the actual manifest with listing and privacy declarations.
`plan` reports additions, updates, replacements, removals, and reordering. The plan
hash binds the target item, artifact, resources, exact operations, and current
Dashboard state; any intervening change makes it stale. `sync-draft` saves only the
approved draft and then verifies the complete state again.

## Current status and boundaries

DashBye is an early technical release. Real Dashboard validation covers read-only
inspection, package upload, icon and promotional artwork replacement, screenshot
replacement, selected privacy-copy updates, draft save, and read-back.

Google login remains manual. Headless session reuse, multiple Dashboard languages,
collected-data changes, certification changes, and permission-change confirmations
have not yet been fully validated. Review submission and publication are
intentionally outside the codebase.

Read the [architecture](docs/architecture.md), [security model](docs/security.md),
and [technical validation record](docs/validation.md) for implementation details
and tested limits.
