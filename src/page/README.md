# The page's code (`src/page/`)

`src/index.html` is the app's page: the main window, and the streams window (`index.html?role=streams`). It holds the markup; its code and CSS are here, by part of the app. The page runs in Electron's renderer (and, for the UI tests, in a plain browser), as ES modules with no build step.

| Folder | What's in it |
|---|---|
| `core.js` | The page's shared state and constants: the windows (`wins`), the layout, the role (`ROLE`) |
| `shared/` | Building blocks: saved settings (`settings.js`), what several parts show (`store.js`), messages from outside the page (`incoming.js`), building elements (`element.js`), timers (`timers.js`), icons, pop-up messages (`flash.js`), the confirm dialog (`ask.js`), menus that close on an outside press (`popover.js`), submenus of the app's own menus (`flyout.js`), dialogs and menus over another dialog (`layers.js`), tooltips, what the search box can find and do (`commands.js`, `fuzzy.js`) |
| `sites/` | A folder for each site (`kick/`, `twitch/`, `youtube/`): everything about that site only, plugged into its `site.js` (see *Sites* below). `sites.js` lists them, `adapter.js` says what each has, `in-site.js` builds the scripts for a site's pages with its parts |
| `platforms/` | `platforms.js` (channel ids, links, the channel's site: `platform(ch)`), linked channels, the link with Pear Drops (`pear-drops.js`, `players-link.js`) |
| `in-site/` | Scripts that run inside the sites' pages (see below), each with the site's own part from its folder |
| `windows/` | Stream, chat and other windows: creating them, their views (`view.js`), title bars, pausing (`pause.js`, `pause-state.js`), pop-out, raids, window capture |
| `layout/` | Placement, layouts, columns, the switch control, saved layouts, chat focus, undo |
| `toolbar/` | The toolbar, its menus (Layout, accounts), and fitting it to the window |
| `panels/<name>/` | The Channels panel, the bell, Settings, streamer profiles, the empty stage, help, updates, extensions |
| `palette/` | The search box (Ctrl/⌘+K): drawing it and its keys. What it lists comes from each part (`commands.js`) |
| `chat/`, `alerts/` | Chat windows' extras (translate, the right-click menu, zoom); mention and spam alerts |
| `styles/base.css` | The theme's colours, page basics and shared controls |

## Rules for the code

**Load order.** Loading a module only defines things: functions, constants, and variables to fill in later. What it does as the page starts goes in its `init()`. `app.js` imports every module, then runs their `init()`s in a fixed order, the order the code had when it was one script, so each part's start-up can use what the parts before it set up.
- **At the top of a module**, only what can run in any order: functions, plain values (numbers, text, lists, objects), arrow functions, `SmvSites` (`src/shared/sites.js`, loaded before any module), and values from modules that aren't in an import cycle with it (a module's imports load before it unless they import it back), such as a site's `new Site({ … })` from `sites/adapter.js`. Anything that calls a function, looks something up in the page, or reads another part's state is declared at the top with `let` and set in `init()`.
- **A new module with start-up code** exports `init()` and gets a place in the list in `app.js`. A module that only defines things (e.g. `shared/settings.js`, `shared/store.js`, `sites/kick/site.js`) has no `init()` and isn't in the list.

**Imports and exports.** Don't write them by hand: run `npm run page-imports` after a change. It works out each module's `import { … }` lines and its `export { … }` list (with `init`) from what the code uses and declares. `npm test` fails when they're out of step.

**Another module's variable.** A module can read a variable it imports, but can't assign to it. The module that owns it has an accessor object for the ones other modules change: `coreVars.wins = …`, `layoutVars.scrollX = 0`, `bellVars.dndUntil = …`. To let another module change one more, add a getter and setter for it to that object.

**Redrawing after a change.** A part that shows something watches it in the store (`shared/store.js`): `store.watch(['saved', 'live'], () => renderSaved())`. Code that changes it says so with `store.changed('saved')`, and doesn't call the parts that show it. Watchers run straight away, in the order they started watching, and each runs once per `changed()` call. The values stay in the module that owns them; the store only knows who to tell. What can change is listed in `TOPICS` in `store.js`: add to it for something new. Only redraws are watchers. Saving, and messages to the main process, stay where the change is made.

**Messages from outside the page** come in through `shared/incoming.js`:
- `fromApp('onLiveStatus', fn)`: the desktop app's main process. Keep any `DESKTOP` or `ROLE` check around it, as the UI tests can give the page a partial `window.kmv`.
- `fromSite('kind', (w, data, view) => …)`: the scripts inside the sites' chat pages. They send `console.log('__kmv:<kind> <json>')`, and the handler goes in the module that owns that kind.
- `settings.onChange`: the other window.

Don't call `window.kmv.on…` directly.

**Saved settings.** Only through `shared/settings.js`, never `localStorage` directly. Every key is listed there once: add new ones to the list. `settings.flag(name, on)`, `text`, `num` and `json` read a setting, `set(name, value)` and `remove(name)` change it, and `settings.onChange(names, fn)` hears about changes made in the other window. None of them throw.
- **Sync (Settings › Sync).** Every key is in `SYNCED` (it goes to your other computers) or `NOT_SYNCED` (it stays on this one: windows, layouts, sign-ins, history), and `npm test` fails on a key in neither. A synced key needs a `settings.onChange` handler, because another computer's value arrives while the page is open (`settings.applySynced` runs the same handlers as a change from the other window); a UI test fails without one.
- **Changing what a synced setting holds** means a new version for it in `VERSIONS`, a step in `UPGRADES` that turns the old value into the new one, and a test with a value of the old version. Older computers keep syncing the keys they understand; a value from a newer version waits until this copy updates.

**Sites.** Ask the channel's site (`platform(ch)` from `platforms/platforms.js`, or `PLATFORMS[site]`) rather than checking the site's name: its addresses (`streamUrl`, `chatUrl`, `pageUrl`, `profileUrl`, `modUrl`), reading a channel from a link (`fromUrl`), raids, what it can do (`mentions`, `spamAlerts`, `offlineChat`, `held`, `chat.shared`, …) and its parts (`feed`, `shoutouts`, `inSite`). Everything about one site is in its folder (`sites/<id>/`): its `site.js` is a `new Site({ … })`, and `sites/adapter.js` lists every slot, what it's for and its default (what a site hasn't got). A feature's code lives once, in its part of the app, and asks the site for what differs; a small difference is a slot in `site.js`, a bigger one a file in the site's folder that `site.js` plugs in. For something new that differs by site, add its slot to `adapter.js` (with the default that means "hasn't got it") and to the sites that have it. `PLAT_NAME[p]` is a site's name, `platIcon(p)` its badge, `siteIds()` and `sites()` all of them. A new site: README.md, *Adding a site*. `npm test` fails on code outside the sites' folders that names a site.

**Views.** Everything done to a stream's or chat's `<webview>` goes through `windows/view.js`: `runIn(view, js)` (for its effect; never fails), `askIn(view, js)` (for its result; a promise that can fail), `addCss`, `setZoom`, `zoomOf`, `setMuted`, `reloadView`, `loadView` (an address, also the one it's on), `viewId`. Don't call the webview's own methods.

**Scripts that run inside the sites** (`in-site/`) are turned into text (`fn.toString()`) and run in the Kick, Twitch or YouTube page. They can't use anything else from the page (no imports, no outside variables), only their own code and what they're given. A site's own part of one is a function in its folder (`sites/<id>/in-site/`, its `site.js`'s `inSite`), given to the shared script as its text: `inSiteCall(agent, site, part)` (`sites/in-site.js`). Write a part as an arrow or `function` expression, never a method, as it goes over as its own text. They talk back with `console.log('__kmv:…')` messages, which `windows/views.js` reads.

**Pausing streams.** `w.pause` holds why a stream is paused. It only changes through the events in `windows/pause-state.js` (`w.pause = pauseEvents.youPlay(w.pause)`, and so on), then `applyPlay(w)` tells the player. Don't set its fields directly.

**Commands (the search box, Ctrl/⌘+K).** A button that does something gets a command, so anything you can click you can also type. A new action is `commands.add({ id, title, … })` in its part's `init()`, a list that changes is `commands.provide(name, q => [...])`, and a part whose controls only show sometimes (Game focus's bar) is `commands.fromControls(sel, { group })`. A command for a button in the markup is `button: '#theButton'`: it runs that button's click, so the two can't do different things, and it marks the button (`data-cmd`). A button made in code carries `data-cmd="<its command's id>"`. Settings' pages, the tabs inside them and their options are found by reading the Settings window (`panels/settings/settings-commands.js`): an option is a `.st-row` (or `.st-lead`, `.st-opt`) with its name in an `.st-t`, or anything with its name in `data-st="…"` (and its second line in `data-st-sub`), so a new one needs no code. `test/ui/palette/coverage.test.js` (and `test/launch/palette/coverage.test.js` for the desktop app's parts) opens every part, every Settings page and every tab inside one, and fails on a visible button, tab, switch, slider, list or box without a command, unless it's on the short list in `test/ui/palette/coverage.js` with why. A new part that opens somewhere else gets a step in those tests. See the top of `shared/commands.js`.

**Menus and panels** that close when you press outside them use `closeOnOutside(el, { button })` from `shared/popover.js`. It also closes them on a press in a stream or chat (the page never sees that press: `windows/views.js` says so with `viewPressed()`) and when the window loses the focus to another window, so don't write your own `pointerdown` check.

**Building elements.** Use `element(tag, props, ...children)` from `shared/element.js`, e.g. `element('div', { class: 'row', title, onclick }, icon, element('span', 'nm', name))`. Children that are text are always text. Keep `innerHTML` for fixed markup (an icon, a static template). Text that comes from a site or from you (channel names, chat messages, titles) never goes into `innerHTML` unescaped: use `element()` or `textContent`, or `esc()` where it has to be in a markup string. A list whose rows look alike shares a row builder (e.g. `channelRow()` in `panels/channels/channels.js` for the Channels list and follow suggestions).

**Timers.** A debounce is `const saveSoon = soon(() => save(), 600)`. A timer that belongs to a window is `winTimer(w, name, fn, ms)`, and closing the window stops it (`releaseWin` calls `stopWinTimers`). Both are in `shared/timers.js`.

**No script in the markup.** The page has a Content-Security-Policy that only runs its own script files: no `<script>` with code in `index.html`, no `onclick="…"`, `onerror="…"` or `javascript:` in markup strings. Set handlers in code (`el.onerror = …`). The one plain script that has to run before the first paint is `page/boot.js`.

**No system pop-ups.** Use `ask()` (`shared/ask.js`) and `flash()` (`shared/flash.js`), not `alert()`, `confirm()` or `prompt()`. See *No system pop-ups* in the main README.

**For the tests.** What a test needs to call is put on `window` where it's defined, marked `// for the tests` (e.g. `window.openSettings = openSettings;`).

## CSS

Each part's CSS is next to its code (`toolbar/toolbar.css`, `panels/settings/settings.css`, …). `index.html` loads every file with a `<link>`, in a fixed order, and later files win over earlier ones. A new CSS file needs its `<link>` in `index.html`, at the right place in that order. Colours come from the theme's variables (`var(--accent)`, `var(--panel)`, … in `styles/base.css`). The switch control's own window loads the same files.

## Tests

- **Unit tests** (`test/unit/page/`, the same folders as the code) are for modules that don't touch the page (`shared/settings.js`, `store.js`, `timers.js`, `incoming.js`, the sites' modules (`sites/`), `windows/pause-state.js`). They load them with `await import(…)`. A module that needs a DOM (`shared/element.js`) is tested in a UI test, which imports it into the page.
- **UI tests** (`test/ui/<part>/`) open the page in a browser. **Launch tests** (`test/launch/<part>/`) start the real desktop app. Both are in folders by part of the app, and tests of the whole app are at the top of each folder.
- **A refactor that shouldn't change anything:** change the code first, with the tests as they are, and make them pass. Then run `npm run visual-diff`: it compares how the page looks with `main` and should find no differences. Only change tests after that, in their own commits.
