# Security model

## Trust boundaries

- Repository files are untrusted input until schema, path, hash, format, and image
  dimensions pass validation.
- The attached Chrome process is trusted only after its endpoint is confirmed as
  loopback and exactly one page matches the requested item ID.
- Existing Dashboard content is never deleted or replaced by v0.1. Images are only
  appended to a configured target count.

## Authentication

Google authentication is manual. Keep the dedicated Chrome user data directory
outside the repository. Never copy a daily browser profile or export its cookies.
The CLI does not read Chrome profile databases.

## Logging

Reports contain counts, booleans, locale labels, relative file names, and SHA-256
hashes. They omit account identifiers, publisher identifiers, field contents,
cookies, tokens, and complete authenticated URLs.

## Write guards

`sync-draft` requires the item ID twice. A partially populated screenshot section
also requires `--confirm-existing-prefix`. The run stops if counts exceed the
configuration, the language changes, another item is selected, or read-back fails.

The codebase contains no submit, publish, archive, delete, privacy certification,
or automated login actions.
