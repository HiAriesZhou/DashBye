# CLI-first onboarding design

## Goal

Explain DashBye from the user's problem outward, then lead with the interactive
terminal setup. Repository-capable coding agents use the same CLI and configuration
contract through an optional text-based automation interface.

## README journey

The README leads with what DashBye is, the repetitive and error-prone Dashboard
work it replaces, and the draft-only result. Installation follows immediately.
The default path installs the CLI and runs `dashbye init`. A copy-paste prompt is
available when the user wants an agent to install the CLI, audit repository-owned
resources, or run the release workflow.

The remaining sections explain the versioned project files, release workflow,
browser boundary, current validation status, and deeper documentation.

## Agent setup protocol

`dashbye init --agent --json` is a non-writing discovery interface. It returns one
JSON object describing either the next missing input or a ready configuration
preview. Each question includes a stable field name, prompt, default when known,
and validation or choice hints. An existing configuration produces a separate
use-existing or explicit-reconfigure decision. The agent supplies collected values
as ordinary init flags and calls the command again.

The agent asks one plain-language question at a time through ordinary conversation.
Once the response is ready, it runs the existing non-interactive init with the
complete arguments to write project-owned configuration and templates. The
protocol is intentionally text based and does not depend on graphical controls.

## Terminal setup

`dashbye init` continues to ask for values in sequence. Before writing, it prints a
configuration preview and asks for confirmation. Existing files remain protected
unless the user explicitly supplies `--overwrite`.

## Safety and compatibility

The CLI name, configuration filename, schema identifiers, and existing flags stay
unchanged. Agent discovery never writes files. Dashboard access is outside init,
and every Dashboard write still requires a bound plan and exact approval hash.
