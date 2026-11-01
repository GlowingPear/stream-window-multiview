# What's new in Stream Multiview

Stream Multiview is in beta, so versions start with 0. Every update raises the last number (0.2.9 → 0.2.10 → 0.2.11 …). The middle number only goes up for a big milestone (0.2 → 0.3). Version 1.0 will be the first finished release.

## 0.4.15 (current)
- Shoutouts: Remove works, the channels are by name and show their pictures

## 0.4.14
- Kick: Ban and Timeout from ALL work again, and a ban from the keys on a name doesn't ask first
- Narrow windows keep their title bar's buttons: the site tabs no longer push them off

## 0.4.13
- A Twitch reward you redeem shows only in that channel's chat
- Shoutouts: channels as cards, Channel settings in tabs, only where you're a mod, bots and special messages

## 0.4.12
- Emotes in Kick redeems in All chat
- Copying a moving emote pastes it moving
- Mention and support alerts read Kick and Twitch chats as the site sends them, also behind ALL or scrolled up
- All chat: Copy with @name, and a removed message copies with why, as on Kick
- All chat: giant emotes shown big, a shared chat's messages show their channel, and avatars kept out of reports
- Shoutouts: one click from ALL and the Kick and Twitch chats, your own messages, and recent chatters one a second

## 0.4.11
- ALL on a channel on its own: its site's tab can be clicked, and ⇧Tab goes to it

## 0.4.10
- Developer › Chat events: the sites' counts and its buttons fit one line
- Twitch's Shield Mode no longer shows as an unknown chat event
- Streamer profiles, chat events and follow lists are kept in a database
- Copy diagnostics says when you're signed in to Kick, and whether players watch signed in

## 0.4.9
- Streams' own storage no longer grows to gigabytes: caches have a size, and unused streams' storage is removed

## 0.4.8
- YouTube channels show as live again in the UK and EU
- ALL: your message held by AutoMod says so, Twitch's raider tags, and the / list right on the box

## 0.4.7
- ALL shows names in each site's own colours, and YouTube's own badges
- Spam alerts flag messages a chat hasn't drawn yet (behind ALL, or scrolled up)
- Reloading ALL refreshes its emotes
- YouTube channels show as live again when its feeds are down
- ALL's emote picker starts with your recent emotes
- ALL shows YouTube polls and removes a user's messages when YouTube does
- Pinning a Twitch message from ALL closes Twitch's Unpin After panel
- ALL shows Kick's polls too, one card at a time, folding into a pill
- ALL shows Twitch's hype train, with a thinner top bar and site switches
- Spam alerts catch promo bots that post friendly lines before their link
- ALL lists the site's chat commands when you type /
- No "possible memory leak" warning with many streams and an extension on
- Pop-up buttons for a channel's page and its chat, and ALL's buttons ask which site
- ALL: one line for a Kick sub, and more of the sites' events known

## 0.4.6
- ALL: only picker emotes go in the recent row, a click there sends it, and the box follows the cursor

## 0.4.5
- ALL keeps its newest line in sight above the box, with a smaller recent-emotes row
- ALL keeps one line for a Kick raid sent twice, and knows four more Twitch messages
- Chat events keep a few samples of rare kinds, and each status

## 0.4.4
- ALL: click a cut-off event line to read all of it
- ALL shows Twitch's raid countdown, gift subs paid forward and goals reached
- ALL: delete another moderator's message on Kick
- ALL shows YouTube gifts; YouTube's held-message stand-ins and ticker no longer count as unreadable
- A linked streamer's YouTube chat loads as soon as they're live, without clicking its tab
- ALL: a row of the emotes you used last over its box, as Kick's chat has
- Fix a test broken by two ALL changes merging together
- Developer reports hide every name: raids, clips, stream titles and Twitch's tags too
- ALL: emotes show as pictures in your message while it sends
- Remove a node_modules link committed by mistake
- Sending on YouTube from ALL works again
- ALL: YouTube's "Sign in to chat" clears once you're signed in, and Reload re-reads every chat
- ALL: a hidden bot message just says “hidden”
- Your line in ALL shows your badges while it sends
- ALL: Kick raids in and out, Kick resub messages, and YouTube's deleted messages
- ALL shows Twitch's raid countdown and goals reached in the app, not only in tests
- Tests and developer tools clean up their temporary folders
- ALL sends on a site whose tab is hidden without waiting for it to show

## 0.4.3
- ALL: Kick's badges as its chat shows them, emote pictures in the box, and the messages already in the chats

## 0.4.2
- ALL: chat windows resize from their corners again
- Channel settings for every channel, ALL for a single channel, and evenly spaced dropdown arrows
- ALL: Twitch watch streaks, rewards and shoutouts, and no more reloading Twitch chats for nothing
- Channel pictures without a coloured circle behind them

## 0.4.1
- Release video: a new song, Twitch and YouTube stand-ins, and the 0.4.0 video
- ALL: every Kick message, the sites' own badges, and a new emote picker

## 0.4.0
- Tab only switches to a linked site that's live
- One chat bot list for mentions and spam alerts, and a linked streamer's own bots
- ALL: a linked streamer's Kick, Twitch and YouTube chats as one list
- ALL: subs, gifts, raids and Super Chats as one short line, with See it on …
- ALL: send on any of the streamer's sites from one box
- ALL: reply, @ and open someone's card from the merged chat
- ALL: mod actions from the merged chat, where you're a mod
- ALL: the mod button opens each site's mod view, or all of them
- ALL: Kick's messages reach it, your sends show (and can't send twice), offline Kick and Twitch chats
- ALL: ⇧Tab steps through the window's tabs (ALL › K › T), offline Kick and Twitch too
- ALL: what moderators do (struck with who and how long for mods; gone for everyone else; a cleared chat)
- ALL: Kick's rewards redeemed, Kicks, subs and raids; Twitch's channel points messages
- ALL: pins share one strip (Kick's and YouTube's); Kick's unbans
- ALL: emotes: :name suggestions and the picker, per site, with the lock
- ALL: Twitch replies thread (the pointer over the line in its hidden chat, Twitch's own Reply)
- ALL: Twitch's pins in the pins strip
- ALL: a send button in the site's colour; its box follows Channel name in chat boxes
- ALL: pins wait in a pill that pings on a new one, pins already up are shown, a filter pill, and text that follows Chat text size
- ALL follows the chats' settings: add-on emotes, words you watch for, spam tags, translation and new emotes
- ALL: gifted subs say who got them, and being in ALL clears its chats' alerts
- Settings › Developer › Chat events: every event the chats send, what ALL still needs, and an export without names
- ALL: the chat's modes above the box, a slow-mode countdown, and the box closed (saying why) where you can't chat
- ALL: Twitch's moderator names and mode changes, their raids with Open, and a setting to open raids from tabs you weren't watching
- ALL says when a site's part stops working, and a Report for a fix to send
- Connected apps: the Kick players' state on its own line, without the On by default tag
- ALL on or off for each linked streamer
- ALL: Kick's /poll, /prediction and /clip open in Kick's chat, unread counts and the @ button follow ALL
- ALL: links, the emote card, the sites' right-click items, translating a whole chat, and Blow up on a click
- ALL: Why didn't this alert? and Copy chat HTML, spelling suggestions in the app's text boxes, chat actions in the search box
- Update Grapevine to 0.11.2

## 0.3.30
- Fix the focus ring left around a window's channel picker after a click
- Tab to another site's chat puts the keyboard in its chat box

## 0.3.29
- Fix linked channel tabs freezing when you switch to them
- Linked channels: offline sites' tabs can't be opened and aren't loaded; YouTube windows follow a channel's new stream
- Fix stray "undefined" / "null" text in menus and lists, and the missing ▾ with names off
- A channel's stream and chat show its site the same way: the badge on its picture
- Settings › Windows: buttons glide to their new place when you move them
- Fix the linked streamer's card (and other dialogs) opening behind Settings

## 0.3.28
- Link a streamer's Kick, Twitch and YouTube accounts: one row, one window with a tab per site
- Linked accounts is now Linked channels

## 0.3.27
- Tests: four that failed now and then on CI wait for what they depend on
- Pairing keys: Grapevine's own key store instead of a copy
- Contributing: fix gaps in Grapevine's library there, not with a copy here

## 0.3.26
- Mac: pressing the toolbar's empty space closes an open menu
- Chat over streams: your own messages show too, and 1 message at once (the latest)

## 0.3.25
- Search box: a saved channel stays on top, Tab and ⇧Tab go both ways; menus close on a press in a stream
- Settings › Search box: turn the search box or its Recent off, and see, remove and clear what it remembers

## 0.3.24
- Search and actions: Ctrl/⌘+K finds and does anything in the app
- Settings fit without scrolling: Chat in tabs, Support as its own page

## 0.3.23
- Chat over streams: keep messages on screen, how long each stays, and how many at once

## 0.3.22
- Fix the listener warnings in the error log, and move to safeStorage's async calls before Electron 46

## 0.3.21
- Copy a chat message's text, with or without emotes, or its HTML
- Support and raids on the stream's picture: who and what along its bottom edge, in any layout
- Support alerts on Kick: one alert per gift, and KICKs and sub celebrations alert again
- Chat over streams: each stream's new chat messages over it for a few seconds, also when popped out
- Settings › Guide (searchable, a ? on every page) and Developer tools for reporting problems

## 0.3.20
- Support alerts: an alert when someone gifts subs, sends KICKs, bits or a Super Chat, or subscribes
- Raid alerts: an alert when someone raids into a stream you have open (Settings › Mentions › Support)

## 0.3.19
- Farming card: "All rewards by" says the day when it isn't today

## 0.3.18
- Start a Kick prediction or make a clip from the chat window

## 0.3.17
- Start a Kick poll from the chat window

## 0.3.16
- Farming widget to the right of the daily reward chest, its card over the windows
- open-pr skill: merge with GitHub's auto-merge

## 0.3.15
- A dark Mac icon, without macOS's grey plate

## 0.3.14
- Update Grapevine to 0.10.2, and commit the lock file
- Tests: make the Pop out streams swap drag wait for each step
- Hide the daily reward chest while Pear Drops isn't connected

## 0.3.13
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
