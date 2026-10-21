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
   Supply known values as flags. For needs_input, ask one concise chat question
   and pass the answer with that question's flag. The first question is which
   stores to manage: show me the detected evidence and let me choose. Repeat
   with accumulated flags.
3. For existing_config, recommend reuse; change stores or reconfigure only if I
   choose it.
   For ready, show the preview and execute writeCommand as an argument array
   after my confirmation. With the local CLI fallback, replace its executable.
4. Audit the actual build and existing store resources. Keep the complete desired
   listing, artwork and privacy state in this extension's configured resource
   directory. Never invent permissions, collection claims or certifications.
   Run validate; templates are placeholders, not release-ready declarations.
5. Run plan with --json. DashBye opens its dedicated Chrome when it needs the
   Dashboard; ask me only to sign in to Google in that window, then run plan
   again. If your environment cannot open GUI apps, explain the limitation and
   ask me to run "dashbye doctor --login". Show the target and all proposed changes and
   wait for my explicit approval before sync-draft --approve-plan <approvalHash>.
6. Require a successful read-back with no remaining operations. Never submit for
   review or publish. Report changes, validation and unresolved issues.
```

Once DashBye is installed, generate a handoff with known values included:

```bash
dashbye init --prompt \
  --project /path/to/extension \
  --artifact dist/release.zip
```

### How the agent protocol works

`init --agent --json` returns one of three states:

- `needs_input`: the agent asks you for one missing value and retries with accumulated flags. Each question names its flag; the first one asks which stores to manage.
- `ready`: the agent shows the preview, then runs the argument-array `writeCommand` after confirmation.
- `existing_config`: the agent recommends reuse unless you choose to change stores (`--stores`) or reconfigure (`--overwrite`).

This is a text protocol and needs no graphical control. A chat without local file and terminal access can only guide you.

The agent may derive manifest facts and organize files, but it must ask when repository evidence cannot establish product behavior, data use, legal certifications, or permission purposes. DashBye opens the dedicated Chrome session; you complete Google sign-in in that window. Every Dashboard write remains bound to the exact plan you approve.

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

Validate, then generate a plan:

```bash
dashbye validate
dashbye plan
```

`plan` opens the dedicated DashBye Chrome when it is not running (see [Chrome and sign-in](#chrome-and-sign-in)), reads the draft, and lists the target and every add, update, reorder, replacement, and removal. It saves the plan outside the repository; see [Saved files](#saved-files).

Execute the reviewed plan:

```bash
dashbye sync-draft
```

`sync-draft` rereads the draft, shows the plan again, and asks `Save these changes to the Dashboard draft? [Y/n]`. Press Enter to save or `n` to cancel. DashBye rejects the plan if the target, artifact, resources, or remote draft changed. A successful run saves the draft, reads it back with zero remaining operations, and writes the release lock.

While the item is in review, the Dashboard makes every draft field read-only. `plan` still reads the draft and lists the differences, adds `Blocked: item is in review; drafts cannot be edited until review completes`, and records the reason under `blocking` in the JSON plan. `sync-draft` refuses such a plan before opening Chrome, and refuses any plan if the item enters review before writing. Run `plan` again once the review completes.

In a terminal, commands print readable summaries; add `--json` for JSON. Scripts and agents, whose output is not a terminal, get JSON and must approve with `--approve-plan <approvalHash>`. Run `dashbye <command> -h` for the options of one command; unknown options are rejected.

## Install from source

Clone DashBye outside your extension repository:

```bash
git clone https://github.com/HiAriesZhou/DashBye.git
cd DashBye
npm ci
node dist/src/cli.js -h
```

The prepare script builds the CLI during `npm ci`. Run subsequent commands from the extension repository, replacing `dashbye` with `node /absolute/path/to/DashBye/dist/src/cli.js`.

## Choosing stores

`dashbye init` looks for packages (`*.zip`, `*.xpi`, `dist/<browser>/`, `web-ext-artifacts/`, WXT `.output/`), packaging scripts in `package.json`, and store links in the README, then asks which stores to manage. Only the stores you choose are written to `targets` in `dashbye.config.yml`, and only those are validated, planned, and synchronized.

To add or remove a store later, edit `targets` or run `dashbye init` and choose **change stores**; existing targets are kept and only new stores are asked about. `--store chrome` limits `validate`, `plan`, or `sync-draft` to some of the configured stores. `validate` mentions packages it finds for stores you have not configured.

Chrome Web Store drafts are saved and read back. Edge packages are uploaded to the product's draft submission through the Edge Add-ons API; the store listing and publishing stay in Partner Center (see [Microsoft Edge Add-ons](store-schema.md#microsoft-edge-add-ons)). Firefox Add-ons has no draft, so `sync-draft` only uploads the package for AMO validation until AMO has approved that version, and then updates the listing fields AMO's API accepts (see [Firefox Add-ons](store-schema.md#firefox-add-ons)).

## Submitting a Firefox version

AMO has no draft: creating a listed version puts it in the review queue, and it cannot be taken back. `dashbye submit` is the only command that does this.

```bash
dashbye submit                               # show the plan; nothing is submitted
dashbye submit --approve-plan <approvalHash> # submit exactly that plan
```

The plan binds the package, the source archive (`targets.firefox.source`), the release notes (`store/releases/<version>.notes.md`), the reviewer notes (`stores.firefox.reviewerNotes`), and AMO's current state. It is blocked when AMO already has the version, the version is not newer, the release notes are missing, or no AMO API key is set. In a terminal without `--approve-plan`, it asks `[y/N]` and Enter declines.

`submit` uploads the package for validation, creates the version with the source archive, sets the notes, and reads the version back. If anything fails after the version exists, it reports `submitted_incomplete` and does not retry; finish the notes in AMO Developer Hub instead of running `submit` again. After AMO approves the version, run `dashbye plan` and `dashbye sync-draft` to update the listing.

## Chrome and sign-in

`plan`, `sync-draft`, and `release` open official Chrome with a dedicated DashBye profile and the configured loopback debugging port when that endpoint is not answering. `dashbye doctor --login` does the same on request, for example to sign in ahead of time. Pass `--no-launch` to require an already running session instead.

The profile stores Chrome settings and the login session; it is not a DashBye account, and it is separate from your everyday browser. Sign in to Google in the opened window yourself. In a terminal DashBye waits for the sign-in (up to about ten minutes) and then continues; otherwise it stops and asks you to sign in and run the command again.

DashBye looks for Chrome in the standard install locations. If yours is elsewhere, set `DASHBYE_CHROME` to the absolute path of the Chrome executable. The configured endpoint must be loopback, such as `http://127.0.0.1:9333`.

Run `dashbye doctor` to check the configuration and the Chrome connection.

### Proxies

DashBye works with and without a proxy. The connection to the dedicated Chrome is
loopback, so DashBye always reaches it directly, even when `HTTP_PROXY` or
`HTTPS_PROXY` is set. Chrome itself uses your system proxy settings to reach the
store dashboards. Store API requests (AMO, Edge) use `HTTPS_PROXY`/`HTTP_PROXY`
when set, fall back to a direct connection if the proxy cannot connect, and connect
directly when no proxy is set or the host is listed in `NO_PROXY`. SOCKS-only
proxies are not used.

- If Chrome does not open the debugging endpoint, a window using the DashBye profile may already be open without it; quit that Chrome and retry.
- If the DashBye Chrome is still running but every window is closed (common on macOS), the endpoint answers but cannot be used. DashBye opens a Dashboard window in it; with `--no-launch` it stops and asks you to run `dashbye doctor --login` or open a new window (Cmd+N / Ctrl+N). `doctor` reports this as "running without an open window".
- If authentication expired, sign in again in the DashBye Chrome window.
- Duplicate edit tabs are supported; DashBye preserves them and reuses its own
  work tab. Different publisher/account contexts still need to be resolved.
- If the wrong language is selected, use the exact Dashboard language label. Multi-locale operation remains unverified.

DashBye opens one work tab for the configured item and reuses it across commands.
Existing editor tabs remain untouched. A work-tab marker survives same-origin
navigation and reloads; after a cross-origin login clears that marker, DashBye may
open a replacement work tab. While Dashboard sign-in is pending, repeated commands
do not open additional tabs. DashBye never automates login, reads profile data, or
exports cookies. Headless session reuse remains unverified.

## Saved files

Plans, the Chrome draft state read by `plan`, and the Chrome profile are kept in the platform's per-user application directory, outside every repository:

| Platform | Directory |
| --- | --- |
| macOS | `~/Library/Application Support/DashBye` |
| Windows | `%LOCALAPPDATA%\DashBye` |
| Linux and others | `$XDG_STATE_HOME/dashbye` (default `~/.local/state/dashbye`) |

The Chrome profile is in `chrome-profile/`; each project's latest `plan.json` and `inspect.json` are in `projects/<hash>/`, named by a hash of the configuration path. `--output` saves an additional copy wherever you choose.

## Configuration and repeat releases

Initialization is normally once per extension. Later commands discover the nearest `dashbye.config.yml`; explicit CLI options override its values. YAML paths resolve relative to their config or resource directory, while CLI paths resolve from the current working directory.

Keep screenshots of real listings and other diagnostics outside repositories; DashBye's own plans, saved draft state, and Chrome profile already are. Release locks belong in the configured resource directory.

For each release: rebuild the extension, update the resource files, then run `dashbye release`. It validates, plans every store, asks once to save the drafts and once more (default no) to submit a new Firefox version, then reads back and lists what is left to do in the store dashboards. `validate`, `plan`, `sync-draft`, and `submit` run the same steps one at a time. Without a terminal, `release` prints the plan and the `--approve-plan` / `--approve-submit` hashes and writes nothing. Name artifacts with `{version}` in `dashbye.config.yml` to avoid editing paths for every release.

### Working on another screen (optional)

Set `browser.display` to a display name, such as a second monitor or a virtual display created by a tool like [yomado](https://github.com/chekusu/yomado), and DashBye moves only its own Chrome window there (macOS). Part of the name is enough when it matches exactly one display; otherwise the window stays where it is and DashBye says so. DashBye does not require yomado or any other tool.

If **Save draft** does not report completion, `sync-draft` reads the draft and retries once with only the remaining changes, provided every one of them is in the approved plan; otherwise it stops and asks you to plan again. Regenerate the plan whenever the package, resources, or Dashboard draft changes. Never reuse an old approval hash.

DashBye has no backend or telemetry. An external agent’s treatment of files and conversation content depends separately on that agent’s permissions and policies.

## Further reference

Run `dashbye -h` for all commands and options. See [validation status](validation.md), [security](security.md), and [architecture](architecture.md).
