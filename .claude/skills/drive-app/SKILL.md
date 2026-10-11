---
name: drive-app
description: Drive the Stream Multiview desktop app with Playwright - click and type in it, read what it shows, take cropped screenshots and record videos for pull requests. Use to check a change in the real app or to capture before/after screenshots or video.
---

# Drive the app

`drive.js` (next to this file) connects Playwright to a dev copy. Write a short Node script that requires it, and run it from anywhere.

## Check the tools first

```sh
node -e "console.log(require('./.claude/skills/drive-app/drive').tools())"
```

It reports `playwright` (needed for everything), `video` (Playwright's ffmpeg) and `screen`, plus what to run for anything missing:

| Missing | Fix |
|---|---|
| Playwright | `npm run test:setup` once (installs Playwright and its browser, not saved as a dependency) |
| Video | `npx playwright install ffmpeg`, or use screenshots only |
| A screen (Linux without a desktop) | run the script with `xvfb-run -a`; otherwise skip captures |

Don't install anything without asking. If a tool is missing, say what you'll skip and how to fix it.

## Screenshots and checks: attach to a running copy

Start it with `npm run dev -- --profile <name> --debug <port>` (see `run-dev`), then:

```js
const drive = require('<repo>/.claude/skills/drive-app/drive');
(async () => {
  const { main, pages, close } = await drive.connect(9333);
  await main.click('#savedBtn');
  // ...
  await main.locator('#importDlg .dlg').screenshot({ path: require('path').join(drive.outDir('pr'), 'after.png') });
  await close();   // disconnects; the app keeps running
})();
```

- `main` is the app's window (`src/index.html`). `pages()` also lists each stream and chat, and hidden helper pages such as the `kick.com` page used for Kick's API.
- Find selectors in `src/index.html`. Examples: `#url` (paste box), `#savedBtn`, `#importBtn`, `[data-imp="kick"]`, `#importDlg .dlg-list`. Progress text in dialogs shows in `.dlg-list .empty`.
- Crop to what changed: screenshot an element (`locator.screenshot`) or use `clip`.

## Videos: start the copy under Playwright

Playwright can only record a copy it starts itself. Close any copy that uses the same profile first.

```js
const run = await drive.launch({ profile: 'work', video: true });   // or dir: '<other worktree>' to record another branch
await drive.blur(run.main, ['#importDlg .dlg-list label']);       // hide private details
// ... the steps ...
const { video } = await run.close();                                 // WebM in the temp folder
```

- Keep videos short (~15 s, or as long as the "before" slowness takes) and under 10 MB. The window is set to 1280×800 to match the video.
- Close anything that distracts from the change first. Open streams play ads and chats scroll: in a dev profile, clear them with `#clear`, then click **Close all** in the app's own confirm dialog (`#askDlg .ask-yes`).
- Wait for real results (`waitForSelector`) instead of fixed sleeps.
- **The last frames are lost when nothing changes on screen.** Video frames are only recorded when the screen changes, and the end is cut off when the app closes. Finish with a little movement, e.g. slowly scroll the result list and back, then wait ~1.5 s before `close()`.
- **Check every video before using it:** `await drive.frames(video, [3, -0.3])` saves stills (seconds; negative counts from the end). Look at them: is the result on screen at the end, and is anything private visible?

## Kick and Cloudflare

Kick sits behind Cloudflare. Its check fails, and can't be passed even by hand, on a page that Playwright is attached to when it loads. Too many automated loads can also make Cloudflare start checking that profile.

- **Load Kick pages without Playwright.** Start the copy with `npm run dev -- --profile <name> --debug <port>`, let its Kick windows load (complete the check by hand once if it appears; the pass is saved in the profile), and only then attach.
- `connect()` only sees web views that open after it connects, so attach to an already-loaded Kick chat with plain DevTools commands instead (`/json/list` on the debug port, then `Runtime.evaluate` and `Page.captureScreenshot` over its WebSocket).
- Keep Kick loads few: open each chat once, don't reopen it for every check, and don't restart the app for every step.
- Twitch and YouTube have no such check, so Playwright is fine there.

## Don't get stuck

- **Run anything that can take over a minute in the background** (the app, launch/UI tests, recordings) with an overall time limit, and read its output when it ends. Never block on it in the foreground.
- **Every wait has a limit.** `drive.js` sets 15 s per step; in your own Playwright code use `page.setDefaultTimeout()` and pass `timeout` to long waits. Give tests a per-test `timeout`.
- **Clean up after a failure before the next step:** close open dialogs and finish anything still waiting, or one failure blocks everything after it.
- **Always close what you started**, in a `finally`, and force-quit it if it doesn't close within ~10 s (`run.close()` does this). Stop only your own processes: by their handle, or by their temporary data folder. Never by name: an installed copy has the same name.
- **If a run stalls,** take a screenshot to see what's on screen (a dialog in the way?), stop your own processes, fix the cause and run again. Don't just raise the timeout.

## Privacy

Captures go to `drive.outDir()` in the system temp folder, never into the repo. Before capturing, blur or crop anything private (usernames, chats, followed channels, avatars) with `drive.blur(page, selectors)`, unless it's what the change is about.

## Before / after

- Use the same steps, window size and profile for both.
- "Before" is captured from an unchanged checkout: the new worktree before editing (see `start-change`), or `drive.launch({ dir })` on another worktree at `main`.
- Name files clearly, e.g. `kick-import-before.png`, `kick-import-after.webm`.
