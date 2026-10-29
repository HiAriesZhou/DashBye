#!/bin/sh
# Vercel's ignored build step, run from website/: exit 0 skips the build, exit 1
# builds, and any other code fails the deployment. The site depends on these paths.
# Vercel clones only the last 10 commits, so the previous deployment's commit may be
# missing after a large merge; build then.
previous="$VERCEL_GIT_PREVIOUS_SHA"
[ -n "$previous" ] && git cat-file -e "$previous^{commit}" 2>/dev/null || exit 1
git diff --quiet "$previous" HEAD -- . ../docs/usage.md ../docs/usage.zh-CN.md ../brand ../README.md ../README.zh-CN.md ../package.json || exit 1
