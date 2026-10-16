// The app's start file (package.json "main"). The Electron side is in src/main/, the page in src/index.html and
// src/page/. This file and src/index.html stay where they are: a copy that updates itself from the source only
// takes an update that has both (src/main/updater.js), so moving either would make older copies refuse it.
require('./main/main.js');
