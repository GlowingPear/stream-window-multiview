# 🍐 Stream Multiview

A desktop app for watching **Kick, Twitch and YouTube** streams and chats side by side, with custom layouts, live alerts, a game focus mode and color themes.

![Version](https://img.shields.io/badge/version-0.2.9%20beta-53fc18) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey) ![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848f)

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
- **Colors and themes**: 11 built-in themes, full color customization, and saved custom themes
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

### Requirements
- [Node.js](https://nodejs.org/) (LTS version)

### Windows
1. Download or clone this repository into a permanent folder.
2. Double-click **`Start Stream Multiview.bat`**. The first launch installs the app engine, which takes about a minute.
3. Optional: double-click **`Create Desktop Shortcut.bat`** to add a desktop and Start menu shortcut with the pear icon.

### macOS / Linux
```sh
./start-mac-linux.sh
```

### From the command line (any platform)
```sh
npm install
npm start
```

> Always start the app with the launcher, the shortcut or `npm start`. They run `harden.js`, which keeps saved-login encryption switched on.

---

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

## Publishing an update

Everyone running the app updates from this repository, so it must be **public**, and `updateRepo` in `package.json` must name it, here `"updateRepo": "GlowingPear/stream-window-multiview"`.

1. Make your changes.
2. Raise `"version"` in `package.json`. The app only updates when this number goes up. While in beta, raise the last number for every update (`0.2.9` → `0.2.10`), and the middle number only for a big milestone (`0.2.x` → `0.3.0`). `1.0.0` is the first finished release.
3. Add a section for the new version at the top of `CHANGELOG.txt`.
4. Push to GitHub.
5. Recommended: create a **Release** with a tag such as `v0.2.10` and short notes. The app shows those notes, and it updates from the newest release. Without releases, it uses the version on the default branch.

Notes:
- If the update changes the Electron version in `package.json`, users are asked to restart with their shortcut, which reinstalls the engine once.
- Copies that are a git clone (they have a `.git` folder) never update themselves. Use `git pull` there.
- Old app files are backed up to the app's data folder (`update-backup`) before each update.

## Project structure

| File | What it is |
|---|---|
| `main.js` | Electron main process: windows, logins, live checks, notifications, game window placement |
| `preload.js` | Safe bridge between the app pages and the main process |
| `index.html` | The main app UI: windows, layouts, switch control, menus and themes |
| `switcher.html` | The switch control when it's popped out into its own window |
| `live.js` | Live-status parsing, link parsing, cookie-file reading and follow import helpers |
| `updater.js` | Checks GitHub for a newer version, downloads it and installs it safely |
| `harden.js` | Turns on Electron's cookie-encryption fuse so saved logins are encrypted |
| `signin-preload.js` | Makes Google's sign-in page accept the app |
| `INSTRUCTIONS.txt` | How to use every feature (also shown in the app) |
| `CHANGELOG.txt` | Version history (also shown in the app) |

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
