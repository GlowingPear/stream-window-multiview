// Checks the chat commands ALL's / list knows (src/page/platforms/twitch.js and kick.js, chatCommands) against what the
// sites' own chats offer now, read from a signed-in developer copy over its debugging port. Nothing is typed or sent.
//   npm run dev -- --profile <name> --debug 9333      (signed in to Twitch and Kick, a chat of each open)
//   npm run check:commands [-- --port 9333]
// Twitch: its chat page's own list (as ALL reads it as it runs: in-site/feed.js twCommandsAgent). Kick: the list its chat
// shows as you type /, so type / in a Kick chat first (in one where you're the streamer it has every command, each saying
// who can use it). Prints what's new, what's gone and what changed; exits 1 when anything differs.
const path = require('path');
const { pathToFileURL } = require('url');

// Kick's commands as its chat holds them while its / list is open: [{ name, args, who }] (who as chatCommands says it)
const KICK_WHO = { viewer: 'all', moderator: 'mod', broadcaster: 'host' };
function kickListAgent(){
  const box = document.querySelector('[data-testid="chat-input"]'); if (!box) return null;
  const fk = Object.keys(box).find(k => k.startsWith('__reactFiber')); if (!fk) return null;
  let root = box[fk]; while (root.return) root = root.return;
  let best = null; const stack = [root]; let n = 0;
  while (stack.length && n < 400000){
    const f = stack.pop(); n++;
    let h = f.memoizedState, i = 0;
    while (h && typeof h === 'object' && i < 60){
      const v = h.memoizedState;
      if (Array.isArray(v) && v.length && v.every(x => x && x.command && typeof x.command.baseCommand === 'string') && (!best || v.length > best.length)) best = v;
      h = h.next; i++;
    }
    if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child);
  }
  return best && best.map(x => ({ name: x.command.baseCommand, args: x.command.argsPlaceholder || '', role: x.command.minimumRole }));
}

// What differs between the list ALL knows (copy) and the site's (live), by name: { added, removed, changed: [{ name, what }] }.
// leftOut: the names ALL leaves out on purpose (they open something in the site's own chat).
function compare(copy, live, leftOut = []){
  const skip = new Set(leftOut), mine = new Map(copy.map(c => [c.name, c])), theirs = new Map(live.filter(c => !skip.has(c.name)).map(c => [c.name, c]));
  const added = [...theirs.keys()].filter(n => !mine.has(n)), removed = [...mine.keys()].filter(n => !theirs.has(n)), changed = [];
  for (const [n, c] of theirs){
    const m = mine.get(n); if (!m) continue;
    for (const k of ['args', 'who']) if (c[k] !== undefined && c[k] !== m[k]) changed.push({ name: n, what: `${k}: "${m[k]}" → "${c[k]}"` });
  }
  return { added, removed, changed };
}
const report = (site, d) => {
  const lines = [...d.added.map(n => `  + /${n} (new on ${site})`), ...d.removed.map(n => `  - /${n} (gone from ${site})`), ...d.changed.map(c => `  ~ /${c.name}: ${c.what}`)];
  console.log(lines.length ? `${site}: ${lines.length} difference${lines.length === 1 ? '' : 's'}\n${lines.join('\n')}` : `${site}: the same`);
  return lines.length;
};

async function inPage(target, fn){
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(${fn})()`, returnByValue: true } }));
  const r = await new Promise(res => ws.addEventListener('message', e => { const d = JSON.parse(e.data); if (d.id === 1) res(d); }));
  ws.close();
  return r.result && r.result.result ? r.result.result.value : null;
}

async function main(){
  const port = +((process.argv.find(a => /^--port=?/.test(a)) || '').split('=')[1] || process.argv[process.argv.indexOf('--port') + 1] || 9333) || 9333;
  let targets;
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); }
  catch { console.error(`No developer copy on port ${port}: start one with npm run dev -- --profile <name> --debug ${port}`); process.exit(2); }
  const src = path.join(__dirname, '..', 'src', 'page');
  const imp = f => import(pathToFileURL(path.join(src, f)).href);
  const [{ twCommandsAgent }, { twitch }, { kick }] = await Promise.all([imp('in-site/feed.js'), imp('platforms/twitch.js'), imp('platforms/kick.js')]);
  const chats = re => targets.filter(t => t.type === 'webview' && re.test(t.url));
  let diffs = 0;
  // Twitch: its whole list from any of its chats (each command says who can use it); /pin only where you can pin
  let tw = null;
  for (const t of chats(/twitch\.tv\/popout\//)) { tw = twitch.liveCommands(await inPage(t, twCommandsAgent)); if (tw) break; }
  if (tw) diffs += report('Twitch', compare(twitch.chatCommands.filter(c => c.name !== 'pin'), tw.filter(c => c.name !== 'pin')));
  else console.log('Twitch: no chat to read (open a Twitch chat in the developer copy)');
  // Kick: the longest list open in its chats
  let kl = null;
  for (const t of chats(/kick\.com\/popout\//)) { const l = await inPage(t, kickListAgent); if (l && (!kl || l.length > kl.length)) kl = l; }
  if (kl) {
    const live = kl.map(c => ({ name: c.name, args: c.args, who: KICK_WHO[c.role] || c.role }));
    const full = kl.length >= kick.chatCommands.length;
    const d = compare(kick.chatCommands, live, ['user', 'category']);
    if (!full) d.removed = [];   // (a viewer's or a moderator's list: what it doesn't have isn't gone)
    diffs += report(`Kick${full ? '' : ' (not the streamer\'s list: only what it shows is checked)'}`, d);
  } else console.log('Kick: no / list open (type / in a Kick chat in the developer copy, then run this again)');
  process.exit(diffs ? 1 : 0);
}

if (require.main === module) main();
module.exports = { compare, kickListAgent, KICK_WHO };
