# DashBye repository identity design

## Decision

Use **DashBye** as the product and repository display name. Keep `dashbye` for the
CLI executable, npm package, configuration filenames, generated filenames, and
schema identifiers so existing project integrations remain valid.

Rename the local repository directory from `cws-release-kit` to `DashBye`. A future
Git hosting repository should use `DashBye` as its repository name.

## Documentation and metadata

Update the README and product-facing prose to use the approved DashBye spelling.
The README should describe the verified draft workflow accurately: package,
listing artwork, privacy copy, save, and read-back have all been exercised against
the Chrome Web Store Dashboard. Review submission and publication remain outside
the automation boundary.

Set package authorship and the repository-local Git identity to
`AriesZhou <aries0331.dev@gmail.com>`.

## History migration

Rewrite every commit reachable from `main` so both author and committer use the
approved identity. Preserve commit messages, topology, and dates. Remove rewrite
backup refs after verification so the previous placeholder identity is not part of
a future first push.

## Validation

Run the complete test suite, verify branding references, inspect package metadata,
and confirm every reachable commit has the expected author and committer. Do not
create a remote or push the repository.
