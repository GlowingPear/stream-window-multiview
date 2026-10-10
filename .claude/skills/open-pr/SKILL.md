---
name: open-pr
description: Open a pull request for a Stream Multiview change - run the tests, write the description from the PR template with before/after screenshots or video, show the draft for approval, then push and create it with gh. Use when a change is ready for review or the developer asks to open a PR.
---

# Open a pull request

## 1. Check the branch

- It must not be `main`. If the work is on `main`, move it to a new branch first.
- The commits must not change the version in `package.json` or `CHANGELOG.md`: releases do that.

## 2. Run the tests

- `npm test` always. Also `npm run test:ui` and `npm run test:launch` if the change touches the UI or the app's start-up (needs `npm run test:setup` once; Linux without a screen: `xvfb-run -a`). The launch tests open the app's window on screen; they don't need it focused, so the developer can keep working.
- The tests need Node.js 22 or newer. On an older Node, `test/unit/firefox-login.test.js` fails with `node:sqlite` missing: say so; it isn't caused by the change.
- Report failures honestly in the PR, with what was and wasn't run.
- Run `npm run test:ui` and `npm run test:launch` in the background with a time limit and read the results when they finish (see *Don't get stuck* in the `drive-app` skill). If a run stalls, find out why before running it again.

## 3. Write the draft

Follow `.github/pull_request_template.md` and the style of recent PRs (`gh pr list --state merged --limit 5 --json title,body`): plain words, a bold label per section, short bullets.

- **Title:** one line a user would understand (e.g. *Add Hikari theme*). Titles become the app's "What's new" entries.
- **Why:** the problem, and `Fixes #<n>` if there's an issue.
- **What changed:** what a reviewer needs to know, not every line.
- **Tests:** what was run and what was tried in the real app.
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

## 6. After merging

Remove the worktree and branch:

```sh
git worktree remove .worktrees/<branch>
git branch -d <branch>
```

Delete any temporary dev profile and the captures in the temp folder.
