# What's new in Stream Multiview

Stream Multiview is in beta, so versions start with 0. Every update raises the last number (0.2.9 → 0.2.10 → 0.2.11 …). The middle number only goes up for a big milestone (0.2 → 0.3). Version 1.0 will be the first finished release.

## 0.3.13 (current)
- Links point at the renamed StreamOrchard GitHub org
- Dependency updates from Dependabot merge themselves once their checks pass
- Dependabot's GitHub Actions updates come as one pull request, so they merge themselves
- Chats stay at their newest messages, also after being out of sight in Chat Stage or Chat Rail
- The README has an animated picture at the top
- While an update downloads, only the arrow moves, not the line under it
- Twitch chats: the rewards pop-up and the emote picker fit a narrow chat, with their close button
- Kick's daily reward chest in the toolbar, from Pear Drops

## 0.3.12
- Spam alerts: everyday words like "spiced" or "spicy" aren't flagged as abusive
- Activity log: clearer Kick player wording, the wait to sign them back in, and a steady heartbeat
- Security update: Electron 44, and sites, extensions and links limited to what they need
- Fix two tests that failed now and then: just after midnight, and Pear Drops forgetting the pairing
- Fix the Pop out streams test that failed now and then on a busy machine

## 0.3.11
- Link with Pear Drops: sign Kick players out while it farms, and a farming widget
- Spam alerts: catch chatbot ad bots by their opt-out line
- Updates: download progress, a toolbar chip and an Updated card
- Connected apps: an Activity log of every message with Pear Drops

## 0.3.10
- Flag abuse in chats you moderate, and choose how many points each spam sign is worth
- New-message counts as a setting, in every layout: title bars and the switch control too
- Arrow keys between streams in every layout; in Chat Stage and Chat Rail they change the chat shown

## 0.3.9
- Chat Stage layout: one stream big with its chat in big text, the other streams in a strip
- Chat Stage: the strip's pictures show how many new messages each chat out of sight has had
- Chat Stage: dragging the line right after a layout change follows the pointer at once
- Chat Rail layout: every stream in a grid, one chat in big text in a rail beside them, with tabs
- Blow up chat shortcuts: Z switches the mode, Shift+Z blows up the chat you last clicked now
- Several monitors: put each layout's streams, chats and switch control on the monitor you like
- Channel name in chat boxes: each chat box says which channel you're typing in
- Settings › Chat: every chat setting in one tab

## 0.3.8
- Kick: alerts keep a reply's emotes and the whole message when it has an emote in the middle
- Blow up chat on click: a switch control mode that lifts a chat big and easy to read

## 0.3.7
- Kick: hovering or replying to a message that mentions you no longer alerts it again when an extension adds a button to its actions
- Release video skill: stand-in Kick chats with a row per message and made-up emotes

## 0.3.6
- Reorganise the app's code into folders and smaller parts (no visible change)
- Kick: emote-only replies and mentions alert once, with their emote
- Kick streams stuck on "This embed seems to be misconfigured" recover by themselves, and Reload fixes them

## 0.3.5
- Spam alerts: flag bots that ask to be added on Discord, Telegram and the like
- Show channels' real display names instead of lowercase ids
- Window bars show the channel's avatar on the channel dropdown instead of the dot
- Channel list: avatars line up with the channel names, without the chosen-one dot
- Empty stage: a Welcome screen for first-time users, then a Launchpad
- Highlight new emotes: emotes a channel added since you last opened its chat glow until you point at one

## 0.3.4
- Emote right-click menu with preview and Copy emote text; translate a whole chat
- Layout menu: Layouts, Switch control and Toolbar tabs; the toolbar as one choice of three
- Kick: replies and @mentions keep their message (name, ":" and text on lines of their own)
- Setting: translate new messages in every chat (off by default)

## 0.3.3
- All notifications: days with few notifications are no longer cut off
- Spam alerts: chat bot names centred in their pills when the list is shared with Mentions
- Settings › Layouts › Toolbar: the Icons only button fits on one line
- Left toolbar, Icons only: the column stays slim on hover; on a Mac the pear shows the window buttons
- Settings › Mentions: the Alerts tab first, and it opens there
- Channels: the search box keeps its height with a long list
- Layout menu: keeps its height while you point at the layouts
- Lock layout: block resizing, keep swapping and closing; clearer swap preview
- Notifications: the chat filter keeps one small width; a slightly wider panel

## 0.3.2
- Release video skill: finds tags without a v, keeps the caption off a chat's message box, and gives stand-in channels profile pictures
- Mentions show the emotes from the message
- Profiles: Unfollow shows straight after signing in to Kick (fixes a flaky launch test)
- Emote preview: point at an emote in chat to see it bigger, copy its name or download it
- Right-click menu in chats and streams: copy, paste, links, translate, open or save emotes
- Mentions ignore chat bots, with one bot list shared with spam alerts
- Reload button for extensions loaded from a folder
- Like YouTube streams from their title bar, or automatically once they're playing
- New toolbar: icons on the right (Layout keeps its name when there's room), Logins, one Channels box to open channels, chat text size in Layout, Columns arrows on the streams, and an option to put the toolbar on the left
- Channels box suggests the channels you follow but haven't saved, and who's live among them
- Kick chats: /clip, /poll and /prediction offer to open the channel page
- A notification bell for mentions, spam, channels going live and the app's messages
- Columns stay lined up when the toolbar moves or the window resizes; Notifications settings in tabs, and Do not disturb from the bell

## 0.3.1
- Dropdowns use the app's own list instead of the system menu
- Saved channels get their pictures by themselves (when saved, imported or live, and slowly for the rest)
- Follow raids: the stream and chat switch to the raided channel
- Fix launch tests that failed at random, and two small bugs behind them
- Typing in a chat clears its mention alert, the same as a click
- Spam alert clears when you ban with Kick's mod shortcut
- Auto layout stays chosen after a restart, so new live channels keep fitting in
- Spam alerts: "call me" and "going live" are no longer read as links, and chat bots can be ignored
- Chat focus keeps the chosen stream columns, and chats no longer overlap
- Saved channels no longer stay shown as live for hours after they go offline
- YouTube setting: show Top chat or Live chat in YouTube chats
- Mentions: your own messages no longer show up as alerts (lines with a time but no name)
- YouTube streams: the app's volume slider and YouTube's stay in step, and a stream opened muted plays no sound
- Long sessions: chats, notifications and closed windows no longer pile up in memory

## 0.3.0
- App tests no longer hang when the app fails to start or close
- Title bars fit narrow windows: buttons that don't fit go into a ⋯ menu
- Extensions: signed-in sites get one switch for chats and streams, and sites an extension doesn't run on are marked
- Spam alerts: catch promo bots at their opening line
- Mac: the app updates itself, without dragging a new disk image into Applications
- YouTube API key: live channels no longer show as "not found" while YouTube's feeds are down
- Mentions: your own words (nicknames) count too, and a mentions history with search and filters
- Saved: a cleaner panel, the live count closes it, and the bottom buttons fit
- Settings > Layouts and a new Layout menu, with auto-opened channels fitted into Auto layout
- On a Mac the toolbar is the window's title bar

## 0.2.21
- Spam alerts flag a wall of the same word
- Mentions list is easier to read, mentions can be turned off per chat, and spam alerts keep a history
- Videos in release notes play in Settings > Updates
- Chrome extensions: install from the Web Store and switch them on per site and window

## 0.2.20
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
