#!/usr/bin/env bash
# PreToolUse hook on Bash: before a `git push`, runs the fast checks CI would fail the push on (bin/pre-push.mjs): AI trailer
# or Claude author, formatting, no-bloat, shared code, Worker size. Blocks (exit 2) only on a real finding.
#
# UNLIKE no-em-dash.sh AND scoped-git-add.sh THIS ONE FAILS OPEN. Those two guard a rule; this one saves a CI round trip, and CI
# still runs every check it runs, so a hook that cannot run (no node, a tool that is not installed, a timeout) must not stall
# a push. The cost of failing open is the CI failure it was meant to prevent, which is where things stood before it.
#
# This file lives only in devkit; each repository runs it from node_modules/@dustinedwards/devkit/claude/hooks through its
# .claude/settings.json (devkit README, "The shared Claude Code hooks"). The settings entry runs it only when the file is
# there, so a repository settings file can name it before the repository's devkit pin has caught up.
command -v node >/dev/null 2>&1 || exit 0
exec node "$(dirname "$0")/../../bin/pre-push.mjs" --hook
