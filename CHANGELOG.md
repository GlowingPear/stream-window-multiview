# What's new in Stream Multiview

Stream Multiview is in beta, so versions start with 0. Every update raises the last number (0.2.9 → 0.2.10 → 0.2.11 …). The middle number only goes up for a big milestone (0.2 → 0.3). Version 1.0 will be the first finished release.

## 0.2.20 (current)
- Streamer profiles: a Profiles directory, live history, notes, and Unfollow on Kick

## 0.2.19
- Test coverage report in CI, many more tests, and fixes they found
- YouTube streams no longer get stuck: answer YouTube's cookie question and skip ads
- Spam and mention alerts work in Kick chats again

## 0.2.18
- Settings window, chat window alerts, and spam alerts for moderators

## 0.2.17
- Faster live checks, YouTube API key, the app's own tooltips and confirm dialog, a fuller Auto layout, and a Hide bar fix

## 0.2.16
- Fix new installs never checking for updates, and show release notes formatted
- Mod view button for channels you moderate, and Kick/Twitch user cards that fit the chat

## 0.2.15
- Kick follow import: get every channel, not just the first 300

## 0.2.14
- Fix Mac signing step on GitHub's Mac build machines

## 0.2.13
- Mac: keep logins after updates (sign every build with the same certificate)
- Move the app's code into a src folder, and use wording that fits every platform

## 0.2.12
- YouTube sign-in through Firefox, and remove the cookies.txt method
- Toolbar fits any window size, with a More menu for what doesn't fit

## 0.2.11
- Add a test suite
- Use CHANGELOG.md instead of CHANGELOG.txt
- Themes: Window border colour, readable accent buttons, and Tron (princess)
- Add a "Watch signed in" option for each site

## 0.2.10
- Installers: a Windows setup (.exe) and a Mac disk image (.dmg). No Node.js needed any more.
- Installed copies update themselves by downloading the new installer.
- Each GitHub release now gets the installers attached automatically.

## 0.2.9
- New theme: Hikari (blue and white).

## 0.2.8
- Automatic updates from GitHub: the app checks for a newer version, installs it in the background and asks you to restart.
- Help > Updates: check now, install, turn automatic updates on or off, and set the GitHub page.
- "What's new" opens by itself the first time you start a new version.

## 0.2.7
- "Put a game here" (Windows): pick your game's window and it moves right into the game area and stays there, so you play it inside Stream Multiview. "No border" hides its title bar, "Release" gives it back.
- Colours and themes (palette button): 10 ready-made themes, change any colour yourself, and save your own themes.

## 0.2.6
- Game focus layout: your game big, with streams, chats and other windows on the side.
- See-through game area: the real game running behind Stream Multiview shows through and you can play it (Windows).
- "Show a window" option to put a stream or another app's window in the game area instead.
- Other apps' windows (e.g. Discord) now appear in the switch control: drag them to swap places, pause them, or click to make them the big one.
- Checkbox to switch keyboard shortcuts off (Help > Keyboard shortcuts).
- G shortcut for Game focus.

## 0.2.5
- Refresh button on every stream in the switch control.
- Undo and redo for your windows (toolbar arrows, Ctrl+Z / Ctrl+Y): closing, opening, moving, resizing, swapping and layout changes.
- Keyboard shortcuts, with a list in Help (press F1 or ?).
- Show another app's window inside the app, like a Discord pop-out call or stream (toolbar screen button, or W). Move and resize it like any other window.
- Help button (?) in the toolbar: Instructions, Keyboard shortcuts and this list.
- New INSTRUCTIONS.txt and CHANGELOG.txt files.

## 0.2.4
- Saved logins are encrypted, locked to your Windows account (green lock in the account menu).
- "Forget my login when I close the app" option for each site.
- The cookies file from "Use your browser's YouTube login" is deleted automatically once you're signed in.
- Kick / Twitch / YouTube badges (K, T, Y) on every saved channel and on the Saved tabs.

## 0.2.3
- Import follows: add the channels you follow on Kick, Twitch or YouTube to Saved, ticking the ones you want.
- YouTube sign-in fix: Google's sign-in pages now accept the app more often.
- "Use your browser's YouTube login" for when Google still refuses.

## 0.2.2
- The switch control can float anywhere in the window (in every layout) or move to its own window, even on another monitor.
- Switch control button in the toolbar to show or hide it.
- Focus view added to the top of the Layout menu.

## 0.2.1
- Fixed YouTube streams and videos not playing (error 152-4).

## 0.2.0 (renamed to Stream Multiview)
- Renamed from Kick Multiview to Stream Multiview, with a new pear icon.
- Twitch and YouTube streams and chats, plus normal YouTube videos.
- Log in separately to Kick, Twitch and YouTube.
- Saved list split into tabs: All, Kick, Twitch, YouTube.
- Save your own named layouts and load them from the Layout menu.
- Every window's name is a dropdown to swap it with another stream or chat.
- × in the switch control to remove a stream (with Undo).
- Lightning button: open a saved channel automatically when it goes live.

## 0.1.9
- Account menu with Log out and Switch account.
- "Pop out hidden" sends streams you can't see to the Streams window.

## 0.1.8
- Saved list sorted A–Z with live channels at the top.
- Desktop notifications when a saved channel goes live.
- "Side chats" setting for how many columns sit beside the big stream.
- Step one stream or a whole page at a time.
- Alerts when someone @mentions you or replies to you in chat.

## 0.1.7
- Strip above the columns with looping ‹ › arrows and a jump-to list.
- Drag switch buttons onto each other to swap streams.
- Auto-pause streams you can't see, and "Pause all except focus".
- Easy switching between Chat focus, Columns and the highlight view.

## 0.1.6
- Fixed volume copying from one stream to another.
- Mini previews now stay in place when the list scrolls.

## 0.1.5
- Switch control upgrades: pause / play, equal-size buttons, live mini previews and scrolling.

## 0.1.4
- Fixed windows overlapping the big stream.
- Switch buttons under the big stream, with volume and mute.

## 0.1.3
- Columns layout: each stream above its chat, scrolling sideways.
- Linked columns you can drag to reorder.
- Highlight a stream to make it big.

## 0.1.2
- Chat focus layout: streams at exact video size, chats get the rest.
- Pop out every stream into a separate window (e.g. a second monitor).

## 0.1.1
- Desktop app, so your Kick login is remembered.
- Save channels to add them quickly.
- Volume controls stay visible at any window size.

## 0.1.0
- First version: Kick streams and chats in windows you can drag, resize and snap together.
