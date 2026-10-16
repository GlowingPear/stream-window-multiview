# The page's code (`src/page/`)

`src/index.html` is the app's page: the main window, and the streams window (`index.html?role=streams`). It holds the markup; its code and CSS are here, by part of the app. The page runs in Electron's renderer (and, for the UI tests, in a plain browser), as ES modules with no build step.

| Folder | What's in it |
|---|---|
| `core.js` | The page's shared state and constants: the windows (`wins`), the layout, the role (`ROLE`) |
| `shared/` | Building blocks: saved settings (`settings.js`), icons, messages (`flash.js`), the confirm dialog (`ask.js`), menus that close on an outside press (`popover.js`), tooltips |
| `platforms/` | One module per site (`kick.js`, `twitch.js`, `youtube.js`), `platforms.js` (channel ids and links), the YouTube-only settings |
| `in-site/` | Scripts that run inside the Kick, Twitch and YouTube pages (see below) |
| `windows/` | Stream, chat and other windows: creating them, their views (`view.js`), title bars, pausing (`pause.js`, `pause-state.js`), pop-out, raids, window capture |
| `layout/` | Placement, layouts, columns, the switch control, saved layouts, chat focus, undo |
| `toolbar/` | The toolbar, its menus (Layout, accounts), and fitting it to the window |
| `panels/<name>/` | The Channels panel, the bell, Settings, streamer profiles, the empty stage, help, updates, extensions |
| `chat/`, `alerts/` | Chat windows' extras (translate, the right-click menu, zoom); mention and spam alerts |
| `styles/base.css` | The theme's colours, page basics and shared controls |

## Rules for the code

**Load order.** `app.js` lists every module in the order they run, which is the order the code had when it was one script. Each of those modules starts with `import '<the one before>';   // runs after it (see app.js)`, so importing the last one loads them all, first to last. Code that runs while a module loads can use what the modules before it set up. Functions from later modules can be called at any time, but their other values are only there once that module has run.
- A new module that runs code as it loads goes into the list in `app.js` and into the chain: it imports the one before it, and the one after it now imports it.
- A module that only defines things and has no imports of its own (e.g. `shared/settings.js`, `platforms/kick.js`, `windows/view.js`, `windows/pause-state.js`) stays out of the list. It's simply imported where it's used.

**Imports and exports.** Don't write them by hand: run `npm run page-imports` after a change. It works out each module's `import { … }` lines and its `export { … }` list from what the code uses and declares, and keeps the load-order line. `npm test` fails when they're out of step.

**Another module's variable.** A module can read a variable it imports, but can't assign to it. The module that owns it has an accessor object for the ones other modules change: `coreVars.wins = …`, `layoutVars.scrollX = 0`, `bellVars.dndUntil = …`. To let another module change one more, add a getter and setter for it to that object.

**Saved settings.** Only through `shared/settings.js`, never `localStorage` directly. Every key is listed there once: add new ones to the list. `settings.flag(name, on)`, `text`, `num` and `json` read a setting, `set(name, value)` and `remove(name)` change it, and `settings.onChange(names, fn)` hears about changes made in the other window. None of them throw.

**Sites.** Ask the channel's site module (`platform(ch)` from `platforms/platforms.js`) rather than checking the site's name: its addresses (`streamUrl`, `chatUrl`, `pageUrl`, `profileUrl`, `modUrl`), reading a channel from a link (`fromUrl`), raids, and what it can do (`mentions`, `spamAlerts`, `emoteLists`, `pageCommands`, `likes`). For something new that differs by site, add it to all three modules, with the same name and shape. A new site is a new module of the same shape, added to `PLATFORMS`. `PLAT_NAME[p]` is a site's name and `platIcon(p)` its badge.

**Views.** Everything done to a stream's or chat's `<webview>` goes through `windows/view.js`: `runIn(view, js)` (for its effect; never fails), `askIn(view, js)` (for its result; a promise that can fail), `addCss`, `setZoom`, `zoomOf`, `setMuted`, `reloadView`, `viewId`. Don't call the webview's own methods.

**Scripts that run inside the sites** (`in-site/`) are turned into text (`fn.toString()`) and run in the Kick, Twitch or YouTube page. They can't use anything else from the page (no imports, no outside variables), only their own code and what they're given. They talk back with `console.log('__kmv:…')` messages, which `windows/views.js` reads.

**Pausing streams.** `w.pause` holds why a stream is paused. It only changes through the events in `windows/pause-state.js` (`w.pause = pauseEvents.youPlay(w.pause)`, and so on), then `applyPlay(w)` tells the player. Don't set its fields directly.

**Menus and panels** that close when you press outside them use `closeOnOutside(el, { button })` from `shared/popover.js`.

**Text in markup.** Text that comes from a site or from you (channel names, chat messages, titles) is escaped with `escH()` (`panels/help/help.js`) when it goes into `innerHTML`, or set with `textContent`.

**No system pop-ups.** Use `ask()` (`shared/ask.js`) and `flash()` (`shared/flash.js`), not `alert()`, `confirm()` or `prompt()`. See *No system pop-ups* in the main README.

**For the tests.** What a test needs to call is put on `window` where it's defined, marked `// for the tests` (e.g. `window.openSettings = openSettings;`).

## CSS

Each part's CSS is next to its code (`toolbar/toolbar.css`, `panels/settings/settings.css`, …). `index.html` loads every file with a `<link>`, in a fixed order, and later files win over earlier ones. A new CSS file needs its `<link>` in `index.html`, at the right place in that order. Colours come from the theme's variables (`var(--accent)`, `var(--panel)`, … in `styles/base.css`). The switch control's own window loads the same files.

## Tests

- **Unit tests** (`test/unit/page/`, the same folders as the code) are for modules that don't touch the page (`shared/settings.js`, the site modules, `windows/pause-state.js`). They load them with `await import(…)`.
- **UI tests** (`test/ui/<part>/`) open the page in a browser. **Launch tests** (`test/launch/<part>/`) start the real desktop app. Both are in folders by part of the app, and tests of the whole app are at the top of each folder.
- **A refactor that shouldn't change anything:** change the code first, with the tests as they are, and make them pass. Then run `npm run visual-diff`: it compares how the page looks with `main` and should find no differences. Only change tests after that, in their own commits.
