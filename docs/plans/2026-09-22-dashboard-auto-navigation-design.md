# Dashboard auto-navigation design

## Problem

DashBye currently connects to a dedicated Chrome session only when the user has
already opened exactly one edit tab for the configured Chrome Web Store item.
That protects the target boundary, but it makes routine use depend on manual
Dashboard navigation that the CLI can verify and perform safely.

## Decision

Keep manual Google authentication and the dedicated Chrome profile, but automate
Dashboard and item navigation after DashBye connects to the configured loopback
endpoint.

The connection flow is:

1. Connect to the configured loopback CDP endpoint.
2. Reuse one exact edit tab for the configured item when it already exists.
3. Reject multiple edit tabs for the same item because concurrent pages can hold
   conflicting unsaved state.
4. Otherwise, reuse an authenticated Developer Dashboard tab or create a new tab
   in the same dedicated browser context and open the Dashboard entry page.
5. Derive the publisher-scoped edit URL from the authenticated Dashboard URL,
   append the exact configured item ID, and navigate to that page.
6. Verify the resulting host, item ID, `/edit` suffix, and Dashboard navigation
   before any state is read or changed.

DashBye must not log the publisher ID, account identity, full authenticated URL,
cookies, or other browser state.

## Authentication and browser boundary

DashBye does not connect to the user's default Chrome profile. The user starts an
official Chrome process with a separate local `--user-data-dir` and a loopback
`--remote-debugging-port`, then signs in to Google manually. If the endpoint is
unavailable, DashBye reports that Chrome must be started. If navigation reaches a
Google sign-in page, DashBye reports that manual login is required and stops.

Automatic browser launching is outside this change. It needs separate operating
system-specific process management and must not silently open a window when a
session expires.

## Command behavior

- `doctor` remains non-navigating. It reports whether Chrome is connected and how
  many exact target edit tabs and Developer Dashboard tabs are open.
- `inspect`, `plan`, and the pre-write stage of `sync-draft` use auto-navigation.
- Navigation is read-only and does not require plan approval.
- All Dashboard writes remain bound to the reviewed plan and exact approval hash.
- Review submission and publication remain unsupported.

## Errors

Errors distinguish the actionable cause:

- endpoint unavailable: start the dedicated Chrome session;
- manual login required: sign in in the dedicated Chrome window;
- publisher context unavailable: Dashboard did not expose a publisher-scoped URL;
- item unavailable: the configured item could not be opened;
- multiple target tabs: close duplicates before continuing;
- target mismatch: navigation reached a different item and all work stops.

## Verification

Unit tests cover accepted Dashboard hosts, exact item matching, publisher-scoped
URL construction, login redirects, and rejection of unrelated URLs. A live test
uses the existing synthetic Chrome Web Store item and ignored workspace under
`.local/cws-test`: `doctor`, `inspect`, and `plan` must work without the user first
opening the item. No live write occurs without a separately reviewed plan.
