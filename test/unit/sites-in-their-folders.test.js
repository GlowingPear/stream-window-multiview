// Everything about one site is in its folders (src/page/sites/<id>/, src/main/sites/<id>/) and the list both sides
// share (src/shared/sites.js), so a new site is a folder on each side and nothing else: README.md, "Adding a site".
// Code elsewhere asks the channel's site (platform(ch), sites.of(ch)) instead of naming one. This fails on code
// (not comments) outside those folders that names a site: its id in quotes, its channel-id prefix, its web address,
// or one of its ids as a property; and on markup the page needs for each site that one of them hasn't got.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const SmvSites = require('../../src/shared/sites.js');

const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const files = (dir, ext) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map(f => (dir + '/' + f).split(path.sep).join('/'))
  .filter(f => ext.test(f) && fs.statSync(path.join(ROOT, f)).isFile());
const inFolders = f => /^src\/(page|main)\/sites\//.test(f) || f === 'src/shared/sites.js';
// A file's code without its comments (each comment's characters as spaces, so line numbers stay)
const code = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

// What names a site: built from the shared list, so a new site is checked too
const ids = SmvSites.IDS.join('|');
const prefixes = SmvSites.SITES.filter(s => s.prefix).map(s => s.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const hosts = SmvSites.SITES.flatMap(s => s.hosts).map(h => h.replace(/\./g, '\\.')).join('|');
const NAMES = new RegExp(`['"\`](${ids})['"\`]|/\\^(${prefixes})|['"\`](${prefixes})|\\b(${hosts})\\b|\\.(${ids})\\b(?!\\s*\\()`, 'g');

// The places that name a site on purpose: [file, text on the line, why]
const ALLOWED = [
  // Pear Drops (Connected apps) farms Kick's drops: its own site, and the players capability Grapevine names it in
  ['src/page/platforms/players-link.js', "const PEAR_SITE = 'kick'", 'the site Pear Drops farms, once'],
  ['src/page/platforms/pear-drops.js', 'watchSignedIn.kick', 'Pear Drops\' Kick choice (PEAR_SITE\'s), saved as link.kickBefore'],
  ['src/page/platforms/pear-drops.js', "settings.json('accounts', {}) || {}).kick", 'your Kick account, for Pear Drops'],
  ['src/page/toolbar/daily-reward.js', 'https://kick.com/?daily-reward=open', 'Kick\'s daily reward, from Pear Drops'],
  ['src/page/panels/settings/activity.js', 'p.platforms.kick', 'Grapevine\'s players capability, as Pear Drops sends it'],
  // saved data from before
  ['src/page/toolbar/accounts-menu.js', "acct.kick = acct.kick || settings.text('account')", 'older copies kept only your Kick account'],
  ['src/page/chat/shoutout-text.js', "r.site === 'twitch' ? 'twitch' : 'kick'", '#300\'s People rows, only ever Kick\'s and Twitch\'s, made into cards once'],
  ['src/page/chat/shoutout-text.js', 'sites: per ? { kick: sites.kick', '#300\'s People rows (as above)'],
  // YouTube's own settings and sign-in (Settings › YouTube; Google blocks signing in inside the app)
  ['src/page/panels/settings/settings.js', "settingsTab === 'youtube'", 'the YouTube settings page\'s tab'],
  ['src/page/panels/help/guide.js', "youtube: 'youtube'", 'the guide\'s YouTube section'],
  ['src/page/toolbar/accounts-menu.js', "showHelp('guide', 'youtube', 'API key')", 'the YouTube API key\'s help'],
  ['src/page/toolbar/accounts-menu.js', 'Open youtube.com in Firefox', 'signing in to YouTube through Firefox'],
  ['src/page/toolbar/accounts-menu.js', 'st.youtube', 'signing in to YouTube through Firefox'],
  ['src/main/firefox-login.js', "const DOMAINS = ['youtube.com', 'google.com']", 'the YouTube login copied from Firefox'],
  ['src/preload/signin-preload.js', 'accounts\\.youtube\\.com', 'Google\'s sign-in pages, where the app shows itself as Firefox'],
  ['src/preload/preload.js', "'yt:resolve'", 'a message\'s name (YouTube\'s live video, sites/youtube/)'],
  // badge pictures, as each site's in-site part sends them (keyed by its id)
  ['src/page/chat/all-chat.js', 'kick = got.kick, own = (!m.from && got.twitch)', 'badge pictures from the sites\' in-site badges parts'],
  ['src/page/chat/all-chat.js', 'r.twitch && r.twitch.global', 'badge pictures (as above)'],
  ['src/page/chat/all-chat.js', 'r.twitch ? { twitch: r.twitch.own }', 'badge pictures (as above)'],
  // the tests' hooks (window.kickIconsAgent and the others, as the tests have always called them)
  ['src/page/chat/all-chat.js', "inSiteOf('kick')", 'the tests\' hooks (the two lines that set them)'],
  // other sites' addresses that happen to be one of these (not the site adapters')
  ['src/page/alerts/spam.js', "const ALLOWED = ['kick.com', 'twitch.tv', 'youtube.com', 'youtu.be'", 'links spam alerts never count, with other well-known sites'],
  ['src/main/event-samples.js', 'tmi.twitch.tv', 'taking names out of IRC lines (Twitch\'s server\'s name)'],
  ['src/main/profiles.js', "youtube: ['YouTube'", 'a profile\'s social links (YouTube next to Instagram and the rest)'],
  ['src/main/profiles.js', "kick: ['Kick'", 'a profile\'s social links'],
  ['src/main/profiles.js', "twitch: ['Twitch'", 'a profile\'s social links'],
  ['src/main/profiles.js', "['instagram', 'twitter', 'youtube'", 'a profile\'s social links'],
  // each site's profile reader stays in profiles.js (its coverage minimum); sites/<id>/site.js calls it
  ['src/main/profiles.js', "platform: 'kick'", 'Kick\'s profile reader'],
  ['src/main/profiles.js', "platform: 'twitch'", 'Twitch\'s profile reader'],
  ['src/main/profiles.js', 'www\\.youtube\\.com\\/(channel', 'YouTube\'s profile reader'],
  ['src/main/profiles.js', "platform: 'youtube'", 'YouTube\'s profile reader'],
  ['src/main/emote-picker.js', 'https://files.kick.com/emotes/', 'Kick\'s emote picker groups (kickGroups), called by sites/kick/'],
  ['src/main/emote-picker.js', "new Set(['twitch', 'twitchhypetrain'])", 'Twitch\'s emote picker groups (twitchGroups), called by sites/twitch/'],
  ['src/main/emote-picker.js', "owner(s) === 'twitch'", 'Twitch\'s emote picker groups (as above)'],
];

test('code outside the sites\' folders doesn\'t name a site (the few that do on purpose, and why, are listed here)', () => {
  const found = [], used = new Set();
  for (const f of [...files('src/page', /\.js$/), ...files('src/main', /\.js$/), ...files('src/shared', /\.js$/), ...files('src/preload', /\.js$/)]) {
    if (inFolders(f)) continue;
    code(read(f)).split('\n').forEach((line, i) => {
      if (!line.match(NAMES)) return;
      const ok = ALLOWED.find(([file, text]) => file === f && line.includes(text));
      if (ok) used.add(ok); else found.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(found, [], 'ask the channel\'s site (platform(ch), sites.of(ch)), or put it in the site\'s folder');
  assert.deepEqual(ALLOWED.filter(a => !used.has(a)).map(a => a[0] + ': ' + a[1]), [], 'an allowed one that\'s gone: take it off the list');
});

test('CSS outside the sites\' folders doesn\'t style a site: each site\'s colours are its site.css', () => {
  const SEL = new RegExp(`[.-](${ids})\\b|=(${ids})\\]`);
  const found = [];
  for (const f of files('src/page', /\.css$/)) {
    if (inFolders(f)) continue;
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) if (SEL.test(m[1])) found.push(`${f}: ${m[1].trim().slice(0, 100)}`);
  }
  assert.deepEqual(found, []);
});

test('every site has what the page\'s markup and CSS need for it', () => {
  const html = read('src/index.html');
  for (const id of SmvSites.IDS) {
    for (const [what, re] of [
      ['its colours (site.css), after every part\'s CSS', new RegExp(`<link rel="stylesheet" href="page/sites/${id}/site\\.css">`)],
      ['its row in the Accounts menu and in Settings › Accounts', new RegExp(`class="am-row" data-p="${id}"[\\s\\S]*class="am-row" data-p="${id}"`)],
      ['its button in the Channels box\'s site picker', new RegExp(`id="spPlat"[^\\n]*data-p="${id}"`)],
      ['its Channels tab', new RegExp(`id="savedTabs"[^\\n]*data-t="${id}"`)],
      ['its "Forget my login" box', new RegExp(`data-f="${id}"`)],
      ['its "Watch signed in" box', new RegExp(`data-w="${id}"`)],
      ['its name box (Settings › Mentions)', new RegExp(`data-me="${id}"`)]
    ]) assert.match(html, re, `${id}: ${what} (src/index.html)`);
    const css = read(`src/page/sites/${id}/site.css`);
    assert.match(css, new RegExp(`\\.pi-${id}\\{`), `${id}: its badge (.pi-${id}) in site.css`);
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(links.indexOf(`page/sites/${id}/site.css`) > links.findIndex(l => !l.startsWith('page/sites/') || /\/(commands|poll|prediction|clip)\.css$/.test(l)) &&
      links.slice(links.indexOf(`page/sites/${id}/site.css`)).every(l => /^page\/sites\/[^/]+\/site\.css$/.test(l)), `${id}: its site.css with the others, after every part's CSS`);
  }
});
