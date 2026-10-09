import { COMMANDS } from './args.js';
import { appStateDir } from './paths.js';

export function manual(): string {
  const commands = Object.entries(COMMANDS).map(([name, spec]) => `  ${name.padEnd(13)} ${spec.summary}`).join('\n');
  return `DashBye
Less dashboard. More shipping.
少填表，多发版。

Version and synchronize Chrome Web Store listing assets, copy, and privacy drafts.

Usage
  dashbye [command] [options]
  dashbye <command> -h     Show the options of one command

Commands
${commands}
  -h, --help    Show this manual
  --version     Show the installed version

First run
  Run "dashbye init" in the extension repository. It asks for the project path, the
  extension ZIP, build directory, or manifest, the release resources path (default
  ./store), the Chrome Web Store item ID and language, and the loopback Chrome
  endpoint (default http://127.0.0.1:9333), then previews the configuration.
  Later runs discover the nearest dashbye.config.yml.

Each release
  dashbye validate     Check the build and store resources
  dashbye plan         Open Chrome if needed, read the draft, show and save the plan
  dashbye sync-draft   Show the plan, ask to save, then save and read back the draft

Chrome and sign-in
  inspect, plan, and sync-draft open official Chrome with the dedicated DashBye
  profile when the endpoint is not running (disable with --no-launch). Sign in to
  Google in that window yourself; in a terminal DashBye waits and then continues.
  DashBye never automates login, reads profile data, or stores cookies.

Saved files
  Plans, inspect results, and the Chrome profile are kept outside repositories in
  ${appStateDir()}
  --output saves an additional copy.

Output and automation
  In a terminal, commands print readable summaries; --json, or output that is not a
  terminal, prints JSON. sync-draft asks "Save these changes to the Dashboard draft?
  [Y/n]" in a terminal. Agents and scripts pass --approve-plan <approvalHash> instead.

Configuration priority
  command-line option > selected/discovered project config > built-in default
  Paths in YAML resolve from their containing config or resource directory.
  Command-line paths resolve from the current working directory.

Default resources
  store/release.yml                    listing and privacy desired state
  store/listing/                       localized detailed descriptions
  store/assets/                        icon, screenshots, and promotional images
  store/releases/<version>.lock.json   verified artifact and resource fingerprints

Release boundary
  DashBye may update a reviewed draft, but it never submits for review or publishes.`;
}
