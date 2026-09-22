# DashBye usage guide

[Back to README](../README.md) · [简体中文](usage.zh-CN.md)

DashBye is designed to be operated with a coding agent. The agent handles repository inspection and repeatable CLI work; you supply product facts, sign in, and approve the exact draft plan.

## Agent setup

Open the extension repository in an agent with local file and terminal access, then paste:

```text
Install and configure DashBye for the extension repository in this session.
Source: https://github.com/HiAriesZhou/DashBye

1. Read AGENTS.md, inspect git status, and preserve unrelated changes. Check
   Node.js 22+ and Git. Install without sudo:
   npm install --global dashbye
   If unavailable, clone outside this extension repository, run npm ci, and use
   node /absolute/path/to/DashBye/dist/src/cli.js in place of dashbye.
2. Read dashbye -h and docs/store-schema.md from the source repository. Run:
   dashbye init --agent --json --project <absolute extension repository path>
   Supply known values as flags. For needs_input, ask one concise chat question.
   Map itemId to --item-id; the other input fields use --project, --artifact,
   --resources, --language and --endpoint. Repeat with accumulated flags.
3. For existing_config, recommend reuse; reconfigure only if I choose it.
   For ready, show the preview and execute writeCommand as an argument array
   after my confirmation. With the local CLI fallback, replace its executable.
4. Audit the actual build and existing store resources. Keep the complete desired
   listing, artwork and privacy state in this extension's configured resource
   directory. Never invent permissions, collection claims or certifications.
   Run validate; templates are placeholders, not release-ready declarations.
5. Before Dashboard access, launch official Chrome with a dedicated profile
   outside all repositories and a loopback remote-debugging endpoint. Request
   any required GUI permission instead of asking me to run the command. Ask me
   only to sign in to Google in the opened window. If your environment cannot
   launch GUI apps, explain the limitation and provide the exact fallback
   command. Then run inspect and plan. Show the target and all proposed changes
   and wait for my explicit approval before sync-draft.
6. Require a successful read-back with no remaining operations. Never submit for
   review or publish. Report changes, validation and unresolved issues.
```

Once DashBye is installed, generate a handoff with known values included:

```bash
dashbye agent-prompt \
  --project /path/to/extension \
  --artifact dist/release.zip
```

### How the agent protocol works

`init --agent --json` returns one of three states:

- `needs_input`: the agent asks you for one missing value and retries with accumulated flags.
- `ready`: the agent shows the preview, then runs the argument-array `writeCommand` after confirmation.
- `existing_config`: the agent recommends reuse unless you explicitly choose reconfiguration.

This is a text protocol and needs no graphical control. A chat without local file and terminal access can only guide you.

The agent may derive manifest facts and organize files, but it must ask when repository evidence cannot establish product behavior, data use, legal certifications, or permission purposes. The agent launches the dedicated Chrome session; you complete Google sign-in in the opened window. Every Dashboard write remains bound to the exact plan you approve.

## Manual CLI workflow

Requires Node.js 22+, Git, official Chrome, and an existing Chrome Web Store item.

Install and initialize from the extension repository:

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

The wizard collects the project, built artifact, resource root, exact item ID, Dashboard language, and loopback Chrome endpoint. Review its preview before writing.

Fill the generated release templates with the complete desired listing and privacy state. Empty lists and `null` can request removal; include all content you intend to retain. See the [resource schema](store-schema.md).

Validate before browser access:

```bash
dashbye validate
```

After connecting Chrome as described below, store diagnostic files in an existing private directory outside the repository:

```bash
dashbye doctor --json
dashbye inspect --output /path/to/private-output/current-draft.json
dashbye plan --output /path/to/private-output/draft-plan.json
```

Review the target and every add, update, reorder, replacement, and removal. To execute the reviewed plan, use its exact `approvalHash`:

```bash
dashbye sync-draft \
  --plan /path/to/private-output/draft-plan.json \
  --approve-plan APPROVED_PLAN_HASH \
  --non-interactive
```

DashBye rejects the plan if the target, artifact, resources, or remote draft changed. A successful run saves the draft, reads it back with zero remaining operations, and writes the release lock.

## Install from source

Clone DashBye outside your extension repository:

```bash
git clone https://github.com/HiAriesZhou/DashBye.git
cd DashBye
npm ci
node dist/src/cli.js -h
```

The prepare script builds the CLI during `npm ci`. Run subsequent commands from the extension repository, replacing `dashbye` with `node /absolute/path/to/DashBye/dist/src/cli.js`.

## Connect Chrome

Use official Chrome with a dedicated profile outside all repositories. The profile stores Chrome settings and the login session; it is not a DashBye account. Keep it separate from your everyday browser.

On macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/Library/Application Support/DashBye/chrome-profile" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  https://chromewebstore.google.com/devconsole
```

On Windows or Linux, invoke the installed official Chrome executable with the same remote-debugging flags and a dedicated absolute profile path. Executable locations vary. The configured endpoint must match the port, such as `http://127.0.0.1:9333`; DashBye accepts only loopback endpoints.

Sign in manually, then run `dashbye doctor --json` from the extension repository and inspect `browser.connected` and all reported issues.

- If disconnected, check the Chrome process, debugging port, and configured endpoint.
- If authentication expired, sign in again manually.
- If multiple edit tabs target the same item, keep one open.
- If the wrong language is selected, use the exact Dashboard language label. Multi-locale operation remains unverified.

DashBye reuses the matching edit tab or navigates the dedicated session to the configured item. It does not launch Chrome, automate login, or export cookies. Headless session reuse remains unverified.

## Configuration and repeat releases

Initialization is normally once per extension. Later commands discover the nearest `dashbye.config.yml`; explicit CLI options override its values. YAML paths resolve relative to their config or resource directory, while CLI paths resolve from the current working directory.

Keep browser profiles, inspect output, plans, screenshots of real listings, and other diagnostics outside repositories. Release locks belong in the configured resource directory.

For each release: rebuild the extension, update the resource files, validate, generate a plan, review and approve it, then sync. Regenerate the plan whenever the package, resources, or Dashboard draft changes. Never reuse an old approval hash.

DashBye has no backend or telemetry. An external agent’s treatment of files and conversation content depends separately on that agent’s permissions and policies.

## Further reference

Run `dashbye -h` for all commands and options. See [validation status](validation.md), [security](security.md), and [architecture](architecture.md).
