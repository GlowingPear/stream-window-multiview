---
name: run-dev
description: Run, restart or stop a developer copy of the Stream Multiview desktop app with npm run dev - separate data folder, side by side with an installed copy, optional debugging port. Use to try a change in the real app or before driving it with the drive-app skill.
---

# Run a dev copy

```sh
npm run dev                                   # fresh data folder, deleted when the app closes
npm run dev -- --profile <name>               # keeps logins and saved channels between runs
npm run dev -- --debug                        # also opens the debugging port (free port, printed)
npm run dev -- --profile <name> --debug 9333  # both, on a fixed port
```

`scripts/dev.js` handles the setup on Windows, Mac and Linux:
- It downloads the app engine (Electron) if `npm install` skipped it (npm's `ignore-scripts` setting).
- It removes `ELECTRON_RUN_AS_NODE`, which Electron-based editors and tools set and which stops the app from starting.
- It runs `src/main/harden.js`, like `npm start`.
- It gives the copy its own data folder, so it never touches an installed copy's logins and runs next to it. The window titles show the branch, e.g. `Stream Multiview [fix/kick-import]`.

Lasting profiles live in the system's app data folder under `Stream Multiview Dev/<name>`. The script prints the path. Use one when the check needs a login, and the same one for "before" and "after".

## Notes

- **Run it in the background** when you need to keep working: start it as a background task and read its output for the `debug:` line.
- **One copy per profile.** A second launch with the same profile hands over to the running one and exits. Use another profile, or close the first.
- **Picking up changes:** The Electron side (`src/main/`, `src/preload/`, `src/shared/`) needs a restart. The page (`src/index.html` and `src/page/`) only needs View › Reload everything (Ctrl/Cmd+R).
- **Stopping:** close the window, or stop the `npm run dev` process (Ctrl+C). Only that copy stops. Never stop processes by name: an installed copy has the same name.
- **Login encryption prompts:** on a Mac, the dev copy may ask for access to "Stream Multiview Safe Storage" in the Keychain: choose **Allow**. Windows (DPAPI) doesn't ask. On Linux, logins are protected by the desktop keyring if there is one.
- **Never change `HOME`** (or `USERPROFILE`) to isolate a copy: on a Mac that hides the login keychain and shows a "Reset To Defaults" dialog. The data folder is already separate.
- **The debugging port** only listens on `127.0.0.1`. Use it for test scripts, not for anything shared.
- **Don't wait on it:** start it as a background task and read its output. If it stalls, see *Don't get stuck* in the `drive-app` skill.
