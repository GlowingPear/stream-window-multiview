---
name: open-pr
description: Open a pull request for a Stream Multiview change - run the tests, write the description from the PR template with before/after screenshots or video, show the draft for approval, then push and create it with gh. Use when a change is ready for review or the developer asks to open a PR.
---

# Open a pull request

## 1. Check the branch

- It must not be `main`. If the work is on `main`, move it to a new branch first.
- The commits must not change the version in `package.json` or `CHANGELOG.md`: releases do that.

## 2. Run the tests and check coverage

- If the change touches app code (`src/`, `scripts/`): run `npm run test:coverage:hidden`. It runs every test (`npm test`, `test:ui` and the launch tests) and records coverage, so don't run those separately as well. It needs `npm run test:setup` once; Linux without a screen: `xvfb-run -a`.
- Otherwise (docs, skills, CI only): `npm test` is enough.
- Always use the `:hidden` commands on the developer's computer (`npm run test:coverage:hidden`, `npm run test:launch:hidden`): the app's windows are invisible and never take focus, so the developer can keep working. The plain `test:coverage` and `test:launch` open the windows on screen and take focus; they're for CI and `xvfb-run`. Run it in the background with a time limit and read the results when it finishes (see *Don't get stuck* in the `drive-app` skill). If a run stalls, find out why before running it again.
- The tests need Node.js 22 or newer (`.nvmrc` has the version CI uses). On an older Node, `test/unit/firefox-login.test.js` fails with `node:sqlite` missing: say so; it isn't caused by the change.
- **Coverage can't go down** (see *Tests* in `README.md`). Look at the per-file numbers it prints:
  - A file below its minimum in `test/coverage-min.json`: first find out whether this machine is the cause. Some code only runs on Linux or on Node 22 or newer, and failing tests lower the numbers. Run `npm run test:coverage:hidden` once on `origin/main` in a temporary worktree (plain `test:coverage` only if that `main` doesn't have the hidden command yet) and compare the same file. Only a drop compared with `main` is caused by the change.
  - A drop caused by the change: add tests for the new code paths until it's back, then run it again. `coverage/report.md` lists the bigger functions no test runs. Test what the change does, not only its easy helpers (e.g. the click a timer sends, a fallback, an error message).
  - Coverage went up: raise the minimums in `test/coverage-min.json` after CI has run, to the numbers on its summary page.
- Report failures honestly in the PR, with what was and wasn't run, and the coverage of the files the change touched.

## 3. Write the draft

Follow `.github/pull_request_template.md` and the style of recent PRs (`gh pr list --state merged --limit 5 --json title,body`): plain words, a bold label per section, short bullets.

- **Title:** one line a user would understand (e.g. *Add Hikari theme*). Titles become the app's "What's new" entries.
- **Why:** the problem, and `Fixes #<n>` if there's an issue.
- **What changed:** what a reviewer needs to know, not every line.
- **Tests:** what was run, the coverage of the files the change touched (and `main`'s, if compared), and what was tried in the real app.
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

## 6. Updating an open PR

When new commits change something visible (a fix after review, a follow-up), the screenshots in the description have to show the new state too:

- Capture again with the same steps (`drive-app`), and update **Before / after** in the body, plus **What changed** and **Tests** if they moved.
- Show the new body and attachments, and wait for approval as in step 4.
- Push, then `gh pr edit <n> --body-file <body.md> --attach <file> [--attach <file> ...]`, and check the references as in step 5.

## 7. After merging

Remove the worktree and branch (from the main checkout or another worktree, not the one being removed):

```sh
npm run worktree -- --clean
```

`start-change` also runs this before each new change, so merged worktrees don't pile up.

Delete any temporary dev profile and the captures in the temp folder.
