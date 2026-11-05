# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Hooks (Claude Code only)
`.claude/settings.json` runs these Node scripts from `.claude/hooks/`:
- `block-bad-tests.js` (before Edit/Write): denies new test code with sleeps, `.only`, assertions that can never fail, empty catch blocks, skip/fail/`@Disabled` without an FM/SCRUM/SEC reference, and raised Playwright retries. If it blocks you, rewrite the test. Don't work around the hook.
- `block-dangerous-commands.js` (before Bash/PowerShell):
  - **Denies:** pushing to main/master, force pushes, `--no-verify`, recursive deletes outside build output, curl piped into a shell, publishing, DROP/TRUNCATE.
  - **Asks first:** any other push, `reset --hard`, `clean -f`, branch deletion, rebase/amend.
- `format-file.js` (after Edit/Write): runs Prettier if that app has it installed, then `oxlint --fix` (web) or `eslint --fix` (admin). Problems it can't fix come back to you as context.
- `log-action.js`: writes a short, redacted JSON line for each action to `.claude/logs/actions.jsonl` (gitignored).
