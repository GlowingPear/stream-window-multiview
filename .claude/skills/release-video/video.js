// Records a "what's new" video of the app from a scenes file (see SKILL.md), with title cards, captions,
// a visible pointer, smooth capture and generated music, and encodes it as an MP4 under 10 MB.
//   node .claude/skills/release-video/video.js <scenes.js> [--dir <checkout>] [--out <file.mp4>] [--keep]
// --dir: the checkout to run (default: this one). --keep: keep the captured frames (for re-encoding).
// Prints the MP4, a contact sheet (a still every 4 s) to look at, and the capture rate.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const drive = require('../drive-app/drive');
const stage = require('./stage');
const capture = require('./capture');
const music = require('./music');
const sounds = require('./sounds');

const ROOT = path.join(__dirname, '..', '..', '..');
const W = 1280, H = 800;   // the window, and the MP4

const CSS = `
#tr-cap{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);opacity:0;transition:all .45s ease,bottom .5s cubic-bezier(.6,0,.3,1);z-index:2147483646;pointer-events:none;
 background:rgba(12,14,12,.92);border:1px solid var(--accent,#7cff4f);border-radius:14px;padding:12px 20px;max-width:900px;box-shadow:0 10px 40px #000a;font-family:system-ui,sans-serif;color:#fff;text-align:left}
#tr-cap.on{opacity:1;transform:translate(-50%,0)}
#tr-cap.top{bottom:calc(100% - 122px)}
#tr-cap .v{display:inline-block;font:700 11px/1 system-ui;letter-spacing:.06em;color:#0b0d0b;background:var(--accent,#7cff4f);padding:4px 7px;border-radius:5px;margin-right:10px;vertical-align:3px}
#tr-cap b{font-size:20px}#tr-cap div{font-size:14px;opacity:.8;margin-top:4px}
#tr-card{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;pointer-events:none;
 background:radial-gradient(ellipse at 50% 45%,#1b2a12 0%,#07090a 65%);color:#fff;font-family:system-ui,sans-serif;
 clip-path:circle(0% at 50% 42%);transition:clip-path .75s cubic-bezier(.7,0,.3,1)}
#tr-card.on{clip-path:circle(80% at 50% 42%)}
#tr-card::before{content:"";position:absolute;width:520px;height:520px;left:50%;top:42%;margin:-260px 0 0 -260px;border-radius:50%;
 background:radial-gradient(circle,color-mix(in srgb,var(--accent,#7cff4f) 28%,transparent) 0%,transparent 65%);animation:trGlow 3s ease-in-out infinite alternate}
@keyframes trGlow{from{transform:scale(.85);opacity:.6}to{transform:scale(1.15);opacity:1}}
#tr-card .spark{position:absolute;width:6px;height:6px;border-radius:50%;background:var(--accent,#7cff4f);opacity:0;animation:trSpark 2.4s ease-out forwards}
@keyframes trSpark{0%{opacity:0;transform:translate(0,0) scale(.4)}15%{opacity:.9}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1)}}
#tr-card .tr-pear{width:104px;height:104px;position:relative;animation:trPop .7s cubic-bezier(.3,1.6,.5,1) both}
#tr-card .tr-pear .juice{animation:pear-fill 1.9s cubic-bezier(.4,0,.2,1) .25s 1 both}
#tr-card .tr-pear .leaf{animation:pear-leaf .45s ease-in-out .9s 2 alternate both}
@keyframes trPop{0%{transform:scale(0) rotate(-25deg)}100%{transform:scale(1) rotate(0)}}
#tr-card h1{margin:0;font-size:56px;letter-spacing:-.02em;position:relative;display:flex;gap:.28em;flex-wrap:wrap;justify-content:center;max-width:1000px}
#tr-card h1.f{font-size:46px}
#tr-card h1 span{display:inline-block;animation:trWord .6s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes trWord{from{opacity:0;transform:translateY(28px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
#tr-card p{margin:0;font-size:20px;opacity:0;position:relative;max-width:820px;text-align:center;animation:trFade .6s ease both}
@keyframes trFade{from{opacity:0;transform:translateY(10px)}to{opacity:.8;transform:none}}
#tr-card ul{margin:8px 0 0;padding:0;list-style:none;font-size:18px;text-align:center;line-height:1.9;position:relative}
#tr-card li{opacity:0;animation:trSlide .6s ease both}
@keyframes trSlide{from{opacity:0;transform:translateX(-40px)}to{opacity:.88;transform:none}}
#tr-card .v{position:relative;font:800 14px/1 system-ui;letter-spacing:.08em;color:#0b0d0b;background:var(--accent,#7cff4f);padding:7px 11px;border-radius:7px;animation:trChip .5s cubic-bezier(.3,1.5,.5,1) .15s both}
@keyframes trChip{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}
#tr-card .v.flip{animation:trFlip .7s ease both}
@keyframes trFlip{0%{transform:rotateX(0)}50%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}
#tr-card .odo{position:relative;font:700 22px/1 ui-monospace,Menlo,monospace;color:var(--accent,#7cff4f);display:flex;align-items:center;gap:10px;opacity:.95}
#tr-card .odo .num{display:inline-block;min-width:4.6em;text-align:center;padding:6px 10px;border:1px solid color-mix(in srgb,var(--accent,#7cff4f) 50%,transparent);border-radius:8px}
#tr-card .odo .num.tick{animation:trTick .35s ease}
@keyframes trTick{0%{transform:translateY(0);opacity:1}45%{transform:translateY(-14px);opacity:0}55%{transform:translateY(14px);opacity:0}100%{transform:none;opacity:1}}
#tr-card .dots{position:absolute;bottom:48px;display:flex;gap:10px}
#tr-card .dots i{width:9px;height:9px;border-radius:50%;background:#ffffff30;transition:all .4s}
#tr-card .dots i.done{background:color-mix(in srgb,var(--accent,#7cff4f) 55%,transparent)}
#tr-card .dots i.cur{background:var(--accent,#7cff4f);transform:scale(1.5);box-shadow:0 0 12px var(--accent,#7cff4f)}
#tr-ring{position:fixed;border:3px solid var(--accent,#7cff4f);border-radius:12px;z-index:2147483644;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.45),0 0 24px var(--accent,#7cff4f);opacity:0;
 transition:opacity .4s,left .5s,top .5s,width .5s,height .5s;animation:trRing 1.2s ease-in-out infinite alternate}
#tr-ring.on{opacity:1}
@keyframes trRing{from{outline:0 solid transparent}to{outline:8px solid color-mix(in srgb,var(--accent,#7cff4f) 25%,transparent)}}
#tr-card.still .spark{display:none}
#tr-card.still .tr-pear,#tr-card.still .tr-pear .leaf,#tr-card.still h1 span,#tr-card.still .v{animation:none}
#tr-card.still .tr-pear .juice{animation:none;transform:translate(0,6px)}
#tr-card.still p{animation:none;opacity:.8}#tr-card.still li{animation:none;opacity:.88}
#tr-mouse{position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,.85);border:2px solid #111;z-index:2147483645;pointer-events:none;transition:transform .12s;left:-50px;top:-50px}
#tr-mouse.down{transform:scale(.7)}`;

// The app's own animated pear (its loading animation): juice fills it once, the leaf sways
const PB = 'M32 14.2C25.6 14.2 23.4 19.4 23.4 24.6 23.4 29.6 20.4 31.6 17.2 35.6 13.2 40.6 12 46.8 14.2 52 17.2 58.8 24.4 62 32 62 39.6 62 46.8 58.8 49.8 52 52 46.8 50.8 40.6 46.8 35.6 43.6 31.6 40.6 29.6 40.6 24.6 40.6 19.4 38.4 14.2 32 14.2Z';
const PEAR = `<svg class="pear-load tr-pear" viewBox="0 0 64 64"><defs><clipPath id="trPearClip"><path d="${PB}"/></clipPath></defs><path class="body" d="${PB}"/>`
  + '<g clip-path="url(#trPearClip)"><path class="juice" d="M0 8Q8 3 16 8T32 8T48 8T64 8T80 8T96 8V90H0Z"/></g>'
  + '<path class="leaf" d="M36.2 9.6C40 4.2 47.5 3.2 52.5 5.4 49.6 10.8 42.4 12.8 36.2 9.6Z"/><path class="stem" d="M33.2 15.5C33 11.5 34.2 8 36.6 4.8"/></svg>';

// The helpers a scenes file's run(t) gets.
function director(run, { features = 0 } = {}) {
  const m = run.main, wait = ms => m.waitForTimeout(ms);
  let mx = W / 2, my = H / 2, dot = 0;
  const ease = k => k * k * (3 - 2 * k);

  // A title card. { h, p, items: [], v: version chip, from: chip text that flips to v, odo: [versions to count through], dot }
  // still: drawn finished, without animation (the poster). A card that follows one still showing swaps in place.
  const card = o => m.evaluate(o => {
    const c = document.getElementById('tr-card');
    const words = (t, d0 = .35) => t.split(' ').map((w, i) => `<span style="animation-delay:${(d0 + i * .09).toFixed(2)}s">${w}</span>`).join('');
    const sparks = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * 6.283, r = 180 + (i % 3) * 70;
      return `<i class="spark" style="left:50%;top:42%;--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r)}px;animation-delay:${(.5 + (i % 4) * .08).toFixed(2)}s"></i>`; }).join('');
    let h = sparks + window.__pear;
    if (o.v) h += `<span class="v">${o.from || o.v}</span>`;
    h += `<h1 class="${o.v ? 'f' : ''}">${words(o.h)}</h1>`;
    if (o.odo) h += `<div class="odo"><span style="opacity:.6">What's new</span><span class="num">${o.odo[0]}</span></div>`;
    if (o.p) h += `<p style="animation-delay:${(.55 + o.h.split(' ').length * .09).toFixed(2)}s">${o.p}</p>`;
    if (o.items) h += '<ul>' + o.items.map((t, i) => `<li style="animation-delay:${(1.1 + i * .35).toFixed(2)}s">${t}</li>`).join('') + '</ul>';
    if (o.dots) h += '<div class="dots">' + Array.from({ length: o.dots }, (_, i) => `<i class="${i < o.dot ? 'done' : i === o.dot ? 'cur' : ''}"></i>`).join('') + '</div>';
    c.innerHTML = h;
    c.classList.toggle('still', !!o.still);
    if (!c.classList.contains('on')) { c.style.transition = 'none'; c.style.clipPath = 'circle(0% at 50% 42%)'; void c.offsetWidth; c.style.transition = ''; c.style.clipPath = ''; }
    c.classList.add('on');
    if (o.from) setTimeout(() => { const v = c.querySelector('.v'); v.classList.add('flip'); setTimeout(() => { v.textContent = o.v; }, 350); }, 1100);
    if (o.odo) { const n = c.querySelector('.odo .num'); o.odo.slice(1).forEach((x, i) => setTimeout(() => { n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick'); setTimeout(() => { n.textContent = x; }, 160); }, 1200 + i * 900)); }
  }, o);
  // the iris closes into the pear
  const uncard = () => m.evaluate(() => { const c = document.getElementById('tr-card'); c.classList.remove('on'); c.style.clipPath = 'circle(0% at 50% 42%)'; });
  const cap = (v, t, s = '') => m.evaluate(([v, t, s]) => {
    const c = document.getElementById('tr-cap'); c.classList.remove('on');
    setTimeout(() => { c.innerHTML = `<span class="v">${v}</span><b>${t}</b>` + (s ? `<div>${s}</div>` : ''); c.classList.add('on'); }, 250);
  }, [v, t, s]);
  const uncap = () => m.evaluate(() => document.getElementById('tr-cap').classList.remove('on'));
  // A feature: its title card first, then the demo with the same words as a caption.
  // from: the previous version, shown on the chip and flipped to v (use on a release's first feature).
  const feature = async (v, title, sub, from) => {
    await uncap();
    await card({ v, from, h: title, p: sub, dot: dot++, dots: features });
    await wait(from ? 2900 : 2500); await uncard(); await wait(800);
    await cap(v, title, sub); await wait(300);
  };
  // Keep the caption off something: up top while it's in the lower part of the window, at the bottom otherwise.
  const dodge = box => m.evaluate(low => document.getElementById('tr-cap').classList.toggle('top', low), box.y + box.height > H * .74);
  // Scroll something fully into view, smoothly, if it isn't already (centred in whatever scrolls: a dialog, a list).
  // Without this a ring runs off the edge, and a click on it lands on what's in front (or the backdrop, closing a dialog).
  const reveal = async sel => {
    const moved = await m.locator(sel).first().evaluate((el, pad) => {
      const r = el.getBoundingClientRect();
      let top = 0, bottom = innerHeight;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight) { const b = p.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
      }
      if (r.top >= top + pad && r.bottom <= bottom - pad) return false;
      el.scrollIntoView({ behavior: 'smooth', block: r.height > bottom - top - 2 * pad ? 'start' : 'center' });
      return true;
    }, 12);
    if (moved) await wait(700);
  };
  // A spotlight ring around something (dims the rest), scrolled into view first.
  // Take it off (unring) before scrolling again: it stays where it was put.
  const ring = async (sel, pad = 6) => {
    await reveal(sel);
    const r = await m.locator(sel).first().boundingBox();
    await dodge(r);
    await m.evaluate(([r, pad]) => { const g = document.getElementById('tr-ring');
      Object.assign(g.style, { left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); g.classList.add('on'); }, [r, pad]);
  };
  const unring = () => m.evaluate(() => document.getElementById('tr-ring').classList.remove('on'));
  // Glide the pointer to a point (smooth, visible). Moving the caption out of the way is moveTo's job.
  const glide = async (x, y, { steps = 18, linear = false } = {}) => {
    const x0 = mx, y0 = my;
    for (let i = 1; i <= steps; i++) { const k = linear ? i / steps : ease(i / steps); await m.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k); await wait(14); }
    mx = x; my = y;
  };
  // Glide to an element (fx/fy: where on it, 0-1), scrolling it into view first. The caption moves to the top while the target is low down.
  const moveTo = async (sel, opts = {}) => {
    await reveal(sel);
    const box = await m.locator(sel).first().boundingBox();
    if (!box) throw new Error(`Nothing on screen for ${sel}`);
    await dodge(box);
    await glide(box.x + box.width * (opts.fx ?? .5), box.y + box.height * (opts.fy ?? .5), opts);
  };
  const press = async () => { await wait(150); await m.mouse.down(); await wait(90); await m.mouse.up(); await wait(250); };
  const click = async (sel, opts) => { await moveTo(sel, opts); await press(); };
  // Click, then type like a person. Long text takes a while, hence the long limit.
  const type = async (sel, text) => { await click(sel); await m.locator(sel).first().pressSequentially(text, { delay: 50, timeout: 60000 }); };
  // Add channels without showing it (do it behind a title card).
  // opens each channel from the Channels box (older versions: the toolbar's link box), then closes the panel
  const add = async names => {
    for (const ch of names) {
      if (await m.$('#url')) { await m.fill('#url', ch); await m.click('#add'); continue; }
      if (!(await m.isVisible('#savedPanel'))) await m.click('#savedBtn');
      await m.fill('#savedInput', ch); await m.click('#spOpen');
      await m.waitForFunction(() => !document.querySelector('#savedInput').value);
    }
    if (await m.isVisible('#savedPanel').catch(() => false)) await m.click('#savedBtn');
  };
  // Run code in a stand-in chat, by channel name; say() posts a message there.
  const inChat = (ch, js) => m.evaluate(([ch, js]) => [...document.querySelectorAll('#stage .win.chat')]
    .find(w => w.querySelector('.title').textContent === ch).querySelector('webview').executeJavaScript(js), [ch, js]);
  const chatSay = (ch, name, text) => inChat(ch, `window.say(${JSON.stringify(name)}, ${JSON.stringify(text)})`);
  // Glide to and click something inside a chat (js returns its element), e.g. a chatter's name.
  const clickInChat = async (ch, js) => {
    const v = await m.locator(`#stage .win.chat:has(.title:text-is("${ch}")) webview`).boundingBox();
    const p = await inChat(ch, `(() => { const r = (${js}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; })()`);
    await dodge({ y: v.y + p.y - p.h / 2, height: p.h });   // e.g. a chat box at the bottom: the caption goes to the top
    await glide(v.x + p.x, v.y + p.y, { steps: 20 }); await wait(300); await m.mouse.click(mx, my);
  };
  return { m, app: run.app, run, stage, W, H, wait, reveal, card, uncard, cap, uncap, feature, ring, unring, glide, moveTo, press, click, type, add, inChat, chatSay, clickInChat };
}

function ffmpeg() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (r.error || !/libx264/.test(r.stdout || '')) {
    const how = { darwin: 'brew install ffmpeg', win32: 'winget install Gyan.FFmpeg' }[process.platform] || 'sudo apt install ffmpeg (or your package manager)';
    throw new Error(`ffmpeg with libx264 is needed to make the MP4: ${how}`);
  }
}
const ff = args => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status) throw new Error('ffmpeg: ' + r.stderr); };

// MP4s must stay under 10 MB (GitHub's limit for videos in release notes and PRs on a free plan).
const LIMIT = 9.5e6;
// Encode a video input and an audio input (ffmpeg input args) to `mp4` under LIMIT, at the window's own
// 1280x800 (scaling up only costs size): one pass at good quality, or two passes at a bitrate that fits when
// that's too big. A long video gets too few bits for 1280x800 text to stay sharp, so it's made at 960x600.
// The poster is added as the cover picture.
async function encode(inputs, seconds, thumb, mp4, work) {
  const plain = path.join(work, 'video.mp4'), cover = path.join(work, 'cover.jpg'), log = path.join(work, 'x264');
  const v = (w = W, h = H) => ['-map', '0:v:0', '-map', '1:a:0', '-vf', `scale=${w}:${h}:flags=lanczos,fps=30`, '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p'];
  const a = ['-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart'];
  ff(['-i', thumb, '-vf', `scale=${W}:${H}:flags=lanczos`, '-q:v', '4', cover]);
  const room = LIMIT - fs.statSync(cover).size;
  ff([...inputs, ...v(), '-crf', '23', ...a, plain]);
  // too big: two passes at a bitrate that fits, lower again if the encoder overshoots (it can, at low bitrates)
  let kbps = Math.floor((room * 8 / seconds - 96e3) / 1000 * .97);   // leave a little for the container
  for (let i = 0; fs.statSync(plain).size > room; i++, kbps = Math.floor(kbps * .9)) {
    if (i === 3) throw new Error(`Couldn't get ${mp4} under 10 MB: make the video shorter`);
    const nul = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const size = kbps < 300 ? [960, 600] : [W, H];
    ff([...inputs, ...v(...size), '-b:v', kbps + 'k', '-pass', '1', '-passlogfile', log, '-an', '-f', 'mp4', nul]);
    ff([...inputs, ...v(...size), '-b:v', kbps + 'k', '-pass', '2', '-passlogfile', log, ...a, plain]);
    for (const f of fs.readdirSync(work)) if (f.startsWith('x264')) fs.rmSync(path.join(work, f), { force: true });
  }
  // the poster as the file's cover picture too (shown by players and file browsers that use one)
  ff(['-i', plain, '-i', cover, '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic', '-movflags', '+faststart', mp4]);
  fs.rmSync(plain, { force: true });
}

// Record a scenes module ({ name, poster, features, seed, stage, run }) and encode it. Returns { mp4, sheet, capture }.
async function record(scenes, { dir = ROOT, out, keep = false } = {}) {
  ffmpeg();
  const name = scenes.name || 'stream-multiview-whats-new';
  const work = drive.outDir(path.join('release-video', name));
  const frames = path.join(work, 'frames');
  const mp4 = out || path.join(drive.outDir('release-video'), name + '.mp4');
  const thumb = path.join(work, 'thumbnail.png');
  const run = await drive.launch({ dir, size: { width: W, height: H }, seed: scenes.seed });
  const m = run.main;
  let cap = null, sfx = null, failed = null;
  try {
    await stage.install(run.app, scenes.stage);
    await m.evaluate(({ css, pear }) => {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      document.body.insertAdjacentHTML('beforeend', '<div id="tr-cap"></div><div id="tr-card" class="on"></div><div id="tr-ring"></div><div id="tr-mouse"></div>');
      window.__pear = pear;
      const ms = document.getElementById('tr-mouse');
      document.addEventListener('pointermove', e => { ms.style.left = e.clientX + 'px'; ms.style.top = e.clientY + 'px'; }, true);
      document.addEventListener('pointerdown', () => ms.classList.add('down'), true);
      document.addEventListener('pointerup', () => ms.classList.remove('down'), true);
      // a dev copy says "git checkout, use git pull" in Settings > Updates: show what an installed copy says
      const fix = () => { const s = document.querySelector('#settingsDlg .upd-state'); if (s && /git checkout/.test(s.textContent)) { s.className = 'upd-state ok'; s.textContent = 'You have the newest version.'; } };
      const host = document.querySelector('#settingsDlg .upd-host') || document.body;
      new MutationObserver(fix).observe(host, { childList: true, subtree: true, characterData: true }); fix();
    }, { css: CSS, pear: PEAR });
    await m.keyboard.press('Escape');   // What's new may open by itself on a new version: closed behind the poster
    // The first frame is a poster (also saved as thumbnail.png and the MP4's cover), never a black screen
    const t = director(run, scenes);
    await t.card({ still: true, h: 'Stream Multiview', ...scenes.poster });
    await m.waitForTimeout(400);
    await m.screenshot({ path: thumb });
    await sounds.start(m);
    await capture.start(run.app, frames);
    await m.waitForTimeout(1500);
    await scenes.run(t);
    await m.mouse.move(W / 2 + 60, H / 2 + 20); await m.waitForTimeout(1500);   // a moment of stillness at the end
  } catch (e) {
    failed = e;
    await m.screenshot({ path: path.join(work, 'fail.png') }).catch(() => {});
  } finally {
    try { sfx = await sounds.stop(m, work); } catch (e) { failed = failed || e; }
    try { cap = await capture.stop(run.app, frames); } catch (e) { failed = failed || e; }
    await run.close();
  }
  if (failed) { failed.message += `\n(screenshot of the moment: ${path.join(work, 'fail.png')})`; throw failed; }

  // the music pauses for the app's own sounds (alert chimes and the like), which are mixed in where they played
  const pauses = sounds.pauses(sfx.events, cap.t0);
  let wav = music.write(cap.seconds + 1, path.join(work, 'music.wav'), { pauses });
  if (sfx.clips.length) {
    const mixed = path.join(work, 'audio.wav');
    const delays = sfx.clips.map((c, i) => `[${i + 1}:a]adelay=${Math.max(0, c.at - cap.t0)}:all=1,volume=1.6[s${i}]`).join(';');
    ff(['-i', wav, ...sfx.clips.flatMap(c => ['-i', c.file]), '-filter_complex',
      `${delays};[0:a]${sfx.clips.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sfx.clips.length + 1}:duration=first:normalize=0[a]`, '-map', '[a]', mixed]);
    wav = mixed;
  }
  await encode(['-f', 'concat', '-safe', '0', '-i', cap.list, '-i', wav], cap.seconds, thumb, mp4, work);
  const sheet = path.join(work, 'sheet.png');
  ff(['-i', mp4, '-map', '0:v:0', '-vf', `fps=1/4,scale=400:-1,tile=6x${Math.ceil(cap.seconds / 24)}`, '-frames:v', '1', sheet]);
  if (!keep) fs.rmSync(frames, { recursive: true, force: true });
  return { mp4, thumbnail: thumb, sheet, capture: cap, pauses };
}

if (require.main === module) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : undefined; };
  const dir = opt('--dir'), out = opt('--out'), keep = a.includes('--keep');
  const file = a.find(x => !x.startsWith('--'));
  if (!file) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 5).join('\n')); process.exit(1); }
  record(require(path.resolve(file)), { dir: dir && path.resolve(dir), out: out && path.resolve(out), keep })
    .then(r => {
      console.log(`MP4:       ${r.mp4}\nThumbnail: ${r.thumbnail}\nSheet:     ${r.sheet}`);
      console.log(`Capture: ${r.capture.seconds.toFixed(1)} s, ${r.capture.fps} fps, longest still ${r.capture.maxGap} s`);
      console.log(`Sounds:  ${r.pauses.length ? r.pauses.map(p => p.from.toFixed(1) + ' s').join(', ') + ' (the music pauses for each)' : 'none'}`);
    })
    .catch(e => { console.error(e.stack || e.message); process.exit(1); });
}

module.exports = { record, director, encode };
