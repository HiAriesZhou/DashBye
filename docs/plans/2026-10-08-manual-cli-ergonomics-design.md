# Manual CLI ergonomics

## Problem

A manual release required a platform-specific Chrome launch command, a private
output directory passed to every command, and copying a 64-character approval hash
from plan JSON into `sync-draft`. Unknown options were silently ignored, and
`--non-interactive` had no effect on `sync-draft`.

## Decisions

- **DashBye opens the dedicated Chrome itself.** `inspect`, `plan`, and `sync-draft`
  launch official Chrome with the DashBye profile and the configured loopback port
  when the endpoint is not reachable. `dashbye chrome` does the same on request.
  Sign-in stays manual: in a terminal DashBye waits for it, otherwise it stops.
  `--no-launch` disables launching. This replaces the earlier promise that the CLI
  never launches Chrome. It still never automates login or reads profile data.
- **Platform state directory.** macOS `~/Library/Application Support/DashBye`,
  Windows `%LOCALAPPDATA%\DashBye`, other systems `$XDG_STATE_HOME/dashbye`
  (default `~/.local/state/dashbye`). It holds `chrome-profile/` and, per item,
  `items/<sha256(itemId) prefix>/plan.json` and `inspect.json`. Directories are
  `0700`, files `0600`. `--output` still writes an additional copy.
- **Terminal confirmation.** In a terminal, `sync-draft` loads the latest plan,
  prints the target and every operation, and asks `Save these changes to the
  Dashboard draft? [Y/n]`; Enter means yes. The approval hash is still checked
  internally, and stale-plan guards are unchanged. Outside a terminal, or with
  `--non-interactive`, `--approve-plan <hash>` is required.
- **Readable output.** With a terminal on stdout, `validate`, `doctor`, `plan`, and
  `sync-draft` print a summary; `--json` or a non-terminal stdout keeps JSON, so
  agents and scripts are unaffected.
- **Strict options.** Each command accepts only its own options, `--key=value` is
  supported, unknown options fail with a suggestion, and `dashbye <command> -h`
  shows that command's usage.

## Manual flow after the change

```bash
dashbye plan        # opens Chrome if needed, validates, reads the draft, saves the plan
dashbye sync-draft  # shows the plan, asks [Y/n], saves and reads back
```

## Not changed

Plan hashing and staleness checks, read-back verification, release locks, the
draft-only boundary, and the agent `init --agent --json` protocol.
