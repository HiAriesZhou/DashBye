# Agent-first README design

## Decision

Make the coding-agent workflow the primary onboarding path in both README files
and usage guides. The terminal workflow remains available as a secondary path.

## Reader journey

1. Understand what DashBye prepares and where its automation stops.
2. Copy one prompt into an agent that has local file and terminal access.
3. See what the agent handles and what still requires the owner.
4. Understand the local-files-to-reviewed-draft flow.
5. Use the manual CLI guide when preferred or when diagnosing a step.

The agent installs or locates DashBye, initializes the extension repository,
audits real build and store resources, asks for missing product facts, validates,
and prepares a concrete Dashboard plan. The owner supplies facts that cannot be
derived, starts and signs into the dedicated Chrome profile, and explicitly
approves the plan before a Dashboard write. DashBye continues to stop before
review submission or publication.

## Content changes

- Put a complete copy-paste agent prompt directly after the README introduction.
- Follow it with a compact Agent/owner responsibility split and workflow.
- Move manual installation and commands into a secondary section and the usage
  guides without obscuring the commands required for review and troubleshooting.
- Lead both usage guides with agent setup, then document source installation,
  Chrome connection, configuration, and repeat releases.
- Keep English and Chinese equivalent in meaning while using natural phrasing.

## Validation

Check all commands against CLI help, verify Markdown links and anchors, parse shell
examples, run initialization tests, and render English and Chinese README files at
desktop/mobile widths in light/dark themes.
