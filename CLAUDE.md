# Stream Multiview

An Electron app for watching several Kick, Twitch and YouTube streams and chats at once. `src/main/` is the Electron side (`src/main.js` only loads it), `src/preload/` the bridge to the page, `src/index.html` with `src/page/` the app's page, and `src/shared/` code both sides load. `README.md` has the project structure, the test commands and how changes and releases work (*Contributing and releases*, *Project structure*).

## Working on a change

- Use the skills in `.claude/skills/`: `start-change` (plan, its own branch and worktree, before / after captures), `run-dev`, `drive-app`, `open-pr`. Changes go on a branch and end as a pull request; never commit to `main`. Don't change the version or `CHANGELOG.md`.
- A pull request that changes something visible shows it: attach the before / after screenshots (or video) with `gh pr create --attach`, and with `gh pr edit --attach` when later commits change what it looks like. See the `open-pr` skill.
- Tests: `npm test` (unit), `npm run test:ui` (the page in a browser), `npm run test:launch:hidden` (the real app, with windows that never take focus: use this one, not `test:launch`). `npm run test:coverage:hidden` runs them all and checks each file's coverage minimum (`test/coverage-min.json`), which can't go down. Add tests next to similar ones, for every new code path: `test/unit/` follows the folders of `src/` and `scripts/` file by file (`src/main/live.js` → `test/unit/main/live.test.js`), `test/ui/` and `test/launch/` follow the page's parts (`test/ui/layout/columns.test.js`).
- Developer tooling (`scripts/`, the skills' helpers) must work on Windows, macOS and Linux.
- No system pop-ups in the app's pages (`alert`, `confirm`, `prompt`, `<datalist>`, date pickers, system menus): use the app's own (see *No system pop-ups* in `README.md`). `npm test` checks.

## Connected apps (Grapevine)

Multiview links with Pear Drops through [`@streamorchard/grapevine`](https://github.com/Stream-Orchard/grapevine): `src/main/link.js` (the link), `src/page/platforms/pear-drops.js` and `players-link.js` (signing Kick players out while it farms), `panels/settings/connected.js` (the card) and `toolbar/farming.js` (the widget).

- What multiview speaks is in `package.json` (`"grapevine"`: it provides `players` 1.0 and uses `drops.farming` 1.0), and `link.js` reads it from there. Capabilities live in Grapevine: change one there (its `change-capability` skill), release it, then bump the dependency here. A new app goes in Grapevine's known-apps list.
- Tests use Grapevine's stand-in Pear Drops (`@streamorchard/grapevine/stand-in-peer`, by its installed path, never `npx`) in a folder of their own, never the real Pear Drops or the real Grapevine folder. Developer copies use their own folder too.
- At the start of every change, `npm run grapevine:check` (see the `start-change` skill). After a multiview release that adds or changes what it sends, record it in Grapevine: `npm run released -- com.glowingpear.streammultiview <version> …` there (its `app-shipped` skill).

## The page's code

@src/page/README.md
