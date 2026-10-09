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
   ask me to run "dashbye chrome". Show the target and all proposed changes and
   wait for my explicit approval before sync-draft --approve-plan <approvalHash>.
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

Chrome Web Store drafts are saved and read back. Firefox Add-ons has no draft, so DashBye only uploads the package for AMO validation and lists listing fields to update by hand in AMO Developer Hub; it never creates a version or submits for review (see [Firefox Add-ons](store-schema.md#firefox-add-ons)). Edge targets are validated and appear in the plan as not yet supported; nothing is written to them.

## Chrome and sign-in

`inspect`, `plan`, and `sync-draft` open official Chrome with a dedicated DashBye profile and the configured loopback debugging port when that endpoint is not answering. `dashbye chrome` does the same on request, for example to sign in ahead of time. Pass `--no-launch` to require an already running session instead.

The profile stores Chrome settings and the login session; it is not a DashBye account, and it is separate from your everyday browser. Sign in to Google in the opened window yourself. In a terminal DashBye waits for the sign-in (up to about ten minutes) and then continues; otherwise it stops and asks you to sign in and run the command again.

DashBye looks for Chrome in the standard install locations. If yours is elsewhere, set `DASHBYE_CHROME` to the absolute path of the Chrome executable. The configured endpoint must be loopback, such as `http://127.0.0.1:9333`.

Run `dashbye doctor` to check the configuration and the Chrome connection.

- If Chrome does not open the debugging endpoint, a window using the DashBye profile may already be open without it; quit that Chrome and retry.
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

Plans, inspect results, and the Chrome profile are kept in the platform's per-user application directory, outside every repository:

| Platform | Directory |
| --- | --- |
| macOS | `~/Library/Application Support/DashBye` |
| Windows | `%LOCALAPPDATA%\DashBye` |
| Linux and others | `$XDG_STATE_HOME/dashbye` (default `~/.local/state/dashbye`) |

The Chrome profile is in `chrome-profile/`; each project's latest `plan.json` and `inspect.json` are in `projects/<hash>/`, named by a hash of the configuration path. `--output` saves an additional copy wherever you choose.

## Configuration and repeat releases

Initialization is normally once per extension. Later commands discover the nearest `dashbye.config.yml`; explicit CLI options override its values. YAML paths resolve relative to their config or resource directory, while CLI paths resolve from the current working directory.

Keep screenshots of real listings and other diagnostics outside repositories; DashBye's own plans, inspect output, and Chrome profile already are. Release locks belong in the configured resource directory.

For each release: rebuild the extension, update the resource files, then run validate, plan, and sync-draft. Regenerate the plan whenever the package, resources, or Dashboard draft changes. Never reuse an old approval hash.

DashBye has no backend or telemetry. An external agent’s treatment of files and conversation content depends separately on that agent’s permissions and policies.

## Further reference

Run `dashbye -h` for all commands and options. See [validation status](validation.md), [security](security.md), and [architecture](architecture.md).
