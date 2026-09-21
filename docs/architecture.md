# Architecture

The CLI has four boundaries:

1. `config.ts` loads YAML, resolves paths relative to the config file, and validates
   descriptions and image dimensions before a browser connection is made.
2. `security.ts` accepts loopback CDP endpoints only and matches one exact
   Developer Dashboard item tab.
3. `plan.ts` compares configured intent with a sanitized Dashboard snapshot. It
   permits description updates and append-only image operations.
4. `dashboard.ts` performs the bounded write, clicks only **Save draft**, reloads,
   and verifies description equality and image counts.

The CLI does not launch Chrome. A human starts official Chrome with a dedicated
profile, signs in, opens the intended item, and supplies the loopback endpoint.

The Dashboard is not a stable public automation API. Selectors are intentionally
small and guarded by headings, exact item IDs, language labels, counts, and final
read-back checks. A selector failure stops the run without switching browsers or
trying another item.
