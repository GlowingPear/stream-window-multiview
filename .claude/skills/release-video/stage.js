// Stand-ins for kick.com, so a video shows only made-up channels and chatters (never real ones):
// a moving picture for each stream, a scrolling chat with a chat box and Kick-style user cards,
// and Kick's channel API (live, viewers, start time, bio, follow/unfollow) for live checks and profiles.
//   await stage.install(run.app, { mod: 'nightowl' });
//   add channels by name: stage.CHANNELS
const CHANNELS = ['pixelpear', 'nightowl', 'arcadia', 'lofilane', 'tidepool', 'emberfox'];
const HUES = { pixelpear: 95, nightowl: 250, arcadia: 320, lofilane: 30, tidepool: 190, emberfox: 10 };
const GAMES = { pixelpear: 'Speedrun practice', nightowl: 'Late night chill', arcadia: 'Retro arcade', lofilane: 'Lo-fi & coding', tidepool: 'Ocean survival', emberfox: 'Ranked grind' };
const BIOS = { pixelpear: 'Speedruns most weeknights. Pears optional.', nightowl: 'Chill streams after dark.', arcadia: 'Old arcade cabinets, new high scores.',
  lofilane: 'Beats to code to.', tidepool: 'Surviving the ocean one raft at a time.', emberfox: 'Climbing the ladder, slowly.' };

const streamPage = ch => `<!doctype html><meta charset=utf-8><title>${ch}</title><style>
html,body{margin:0;height:100%;overflow:hidden;background:#000;font-family:system-ui,sans-serif}
canvas{position:absolute;inset:0;width:100%;height:100%}
.o{position:absolute;left:4%;bottom:7%;color:#fff;text-shadow:0 2px 12px #0008}
.o b{font-size:min(7vw,52px);display:block;letter-spacing:-.02em}.o span{font-size:min(3vw,20px);opacity:.85}
.live{position:absolute;left:4%;top:7%;background:#e91916;color:#fff;font:700 min(2.6vw,15px)/1 system-ui;padding:.35em .6em;border-radius:4px}
</style><canvas id=c></canvas><div class=live>LIVE</div><div class=o><b>${ch}</b><span>${GAMES[ch] || ''}</span></div><script>
const c=document.getElementById('c'),x=c.getContext('2d'),h=${HUES[ch] ?? 200};let t=0;
function f(){c.width=innerWidth;c.height=innerHeight;const W=c.width,H=c.height;
const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'hsl('+h+',70%,22%)');g.addColorStop(1,'hsl('+(h+50)+',70%,40%)');x.fillStyle=g;x.fillRect(0,0,W,H);
for(let i=0;i<7;i++){const r=(.18+.08*i)*Math.min(W,H);x.beginPath();x.arc(W*(.5+.38*Math.sin(t/90+i*1.7)),H*(.5+.3*Math.cos(t/110+i)),r,0,7);x.fillStyle='hsla('+(h+i*18)+',90%,65%,.13)';x.fill();}
t++;requestAnimationFrame(f)}f();</script>`;

// window.say(name, text) adds a message; clicking a name opens a user card (to the left, off a narrow window, as kick.com does)
const chatPage = ch => `<!doctype html><meta charset=utf-8><title>chat</title><style>
html,body{margin:0;height:100%;background:#18181b;color:#efeff1;font:13px/1.45 system-ui,sans-serif;overflow:hidden}
#chat{position:absolute;inset:0 0 58px 0;display:flex;flex-direction:column;justify-content:flex-end;padding:6px 10px;overflow:hidden}
#box{position:absolute;left:0;right:0;bottom:0;height:58px;display:flex;align-items:center;gap:8px;padding:0 10px;border-top:1px solid #2a2a2e;background:#1f1f23}
#box input{flex:1;min-width:0;height:34px;border-radius:6px;border:1px solid #3a3a3f;background:#0e0e10;color:#efeff1;padding:0 10px;font:13px system-ui}
#box button{height:34px;padding:0 14px;border:0;border-radius:6px;background:#53fc18;color:#0b0d0b;font:700 13px system-ui}
.row{padding:3px 4px;border-radius:4px}.row b{font-weight:700;cursor:pointer}
#user-identity{position:fixed;top:56px;right:calc(100% + 12px);width:356px;background:#232328;border:1px solid #3a3a3f;border-radius:10px;padding:16px;box-shadow:0 12px 40px #000c;z-index:5}
#user-identity .hd{display:flex;align-items:center;gap:12px}#user-identity .av{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font:800 20px system-ui;color:#111}
#user-identity .nm{font:700 17px system-ui}#user-identity .sub{opacity:.6;font-size:12px;margin-top:2px}
#user-identity .badges{display:flex;gap:6px;margin:12px 0}#user-identity .badges i{font-style:normal;font-size:11px;padding:3px 7px;border-radius:5px;background:#34343a}
#user-identity .acts{display:flex;gap:8px;margin-top:6px}#user-identity .acts button{flex:1;height:32px;border-radius:6px;border:0;font:600 12px system-ui;background:#34343a;color:#fff}
#user-identity .acts .p{background:#53fc18;color:#111}#user-identity .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#aaa;font-size:18px}
</style><body><div id="chat"></div><div id="box"><input placeholder="Send a message"><button>Chat</button></div><script>
const COL=['#ff7f50','#9acd32','#1e90ff','#ff69b4','#daa520','#00ced1','#ba55d3','#3cb371'];
const NAMES=['mossyrock','quietkoala','bytebun','sundew','ravenquill','zestyplum','tinycomet','glowmoth','ferngully','paperboat'];
const LINES=['gg','that was clean','lets gooo','hello chat','how is everyone tonight','no way','LUL','that jump though','first time here, love it','music is great today','hydrate check','W stream','see you tomorrow','ok that was close','clip it'];
const chat=document.getElementById('chat'),col=s=>COL[[...s].reduce((a,c)=>a+c.charCodeAt(0),0)%COL.length];
window.card=s=>{let c=document.getElementById('user-identity');if(c)c.remove();c=document.createElement('div');c.id='user-identity';
c.innerHTML='<button class=x>×</button><div class=hd><div class=av style="background:'+col(s)+'">'+s[0].toUpperCase()+'</div><div><div class=nm style="color:'+col(s)+'">'+s+'</div><div class=sub>Following since March 2025</div></div></div><div class=badges><i>Subscriber · 8 months</i><i>Chatted 214 times</i></div><div class=acts><button class=p>Follow</button><button>Reply</button><button>Mention</button></div>';
c.querySelector('.x').onclick=()=>c.remove();document.body.appendChild(c);};
document.addEventListener('click',e=>{const b=e.target.closest('.row b');if(b)card(b.textContent);});
window.say=(s,t)=>{const d=document.createElement('div');d.className='row';d.innerHTML='<b></b>: <span></span>';const b=d.querySelector('b');b.textContent=s;b.style.color=col(s);d.querySelector('span').textContent=t;chat.appendChild(d);while(chat.children.length>60)chat.firstChild.remove();};
for(let i=0;i<14;i++)say(NAMES[(i*3+${ch.length})%NAMES.length],LINES[(i*7+${ch.length})%LINES.length]);
let n=${ch.length};setInterval(()=>{n++;say(NAMES[(n*3)%NAMES.length],LINES[(n*7+3)%LINES.length]);},1400+${ch.length}*150);
</script></body>`;

// Kick's /api/v2/channels/<slug> for a made-up channel: live for a while, with viewers and a bio
const kickTime = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
function kickChannel(ch, i) {
  const live = ch !== 'emberfox';
  return { slug: ch, followers_count: [15400, 3200, 8700, 21000, 1900, 640][i] ?? 1000, verified: i === 0,
    user: { username: ch, bio: BIOS[ch] || '', profile_pic: '' },
    livestream: live ? { is_live: true, session_title: GAMES[ch], viewer_count: [912, 214, 487, 1530, 96, 0][i] ?? 50,
      start_time: kickTime(Date.now() - (40 + i * 35) * 60e3), categories: [{ name: GAMES[ch] }] } : null,
    chatroom: { slow_mode: i === 1, message_interval: 5 } };
}

// mod: the one channel you "moderate" (mod view button, spam alerts). kick: extra or replaced API answers, by slug.
async function install(app, { mod = 'nightowl', kick = {} } = {}) {
  const api = Object.fromEntries(CHANNELS.map((c, i) => [c, kickChannel(c, i)]));
  Object.assign(api, kick);
  await app.evaluate(({ session, ipcMain }, { pages, api, mod }) => {
    const html = s => new Response(s, { headers: { 'content-type': 'text/html' } });
    const json = (d, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { 'content-type': 'application/json' } });
    const s = session.fromPartition('persist:kick');
    try { s.protocol.unhandle('https'); } catch {}
    s.protocol.handle('https', req => {
      const u = new URL(req.url);
      const chat = /^\/popout\/([^/]+)\/chat/.exec(u.pathname);
      if (chat) { const p = pages.chat[decodeURIComponent(chat[1])]; return p ? html(p) : new Response('', { status: 404 }); }
      const m = /^\/api\/v[12]\/channels\/([\w-]+)(\/[\w-]+)?$/.exec(u.pathname);
      if (m) {
        if (m[2] === '/follow') return new Response(null, { status: 204 });
        const c = api[m[1]];
        if (!c) return json({ message: 'Not found' }, 404);
        if (m[2] === '/videos') return json([]);
        if (m[2] === '/me') return json({ following: true, following_since: '2025-03-14T20:00:00Z' });
        return json(c);
      }
      if (u.pathname.startsWith('/api/')) return json({ message: 'Not found' }, 404);
      return html('<!doctype html><title>Kick</title>');
    });
    for (const ch of Object.keys(pages.stream)) session.fromPartition('persist:kmv-stream-' + ch).protocol.handle('https', req =>
      /player\.kick\.com/.test(req.url) ? html(pages.stream[ch]) : new Response('', { status: 404 }));
    ipcMain.removeHandler('mod:check');
    ipcMain.handle('mod:check', (_e, ch) => ch === mod);
    return s.cookies.set({ url: 'https://kick.com', name: 'session_token', value: 'stand-in' });   // "logged in" to Kick
  }, { mod, api, pages: {
    chat: Object.fromEntries(CHANNELS.map(c => [c, chatPage(c)])),
    stream: Object.fromEntries(CHANNELS.map(c => [c, streamPage(c)])) } });
}

module.exports = { CHANNELS, install, kickTime };
