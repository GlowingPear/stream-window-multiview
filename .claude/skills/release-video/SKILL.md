---
name: release-video
description: Make a "what's new" video of Stream Multiview for everything merged since the last release (or between two versions) - a feature-by-feature walkthrough of the real app with animated title cards, captions, generated music and made-up channels, as an MP4. Use when asked for a release video, trailer, walkthrough, demo or showcase of recent changes.
---

# Release video

A walkthrough of the real app, one feature at a time: a title card, then the feature in use with the same words as a caption. Everything runs in a dev copy against stand-in channels, so no real streamer, chatter or account ever appears.

Files next to this one:

| File | What it does |
|---|---|
| `changes.js` | Lists what to cover: PRs merged since the newest tag (or a range), with their descriptions |
| `video.js` | Records a scenes file and makes the MP4, always under 10 MB (`node video.js <scenes.js>`) |
| `stage.js` | Stand-in kick.com (and Twitch and YouTube: their chats and players are stand-ins, and the app's questions to them get empty answers, so no real channel shows): six made-up channels (`pixelpear`, `nightowl`, `arcadia`, `lofilane`, `tidepool`, `emberfox`) with moving pictures, chats with a chat box and user cards (each message in a row of its own, as on Kick), made-up emotes (`EMOTES`; `emoteHtml(name)` for a message, `[emote:<EMOTE_IDS[name]>:<name>]` in Kick's chat events, served at Kick's emote address so no real emote is ever asked for, and listed as each channel's emotes), and Kick's channel API |
| `capture.js` | Smooth capture of every frame the window paints |
| `music.js` | Generated backing song (no samples, nothing to license): intro, verse, lift, chorus with a hook, breakdown, arranged to fit the video's length |
| `sounds.js` | Records the app's own sounds (alert chimes and the like) so the music can pause for them |
| `examples/` | Finished scenes files, as models for the next one: `0.2.20.js` (one feature set, seeded data), `0.2.16-to-0.2.18.js` (three releases, chats, alerts; recorded from a v0.2.18 checkout with `--dir`), `0.4.0.js` (ALL: a linked streamer on Kick and Twitch, fed made-up lines in each site's format by `0.4.0-chat.js`; captions beside the chat) |

## 1. Check the tools

- Playwright: `npm run test:setup` once (see `drive-app`).
- ffmpeg with libx264 on the PATH: `brew install ffmpeg`, `winget install Gyan.FFmpeg` or `sudo apt install ffmpeg`. Playwright's own ffmpeg can't make MP4s.
- A screen (`xvfb-run -a` on Linux without one). The app opens on screen while recording, which takes a few minutes; it doesn't need focus.

Don't install anything without asking.

## 2. Find what changed

```sh
node .claude/skills/release-video/changes.js                 # merged since the newest tag
node .claude/skills/release-video/changes.js v0.2.16 v0.2.18  # or a range
```

The default is the changes merged into `main` but not yet tagged: a video for the coming release. For those, `changes.js` prints the next version (the newest tag's last number + 1). Use it on the poster, the chips and the outro as if it were already out (`Get 0.2.21`): the video is attached to that release when it's published. If nothing is merged since the newest tag, it says so and lists that release's own changes instead. Tell the developer which range the video covers.

Pick what to show from the PR descriptions:
- Show what a user sees and does. Leave out tests, CI, tooling, refactors and docs.
- A fix that's hard to see on its own still gets a short scene, e.g. the before-broken thing working.
- Several releases: include every one of them, in version order.

## 3. Start a worktree

The skill only writes to the temp folder, so a video needs no branch. Run it in its own worktree anyway (`npm run worktree -- docs/video-<version>`, see `start-change`) so a dev copy of `main` is used and the main checkout stays free. Remove the worktree when done (`git worktree remove`, then delete the branch).

## 4. Write the scenes file

Write it in the temp folder (not the repo), starting from the closest example. Find selectors in `src/index.html`, `src/page/` and in the PR's launch tests (`test/launch/**/*.test.js`), which drive the same features.

```js
module.exports = {
  name: 'stream-multiview-0.2.21',              // the MP4's name
  poster: { v: '0.2.21', h: "What's new", p: 'One line about the release' },   // the first frame and thumbnail
  features: 4,                                  // how many feature() calls: the progress dots
  seed(data) { /* optional: write files (e.g. profiles.json) into the app's data folder before it starts */ },
  stage: { mod: 'nightowl', kick: { /* optional: extra or replaced Kick API answers, by slug */ } },
  async prepare(m) { /* optional: saved settings and a reload, before the cards are added (a reload in run() removes them) */ },
  async run(t) { /* the scenes */ }
};
```

`t` has `m` (the main window, a Playwright page), `app`, `stage`, `wait(ms)` and:

| Helper | Does |
|---|---|
| `card({ h, p, items, odo, v, from })` / `uncard()` | Animated title card (iris, word-by-word title, sparks, the app's pear filling once) / iris it closed |
| `feature(v, title, sub, from?)` | Title card for a feature, then the same words as a caption. `from`: the previous version, flipped to `v` on the chip (a release's first feature) |
| `cap(v, title, sub)` / `uncap()` | Caption only (a second point within a feature) |
| `ring(sel)` / `unring()` | Spotlight ring around something; scrolls it into view first |
| `moveTo(sel, { fx, fy })`, `click(sel)`, `type(sel, text)` | A visible pointer gliding there (scrolling it into view first), clicking, typing like a person |
| `glide(x, y)` | The pointer to a point (e.g. the top edge) |
| `reveal(sel)` | Smoothly scroll something fully into view |
| `add(names)` | Add channels without showing it (behind a card) |
| `chatSay(ch, name, text)`, `inChat(ch, js)`, `clickInChat(ch, js)` | Post a message in a stand-in chat, run code there, click something there (e.g. a name or the chat box; the caption moves off it) |

## The style (what developers asked for)

- **Poster first.** The first frame is a still poster, never a black screen. It's also saved as `thumbnail.png` and as the MP4's cover picture.
- **One opening card**, counting through the versions (`odo`), with one line per release listing its features. Never several cards in a row: set up channels, layouts and saved streamers behind the opening card (`add`, DOM clicks) so the first scene starts ready.
- **Each feature's card comes right before its demo** (`feature`), never after it. Mark each release's first feature with `from` so the chip flips to the new version.
- **Show it working.** Use real clicks, typing and the app's own dialogs. Visible results matter: a window lighting up, a dialog asking first, a list filtering.
- **Keep things in frame.** `ring` and `moveTo` scroll their target into view. Take a ring off before scrolling again. Captions move to the top when the pointer is low; check they don't cover what's being shown.
- **Things that hide must be shown hiding.** Move the pointer away so it goes, then back so it returns (e.g. the hidden bar: away, wait, then to the top edge).
- **Made-up everything.** Only the stand-in channels and chatters, seeded data with made-up history, and invented names in typed text. Never a real channel, login or chat.
- **Under 10 MB** (GitHub's limit for a video in release notes or a PR). `video.js` sees to it. It encodes at the window's 1280×800, in two passes when one pass is too big, and drops to 960×600 when the video is too long for 1280×800 to stay sharp (over about 3 minutes). Aim for 2-3 minutes, so it stays at 1280×800.
- **Pace:** title cards ~2.5 s, a beat of 1-3 s on each result, ~10-20 s per feature. An outro card: `Get <version>` / `Settings › Updates › Check now`, and every feature in a line.
- **Hear the app's sounds.** When a demo makes the app play a sound (a mention chime, a spam knock, a sound preview in Settings), the music pauses for it and the real sound plays. `video.js` does this by itself for everything the app plays through WebAudio, which covers all the built-in sounds. Leave alert sounds on in demos, and give each sound a beat (~2 s) before the next thing happens. A custom sound file isn't recorded, so demos use the built-in sounds.
- **Smooth:** ~24-30 fps captured. Don't use Playwright's own video recording, which drops to 5-15 fps and looks laggy.

## 5. Record

```sh
node .claude/skills/release-video/video.js <scenes.js> [--dir <worktree>] [--out <file.mp4>]
```

Run it in the background with a time limit (it takes as long as the video plus about a minute; see *Don't get stuck* in `drive-app`). It prints the MP4, the thumbnail, a contact sheet, the capture rate and when the app's sounds played (the music pauses there). On a failure it saves `fail.png` of that moment and says where.

## 6. Check it before handing it over

- **Look at the contact sheet** (a still every 4 s). For details, take stills with `ffmpeg -ss <s> -i <mp4> -map 0:v:0 -frames:v 1 <png>`, or 1 s sheets of a stretch with `-vf "fps=1,scale=480:-1,tile=6x4"`.
- Check:
  - Is each card before its demo?
  - Is every ringed or clicked thing fully in frame?
  - Does any caption cover the thing being shown?
  - Is anything real or private visible?
  - Do dev-only texts show up? (`video.js` already swaps Settings › Updates' "git checkout" notice for what an installed copy says.)
- The capture rate should be ~24+ fps with the longest still under ~0.4 s. If not, close other heavy apps and record again.
- Fix the scenes file and record again until it's right. Then give the developer the MP4 path, its length and what it covers.

## Gotchas

- **What's new** opens by itself on a new version. `video.js` closes it behind the poster.
- **Buttons hidden in the More menu** at 1280×800 (e.g. `#tile`) time out when clicked: click them through the DOM behind a card, or open the menu first.
- **Mention and spam alerts** ignore what's already in a chat when they're turned on. Wait ~3 s after closing Settings before `chatSay`.
- **Long typing** is fine: `type` allows 60 s.
- **A dialog that closes by itself** usually means a click landed on its backdrop. Use `moveTo`/`click`, which scroll their target into view, not raw mouse clicks at a box.
- **Settings scrolls:** don't over-scroll long panes (e.g. release notes) past what matters. Scroll in small wheel steps.
- **Live checks** go to the stand-in Kick API: `m.evaluate(() => window.kmv.checkLiveNow())` makes the channels show live with viewers and start times.
- **Kick-only stand-ins.** Twitch and YouTube channels would reach the real sites, so use the stand-in Kick channels.
