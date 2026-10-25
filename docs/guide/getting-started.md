---
title: Getting started
group: start
icon: sparkle
lede: Install the app, open it the first time, and find your way around.
settings: general
words: [install, download, setup, welcome, launchpad, tour, mac, windows, kick multiview]
related: [adding-streams, logging-in]
order: 1
---

Watch several Kick, Twitch and YouTube streams and their chats at once.
The toolbar: Logins, Channels and Profiles on the left; on the right, Layout and then buttons that show just an icon (point at one for its name). In a small window, buttons that don't fit move into the ⋯ (More) button at the end of the toolbar.

- Download the installer from the project's GitHub page (Releases):
  - Windows: `Stream-Multiview-Setup-….exe`. Run it and follow the steps. It adds Stream Multiview to the Start menu and your desktop.
  - Mac: `Stream-Multiview-…-mac.dmg`. Open it and drag Stream Multiview into Applications.
- First time only: Windows may say "Windows protected your PC". Click **More info → Run anyway**. On a Mac, if it says the app can't be checked, open **System Settings → Privacy & Security** and click **Open Anyway**. This is because the app isn't code-signed yet.
- Running from the source files instead: install Node.js (LTS) and double-click **Start Stream Multiview.bat** (Mac/Linux: `start-mac-linux.sh`; on a Mac the first time, right-click it > Open With > Terminal). The first start installs the app engine (about a minute). **Create Desktop Shortcut.bat** adds a shortcut with the pear icon.
  - Keep that folder where it is after setup: the app runs from it.
- Coming from Kick Multiview: your logins, saved channels and layouts carry over by themselves. Running from source, copy the old folder's `node_modules` into the new one before the first start to skip the one-minute engine install.
- Your windows, volumes and saved channels are remembered between launches.
- **With no windows open**, the stage helps you get going:
  - **The first time: Welcome.** A box to paste a link or type a name (a link shows what it is; for a name, pick Kick, Twitch or YouTube), Log in and Import follows for each site, and handy keys. **Learn the app** has a card for each feature: **Show me** points at it and ticks it off. **Take the tour** steps through the toolbar's buttons (arrow keys move, Esc ends it).
  - **After your first stream: the Launchpad.** The same box, your saved channels that are live now (open one, all of them, or as a Focus view), **Reopen last session** (the windows you had open before closing them all), Import follows, and **Learn the app** to go back to Welcome.
  - The first time a window opens, a small card shows tips for moving and resizing windows.
  - Settings > General > **Welcome screen: Show it again** brings Welcome, its cards and the tour back.
