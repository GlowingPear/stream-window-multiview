---
name: start-change
description: Start a change to Stream Multiview (bug fix, feature, issue) - plan it, create its branch in a separate git worktree, capture "before" screenshots/video, build and check it, then hand over to open-pr. Use when asked to fix, add or change something in this repo, or to work on an issue.
---

# Start a change

Every change goes on its own branch in its own worktree and ends as a pull request. Never commit to `main`.

## 0. Check Grapevine knows what multiview's releases shipped

```sh
npm run grapevine:check
```

Never `npx grapevine-check`: without Grapevine installed, `npx` would fetch a package of that name from npm. It reads the `grapevine` field of `package.json` from every release tag and compares it with Grapevine's record.

- If it lists releases, record them in Grapevine (its `app-shipped` skill): in a Grapevine checkout, run each command it printed (e.g. `npm run released -- com.glowingpear.streammultiview 0.4.0 players@1.0 drops.farming@1.0`), then open a pull request and a patch release there. Tell the developer if you can't.
- Until a release is recorded, the capability versions it shipped could still be changed in place, and Pear Drops' card can't say which multiview release to update to.

## 1. What's the change?

- If the request already has a description or an issue (`#12`, an issue URL), use it. Don't ask again.
- For an issue, read it: `gh issue view <n> --comments`.
- **Mockups and screenshots in the issue or its comments are the design.** Download every image (and video) and look at each one before planning, also ones you made yourself: the copies on the issue are what was agreed. They're `https://github.com/user-attachments/assets/<id>` links, which need your GitHub login: `curl -sL -H "Authorization: token $(gh auth token)" -o <file> <url>`, into the temp folder (never the repo).
- If nothing was given, ask once: "What's the change? A short description or an issue number/URL."
- If it's too vague to plan, look at the code first and only ask if it's still unclear.

## 2. Plan (read-only, before any code changes)

Look at the relevant code (see the project structure table in `README.md`), then show a short plan and wait for approval:

- **Why:** the problem in one or two lines (plus `Fixes #<n>` if there's an issue)
- **Changes:** which files and how
- **Testing:** which of `npm test`, `npm run test:ui`, `npm run test:launch:hidden` and what to try in the app. Run the launch tests with the `:hidden` command, so their windows stay invisible and don't take the developer's focus.
- **Before / after:** what to capture, or N/A (rules below), and whether it needs a login (then use a lasting profile)
- **Branch:** e.g. `fix/12-kick-follow-limit` or `feat/hikari-theme`. Pick it yourself; don't ask.
- **Mockups** (when the issue has them): what each one shows, the wording in them, and anything in the plan that differs from them, and why.

For large or risky changes, use plan mode.

**Before / after rules:**
- **Screenshot** for something you can see at one moment: layout, styling, wording, a dialog or list with different content, an error or empty state.
- **Video** for something that happens over time: progress or loading, animations, drag and drop, resizing, a sequence of steps, timing fixes (flicker, freezes). Keep it under ~15 s. Record "before" too only when the motion itself changed; a new feature needs just "after".
- **Both** when there's an end state and the steps to get there matter.
- **N/A** when nothing visible changes (refactors, build/CI, tests, docs). For a refactor of the page (`src/index.html`, `src/page/`), `npm run visual-diff` shows it still looks the same: put its result in the PR instead.
- If unsure, screenshot.

Check the tools before promising captures (see the `drive-app` skill): Playwright (`npm run test:setup`), its ffmpeg for video, a screen (`xvfb-run` on a Linux machine without one), `gh` 2.99+ for attaching. If something is missing, say what will be skipped and how to fix it. Don't install anything without asking.

## 3. Create the worktree

```sh
npm run worktree -- --clean      # first: removes worktrees (and branches) whose PR is merged
npm run worktree -- <branch>
```

It creates the branch from the latest `origin/main` in `.worktrees/<branch>` inside the main checkout (ignored by git and left out of the installers), runs `npm install` and checks the app engine. Work only in the printed folder from now on. Untracked local files (e.g. a `.envrc`) aren't copied: mention any that the developer may need. `--clean` skips worktrees with uncommitted changes and says so; pass that on.

## 4. Capture "before"

The new worktree is still identical to `main`, so capture "before" now, before editing anything, following the `drive-app` skill. Save captures in the temp folder (`drive.outDir()`), never in the repo.

## 5. Build and check

- Make the change. Match the surrounding code's style.
- No system pop-ups (`alert`/`confirm`/`prompt`, `<datalist>`, date pickers, system menus or message boxes): use the app's own dropdown list, `ask()` and `flash()`. See *No system pop-ups* in `README.md`; `npm test` checks it.
- Add or update tests next to similar ones in `test/`: for every new code path, not only the parts that are easy to test. Coverage can't go down; CI checks it on the pull request (see `open-pr`), so don't run it locally.
- Run the dev copy (`run-dev` skill) and check the change in the real app. the Electron side (`src/main/`, `src/preload/`) needs a restart, the page (`src/index.html`, `src/page/`) only Ctrl/Cmd+R.
- Capture "after" with exactly the same steps as "before".
- If the issue has mockups, put the "after" captures side by side with them and fix what doesn't match (layout, wording, states, where things sit) before handing over. Say in the PR where it differs on purpose.
- Commit in small, clear commits. Don't change the version or `CHANGELOG.md`.

## 6. Hand over

When the developer is happy, follow the `open-pr` skill. Pass on the plan's Why, Testing, the issue number and the capture files. Then, without asking:

- **No coverage run:** CI checks it on the pull request (`open-pr` step 5). Only if CI's coverage check fails, add the missing tests and push.
- **Auto-merge:** `gh pr merge <n> --auto --merge` as soon as the pull request is open (`open-pr` step 7). If a check fails, fix it on the branch and push; auto-merge stays on.
- **Clean up once merged:** when `gh pr view <n> --json state` says `MERGED`, remove the worktree and its branch, then the branch on GitHub (`open-pr` step 8): `npm run worktree -- --clean && git push origin --delete <branch>`, from the main checkout.
