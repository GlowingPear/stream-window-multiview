# 🍐 Stream Multiview

A desktop app for watching **Kick, Twitch and YouTube** streams and chats side by side, with custom layouts, live alerts, a game focus mode and color themes.

![Version](https://img.shields.io/badge/version-0.2.10%20beta-53fc18) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey) ![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848f)

---

## Features

**Watch everything at once**
- Kick, Twitch and YouTube streams and chats, plus regular YouTube videos
- Drag, resize and snap windows anywhere, or let a layout arrange them
- Layouts: **Focus view**, **Game focus**, **Columns**, **Chat focus**, **Auto** and **Tile**
- Save your own named layouts and switch between them from a dropdown
- Every window's name is a dropdown, so you can swap any two streams or chats

**Switch control**
- One panel for every stream: play/pause, mute, volume, refresh, a live mini preview and remove
- Click a name to make it the big stream, or drag names onto each other to swap them
- Dock it, float it anywhere in the window, or pop it out into its own window (even on another monitor)

**Gaming**
- **Game focus** layout: your game takes the big area and streams and chats sit on the side
- **Put a game here** (Windows): moves your game's real window into the game area, where you play it as normal
- See-through game area, plus "Show a window" to put a stream or another app's window there instead

**Other apps' windows**
- Show any window (such as a Discord pop-out call) as a live picture inside the app
- These windows appear in the switch control and can be made the big one

**Saved channels and alerts**
- Saved list with Kick / Twitch / YouTube tabs, with live channels listed first
- Desktop notifications when saved channels go live, and optional auto-open when they do
- **Import follows** from Kick, Twitch and YouTube
- Alerts when someone @mentions you or replies to you in Kick or Twitch chat

**Comfort**
- Undo / redo for window changes (Ctrl+Z / Ctrl+Y)
- Keyboard shortcuts (press **F1**), which you can switch off
- **Colors and themes**: 12 built-in themes, full color customization, and saved custom themes
- Auto-pause streams you can't see, and "pause all except focus" to save bandwidth
- Built-in instructions and a "What's new" list (the **?** button)

**Automatic updates**
- Checks this GitHub repository for new versions, installs them in the background, then asks you to restart
- Help › Updates: check now, turn automatic updates on or off

**Privacy and security**
- One login per platform, kept between launches. Passwords are never stored, only each site's "stay signed in" session.
- Saved logins are **encrypted** with a key tied to your Windows account (macOS: Keychain)
- Optional "Forget my login when I close the app" for each platform
- Each stream player gets its own storage, so volumes and settings don't leak between streams

---

## Getting started

### Download (recommended)
Get the latest installer from the [**Releases**](https://github.com/GlowingPear/stream-window-multiview/releases/latest) page:

| System | File | How |
|---|---|---|
| Windows 10/11 | `Stream-Multiview-Setup-<version>.exe` | Run it and follow the steps |
| macOS (Intel and Apple Silicon) | `Stream-Multiview-<version>-mac.dmg` | Open it and drag the app into Applications |

The app isn't code-signed yet, so the first launch shows a warning:
- **Windows** ("Windows protected your PC"): click **More info → Run anyway**.
- **Mac** ("can't be opened" / "Apple could not verify"): open **System Settings → Privacy & Security** and click **Open Anyway**.

Installed copies update themselves from new releases.

### Run from source
Requires [Node.js](https://nodejs.org/) (LTS).
- **Windows:** double-click **`Start Stream Multiview.bat`** (first launch installs the engine, about a minute). Optional: **`Create Desktop Shortcut.bat`**.
- **macOS / Linux:** `./start-mac-linux.sh`
- **Any platform:** `npm install` then `npm start`

> When running from source, always start the app with the launcher, the shortcut or `npm start`. They run `harden.js`, which keeps saved-login encryption switched on. (The installers have it built in.)

### Building the installers yourself
```sh
npm install
npm run dist:win   # on Windows -> dist/Stream-Multiview-Setup-<version>.exe
npm run dist:mac   # on a Mac   -> dist/Stream-Multiview-<version>-mac.dmg
```

## Adding streams

Paste any of these into the box at the top and press Enter:

| Platform | Examples |
|---|---|
| Kick | `kick.com/name` or just `name` |
| Twitch | `twitch.tv/name` or `tw:name` |
| YouTube channel | `youtube.com/@name` or `@name` (opens their live stream) |
| YouTube video | any `watch?v=`, `youtu.be/`, `/live/` or `/shorts/` link |

---

## Keyboard shortcuts (highlights)

| Key | Action |
|---|---|
| `F1` / `?` | Help and the full shortcut list |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `F` / `G` / `C` / `T` | Focus view / Game focus / Columns / Tile |
| `1`–`9` | Make that stream the big one |
| `←` `→` | Previous / next stream big |
| `M` / `Space` / `R` | Mute / pause / refresh the big stream |
| `S` | Switch control on / off |
| `W` | Show another app's window |

All shortcuts can be switched off in **Help › Keyboard shortcuts**.

---

## Contributing and releases

**Making a change:** open a pull request against `main`. Don't change the version number or `CHANGELOG.md` in it. Write the pull request title as one line a user would understand (for example *"Add Hikari theme"*), because titles become the app's "What's new" entries. Every pull request runs the tests, and builds the Windows and Mac installers as a test if it changes anything that goes into them (they appear under the run's **Artifacts**). A red ✗ on the pull request means something broke: open **Details** to see which test.

**Running the tests yourself** (needs Node.js 22 or newer):

| Command | What it checks | Time |
|---|---|---|
| `npm test` | Updates, the release scripts and login encryption. Needs nothing else installed. | seconds |
| `npm run test:setup` | Run once: installs the test browser (Playwright). It isn't saved as a dependency of the app. | once |
| `npm run test:ui` | The app's page in a headless browser: adding streams, layouts, the switch control, undo/redo, shortcuts, themes, Help | ~30 s |
| `npm run test:launch` | Starts the real desktop app, adds a stream and quits (needs `npm install`; on Linux without a screen, run it with `xvfb-run -a`) | ~10 s |
| `npm run test:all` | All of the above | |

The tests are in `test/`. When you add a feature, add a test next to the similar ones.

**Publishing an update** (when one or more pull requests are merged):
1. Go to **Releases → Draft a new release**.
2. **Choose a tag:** type the new version, e.g. `v0.2.11`, and pick *Create new tag on publish*, target **main**. While in beta, raise the last number for each update (`v0.2.10` → `v0.2.11`); raise the middle one only for a big milestone (`v0.3.0`). `v1.0.0` is the first finished release.
3. Click **Generate release notes** (lists the merged pull requests), tidy them if you like, and **Publish release** (leave "pre-release" unticked).

The **Build installers** workflow then sets the version from the tag, adds the notes to `CHANGELOG.md`, commits that to `main`, builds the installers and attaches them to the release. Everyone's app updates itself from there: installed copies download the new installer, copies run from source download the new files.

Notes:
- Create the release from the latest `main`; the workflow stops if the tag points anywhere else.
- If you turn on a rule that blocks direct pushes to `main`, allow **GitHub Actions** to bypass it, so the workflow can commit the version and changelog.
- Copies that are a git clone (they have a `.git` folder) never update themselves. Use `git pull` there.

## Project structure

| File | What it is |
|---|---|
| `main.js` | Electron main process: windows, logins, live checks, notifications, game window placement |
| `preload.js` | Safe bridge between the app pages and the main process |
| `index.html` | The main app UI: windows, layouts, switch control, menus and themes |
| `switcher.html` | The switch control when it's popped out into its own window |
| `live.js` | Live-status parsing, link parsing, cookie-file reading and follow import helpers |
| `updater.js` | Checks GitHub for a newer version, downloads it and installs it safely |
| `build/icon.png` | Large app icon used for the Mac build |
| `.github/workflows/build.yml` | On each release: stamps the version and changelog, runs the quick tests, builds the .exe and .dmg installers, attaches them |
| `scripts/prepare-release.js` | Sets the version from the release tag and adds the release notes to `CHANGELOG.md` |
| `scripts/release-notes.js` | Turns a version's section of `CHANGELOG.md` into release notes |
| `test/` | Quick tests (`unit/`), UI tests (`ui/`) and the desktop-app launch test (`launch/`) |
| `.github/workflows/test.yml` | Runs the tests on every pull request and every change to `main` |
| `harden.js` | Turns on Electron's cookie-encryption fuse so saved logins are encrypted |
| `signin-preload.js` | Makes Google's sign-in page accept the app |
| `INSTRUCTIONS.txt` | How to use every feature (also shown in the app) |
| `CHANGELOG.md` | Version history (also shown in the app) |

---

## Notes and limitations

- **Put a game here** is Windows-only. It works best with games set to **Windowed** mode, and some games refuse to be resized.
- Windows from other apps (like Discord) are shown as a live picture. Interact with them in the real window.
- Google sometimes blocks sign-in inside apps. If that happens, use **"Use your browser's YouTube login instead"** in the account menu.
- YouTube chats aren't watched for @mentions.
- The app depends on how Kick, Twitch and YouTube's websites work today, so a change on their side can break a feature until the app is updated.

---

## Disclaimer

Stream Multiview is an independent project. It is not affiliated with or endorsed by Kick, Twitch, YouTube, Google or Discord. All trademarks belong to their owners.
