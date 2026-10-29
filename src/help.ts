import { COMMANDS } from './args.js';
import { appStateDir } from './paths.js';

export function manual(): string {
  const commands = Object.entries(COMMANDS).map(([name, spec]) => `  ${name.padEnd(13)} ${spec.summary}`).join('\n');
  return `DashBye
Less dashboard. More shipping.
少填表，多发版。

Version and synchronize browser extension store listings, packages, and privacy drafts
for Chrome Web Store, with Firefox Add-ons and Microsoft Edge Add-ons as optional stores.

Usage
  dashbye [command] [options]
  dashbye <command> -h     Show the options of one command

Commands
${commands}
  -h, --help    Show this manual
  --version     Show the installed version

First run
  Run "dashbye init" in the extension repository. It asks which stores to manage:
  Chrome Web Store is the default (press Enter); add edge or firefox only if you
  publish there. It shows what it found for each store, then asks only for the
  chosen stores' packages and IDs, the release resources path (default ./store),
  and the loopback Chrome endpoint, and previews the result.
  Later runs discover the nearest dashbye.config.yml. To add or remove a store,
  run "dashbye init --stores chrome,firefox", or edit its targets.
  --store chrome limits validate, plan, or sync-draft to some configured stores.

Each release
  dashbye release      Validate, plan every store, ask once to save the drafts and
                       once more (default no) to submit Firefox, then read back
  Step by step: validate, plan, sync-draft, submit (Firefox)

Chrome and sign-in
  plan, sync-draft, and release open official Chrome with the dedicated DashBye
  profile when the endpoint is not running (disable with --no-launch). Sign in to
  Google in that window yourself; in a terminal DashBye waits and then continues.
  DashBye never automates login, reads profile data, or stores cookies.

Saved files
  Plans, the last draft state read, and the Chrome profile are kept outside repositories in
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
  DashBye updates drafts and never publishes. Chrome stops at the saved draft and
  Edge at the draft package. AMO has no draft, so only "dashbye submit" creates a
  Firefox version, for the plan you approve; the AMO listing is updated after AMO
  approves that version.`;
}
