---
name: open-pr
description: Open a pull request for a Stream Multiview change - run the tests, write the description from the PR template with before/after screenshots or video, show the draft for approval, then push and create it with gh. Use when a change is ready for review or the developer asks to open a PR.
---

# Open a pull request

## 1. Check the branch

- It must not be `main`. If the work is on `main`, move it to a new branch first.
- The commits must not change the version in `package.json` or `CHANGELOG.md`: releases do that.

## 2. Run the tests

Coverage isn't run on the developer's computer: it runs every suite again while recording, which is slow and heavy. CI checks it on the pull request (step 5).

- If the change touches app code (`src/`, `scripts/`): run `npm test`, `npm run test:ui` and `npm run test:launch:hidden`, one after another. The UI and launch tests run four files at a time. They need `npm run test:setup` once; Linux without a screen: `xvfb-run -a`.
- Otherwise (docs, skills, CI only): `npm test` is enough.
- Always use `npm run test:launch:hidden` on the developer's computer: the app's windows are invisible and never take focus, so the developer can keep working. The plain `test:launch` opens the windows on screen and takes focus; it's for CI and `xvfb-run`. Run the suites in the background with a time limit and read the results when they finish (see *Don't get stuck* in the `drive-app` skill). If a run stalls, find out why before running it again.
- The tests need Node.js 22 or newer (`.nvmrc` has the version CI uses). On an older Node, `test/unit/firefox-login.test.js` fails with `node:sqlite` missing: say so; it isn't caused by the change.
- Report failures honestly in the PR, with what was and wasn't run.

## 3. Write the draft

Follow `.github/pull_request_template.md` and the style of recent PRs (`gh pr list --state merged --limit 5 --json title,body`): plain words, a bold label per section, short bullets.

- **Title:** one line a user would understand (e.g. *Add Hikari theme*). Titles become the app's "What's new" entries.
- **Why:** the problem, and `Fixes #<n>` if there's an issue.
- **What changed:** what a reviewer needs to know, not every line.
- **Tests:** what was run, and what was tried in the real app.
- **Before / after:** a table of screenshots, videos on their own line below it, or `N/A` when nothing visible changed. Reference each file by its path, e.g. `![After](/tmp/.../after.png)`.
- **Notes:** what users will see, steps before merging, PRs it builds on. Drop the section if empty.

Save the body to a file in the temp folder (not the repo).

## 4. Show the draft and wait

Show the title, the body and the list of attachments. Point out anything private in the captures. **Don't push until the developer approves.**

## 5. Push and create

```sh
git push -u origin <branch>
gh pr create --base main --title "<title>" --body-file <body.md> --attach <file> [--attach <file> ...]
```

- `--attach` uploads each image or video to GitHub and rewrites references to it in the body (gh 2.99 or newer). With an older gh, create the PR without the attachments and tell the developer to drag the files from the temp folder into the description.
- Open the PR (`gh pr view --json body`) and check that every reference became a GitHub URL. Fix it with `gh pr edit --body-file ... --attach ...` if not.
- Use the developer's own git and gh accounts. Don't change them.
- **Coverage can't go down** (see *Tests* in `README.md`). CI's test run checks it (`npm run test:coverage` on Linux) and fails if a file drops below its minimum in `test/coverage-min.json`; the run's summary page has the per-file numbers and the bigger functions no test runs. When it fails for coverage, add tests for the change's new code paths (what it does, not only its easy helpers: the click a timer sends, a fallback, an error message) and push them. When coverage went up, raise the minimums in `test/coverage-min.json` to the numbers on that summary page.

## 6. Updating an open PR

When new commits change something visible (a fix after review, a follow-up), the screenshots in the description have to show the new state too:

- Capture again with the same steps (`drive-app`), and update **Before / after** in the body, plus **What changed** and **Tests** if they moved.
- Show the new body and attachments, and wait for approval as in step 4.
- Push, then `gh pr edit <n> --body-file <body.md> --attach <file> [--attach <file> ...]`, and check the references as in step 5.

## 7. Merging

When the developer wants the PR merged once its checks pass, turn on auto-merge rather than waiting on the checks yourself:

```sh
gh pr merge <n> --auto --merge
gh pr view <n> --json autoMergeRequest,state   # autoMergeRequest set: GitHub merges it when every required check passes
```

- GitHub merges it as soon as the required checks pass and it's up to date, and does nothing if a check fails. Then fix it on the branch and push: auto-merge stays on.
- If `gh` says the PR is already mergeable (`clean status`), it merges straight away.
- Only merge without `--auto` when the developer asks to. Then first wait until `gh pr checks <n>` shows nothing pending and `gh pr view <n> --json mergeStateStatus` is `CLEAN`: `gh pr checks --watch` can stop before every check has started.

## 8. After merging

Once `gh pr view <n> --json state` says `MERGED`, remove the worktree and its branch (from the main checkout or another worktree, not the one being removed), then the branch on GitHub, which the repository doesn't delete itself:

```sh
npm run worktree -- --clean
git push origin --delete <branch>
```

Never delete the branch on GitHub before the merge: that closes the PR.

`start-change` also runs this before each new change, so merged worktrees don't pile up.

Delete any temporary dev profile, and remove the captures from the temp folder:

```sh
node -e "require('./.claude/skills/drive-app/drive').clean()"
```
