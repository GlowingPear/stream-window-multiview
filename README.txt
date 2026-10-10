STREAM MULTIVIEW — DESKTOP APP
==============================
Watch several Kick, Twitch and YouTube streams and their chats at once.

How to use every feature: INSTRUCTIONS.txt (or the ? button in the app).
What changed in each version: CHANGELOG.txt (or ? > What's new).

FIRST TIME SETUP (Windows)
1. Unzip this folder somewhere permanent (e.g. Documents\Stream Multiview).
2. Install Node.js (free) from https://nodejs.org — pick the "LTS" version,
   click through the installer with the default options.
3. Double-click "Start Stream Multiview.bat".
   The first launch installs the app engine (about a minute). After that it
   opens straight away.
4. Optional: double-click "Create Desktop Shortcut.bat" for a desktop and
   Start menu shortcut with the pear icon.

UPDATING FROM KICK MULTIVIEW
Your logins, saved channels and layout carry over automatically. To skip the
one-minute engine install, copy the "node_modules" folder from the old app
folder into this one before the first launch.

Mac / Linux: install Node.js, then run start-mac-linux.sh
(on Mac: right-click > Open With > Terminal the first time).

LOGGING IN TO CHAT
The account button (person icon) has a row for Kick, Twitch and YouTube, each
with Log in, Switch and Log out (also in the Account menu). Sign in once per
site; for Kick, do the email code once. Every chat window shares that login, and it is saved, so
you stay logged in when you rearrange windows or restart the app.
Tip: sign in with email + password. Google may refuse sign-in inside apps
that aren't a regular browser; if YouTube login is blocked, chat still works
for reading.
YouTube sign-in: on Google's sign-in pages the app now presents itself as
Firefox, which Google accepts more often. If Google still refuses, use
"Use your browser's YouTube login instead" at the bottom of the account menu:
  1. In your normal browser, install the extension "Get cookies.txt LOCALLY".
  2. Go to youtube.com (signed in), click the extension, Export.
  3. In the app, choose that file. Only the YouTube/Google login is copied.
  4. Once you're signed in, the app deletes that file (it is your login).
KEEPING YOUR LOGINS SAFE
- Your passwords are never saved: sites give the app a login token, like a
  browser's "stay signed in". Those are saved ENCRYPTED, with a key tied to
  your Windows account, so a copy of the app's data folder is useless on
  another PC. The account menu shows a green lock when this is on.
  (Start the app with "Start Stream Multiview.bat" or its shortcut; that is
  what keeps encryption switched on.)
- Don't run old copies of Kick Multiview anymore: they share the same data
  folder but can't read encrypted logins (you'd just have to log in again).
- "Forget my login when I close the app" (account menu): tick a site and its
  login is wiped every time the app closes. You log in again each start.
- After "Use your browser's YouTube login", the app deletes the exported
  cookies file once you're signed in.
- If you ever think a login was stolen: change that site's password and use
  its "log out of all sessions" option. That ends every copied login.
IMPORT FOLLOWS: "Import follows" on each account row (or Saved > Import)
reads the channels you follow with your login in the app and lets you tick
which ones to add to Saved. You need to be logged in to that site first.
Logging out removes that site's saved login (and the username used for
mention alerts) so someone else can sign in.
Streams themselves play without your login (each stream keeps its own
separate storage so volumes don't mix), so Twitch Turbo / YouTube Premium
ad-free may not apply to the video.

USING IT
- Paste a link in the top box and press Enter:
    Kick:    kick.com/name, or just the name
    Twitch:  twitch.tv/name, or tw:name
    YouTube: a channel (youtube.com/@name, @name, yt:@name, /channel/UC…)
             or any video link (watch?v=, youtu.be/, /live/, /shorts/).
  A YouTube channel opens its current live stream. If it isn't live, the
  window says so, checks again every 2 minutes, and has a "Check now" button.
  A normal (not live) YouTube video plays in a window without a chat.
- Every stream and chat window has a dropdown with the channel's name in
  its title bar (in any layout): pick another open channel to swap the two.
  Twitch windows have a purple dot, YouTube red, Kick green.
- Drag windows by their title bar; resize from any edge or corner.
- Each stream has a volume slider + mute button in its title bar that always
  stays visible, however small the window. Scroll over it to adjust.
- ☆ on a window saves the channel; "★ Saved" lists saved channels: the ones
  live right now at the top (A–Z), then everyone else (A–Z).
  Tabs at the top (All / Kick / Twitch / YouTube) filter the list. A plain
  name typed into the Saved box on the Twitch tab is saved as a Twitch
  channel (same for YouTube).
  The lightning button on a saved channel opens it automatically when it
  goes live (once per broadcast: if you close it, it won't reopen until the
  next time they go live).
- Live alerts: while the app is open it checks your saved channels about
  once a minute. Live ones get a red LIVE badge with viewers, category and
  title, and the Saved button shows how many are live. When a saved channel
  goes live you get a desktop notification; click it to open the stream.
  Turn alerts off for everything ("Notify me when they go live") or per
  channel with its bell. "Open live" opens every saved channel that's live.
  (This only works while the app is running.)
- Mentions (the @ button in the toolbar): get a desktop notification when
  someone writes @YourName or replies to one of your messages in any open
  Kick or Twitch chat. Set your usernames there (or click Detect). YouTube
  chats aren't watched for mentions. Click a notification
  or a row in the list to jump to that chat. Works for chats that are open
  in the app while it's running.
- Layout menu: pick how windows are arranged. "Focus view" (at the top)
  makes one stream big with its chat beside it, the others in columns.
  Your layouts (bottom of the Layout menu): type a name and Save to store
  the current arrangement (windows, order, columns, highlight). Click a
  saved one to go back to it; windows already open stay open, missing ones
  reopen. ⟳ updates it with the current arrangement, × deletes it.
- Columns: each channel gets a column, its stream on top and its chat
  underneath. When there are more columns than fit, scroll sideways with the
  ‹ › arrows in the toolbar, the scrollbar at the bottom, or the mouse wheel
  over any title bar. Stays on (and re-arranges itself) as you add or close
  channels, until you pick another layout.
  When there are more columns than fit, a strip appears just above them:
  ‹ and › step one stream at a time (and loop around at either end), and
  the name in the middle is a list you can click to jump to any stream.
    Linked (chain-link button): each stream and its chat are joined. Drag
    either title bar to move the whole column; the others slide aside to
    show where it will land, and dragging to the screen edge scrolls.
    The order is remembered. Turn Linked off to move/resize windows freely.
    Highlight (corner-arrows button on a stream): that stream goes big on
    the left with its chat beside it, and stays put while you scroll the
    other columns. Click it again to put it back.
    Under the big stream is a Focus bar with every open stream: click a
    name to swap it into the big spot (click the green one to un-highlight).
    The × on a button closes that stream and its chat; "Undo" in the
    message that pops up brings them back.
    Drag a button (by its name or any blank part) onto another to swap
    them; this also swaps their columns. Every button is the same size. Each has a pause/play button (play
    jumps back to live), a mute button and a volume slider; scroll the wheel over
    one to change its volume, and Shift-click a mute button to hear only
    that stream.
    The little arrow at the right of each button opens a small live,
    always-muted mini player under that button's controls (click it to put
    that stream in the big spot); click the arrow again to close it. Each
    open mini player is a second copy of that stream, so it uses some extra
    internet bandwidth while open. Each stream remembers whether its preview is
    open. When the Focus area fills up it scrolls up and down with the
    mouse wheel; the wheel only changes volume when you're over a volume
    slider and not in the middle of scrolling.
- Chat focus: streams sized exactly to their video (no black bars), chats get
  all the remaining space as tall columns. Click it again to switch between
  1, 2 or 3 columns of streams.
  In Chat focus, drag a stream by its title bar onto another stream to swap
  them (their chats swap too). The corner-arrows button on a stream switches
  to the highlight view with that stream big. In the highlight view, the
  buttons at the top of the Focus area take you to "Columns view" (plain
  columns, no highlight) or back to "Chat focus view".
  Both views share the same stream order.
  "Side chats" (top of the Focus area in the highlight view) sets how many
  stream + chat columns sit beside the big stream: Auto, or 1-5. More
  columns make the big stream smaller.
  In Columns / highlight view, the name at the top of each side chat is a
  dropdown: pick any stream to show it in that column (the two swap places).
  "Step: 1 / Step: page" on the strip above the columns sets whether the
  arrows move one stream at a time or reveal a whole page of hidden ones.
  "Pop out hidden" (Focus area) sends every stream you can't currently see
  to the Streams window (e.g. for a second monitor). Their chats stay here
  as columns; "Bring streams back" returns them.
- Switch control (button in the toolbar, or Layout menu > Switch control):
  the list of streams with play/pause, mute, volume, previews and ×.
    Docked: under the big stream in Focus view (the old way).
    Floating: a panel over the windows in EVERY layout. Drag it by its top
      bar, resize it from the bottom-right corner; it remembers where it was.
    Own window: its own window you can put anywhere, even on another
      monitor. The pin button keeps it on top of other windows. Closing it
      docks the switch control again.
  The small buttons at the right of its top bar switch between these.
  Clicking a name in any layout opens Focus view with that stream big.
  Dragging one name onto another swaps the two streams in any layout.
- Chat − 100% +: shrink or grow the text in every chat window, so more
  messages and emotes fit.
- Pop out streams: moves every stream into its own window (drag it to your
  other monitor; it opens there automatically if you have one). Chats then
  fill the main window. New channels you add go to the right window on
  their own. In the streams window, Tile gives every stream equal space and
  Spotlight makes the stream you last clicked big.
  Drag a stream by its title bar onto another one to swap them.
  "Bring streams back" or closing that window returns the streams. If you quit with the streams
  popped out, they reopen that way next time.
- Auto layout / Tile arrange everything to fit the screen.
- View > Toggle Full Screen (F11) for a borderless view.
- Auto-pause hidden (checkbox in the toolbar): streams that are off-screen
  or behind the big stream pause after 2 seconds to save bandwidth, and
  jump back to live as soon as you can see them. Streams you can hear
  (unmuted) are never auto-paused. Their switcher dot turns blue.
- Pause all except focus (top of the Focus area, under the big stream):
  pauses every stream except the big one, plus their mini previews. It
  follows you when you switch focus; click "Resume others" to turn it off.
  Each option only undoes its own pauses, and pressing play on any stream
  always plays it.
- Your windows, volumes and saved channels are remembered between launches.

Don't move or delete the folder after setup — the app runs from it.
To make a desktop shortcut: double-click "Create Desktop Shortcut.bat".
