# The page's code (`src/page/`)

`src/index.html` is the app's page: the main window, and the streams window (`index.html?role=streams`). It holds the markup; its code and CSS are here, by part of the app. The page runs in Electron's renderer (and, for the UI tests, in a plain browser), as ES modules with no build step.

| Folder | What's in it |
|---|---|
| `core.js` | The page's shared state and constants: the windows (`wins`), the layout, the role (`ROLE`) |
| `shared/` | Building blocks: saved settings (`settings.js`), what several parts show (`store.js`), messages from outside the page (`incoming.js`), building elements (`element.js`), timers (`timers.js`), icons, pop-up messages (`flash.js`), the confirm dialog (`ask.js`), menus that close on an outside press (`popover.js`), tooltips |
| `platforms/` | One module per site (`kick.js`, `twitch.js`, `youtube.js`), `platforms.js` (channel ids and links), the YouTube-only settings, the link with Pear Drops (`pear-drops.js`, `players-link.js`) |
| `in-site/` | Scripts that run inside the Kick, Twitch and YouTube pages (see below) |
| `windows/` | Stream, chat and other windows: creating them, their views (`view.js`), title bars, pausing (`pause.js`, `pause-state.js`), pop-out, raids, window capture |
| `layout/` | Placement, layouts, columns, the switch control, saved layouts, chat focus, undo |
| `toolbar/` | The toolbar, its menus (Layout, accounts), and fitting it to the window |
| `panels/<name>/` | The Channels panel, the bell, Settings, streamer profiles, the empty stage, help, updates, extensions |
| `chat/`, `alerts/` | Chat windows' extras (translate, the right-click menu, zoom); mention and spam alerts |
| `styles/base.css` | The theme's colours, page basics and shared controls |

## Rules for the code

**Load order.** Loading a module only defines things: functions, constants, and variables to fill in later. What it does as the page starts goes in its `init()`. `app.js` imports every module, then runs their `init()`s in a fixed order, the order the code had when it was one script, so each part's start-up can use what the parts before it set up.
- **At the top of a module**, only what can run in any order: functions, plain values (numbers, text, lists, objects), arrow functions, and values from modules that import nothing. Anything that calls a function, looks something up in the page, or reads another part's state is declared at the top with `let` and set in `init()`.
- **A new module with start-up code** exports `init()` and gets a place in the list in `app.js`. A module that only defines things (e.g. `shared/settings.js`, `shared/store.js`, `platforms/kick.js`) has no `init()` and isn't in the list.

**Imports and exports.** Don't write them by hand: run `npm run page-imports` after a change. It works out each module's `import { … }` lines and its `export { … }` list (with `init`) from what the code uses and declares. `npm test` fails when they're out of step.

**Another module's variable.** A module can read a variable it imports, but can't assign to it. The module that owns it has an accessor object for the ones other modules change: `coreVars.wins = …`, `layoutVars.scrollX = 0`, `bellVars.dndUntil = …`. To let another module change one more, add a getter and setter for it to that object.

**Redrawing after a change.** A part that shows something watches it in the store (`shared/store.js`): `store.watch(['saved', 'live'], () => renderSaved())`. Code that changes it says so with `store.changed('saved')`, and doesn't call the parts that show it. Watchers run straight away, in the order they started watching, and each runs once per `changed()` call. The values stay in the module that owns them; the store only knows who to tell. What can change is listed in `TOPICS` in `store.js`: add to it for something new. Only redraws are watchers. Saving, and messages to the main process, stay where the change is made.

**Messages from outside the page** come in through `shared/incoming.js`:
- `fromApp('onLiveStatus', fn)`: the desktop app's main process. Keep any `DESKTOP` or `ROLE` check around it, as the UI tests can give the page a partial `window.kmv`.
- `fromSite('kind', (w, data, view) => …)`: the scripts inside the sites' chat pages. They send `console.log('__kmv:<kind> <json>')`, and the handler goes in the module that owns that kind.
- `settings.onChange`: the other window.

Don't call `window.kmv.on…` directly.

**Saved settings.** Only through `shared/settings.js`, never `localStorage` directly. Every key is listed there once: add new ones to the list. `settings.flag(name, on)`, `text`, `num` and `json` read a setting, `set(name, value)` and `remove(name)` change it, and `settings.onChange(names, fn)` hears about changes made in the other window. None of them throw.

**Sites.** Ask the channel's site module (`platform(ch)` from `platforms/platforms.js`) rather than checking the site's name: its addresses (`streamUrl`, `chatUrl`, `pageUrl`, `profileUrl`, `modUrl`), reading a channel from a link (`fromUrl`), raids, and what it can do (`mentions`, `spamAlerts`, `emoteLists`, `pageCommands`, `likes`). For something new that differs by site, add it to all three modules, with the same name and shape. A new site is a new module of the same shape, added to `PLATFORMS`. `PLAT_NAME[p]` is a site's name and `platIcon(p)` its badge.

**Views.** Everything done to a stream's or chat's `<webview>` goes through `windows/view.js`: `runIn(view, js)` (for its effect; never fails), `askIn(view, js)` (for its result; a promise that can fail), `addCss`, `setZoom`, `zoomOf`, `setMuted`, `reloadView`, `loadView` (an address, also the one it's on), `viewId`. Don't call the webview's own methods.

**Scripts that run inside the sites** (`in-site/`) are turned into text (`fn.toString()`) and run in the Kick, Twitch or YouTube page. They can't use anything else from the page (no imports, no outside variables), only their own code and what they're given. They talk back with `console.log('__kmv:…')` messages, which `windows/views.js` reads.

**Pausing streams.** `w.pause` holds why a stream is paused. It only changes through the events in `windows/pause-state.js` (`w.pause = pauseEvents.youPlay(w.pause)`, and so on), then `applyPlay(w)` tells the player. Don't set its fields directly.

**Menus and panels** that close when you press outside them use `closeOnOutside(el, { button })` from `shared/popover.js`.

**Building elements.** Use `element(tag, props, ...children)` from `shared/element.js`, e.g. `element('div', { class: 'row', title, onclick }, icon, element('span', 'nm', name))`. Children that are text are always text. Keep `innerHTML` for fixed markup (an icon, a static template). Text that comes from a site or from you (channel names, chat messages, titles) never goes into `innerHTML` unescaped: use `element()` or `textContent`, or `esc()` where it has to be in a markup string. A list whose rows look alike shares a row builder (e.g. `channelRow()` in `panels/channels/channels.js` for the Channels list and follow suggestions).

**Timers.** A debounce is `const saveSoon = soon(() => save(), 600)`. A timer that belongs to a window is `winTimer(w, name, fn, ms)`, and closing the window stops it (`releaseWin` calls `stopWinTimers`). Both are in `shared/timers.js`.

**No script in the markup.** The page has a Content-Security-Policy that only runs its own script files: no `<script>` with code in `index.html`, no `onclick="…"`, `onerror="…"` or `javascript:` in markup strings. Set handlers in code (`el.onerror = …`). The one plain script that has to run before the first paint is `page/boot.js`.

**No system pop-ups.** Use `ask()` (`shared/ask.js`) and `flash()` (`shared/flash.js`), not `alert()`, `confirm()` or `prompt()`. See *No system pop-ups* in the main README.

**For the tests.** What a test needs to call is put on `window` where it's defined, marked `// for the tests` (e.g. `window.openSettings = openSettings;`).

## CSS

Each part's CSS is next to its code (`toolbar/toolbar.css`, `panels/settings/settings.css`, …). `index.html` loads every file with a `<link>`, in a fixed order, and later files win over earlier ones. A new CSS file needs its `<link>` in `index.html`, at the right place in that order. Colours come from the theme's variables (`var(--accent)`, `var(--panel)`, … in `styles/base.css`). The switch control's own window loads the same files.

## Tests

- **Unit tests** (`test/unit/page/`, the same folders as the code) are for modules that don't touch the page (`shared/settings.js`, `store.js`, `timers.js`, `incoming.js`, the site modules, `windows/pause-state.js`). They load them with `await import(…)`. A module that needs a DOM (`shared/element.js`) is tested in a UI test, which imports it into the page.
- **UI tests** (`test/ui/<part>/`) open the page in a browser. **Launch tests** (`test/launch/<part>/`) start the real desktop app. Both are in folders by part of the app, and tests of the whole app are at the top of each folder.
- **A refactor that shouldn't change anything:** change the code first, with the tests as they are, and make them pass. Then run `npm run visual-diff`: it compares how the page looks with `main` and should find no differences. Only change tests after that, in their own commits.
