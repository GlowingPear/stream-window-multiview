---
name: start-change
description: Start a change to Stream Multiview (bug fix, feature, issue) - plan it, create its branch in a separate git worktree, capture "before" screenshots/video, build and check it, then hand over to open-pr. Use when asked to fix, add or change something in this repo, or to work on an issue.
---

# Start a change

Every change goes on its own branch in its own worktree and ends as a pull request. Never commit to `main`.

## 1. What's the change?

- If the request already has a description or an issue (`#12`, an issue URL), use it. Don't ask again.
- For an issue, read it: `gh issue view <n> --comments`.
- If nothing was given, ask once: "What's the change? A short description or an issue number/URL."
- If it's too vague to plan, look at the code first and only ask if it's still unclear.

## 2. Plan (read-only, before any code changes)

Look at the relevant code (see the project structure table in `README.md`), then show a short plan and wait for approval:

- **Why:** the problem in one or two lines (plus `Fixes #<n>` if there's an issue)
- **Changes:** which files and how
- **Testing:** which of `npm test`, `npm run test:ui`, `npm run test:launch` and what to try in the app
- **Before / after:** what to capture, or N/A (rules below), and whether it needs a login (then use a lasting profile)
- **Branch:** e.g. `fix/12-kick-follow-limit` or `feat/hikari-theme`. Pick it yourself; don't ask.

For large or risky changes, use plan mode.

**Before / after rules:**
- **Screenshot** for something you can see at one moment: layout, styling, wording, a dialog or list with different content, an error or empty state.
- **Video** for something that happens over time: progress or loading, animations, drag and drop, resizing, a sequence of steps, timing fixes (flicker, freezes). Keep it under ~15 s. Record "before" too only when the motion itself changed; a new feature needs just "after".
- **Both** when there's an end state and the steps to get there matter.
- **N/A** when nothing visible changes (refactors, build/CI, tests, docs).
- If unsure, screenshot.

Check the tools before promising captures (see the `drive-app` skill): Playwright (`npm run test:setup`), its ffmpeg for video, a screen (`xvfb-run` on a Linux machine without one), `gh` 2.99+ for attaching. If something is missing, say what will be skipped and how to fix it. Don't install anything without asking.

## 3. Create the worktree

```sh
npm run worktree -- <branch>
```

It creates the branch from the latest `origin/main` next to the main checkout, runs `npm install` and checks the app engine. Work only in the printed folder from now on. Untracked local files (e.g. a `.envrc`) aren't copied: mention any that the developer may need.

## 4. Capture "before"

The new worktree is still identical to `main`, so capture "before" now, before editing anything, following the `drive-app` skill. Save captures in the temp folder (`drive.outDir()`), never in the repo.

## 5. Build and check

- Make the change. Match the surrounding code's style.
- Add or update tests next to similar ones in `test/`.
- Run the dev copy (`run-dev` skill) and check the change in the real app. `src/main.js` and `src/live.js` need a restart, `src/index.html` only Ctrl/Cmd+R.
- Capture "after" with exactly the same steps as "before".
- Commit in small, clear commits. Don't change the version or `CHANGELOG.md`.

## 6. Hand over

When the developer is happy, follow the `open-pr` skill. Pass on the plan's Why, Testing, the issue number and the capture files.
