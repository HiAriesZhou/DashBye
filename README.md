<div align="center">

<img src="https://raw.githubusercontent.com/HiAriesZhou/DashBye/main/brand/dashbye-readme.png" alt="DashBye’s waving gecko" width="128">

<h1>DashBye</h1>

<p><strong>Less dashboard. More shipping.</strong></p>

<p>Give your coding agent a versioned release workspace for browser extensions.<br>
DashBye keeps the package, store copy, screenshots, artwork, and privacy declarations in your extension repository, compares them with Chrome Web Store, Firefox Add-ons, and Microsoft Edge Add-ons, and writes nothing until you approve the exact plan.</p>

[![npm](https://img.shields.io/npm/v/dashbye?color=429C7E)](https://www.npmjs.com/package/dashbye) [![CI](https://github.com/HiAriesZhou/DashBye/actions/workflows/ci.yml/badge.svg)](https://github.com/HiAriesZhou/DashBye/actions/workflows/ci.yml) [![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-1D3043)](https://nodejs.org/) [![License: GPL-3.0-only](https://img.shields.io/badge/license-GPL--3.0--only-1D3043)](LICENSE)

**English** · [简体中文](README.zh-CN.md) · [Usage guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md) · [Example](#example)

</div>

---

## What it solves

- **New build, old screenshots?** Version store assets with the extension and compare them before the release.
- **New permission, last version’s explanation?** Validate declarations against the built extension while there is still time to fix them.
- **Copy, paste, upload, repeat?** Review one deterministic plan instead of reconstructing the listing by hand.

## How it works

1. **Your extension repository** holds the build and the store resources.
2. **The agent audits** the real build, manifest, copy, images, and privacy evidence.
3. **DashBye compares** them with each store you manage and builds one plan.
4. **You approve** the exact plan.
5. **DashBye writes** the approved changes and reads them back.

DashBye runs locally. It reaches Chrome Web Store through your dedicated Chrome session, and Firefox Add-ons and Edge Add-ons through their official APIs with keys you keep outside the repository. It has no account, server, or telemetry.

## Supported stores

| Store | DashBye does | You still do |
| --- | --- | --- |
| **Chrome Web Store** | Saves the package, listing, images, and privacy declarations to the Dashboard draft, then reads them back | Sign in to Google; submit for review and publish |
| **Firefox Add-ons** | Validates the package; `dashbye submit` creates a listed version from an approved plan; after AMO approves it, updates the summary, description, homepage, support email, and categories | Support URL and screenshots in AMO Developer Hub |
| **Microsoft Edge Add-ons** | Uploads the package to the product’s draft submission | Store listing, review, and publishing in Partner Center |

> **Important:** Firefox Add-ons has no draft. A version created by `dashbye submit` enters AMO review and cannot be taken back, and listing updates go live immediately. DashBye does both only for the plan you approve.

## Quick start with your agent

Open your extension repository in a coding agent with local file and terminal access. Paste this:

```text
Set up DashBye for this extension repository and prepare its Chrome Web Store
draft. Source: https://github.com/HiAriesZhou/DashBye

Install DashBye without sudo, read "dashbye -h", and use
"dashbye init --agent --json" to configure this repository. Inspect the actual
build, manifest, existing store copy, screenshots, artwork, and privacy evidence.
Ask me for facts you cannot establish; never invent product claims, permission
purposes, data-use declarations, or certifications.

Keep diagnostic files outside repositories. Run validate and plan with --json;
DashBye opens its dedicated Chrome when it needs the Dashboard. Ask me only to
complete Google sign-in in that window. If your environment cannot open GUI apps,
explain why and ask me to run "dashbye doctor --login". Show me the exact target and
every proposed change, and wait for my explicit approval before sync-draft.

After an approved sync, require a successful read-back with zero remaining
differences. Never submit for review or publish. Report files changed, checks
performed, and anything still unresolved.
```

| The agent | You |
| --- | --- |
| Installs or locates the CLI | Provide product facts the repository cannot prove |
| Initializes the repository | Sign in to Google in the Chrome window DashBye opens |
| Organizes and validates the release resources | Approve the exact plan before DashBye writes to the draft |
| Prepares a concrete change plan | Submit for review and publish yourself |

Want a prompt with known paths filled in? After installation:

```bash
dashbye init --prompt --project /path/to/extension
```

## Use the CLI manually

Requires **Node.js 22+**, Git, and an existing item in each store you manage. Chrome Web Store also needs official Chrome; Firefox and Edge need an API key (see the [resource schema](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md)).

Install and initialize from the extension repository:

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

Fill the generated `store/` templates with real copy, images, and privacy declarations. Then run the release:

```bash
dashbye release
```

`release` validates the build and resources, opens a dedicated DashBye Chrome window when needed, and plans every configured store. Sign in to the store dashboards there the first time (`dashbye doctor --login` opens it ahead of time); DashBye waits and then reads the drafts.

- **Save:** it lists every change, previews text changes, and asks `Save these changes to the Dashboard draft? [Y/n]`.
- **Submit to Firefox:** for a new Firefox version it asks separately, `Submit Firefox … to AMO for review? [y/N]`, because AMO has no draft.
- **Done:** each draft was saved and read back with **zero remaining differences**, followed by a version lock and a list of what is left to do in the store dashboards.

`validate`, `plan`, `sync-draft`, and `submit` run the same steps one at a time.

Run `dashbye <command> -h` to see the options of a command. The [usage guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md) covers source installation, resource layout, Chrome setup, and failure cases.

### Later releases

Update the extension build and files in `store/`, then run `dashbye release` again. Name packages like `release/x-chrome-v{version}.zip` in `dashbye.config.yml` and DashBye picks the newest build, so the configuration does not change between releases. The dedicated Chrome profile keeps your sign-ins.

DashBye discovers the nearest `dashbye.config.yml`. You only need to explain where the screenshots live once. If the build, resources, or remote draft changes after approval, generate and review a fresh plan.

## Example

A real run against one extension’s **English listing**. Before starting, DashBye was configured in the extension repository, and the owner was signed in to Google in the dedicated Chrome profile.

<details>
<summary><strong>Walk through the three steps</strong></summary>

<br>

**1. Tell the agent what you need**

Ask: “Set up DashBye for this extension repository and prepare its Chrome Web Store draft.” The agent checks the build and store resources, then compares them with the existing draft.

**2. Review and approve the plan**

The plan targets the extension’s **English listing** and contains **one change: replace the 440 × 280 small promotional tile**. The package, description, screenshots, and privacy declarations have no differences. The agent explains that replacement removes the old image and uploads the new one, then waits. The owner replied “Save”.

**3. Save the draft and verify it**

DashBye saves the draft and immediately reads it back. In this example, the first read-back still showed a difference, so the agent didn't report success. It re-ran plan, found nothing left to do, and ran a zero-operation sync. That returned `saved_and_reread` and wrote the release lock, and a fresh plan showed `operations: []`: **zero remaining differences**. The draft is saved, never submitted for review or published.

[Case notes](https://github.com/HiAriesZhou/DashBye/blob/main/docs/assets/demo/README.md)

</details>

## What you are responsible for

- Missing product facts, privacy claims, and certifications
- Manual sign-in to the store dashboards
- Approval for each write plan, and a separate yes for each Firefox submission
- Final review submission in the Chrome Web Store Dashboard and publication in Partner Center

> **Warning:** Empty lists and `null` in the desired state can request removal, so the agent must show those operations explicitly. DashBye rejects stale plans and checks the saved result against the approved desired state.

## Working on another screen (optional)

DashBye uses your normal screen by default. To keep its Chrome window off the screen you are working on, set `browser.display` in `dashbye.config.yml` to the name of another display, such as a second monitor; DashBye then moves only its own window there (macOS). One way to get a spare screen without extra hardware is a virtual display, for example [yomado](https://github.com/chekusu/yomado), which creates named virtual displays on macOS. DashBye does not require yomado or any other tool for this.

```yaml
browser:
  endpoint: http://127.0.0.1:9333
  display: DashBye   # a monitor or virtual display name; omit to stay on the current screen
```

## Current support

This is an early technical release. Exercised on real store items:

- **Chrome Web Store:** package upload, artwork replacement, selected privacy-copy changes, draft saving, and read-back.
- **Firefox Add-ons:** one `dashbye submit` from validation upload to version read-back, and a listing update after AMO approved that version.
- **Microsoft Edge Add-ons:** one package upload to a draft submission.

Still unverified: multiple locales, headless session reuse, collected-data and certification changes, new permission confirmations, and Chrome install locations on Windows and Linux. Edge listing fields are not automated.

## Documentation

| Document | Covers |
| --- | --- |
| [Usage guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md) | Source installation, resource layout, Chrome setup, failure cases |
| [Resource schema](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md) | `dashbye.config.yml` and the `store/` resource layout |
| [Validation record](https://github.com/HiAriesZhou/DashBye/blob/main/docs/validation.md) | What has been verified on a real Dashboard |
| [Security](https://github.com/HiAriesZhou/DashBye/blob/main/docs/security.md) | Local execution, loopback CDP, and write boundaries |
| [Architecture](https://github.com/HiAriesZhou/DashBye/blob/main/docs/architecture.md) | How local intent becomes an approved write |

For all commands and options, run `dashbye -h`.

## License & brand

Code: [GPL-3.0-only](LICENSE), with commercial use permitted under its terms; see [licensing scope](LICENSING.md). Earlier MIT releases retain their original permissions.

The name, logo, and mascot have separate [brand](TRADEMARK.md) and [asset terms](https://github.com/HiAriesZhou/DashBye/blob/main/brand/LICENSE). Forks marketed as another product must use their own identity.
