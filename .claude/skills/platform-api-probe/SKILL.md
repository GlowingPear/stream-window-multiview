---
name: platform-api-probe
description: Investigate Kick, Twitch or YouTube API behaviour using the dev copy's own sign-in - read-only requests to compare endpoints, paging and fields. Use when an import, live check or login stops working, or before changing code that calls these sites.
---

# Probe a platform's API

The app talks to undocumented Kick, Twitch and YouTube APIs, which change without notice. Check what the API returns today before changing code that calls it.

## Rules

- **Read-only.** GET requests (and Twitch GraphQL *queries*) only. Never follow, unfollow, chat, subscribe or change settings.
- Use the developer's own account or a test account, and only with their OK.
- Keep request counts low and don't loop without a limit. Kick is behind Cloudflare: bursts of requests (e.g. downloading its scripts to search them) or automated page loads can get the profile checked, and the check can't be passed while Playwright is attached (see `drive-app`).
- Don't paste tokens, cookies or personal data into the PR or the chat. Report counts, field names and status codes.

## How

1. Start a dev copy with a lasting profile and the debugging port: `npm run dev -- --profile <name> --debug <port>`. Sign in to the platform in the app if needed.
2. Connect with the `drive-app` helper and run requests **inside the app's own pages**, so they carry the same login as the app's code:
   - **Kick:** the hidden `kick.com` page (`pages().find(p => p.url().startsWith('https://kick.com/'))`). Use the same headers as `kickFollows()` in `src/main/main.js`: `Authorization: Bearer <session_token cookie>` and `X-XSRF-TOKEN`.
   - **Twitch:** GraphQL at `https://gql.twitch.tv/gql`, as in `twitchFollows()`. It needs the app's Twitch `auth-token` cookie and `Client-Id`.
   - **YouTube:** the app reads pages rather than an API (`scrapeFollowPage`). Inspect them in a YouTube page of the dev copy.
3. Copy the code's request first, so you can see what the app sees. Then vary one thing at a time: endpoint, page size, cursor.
4. Compare results by content, not just counts: same items? Missing? Duplicates? How does the last page end?

## Example: Kick's follow list

```js
const out = await kickPage.evaluate(async () => {
  const ck = n => decodeURIComponent((document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1] || '');
  const h = { Accept: 'application/json', Authorization: 'Bearer ' + ck('session_token'), 'X-XSRF-TOKEN': ck('XSRF-TOKEN') };
  const r = await fetch('/api/v2/channels/followed-page?cursor=0', { credentials: 'include', headers: h });
  const d = await r.json();
  return { status: r.status, keys: Object.keys(d), count: (d.channels || []).length, next: d.nextCursor };
});
```

Write down what you found (endpoints, page sizes, fields, limits) in the PR's **Why** or **Tests** section, so the next person doesn't have to repeat it.
