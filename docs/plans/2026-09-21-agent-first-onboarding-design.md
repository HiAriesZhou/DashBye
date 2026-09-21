# Agent-first onboarding design

## Goal

Explain DashBye from the user's problem outward, then offer two setup paths that
share one configuration contract: an Agent path for repository-capable coding
agents and an interactive terminal path for direct CLI users.

## README journey

The README leads with what DashBye is, the repetitive and error-prone Dashboard
work it replaces, and the draft-only result. Installation follows immediately.
The recommended path is a copy-paste prompt that points an agent at the canonical
GitHub repository. The terminal path installs from source and runs `dashbye init`.

The remaining sections explain the versioned project files, release workflow,
browser boundary, current validation status, and deeper documentation.

## Agent setup protocol

`dashbye init --agent --json` is a non-writing discovery interface. It returns one
JSON object describing either the next missing input or a ready configuration
preview. Each question includes a stable field name, prompt, default when known,
and validation or choice hints. An existing configuration produces a separate
use-existing or explicit-reconfigure decision. The agent supplies collected values
as ordinary init flags and calls the command again.

The host agent should render each question with its native structured-input UI
when one is available. Otherwise it asks one plain-language question at a time.
Once the response is ready, the agent runs the existing non-interactive init with
the complete arguments to write project-owned configuration and templates.

This protocol cannot force a generic ChatGPT interface to display buttons. Native
menus depend on tools exposed by the host. A future MCP or plugin may wrap the same
protocol without changing the project configuration format.

## Terminal setup

`dashbye init` continues to ask for values in sequence. Before writing, it prints a
configuration preview and asks for confirmation. Existing files remain protected
unless the user explicitly supplies `--overwrite`.

## Safety and compatibility

The CLI name, configuration filename, schema identifiers, and existing flags stay
unchanged. Agent discovery never writes files. Dashboard access is outside init,
and every Dashboard write still requires a bound plan and exact approval hash.
