<img src="https://raw.githubusercontent.com/HiAriesZhou/DashBye/main/brand/dashbye-readme.png" alt="DashBye’s waving gecko" width="112">

# DashBye

*Less dashboard. More shipping.*

Give your coding agent a versioned Chrome Web Store release workspace. DashBye keeps the package, copy, screenshots, artwork, and privacy declarations in your extension repository, then prepares a draft you can review.

[English](README.md) · [简体中文](README.zh-CN.md) · [Manual CLI](#prefer-the-terminal) · [Usage guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md)

## Hand this to your agent

Open your extension repository in a coding agent with local file and terminal access. Paste this:

```text
Set up DashBye for this extension repository and prepare its Chrome Web Store
draft. Source: https://github.com/HiAriesZhou/DashBye

Install DashBye without sudo, read "dashbye -h", and use
"dashbye init --agent --json" to configure this repository. Inspect the actual
build, manifest, existing store copy, screenshots, artwork, and privacy evidence.
Ask me for facts you cannot establish; never invent product claims, permission
purposes, data-use declarations, or certifications.

Keep browser profiles and diagnostic files outside repositories. When Dashboard
access is needed, launch official Chrome with a dedicated profile outside all
repositories and a loopback remote-debugging endpoint. Request any GUI permission
you need instead of asking me to run the launch command. Ask me only to complete
Google sign-in in the opened window. If your environment cannot launch GUI apps,
explain why and give me the exact fallback command. Then run validate, inspect,
and plan. Show me the exact target and every proposed change, and wait for my
explicit approval before sync-draft.

After an approved sync, require a successful read-back with zero remaining
differences. Never submit for review or publish. Report files changed, checks
performed, and anything still unresolved.
```

The agent will install or locate the CLI, initialize the repository, organize the release resources, validate them, and prepare a concrete change plan.

You provide product facts the repository cannot prove, sign in to Google in the Chrome window the agent opens, and approve the exact plan before DashBye writes to the draft.

Want a prompt with known paths filled in? After installation:

```bash
dashbye agent-prompt --project /path/to/extension
```

## What happens next

Extension repository → Agent audits the real build and resources → DashBye compares them with the store draft → You approve the plan → DashBye saves and reads back the draft.

DashBye runs locally and connects directly to Google through your dedicated Chrome session. It has no account, server, or telemetry. **It stops at the saved draft; you submit for review and publish in the Dashboard.**

## New release. Same old form?

- **New build, old screenshots?** Version store assets with the extension and compare them before the release.
- **New permission, last version’s explanation?** Validate declarations against the built extension while there is still time to fix them.
- **Copy, paste, upload, repeat?** Review one deterministic plan instead of reconstructing the listing by hand.

## Prefer the terminal?

Requires **Node.js 22+**, Git, official Chrome, and an existing Chrome Web Store item.

Install and initialize from the extension repository:

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

Fill the generated `store/` templates with real copy, images, and privacy declarations. Then validate:

```bash
dashbye validate
```

Start a dedicated Chrome profile outside the repository and sign in manually. The [browser guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md#connect-chrome) includes the launch command and troubleshooting steps.

Choose an existing private output directory outside the repository, inspect the current draft, and generate a plan:

```bash
dashbye doctor --json
dashbye inspect --output /path/to/private-output/current-draft.json
dashbye plan --output /path/to/private-output/draft-plan.json
```

Review every operation. Replace `APPROVED_PLAN_HASH` with that plan’s `approvalHash` only after you approve it:

```bash
dashbye sync-draft \
  --plan /path/to/private-output/draft-plan.json \
  --approve-plan APPROVED_PLAN_HASH \
  --non-interactive
```

Success means the draft was saved and read back with **zero remaining differences**, followed by a version lock. The [usage guide](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md) covers source installation, resource layout, Chrome setup, and failure cases.

## The next release is shorter

Update the extension build and files in `store/`. With the dedicated Chrome session running and signed in, repeat **validate → plan → review → sync-draft** with the new plan hash.

DashBye discovers the nearest `dashbye.config.yml`. You only need to explain where the screenshots live once. If the build, resources, or remote draft changes after approval, generate and review a fresh plan.

## What stays in your hands

- Missing product facts, privacy claims, and certifications
- Manual Google sign-in
- Approval for each Dashboard write plan
- Final review submission and publication

Empty lists and `null` in the desired state can request removal, so the agent must show those operations explicitly. DashBye rejects stale plans and checks the saved result against the approved desired state.

## What works today

This is an early technical release. Package upload, artwork replacement, selected privacy-copy changes, draft saving, and read-back have been exercised on a real Dashboard. Multiple locales, headless session reuse, collected-data/certification changes, and new permission confirmations remain unverified.

[Usage & source install](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.md) · [Resource schema](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md) · [Validation record](https://github.com/HiAriesZhou/DashBye/blob/main/docs/validation.md) · [Security](https://github.com/HiAriesZhou/DashBye/blob/main/docs/security.md) · [Architecture](https://github.com/HiAriesZhou/DashBye/blob/main/docs/architecture.md)

For all commands and options, run `dashbye -h`.

## License & brand

Code: [GPL-3.0-only](LICENSE), with commercial use permitted under its terms; see [licensing scope](LICENSING.md). Earlier MIT releases retain their original permissions.

The name, logo, and mascot have separate [brand](TRADEMARK.md) and [asset terms](https://github.com/HiAriesZhou/DashBye/blob/main/brand/LICENSE). Forks marketed as another product must use their own identity.
