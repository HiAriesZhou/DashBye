# Dashbye versioned release workspace design

## Goal

Dashbye manages the complete desired Chrome Web Store draft state outside its own
repository. A user points the CLI at a project, a built extension artifact, and a
release resource directory. Dashbye compares the built manifest, versioned local
metadata, the previous normalized release record, and the current Dashboard draft.

The tool remains product-neutral. It does not recognize repository names or fixed
product paths.

## Entry points

`dashbye -h` is the only help entry point. It documents every command, option,
default, initialization step, configuration precedence, and agent example.

When no configuration exists in an interactive terminal, `dashbye init` guides the
user through project path, build artifact, resource directory, item ID, default
language, CDP endpoint, and output configuration path. Non-interactive use requires
explicit values and returns structured errors instead of prompting.

Configuration precedence is command-line values, then the explicitly selected or
nearest discovered project configuration, then built-in defaults. Relative paths in
a configuration resolve from that configuration file.

## Release workspace

The default resource directory is `store/`, but every path is configurable.

```text
store/
  release.yml
  listing/
    <locale>/description.txt
  assets/
  releases/<version>.lock.json
```

`release.yml` is one reviewable desired-state document for listing fields and
privacy declarations. Longer localized descriptions and binary assets remain in
their own files.

The built extension ZIP, build directory, or manifest is the source of truth for
version, localized summary, permissions, optional permissions, host permissions,
optional host permissions, and content-script matches. A generated lock records the
artifact SHA-256, normalized manifest facts, release metadata hashes, and asset
hashes. It contains no browser credentials.

## Listing and privacy coverage

Listing state covers detailed descriptions by locale, category, default language,
localized and global screenshots and videos, icon, small and marquee promotional
images, homepage, support and official URLs, and mature-content status.

Privacy state covers single purpose, permission and host-scope justifications,
remote-code declaration, collected data categories, data-use certifications, and
privacy-policy URL. Manifest facts can identify missing or stale justifications and
scope changes, but Dashbye never invents data collection claims or legal
certifications.

## Comparison and plans

Validation compares the current artifact with the declared release workspace and
the prior release lock. A permission addition without a justification is an error;
a removed permission with a stale justification is an error. Required/optional
moves and broader host or content-script scopes are highlighted for review.

Planning compares normalized local intent with a freshly read Dashboard snapshot.
Plans contain exact add, update, replace, remove, and reorder operations. A plan is
bound to item ID, artifact hash, resource hashes, and remote snapshot hash. Any
change before execution invalidates it.

## Browser writes

Dashbye connects only to an already running, manually authenticated Chrome through
a loopback CDP endpoint. It never automates Google login. Sync may reconcile draft
listing and privacy fields, including image removal and replacement, only from an
approved plan. Privacy writes and destructive asset operations require explicit
approval in both interactive and agent modes.

The final listing and privacy operation remains **Save draft**. Package upload is
kept within the item draft. Review submission and publication are
outside the tool. After saving, Dashbye reloads and reads every supported field and
asset order. A partial failure reports completed and incomplete operations.

## Testing

Unit tests cover configuration precedence, artifact normalization, permission
drift, stale justifications, deterministic hashing, complete reconciliation plans,
plan invalidation, and output redaction. Fixture-driven adapter tests cover listing
and privacy selectors. Real Dashboard verification proceeds read-only first, then a
reviewed draft write, save, reload, and read-back on one explicitly confirmed item.
