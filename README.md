<img src="https://raw.githubusercontent.com/HiAriesZhou/DashBye/main/brand/dashbye-readme.png" alt="DashBye’s waving gecko" width="112">

# DashBye

*Less dashboard. More shipping.*

Give your coding agent a versioned Chrome Web Store release workspace. DashBye keeps the package, copy, screenshots, artwork, and privacy declarations in your extension repository, then prepares a draft you can review.

[English](README.md) · [简体中文](README.zh-CN.md) · [Manual CLI](#use-the-cli-manually) · [Usage guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md)

## Example

Before starting: DashBye is configured in the extension repository, and you are signed in to Google in the dedicated Chrome profile.

### 1. Tell the agent what you need

Ask: “Set up DashBye for this extension repository and prepare its Chrome Web Store draft.” The agent checks the build and store resources, then compares them with the existing draft.

### 2. Review and approve the plan

The plan targets the extension’s **English listing** and contains **one change: replace the 440 × 280 small promotional tile**. The package, description, screenshots, and privacy declarations have no differences. The agent explains that replacement removes the old image and uploads the new one, then waits. The owner replied “Save”.

### 3. Save the draft and verify it

DashBye saves the draft and immediately reads it back. In this example, the first read-back still showed a difference, so the agent didn't report success. It re-ran inspect and plan, found nothing left to do, and ran a zero-operation sync. That returned `saved_and_reread` and wrote the release lock, and a fresh plan showed `operations: []`: **zero remaining differences**. The draft is saved, never submitted for review or published. [Case notes](https://github.com/HiAriesZhou/DashBye/blob/main/docs/assets/demo/README.md)

Try the same workflow in your extension repository with the prompt below.

## Set up with your agent

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
explain why and ask me to run "dashbye chrome". Show me the exact target and
every proposed change, and wait for my explicit approval before sync-draft.

After an approved sync, require a successful read-back with zero remaining
differences. Never submit for review or publish. Report files changed, checks
performed, and anything still unresolved.
```

The agent will install or locate the CLI, initialize the repository, organize the release resources, validate them, and prepare a concrete change plan.

You provide product facts the repository cannot prove, sign in to Google in the Chrome window DashBye opens, and approve the exact plan before DashBye writes to the draft.

Want a prompt with known paths filled in? After installation:

```bash
dashbye agent-prompt --project /path/to/extension
```

## How it works

Extension repository → Agent audits the real build and resources → DashBye compares them with the store draft → You approve the plan → DashBye saves and reads back the draft.

DashBye runs locally and connects directly to Google through your dedicated Chrome session. It has no account, server, or telemetry. **It stops at the saved draft; you submit for review and publish in the Dashboard.**

## What it solves

- **New build, old screenshots?** Version store assets with the extension and compare them before the release.
- **New permission, last version’s explanation?** Validate declarations against the built extension while there is still time to fix them.
- **Copy, paste, upload, repeat?** Review one deterministic plan instead of reconstructing the listing by hand.

## Use the CLI manually

Requires **Node.js 22+**, Git, official Chrome, and an existing Chrome Web Store item.

Install and initialize from the extension repository:

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

Fill the generated `store/` templates with real copy, images, and privacy declarations. Then validate, plan, and sync:

```bash
dashbye validate
dashbye plan
dashbye sync-draft
```

`plan` opens a dedicated DashBye Chrome window when needed. Sign in to Google there the first time; DashBye waits and then reads the draft. It lists every change and saves the plan outside the repository.

`sync-draft` shows the plan again and asks `Save these changes to the Dashboard draft? [Y/n]`. Press Enter to save, or `n` to cancel. Success means the draft was saved and read back with **zero remaining differences**, followed by a version lock.

Run `dashbye <command> -h` to see the options of a command. The [usage guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md) covers source installation, resource layout, Chrome setup, and failure cases.

## Later releases

Update the extension build and files in `store/`, then repeat **validate → plan → sync-draft**. The dedicated Chrome profile keeps your sign-in between releases.

DashBye discovers the nearest `dashbye.config.yml`. You only need to explain where the screenshots live once. If the build, resources, or remote draft changes after approval, generate and review a fresh plan.

## What you are responsible for

- Missing product facts, privacy claims, and certifications
- Manual Google sign-in
- Approval for each Dashboard write plan
- Final review submission and publication

Empty lists and `null` in the desired state can request removal, so the agent must show those operations explicitly. DashBye rejects stale plans and checks the saved result against the approved desired state.

## Current support

This is an early technical release. Package upload, artwork replacement, selected privacy-copy changes, draft saving, and read-back have been exercised on a real Dashboard. Multiple locales, headless session reuse, collected-data/certification changes, and new permission confirmations remain unverified.

[Usage & source install](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md) · [Resource schema](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md) · [Validation record](https://github.com/HiAriesZhou/DashBye/blob/main/docs/validation.md) · [Security](https://github.com/HiAriesZhou/DashBye/blob/main/docs/security.md) · [Architecture](https://github.com/HiAriesZhou/DashBye/blob/main/docs/architecture.md)

For all commands and options, run `dashbye -h`.

## License & brand

Code: [GPL-3.0-only](LICENSE), with commercial use permitted under its terms; see [licensing scope](LICENSING.md). Earlier MIT releases retain their original permissions.

The name, logo, and mascot have separate [brand](TRADEMARK.md) and [asset terms](https://github.com/HiAriesZhou/DashBye/blob/main/brand/LICENSE). Forks marketed as another product must use their own identity.
