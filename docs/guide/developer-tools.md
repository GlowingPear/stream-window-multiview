---
title: Developer tools
group: help
icon: code
lede: Tools for finding out why something isn't working, and for reporting it.
settings: developer
words: [developer, debug, diagnostics, error, log, html, inspect, devtools, report, bug, why, alert]
related: [reporting-a-problem, right-click, mentions]
order: 30
---

- Settings › Developer › **Developer tools** (off at first) adds a few tools for looking into a problem. The first time, it says what Inspect can see.
- **In a chat's right-click menu**, a **Developer** group at the end:
  - **Copy message HTML**: the whole message's HTML, with its name and badges, without what the app adds to it.
  - **Copy chat HTML**: the chat's last 30 messages and the list around them (its banners and pinned message), without scripts, styles and very long attributes.
  - **Why didn't this alert?**: how the mention and spam alerts read that message: what they saw, each check in order (mentions on, this chat, your username, your words, a chat bot, when it came in, its spam score) and the first reason it didn't alert. **Copy** puts it on the clipboard.
  - **Inspect**: Chrome's developer tools for that chat or stream.
- **In a window's ⋯ menu**: **Copy window state** (its address, whether it loaded, live, paused and why, sound, size, the app's helpers in it and its timers) and **Inspect**.
- **Copy diagnostics** (Settings › Developer, with the switch on or off): the app's version, your system, the open windows, settings, recent errors and the last requests to the sites, ready to paste in a report. **Save as file…** saves the same.
- **Errors**: the last 200 errors from the app, its page and its helpers in the chats, from this run and the one before. The same error again is counted, not repeated.
- **Requests**: the last 40 requests to the sites (live checks, follows and profiles), with their status and time. **Errors only** shows just the ones that failed or didn't answer OK (no answer, or a status like 404 or 429). Click one to copy the request and the answer (the answer's text is only kept while Developer tools are on).
- Everything stays on this computer and only goes anywhere when you copy it. Logins, cookies and keys are left out; channel and chat names can be in it. **Clear** empties both lists.

> **Tip:** Inspect can read the page's data, including your login to that site. Use it yourself, and don't share what it shows.
