# Claude Code entry point

Read [AGENTS.md](AGENTS.md) for the shared engineering, safety, and release rules.
Use [docs/architecture.md](docs/architecture.md) for module responsibilities,
[docs/usage.md](docs/usage.md) for CLI behavior, and
[docs/validation.md](docs/validation.md) for real-store verification limits.

DashBye is a local-first TypeScript ESM CLI. Relative imports use `.js`. Tests run
against compiled `dist/` files, so rebuild before running an individual test.

```bash
npm run check
npm test
npm run build && node --test dist/tests/reconcile.test.js
node dist/src/cli.js -h
```

The static website is a separate package with its own lockfile. From `website/`:

```bash
npm test
npm run build
npm run dev
```

Vercel builds with Root Directory `website` using `website/vercel.json`.
`dashbye.lol` is primary; `dashbye.arieszhou.com` serves the same build with canonical
URLs on dashbye.lol. Merges to `main` deploy production when site inputs change.
The ignored-build logic lives in `website/scripts/ignore-build.sh`.
