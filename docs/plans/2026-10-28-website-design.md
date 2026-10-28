# Website design (dashbye.lol)

## Decisions

- **Layout**: `website/` beside the CLI, a standalone npm package with its own lockfile.
  Not an npm workspace: the CLI's `npm ci`, tests, release workflow, and published files
  stay unchanged, and Vercel does not install playwright-core or sharp for the CLI.
- **Stack**: Astro static output, no client framework. The only script is the copy button.
- **Single source**: the version comes from `package.json`, the agent prompt from the READMEs,
  and `/docs/` renders `docs/usage.md` and `docs/usage.zh-CN.md`. Landing copy is a short
  curated version of the READMEs in `website/src/lib/copy.ts`.
- **Languages**: English at `/`, Simplified Chinese at `/zh/`, linked with hreflang.
- **Domains**: `dashbye.lol` is primary. `dashbye.arieszhou.com` serves the same build so the
  site stays reachable if the `.lol` domain is not; canonical URLs always point to dashbye.lol.
- **Privacy**: no analytics, cookies, or third-party requests. Fonts (Sora, JetBrains Mono)
  are self-hosted, which also keeps the site complete on networks that block Google Fonts.

## Visual direction

Paper and ink from the brand palette (soft white `#F7FAF9`, navy `#1D3043`); green `#429C7E`
marks approval and "nothing left to change". The page leads with the tagline and the gecko,
then a synthetic `dashbye release` transcript (fictional item ID, real output format) with
three numbered notes. Sections are separated by hairlines rather than cards.

## Deployment

Vercel project with Root Directory `website`; `website/vercel.json` skips builds when no file
the site reads has changed. CI builds the site in its own job.
