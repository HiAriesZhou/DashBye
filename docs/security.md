# Security model

## Local execution and resource flow

DashBye runs on the user's computer. Local artifact inspection, validation and
fingerprinting do not require a Dashboard connection. Dashboard operations connect
to the user's local Chrome through loopback CDP; Chrome communicates directly with
Google's Chrome Web Store Dashboard. Approved package and resource changes are
uploaded to the item draft through that browser.

DashBye has no servers, backend, account system, telemetry, analytics or
resource-hosting service. Configuration, plans and release locks are local
files. The CLI does not push them to Git or submit drafts for review or publication.
Google controls storage and processing on the Dashboard side.

These statements describe DashBye's own behavior. Installation downloads software
from GitHub and package registries. If a user supplies files or command output to
an external AI agent, that agent's data handling is separate and is governed by
its own permissions and policies. User-chosen backup or sharing of local files is
also outside DashBye's control.

## Trust boundaries

- Repository files are untrusted until schema, path, hash, image, and manifest
  validation succeeds.
- Chrome is accepted only through an explicit loopback HTTP endpoint with a port.
- Exactly one open edit tab must match the configured 32-character item ID.
- The plan hash binds the target, artifact, resources, remote state, and operations.
  DashBye rereads remote state immediately before applying it.

## Authentication

Google authentication is manual. A Chrome profile is a local directory containing
browser settings and session state. Use a separate directory outside the project
repository to prevent accidental Git commits of login files and keep the everyday
Chrome session separate. This is local session isolation, not cloud setup.
Do not copy a daily profile.
DashBye does not read profile databases, export cookies, automate login, or bypass
security challenges.

## Agent initialization

`init --agent --json` is discovery-only. It returns the next missing input or a
configuration preview and write command; it does not create files, start Chrome, or
access the Dashboard. The host agent decides whether it can render native choices
and must fall back to one plain-language question at a time when it cannot.

## Data minimization

Structured output includes versions, counts, booleans, locale labels, operation
names, and content hashes. It omits account identifiers, publisher identifiers,
field contents, credentials, cookies, tokens, and authenticated URLs. Release locks
contain only normalized manifest facts and local fingerprints.

## Write guards

`sync-draft` requires a saved plan and its exact approval hash. Plans that include
privacy changes, package upload, or destructive asset replacement explicitly mark
owner approval as required. If the local inputs or remote draft change, execution
stops as stale. A successful run must save and reread with zero remaining
operations before writing a release lock.

The codebase has no review submission, publication, archive, login, or account
management action. Asset removal exists only as an operation in a bound,
owner-approved full desired-state plan.
